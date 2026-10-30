import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { parse } from 'yaml';

const workflow = parse(fs.readFileSync(
  path.resolve(__dirname, '../.github/workflows/deploy-firebase.yml'), 'utf8'
));
const deployScript = workflow.jobs.deploy.steps.find(
  (step) => step.name === 'Deploy (Hosting, Functions, Firestore & Storage Rules, Indexes)'
).run;
const iamReadFailure = 'Failed to get the IAM Policy on the Service projects/example/locations/us-central1/services/sharerecipe';
const readinessFailure = 'Could not create or update Cloud Run service recipeimportpage. Provisioning revision instances to receive traffic. Resource readiness deadline exceeded.';
const quotaFailure = "Error: Request to https://cloudbilling.googleapis.com/v1/projects/example/billingInfo had HTTP Error: 429, Quota exceeded for quota metric 'All requests' and limit 'All requests per minute'";

function runDeploy(responses) {
  return spawnSync('bash', ['-e', '-o', 'pipefail', '-c', `
    firebase() {
      echo "firebase invoked" >&2
      IFS= read -r response
      printf '%s\\n' "$response"
      if [ "$response" = "Deploy complete!" ]; then
        return 0
      fi
      echo "Unable to set the invoker for the IAM policy on the following functions:"
      echo "Error: There was an error deploying functions"
      return 2
    }
    sleep() { echo "sleep $1" >&2; }
    ${deployScript}
  `], { input: responses.join('\n') + '\n', encoding: 'utf8', timeout: 5000 });
}

describe('Firebase deploy workflow retries', () => {
  test('retries a Cloud Run IAM policy read failure and completes the deploy', () => {
    const result = runDeploy([iamReadFailure, 'Deploy complete!']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Firebase deploy attempt 2/3');
    expect(result.stdout.match(/firebase invoked/g)).toHaveLength(2);
    expect(result.stderr).toContain('sleep 15');
  });

  test('retries a Cloud Run resource readiness deadline and completes the deploy', () => {
    const result = runDeploy([readinessFailure, 'Deploy complete!']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Firebase deploy attempt 2/3');
    expect(result.stdout.match(/firebase invoked/g)).toHaveLength(2);
    expect(result.stderr).toContain('sleep 15');
  });

  test('retries a Cloud Billing API quota error and completes the deploy', () => {
    const result = runDeploy([quotaFailure, 'Deploy complete!']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Firebase deploy attempt 2/3');
    expect(result.stdout.match(/firebase invoked/g)).toHaveLength(2);
    expect(result.stderr).toContain('sleep 10');
  });

  test('fails after three persistent IAM policy read failures', () => {
    const result = runDeploy(Array(3).fill(iamReadFailure));

    expect(result.status).toBe(2);
    expect(result.stdout.match(/firebase invoked/g)).toHaveLength(3);
    expect(result.stderr.match(/sleep 15/g)).toHaveLength(2);
  });

  test('does not retry an IAM policy write permission error', () => {
    const result = runDeploy(['Failed to set the IAM Policy on the Service: HTTP Error: 403, Permission denied']);

    expect(result.status).toBe(2);
    expect(result.stdout.match(/firebase invoked/g)).toHaveLength(1);
    expect(result.stderr).not.toContain('sleep');
  });

  test('completes a successful deploy without retrying', () => {
    const result = runDeploy(['Deploy complete!']);

    expect(result.status).toBe(0);
    expect(result.stdout.match(/firebase invoked/g)).toHaveLength(1);
    expect(result.stderr).not.toContain('sleep');
  });
});

describe('Firebase deploy workflow targets', () => {
  // Regeländerungen in storage.rules müssen mit dem Client live gehen (Tech-Check S25).
  it('deployt Hosting, Functions, Firestore- und Storage-Regeln gemeinsam', () => {
    const only = deployScript.match(/firebase deploy --only (\S+)/)[1].split(',');
    expect(only).toEqual(expect.arrayContaining(['hosting', 'functions', 'firestore:rules', 'storage']));
  });
});

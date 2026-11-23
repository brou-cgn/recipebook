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
// Antworten mit „exit0:“ geben den Rest aus (ein \n darin wird zum Zeilenumbruch) und enden mit Exit-Code 0.
// Deploy-Lauf 2130 (Tech-Check B7): Kontingent-Fehler, eine Function bleibt alt, Hosting ohne
// Freigabe, kein „Deploy complete!“ – und trotzdem Exit-Code 0.
const incompleteRun2130 = 'exit0:' + [
  '⚠  functions: Got "Quota Exceeded" error while trying to update projects/example/locations/us-central1/functions/scrapeInstagramReel. Waiting to retry...',
  '⚠  functions:  failed to update function projects/example/locations/us-central1/functions/scrapeInstagramReel',
  '✔  functions[importRecipeShortcut(us-central1)] Successful update operation.',
].join('\\n');

function runDeploy(responses) {
  return spawnSync('bash', ['-e', '-o', 'pipefail', '-c', `
    firebase() {
      echo "firebase invoked" >&2
      IFS= read -r response
      case "$response" in
        exit0:*)
          printf '%b\\n' "\${response#exit0:}"
          return 0
          ;;
      esac
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

describe('Firebase deploy workflow: Exit-Code 0 allein ist kein Erfolg (Tech-Check B7)', () => {
  test('wiederholt einen Lauf, der mit 0 endet, aber nicht fertig wird (Deploy-Lauf 2130)', () => {
    const result = runDeploy([incompleteRun2130, 'Deploy complete!']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('did not complete');
    expect(result.stdout).toContain('Firebase deploy attempt 2/3');
    expect(result.stdout.match(/firebase invoked/g)).toHaveLength(2);
    expect(result.stderr).toContain('sleep 30');
  });

  test('wird rot, wenn der Deploy dreimal mit 0 endet, ohne fertig zu werden', () => {
    const result = runDeploy(Array(3).fill(incompleteRun2130));

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('::error::Firebase deploy did not complete after 3 attempts');
    expect(result.stdout.match(/firebase invoked/g)).toHaveLength(3);
    expect(result.stderr.match(/sleep 30/g)).toHaveLength(2);
  });

  test('wiederholt auch, wenn trotz „Deploy complete!“ eine Function gescheitert ist', () => {
    const failedButComplete = 'exit0:⚠  functions:  failed to update function projects/example/locations/us-central1/functions/scrapeInstagramReel\\nDeploy complete!';
    const result = runDeploy([failedButComplete, 'Deploy complete!']);

    expect(result.status).toBe(0);
    expect(result.stdout.match(/firebase invoked/g)).toHaveLength(2);
  });

  test('erkennt „Deploy complete!“ auch zwischen den Farbcodes der CLI', () => {
    const result = runDeploy(['exit0:\u001b[32m✔\u001b[39m \u001b[1m\u001b[4mDeploy complete!\u001b[24m\u001b[22m']);

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

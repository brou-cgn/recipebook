#!/usr/bin/env node
/**
 * Runs the test suite the way CI should: everything except the suites listed
 * in quarantined-tests.js, non-interactively, failing the build on the first
 * red test.
 *
 * Exists as a script rather than a flag in package.json because
 * create-react-app only forwards a fixed set of Jest options from
 * package.json ("jest" key), and testPathIgnorePatterns is not one of them -
 * it has to be passed on the command line, and 22 paths do not belong in a
 * one-line npm script.
 *
 * Also prints what it skipped. A quarantine nobody sees is a quarantine
 * nobody clears.
 */
const { spawnSync } = require('child_process');
const path = require('path');
const quarantined = require('./quarantined-tests');

// Jest matches testPathIgnorePatterns as regular expressions against the
// absolute path, so the dots in "*.test.js" need escaping - otherwise they
// are wildcards that could match unrelated files.
const patterns = quarantined.map(
  (file) => file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'
);

if (quarantined.length > 0) {
  console.log(
    `\nSkipping ${quarantined.length} quarantined test suite(s) - see scripts/quarantined-tests.js:`
  );
  quarantined.forEach((file) => console.log(`  - ${file}`));
  console.log('');
}

const reactScripts = path.join('node_modules', '.bin', 'react-scripts');
const result = spawnSync(
  reactScripts,
  [
    'test',
    '--watchAll=false',
    '--passWithNoTests',
    ...patterns.map((pattern) => `--testPathIgnorePatterns=${pattern}`),
  ],
  { stdio: 'inherit', env: { ...process.env, CI: 'true' }, shell: process.platform === 'win32' }
);

process.exit(result.status === null ? 1 : result.status);

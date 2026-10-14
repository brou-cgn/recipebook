#!/usr/bin/env node
/**
 * Runs the test suite the way CI should: everything except the suites listed
 * in quarantined-tests.js, non-interactively, failing the build on the first
 * red test.
 *
 * Exists as a script rather than a flag in package.json because the
 * quarantine is passed to Jest as testPathIgnorePatterns on the command line,
 * and that many paths do not belong in a one-line npm script. (Originally
 * also because create-react-app did not forward that option from
 * package.json; Jest now runs standalone, see jest.config.js.)
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

const jest = path.join('node_modules', '.bin', 'jest');
const result = spawnSync(
  jest,
  [
    '--ci',
    '--watchAll=false',
    '--passWithNoTests',
    ...patterns.map((pattern) => `--testPathIgnorePatterns=${pattern}`),
  ],
  { stdio: 'inherit', env: { ...process.env, CI: 'true' }, shell: process.platform === 'win32' }
);

process.exit(result.status === null ? 1 : result.status);

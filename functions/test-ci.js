// Führt alle Function-Tests (node:test) aus – außer den Einträgen in quarantined-tests.js.
const {spawnSync} = require('node:child_process');
const quarantined = require('./quarantined-tests');

const args = ['--test'];
for (const pattern of quarantined) args.push('--test-skip-pattern', pattern);

const result = spawnSync(process.execPath, args, {stdio: 'inherit', cwd: __dirname});
process.exit(result.status === null ? 1 : result.status);

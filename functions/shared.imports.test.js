/**
 * Jeder destrukturierte Import aus shared/ muss im Zielmodul existieren.
 * `const {a} = require('./x')` liefert für einen nicht exportierten Namen still
 * `undefined`; der Fehler zeigt sich erst, wenn die Function aufgerufen wird.
 * ESLint (no-undef) sieht das nicht, weil der Name lokal deklariert ist.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DIRS = ['handlers', 'shared'];

function sourceFiles() {
  const files = [path.join(__dirname, 'index.js')];
  for (const dir of DIRS) {
    for (const f of fs.readdirSync(path.join(__dirname, dir))) {
      if (f.endsWith('.js')) files.push(path.join(__dirname, dir, f));
    }
  }
  return files;
}

function destructuredNames(text) {
  const imports = [];
  for (const m of text.matchAll(/const \{([^}]*)\} = require\('([^']+)'\);/g)) {
    const names = m[1].split(',').map((n) => n.trim().split(':')[0].trim()).filter(Boolean);
    imports.push({names, request: m[2]});
  }
  return imports;
}

test('destrukturierte Imports aus shared/ sind im Zielmodul exportiert', () => {
  const problems = [];
  for (const file of sourceFiles()) {
    const text = fs.readFileSync(file, 'utf8');
    for (const {names, request} of destructuredNames(text)) {
      if (!request.startsWith('.')) continue;
      const target = path.resolve(path.dirname(file), request);
      if (!target.startsWith(path.join(__dirname, 'shared') + path.sep)) continue;
      const exported = require(target);
      for (const name of names) {
        if (!(name in exported)) problems.push(`${path.relative(__dirname, file)}: ${name} fehlt in ${request}`);
      }
    }
  }
  assert.deepEqual(problems, []);
});

test('jeder Export eines shared-Moduls ist definiert', () => {
  for (const f of fs.readdirSync(path.join(__dirname, 'shared')).filter((x) => x.endsWith('.js'))) {
    const exported = require(path.join(__dirname, 'shared', f));
    for (const [name, value] of Object.entries(exported)) {
      assert.notEqual(value, undefined, `shared/${f}: ${name} ist undefined`);
    }
  }
});

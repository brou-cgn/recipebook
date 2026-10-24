/**
 * shared/*.js dürfen sich nicht gegenseitig (auch nicht über Ecken) importieren:
 * Mit `const {x} = require('./y')` bekäme ein Modul im Zyklus beim Laden
 * `undefined`, und die Function bricht erst zur Laufzeit. Node warnt dann nur
 * ("Accessing non-existent property ... inside circular dependency"), die Tests
 * der Handler fangen es nicht, weil sie die Helfer meist stubben.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SHARED_DIR = path.join(__dirname, 'shared');

function siblingRequires(file) {
  const text = fs.readFileSync(path.join(SHARED_DIR, file), 'utf8');
  const found = [];
  for (const m of text.matchAll(/require\('\.\/([A-Za-z0-9_-]+)'\)/g)) found.push(`${m[1]}.js`);
  return found;
}

test('shared/*.js enthalten keine zyklischen require-Ketten', () => {
  const files = fs.readdirSync(SHARED_DIR).filter((f) => f.endsWith('.js'));
  const graph = new Map(files.map((f) => [f, siblingRequires(f)]));

  const state = new Map(); // 1 = auf dem aktuellen Pfad, 2 = fertig
  const stack = [];
  function visit(node) {
    if (state.get(node) === 2) return;
    assert.notEqual(state.get(node), 1, `Zyklus: ${[...stack, node].join(' -> ')}`);
    state.set(node, 1);
    stack.push(node);
    for (const next of graph.get(node) || []) visit(next);
    stack.pop();
    state.set(node, 2);
  }
  for (const f of files) visit(f);
});

test('shared/*.js importieren nichts aus handlers/ oder index.js', () => {
  for (const f of fs.readdirSync(SHARED_DIR).filter((x) => x.endsWith('.js'))) {
    const text = fs.readFileSync(path.join(SHARED_DIR, f), 'utf8');
    assert.doesNotMatch(text, /require\('\.\.\/(handlers|index)/, `${f} importiert handlers/ oder index`);
  }
});

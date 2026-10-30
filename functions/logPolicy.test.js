/**
 * AGENTS.md: keine personenbezogenen Daten (E-Mail-Adressen u. Ä.) in Logs.
 * Cloud Logging hält alles, was console.* in einer Function ausgibt (Tech-Check S26).
 *
 * Geprüft wird der Code in den Argumenten jedes console-Aufrufs: Variablen oder
 * Felder, deren Name auf "email"/"emails" endet, dürfen dort nicht stehen
 * (ausgenommen `.length`). Der Text von String-Literalen zählt nicht, der Code in
 * Template-Platzhaltern schon. Statt der Adresse die uid oder eine ID loggen.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function sourceFiles(dir) {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(full);
    return entry.name.endsWith('.js') && !entry.name.endsWith('.test.js') ? [full] : [];
  });
}

/**
 * Code zwischen den Klammern eines Aufrufs (start = Index der öffnenden Klammer),
 * ohne den Text von String-Literalen, aber mit dem Code in Template-Platzhaltern.
 * @param {string} src - Quelltext
 * @param {number} start - Index der öffnenden Klammer
 * @return {string} Argument-Code
 */
function callArguments(src, start) {
  let depth = 0;
  let quote = null;
  let out = '';
  const templateDepths = [];
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') {
        i++;
      } else if (quote === '`' && c === '$' && src[i + 1] === '{') {
        templateDepths.push(depth);
        depth++;
        quote = null;
        i++;
        out += ' ';
      } else if (c === quote) {
        quote = null;
      }
      continue;
    }
    if (c === '"' || c === '\'' || c === '`') {
      quote = c;
      continue;
    }
    if (c === '(' || c === '{' || c === '[') depth++;
    if (c === ')' || c === '}' || c === ']') {
      depth--;
      if (c === '}' && templateDepths.length && templateDepths[templateDepths.length - 1] === depth) {
        templateDepths.pop();
        quote = '`';
        continue;
      }
      if (depth === 0) break;
    }
    out += c;
  }
  return out;
}

const CONSOLE_CALL = /\bconsole\.(?:log|info|warn|error|debug)\s*\(/g;
const EMAIL_NAME = /(?<![\w$])(?:[A-Za-z_$][\w$]*)?[eE]mails?\b(?!\s*\.length)(?!\s*\()/;

const findViolations = (src) => {
  const found = [];
  for (const match of src.matchAll(CONSOLE_CALL)) {
    const args = callArguments(src, match.index + match[0].length - 1);
    const name = args.match(EMAIL_NAME);
    if (name) {
      const line = src.slice(0, match.index).split('\n').length;
      found.push({line, name: name[0]});
    }
  }
  return found;
};

test('Function-Logs enthalten keine E-Mail-Adressen', () => {
  const violations = sourceFiles(__dirname).flatMap((file) =>
    findViolations(fs.readFileSync(file, 'utf8')).map(({line, name}) =>
      `${path.relative(__dirname, file)}:${line} loggt ${name}`));
  assert.deepEqual(violations, []);
});

test('Prüfung erkennt E-Mails in Platzhaltern und Argumenten, nicht im Text', () => {
  const flagged = (code) => findViolations(code).map((v) => v.name);
  assert.deepEqual(flagged('console.log(`sent to ${normalizedEmail}`);'), ['normalizedEmail']);
  assert.deepEqual(flagged('console.warn(\'no user\', user.email);'), ['email']);
  assert.deepEqual(flagged('console.log(\n  `x ${String(userEmail)}`,\n);'), ['userEmail']);
  assert.deepEqual(flagged('console.log(`sent to ${adminEmails.length} admins`);'), []);
  assert.deepEqual(flagged('console.error(\'error sending email:\', mailError);'), []);
  assert.deepEqual(flagged('console.log(`user ${userId}`, {count: 2});'), []);
});

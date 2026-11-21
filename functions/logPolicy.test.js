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

// ---------------------------------------------------------------------------
// Versandfehler (Tech-Check S27): Ein Fehler aus transporter.sendMail trägt die
// Empfängeradressen (rejected, rejectedErrors, Serverantwort in message). Jeder
// sendMail-Aufruf muss deshalb in einem try liegen (in derselben Funktion), dessen
// catch den Fehler nur über mailFehlerCode / mailVersandFehler oder seine Felder
// code, responseCode und command verwendet – nicht roh loggen, nicht roh werfen.

const espree = require('espree');

const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const SAFE_HELPERS = new Set(['mailFehlerCode', 'mailVersandFehler']);
const SAFE_FIELDS = new Set(['code', 'responseCode', 'command']);

function walk(node, visit, parents = []) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, parents);
  const chain = [...parents, node];
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'range') continue;
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit, chain));
    else if (value && typeof value.type === 'string') walk(value, visit, chain);
  }
}

const isSendMail = (node) => node.type === 'CallExpression' &&
  node.callee.type === 'MemberExpression' && !node.callee.computed && node.callee.property.name === 'sendMail';

/** Innerstes try (ohne Funktionsgrenze dazwischen), in dessen block der Knoten liegt. */
function enclosingTry(node, parents) {
  let child = node;
  for (let i = parents.length - 1; i >= 0; i--) {
    const p = parents[i];
    if (FUNCTION_TYPES.has(p.type)) return null;
    if (p.type === 'TryStatement' && p.block === child) return p;
    child = p;
  }
  return null;
}

function unsafeUses(handler) {
  if (!handler || !handler.param || handler.param.type !== 'Identifier') return ['catch ohne Fehlervariable'];
  const name = handler.param.name;
  const out = [];
  const seen = new Set(); // {error}: Schlüssel und Wert sind dieselbe Stelle
  walk(handler.body, (node, parents) => {
    if (node.type !== 'Identifier' || node.name !== name || seen.has(node.start)) return;
    const parent = parents[parents.length - 1];
    // Eigenschaftsnamen sind keine Verwendung der Variable (console.error, {error: …}).
    if (parent.type === 'MemberExpression' && parent.property === node && !parent.computed) return;
    if (parent.type === 'Property' && parent.key === node && !parent.computed && !parent.shorthand) return;
    seen.add(node.start);
    const viaHelper = parent.type === 'CallExpression' && parent.callee.type === 'Identifier' &&
      SAFE_HELPERS.has(parent.callee.name) && parent.arguments.includes(node);
    const viaField = parent.type === 'MemberExpression' && parent.object === node && !parent.computed &&
      SAFE_FIELDS.has(parent.property.name);
    if (!viaHelper && !viaField) out.push(`${name} roh verwendet (Zeile ${node.loc.start.line})`);
  });
  return out;
}

function mailErrorViolations(src) {
  const ast = espree.parse(src, {ecmaVersion: 'latest', sourceType: 'commonjs', loc: true});
  const found = [];
  walk(ast, (node, parents) => {
    if (!isSendMail(node)) return;
    const tryStmt = enclosingTry(node, parents);
    const line = node.loc.start.line;
    if (!tryStmt || !tryStmt.handler) {
      found.push(`sendMail in Zeile ${line} ohne try/catch in derselben Funktion`);
      return;
    }
    for (const use of unsafeUses(tryStmt.handler)) found.push(`sendMail in Zeile ${line}: ${use}`);
  });
  return found;
}

test('Versandfehler aus sendMail gelangen nur ohne Adressen in Logs oder nach oben', () => {
  const files = sourceFiles(__dirname).filter((file) => fs.readFileSync(file, 'utf8').includes('.sendMail('));
  assert.ok(files.length >= 4, `zu wenige Dateien mit sendMail gefunden: ${files.length}`);
  const violations = files.flatMap((file) =>
    mailErrorViolations(fs.readFileSync(file, 'utf8')).map((v) => `${path.relative(__dirname, file)}: ${v}`));
  assert.deepEqual(violations, []);
});

test('Prüfung der Versandfehler erkennt rohe Fehler, fehlendes try und Funktionsgrenzen', () => {
  const ok = `async function f(t) {
    try { await t.sendMail({}); } catch (err) { console.error('x', mailFehlerCode(err), err.code, err?.command); }
  }
  async function g(t) {
    try { await t.sendMail({}); } catch (err) { throw mailVersandFehler(err); }
  }`;
  assert.deepEqual(mailErrorViolations(ok), []);
  assert.deepEqual(mailErrorViolations('async function f(t) { try { await t.sendMail({}); } catch (mailError) { console.error(\'x\', mailError); } }'),
      ['sendMail in Zeile 1: mailError roh verwendet (Zeile 1)']);
  assert.deepEqual(mailErrorViolations('async function f(t) { try { await t.sendMail({}); } catch (e) { console.error(e.message); } }'),
      ['sendMail in Zeile 1: e roh verwendet (Zeile 1)']);
  assert.deepEqual(mailErrorViolations('async function f(t) { try { await t.sendMail({}); } catch (e) { throw e; } }'),
      ['sendMail in Zeile 1: e roh verwendet (Zeile 1)']);
  assert.deepEqual(mailErrorViolations('async function f(t) { try { await t.sendMail({}); } catch (error) { console.error(mailFehlerCode(error)); } }'), []);
  assert.deepEqual(mailErrorViolations('async function f(t) { try { await t.sendMail({}); } catch (error) { log({error}); } }'),
      ['sendMail in Zeile 1: error roh verwendet (Zeile 1)']);
  assert.deepEqual(mailErrorViolations('const f = (t) => t.sendMail({});'),
      ['sendMail in Zeile 1 ohne try/catch in derselben Funktion']);
  // Das äußere try fängt den Fehler der inneren Funktion nicht.
  assert.deepEqual(mailErrorViolations('try { const f = () => t.sendMail({}); } catch (e) { console.error(mailFehlerCode(e)); }'),
      ['sendMail in Zeile 1 ohne try/catch in derselben Funktion']);
});

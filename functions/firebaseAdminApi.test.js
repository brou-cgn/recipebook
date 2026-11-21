/**
 * Schutz gegen inkompatible firebase-admin-Majors (Tech-Check F18).
 *
 * Nach den Dependabot-Bumps auf firebase-admin 14 am 30.10. und 06.11.2026 schlugen alle
 * geplanten Jobs mit "admin.firestore is not a function" fehl, inklusive Mailversand:
 * v14 entfernt die Namespace-API (admin.firestore(), admin.auth() …). Die übrigen Tests
 * mocken firebase-admin und merken so etwas nicht. Dieser Test liest den Produktivcode
 * und lädt das echte, installierte Paket:
 *
 * - Produktivcode lädt firebase-admin nur über modulare Subpfade und destrukturiert,
 *   z. B. const {getFirestore, FieldValue} = require('firebase-admin/firestore').
 * - Jeder so importierte Name existiert im installierten Paket. Entfernt oder verschiebt
 *   ein Major-Update einen davon, wird dieser Test rot, bevor ein Deploy es tut.
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

const sources = sourceFiles(__dirname).map((file) => ({
  file: path.relative(__dirname, file),
  src: fs.readFileSync(file, 'utf8'),
}));

// require('firebase-admin') oder require('firebase-admin/<subpfad>'), beliebige Quotes
const ANY_REQUIRE = /require\(\s*(['"])(firebase-admin(?:\/[^'"]*)?)\1\s*\)/g;
// const {a, b: c} = require('firebase-admin/<subpfad>')
const DESTRUCTURED = /const\s*\{([^}]*)\}\s*=\s*require\(\s*(['"])(firebase-admin\/[^'"]+)\2\s*\)/g;

test('Produktivcode lädt firebase-admin nur modular und destrukturiert', () => {
  const problems = [];
  for (const {file, src} of sources) {
    const requests = [...src.matchAll(ANY_REQUIRE)].map((m) => m[2]);
    if (requests.includes('firebase-admin')) {
      problems.push(`${file}: require('firebase-admin') nutzt die Namespace-API, die es ab v14 nicht mehr gibt – ` +
        'stattdessen firebase-admin/app, /firestore, /auth, /storage oder /messaging');
    }
    const subpaths = requests.filter((r) => r !== 'firebase-admin').length;
    const destructured = [...src.matchAll(DESTRUCTURED)].length;
    if (subpaths !== destructured) {
      problems.push(`${file}: firebase-admin-Subpfad nicht als const {…} = require(…) importiert ` +
        '(nur so prüft dieser Test die genutzten Namen)');
    }
  }
  assert.deepEqual(problems, []);
});

test('jeder importierte Name existiert im installierten firebase-admin', () => {
  const used = new Map();
  for (const {file, src} of sources) {
    for (const m of src.matchAll(DESTRUCTURED)) {
      const subpath = m[3];
      if (!used.has(subpath)) used.set(subpath, new Map());
      for (const part of m[1].split(',')) {
        const name = part.split(':')[0].trim();
        if (!name) continue;
        const files = used.get(subpath).get(name) || [];
        used.get(subpath).set(name, [...files, file]);
      }
    }
  }
  assert.ok(used.has('firebase-admin/app'), 'Erwartet: index.js lädt firebase-admin/app (initializeApp)');
  assert.ok(used.has('firebase-admin/firestore'), 'Erwartet: Code nutzt firebase-admin/firestore');

  const missing = [];
  for (const [subpath, names] of used) {
    let mod;
    try {
      mod = require(subpath);
    } catch (err) {
      missing.push(`${subpath} lässt sich nicht laden (${err.code || err.message})`);
      continue;
    }
    for (const [name, files] of names) {
      if (mod[name] === undefined) missing.push(`${subpath}: ${name} fehlt (genutzt in ${files.join(', ')})`);
    }
  }
  const {SDK_VERSION} = require('firebase-admin/app');
  assert.deepEqual(missing, [], `Installiert ist firebase-admin ${SDK_VERSION}`);
});

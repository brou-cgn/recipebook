/**
 * Schutz gegen inkompatible firebase-admin-Majors.
 *
 * Der Functions-Code nutzt die Namespace-API (admin.firestore(), admin.auth(),
 * admin.messaging(), admin.storage()). firebase-admin v14 entfernt sie – nach den
 * Dependabot-Bumps am 30.10. und 06.11.2026 schlugen alle geplanten Jobs mit
 * "admin.firestore is not a function" fehl, inklusive Mailversand. Die übrigen
 * Tests mocken firebase-admin und merkten davon nichts; dieser Test lädt das
 * echte, installierte Paket.
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

const NAMESPACES = ['firestore', 'auth', 'messaging', 'storage'];

test('installiertes firebase-admin bietet jede im Code genutzte Namespace-API', () => {
  const used = new Set();
  for (const file of sourceFiles(__dirname)) {
    const src = fs.readFileSync(file, 'utf8');
    for (const ns of NAMESPACES) {
      if (new RegExp(`\\badmin\\.${ns}\\s*\\(`).test(src)) used.add(ns);
    }
  }
  assert.ok(used.size > 0, 'Erwartet: Code nutzt mindestens eine Namespace-API');

  const admin = require('firebase-admin');
  for (const ns of used) {
    assert.equal(
        typeof admin[ns], 'function',
        `admin.${ns}() wird im Code genutzt, fehlt aber im installierten firebase-admin ` +
        '(Major-Update ohne Umstellung auf modulare Imports?)',
    );
  }
});

/**
 * Persönlicher Kurzbefehl-Schlüssel (Tech-Check S7): erzeugen, widerrufen, prüfen.
 * Die Anmeldung der Endpunkte damit prüft index.shortcutAuth.test.js.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Module = require('node:module');
const {isFirebaseAdminRequest, firebaseAdminModule, purgeFunctionsCache} = require('./testSupport');

const SERVER_TS = {__serverTimestamp: true};
const DELETE = {__delete: true};

/** Firestore-Ersatz: Pfad -> Daten, set mit merge, delete. */
function makeDb(seed = {}) {
  const store = new Map(Object.entries(seed));
  const ref = (path) => ({
    get: async () => ({exists: store.has(path), data: () => store.get(path)}),
    set: async (data, opts) => {
      const base = opts && opts.merge ? {...(store.get(path) || {})} : {};
      for (const [key, value] of Object.entries(data)) {
        if (value === DELETE) delete base[key];
        else base[key] = value;
      }
      store.set(path, base);
    },
    delete: async () => store.delete(path),
    collection: (name) => ({doc: (id) => ref(`${path}/${name}/${id}`)}),
  });
  return {store, collection: (name) => ({doc: (id) => ref(`${name}/${id}`)})};
}

function loadModule(db) {
  purgeFunctionsCache();
  const originalLoad = Module._load;
  Module._load = function(request, parent, ...args) {
    if (request === 'firebase-functions/v2/https') {
      return {
        onCall: (_o, h) => h,
        HttpsError: class extends Error {
          constructor(code, message) {
            super(message);
            this.code = code;
          }
        },
      };
    }
    if (isFirebaseAdminRequest(request, parent)) {
      const firestore = () => db;
      firestore.FieldValue = {serverTimestamp: () => SERVER_TS, delete: () => DELETE};
      return firebaseAdminModule(request, {firestore});
    }
    return originalLoad.call(this, request, parent, ...args);
  };
  try {
    return require('./shortcutToken');
  } finally {
    Module._load = originalLoad;
  }
}

test('createShortcutToken: gibt den Schlüssel einmal zurück und speichert nur den Fingerabdruck', async () => {
  const db = makeDb({'users/u1': {role: 'edit'}});
  const mod = loadModule(db);
  const {token} = await mod.createShortcutToken({auth: {uid: 'u1'}});

  const match = mod.TOKEN_PATTERN.exec(token);
  assert.ok(match, `Schlüssel im Format rbk.<uid>.<geheim>: ${token}`);
  assert.equal(match[1], 'u1');
  const stored = db.store.get('users/u1/security/shortcutToken');
  assert.equal(stored.hash, crypto.createHash('sha256').update(match[2]).digest('hex'));
  assert.ok(!JSON.stringify(stored).includes(match[2]), 'das Geheimnis selbst wird nicht gespeichert');
  assert.equal(db.store.get('users/u1').shortcutTokenEnabled, true);
  assert.equal(db.store.get('users/u1').role, 'edit', 'das Nutzerdokument wird nur ergänzt');
});

test('createShortcutToken: ein neuer Schlüssel ersetzt den alten', async () => {
  const db = makeDb({'users/u1': {role: 'edit'}});
  const mod = loadModule(db);
  const alt = (await mod.createShortcutToken({auth: {uid: 'u1'}})).token;
  const neu = (await mod.createShortcutToken({auth: {uid: 'u1'}})).token;
  assert.notEqual(alt, neu);
  assert.equal(await mod.verifyShortcutToken(db, alt), null);
  assert.equal(await mod.verifyShortcutToken(db, neu), 'u1');
});

test('verifyShortcutToken: prüft Format, Konto und Geheimnis und merkt sich die letzte Nutzung', async () => {
  const db = makeDb({'users/u1': {role: 'edit'}});
  const mod = loadModule(db);
  const {token} = await mod.createShortcutToken({auth: {uid: 'u1'}});
  const [, , secret] = mod.TOKEN_PATTERN.exec(token);

  assert.equal(await mod.verifyShortcutToken(db, `  ${token}  `), 'u1', 'Leerzeichen am Rand stören nicht');
  assert.deepEqual(db.store.get('users/u1/security/shortcutToken').lastUsedAt, SERVER_TS);
  assert.equal(await mod.verifyShortcutToken(db, `rbk.u2.${secret}`), null, 'fremdes Konto');
  assert.equal(await mod.verifyShortcutToken(db, `rbk.u1.${'x'.repeat(43)}`), null, 'falsches Geheimnis');
  for (const kaputt of ['', null, undefined, 42, 'rbk.u1', `xyz.u1.${secret}`, `rbk.u1.${secret}x`]) {
    assert.equal(await mod.verifyShortcutToken(db, kaputt), null, `kaputt: ${kaputt}`);
  }
});

test('revokeShortcutToken: Schlüssel gilt danach nicht mehr, Anzeige-Spiegel ist weg', async () => {
  const db = makeDb({'users/u1': {role: 'edit'}});
  const mod = loadModule(db);
  const {token} = await mod.createShortcutToken({auth: {uid: 'u1'}});
  await mod.revokeShortcutToken({auth: {uid: 'u1'}});

  assert.equal(await mod.verifyShortcutToken(db, token), null);
  assert.equal(await mod.hasShortcutToken(db, 'u1'), false);
  assert.equal(db.store.get('users/u1').shortcutTokenEnabled, false);
  assert.equal('shortcutTokenCreatedAt' in db.store.get('users/u1'), false);
});

test('ohne Anmeldung weder erzeugen noch widerrufen', async () => {
  const db = makeDb();
  const mod = loadModule(db);
  await assert.rejects(mod.createShortcutToken({}), (err) => err.code === 'unauthenticated');
  await assert.rejects(mod.revokeShortcutToken({}), (err) => err.code === 'unauthenticated');
  assert.equal(db.store.size, 0);
});

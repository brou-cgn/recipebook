const test = require('node:test');
const assert = require('node:assert/strict');
const {authorizeListPush, LIST_PUSH_PER_DAY} = require('./listPushGuard');

class FakeHttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** Minimaler Firestore-Ersatz: db.doc(path), Transaktionen, Pfad -> Daten. */
const makeDb = (seed = {}) => {
  const store = new Map(Object.entries(seed));
  const snap = (path) => ({exists: store.has(path), data: () => store.get(path)});
  return {
    store,
    doc: (path) => ({path, get: async () => snap(path)}),
    runTransaction: async (handler) => {
      const writes = [];
      const tx = {
        get: async (ref) => snap(ref.path),
        set: (ref, data) => writes.push(() => store.set(ref.path, data)),
      };
      const result = await handler(tx);
      writes.forEach((write) => write());
      return result;
    },
  };
};

const NOW = Date.UTC(2026, 9, 21, 12);
const group = {type: 'private', ownerId: 'owner', memberIds: ['owner', 'mia']};
const users = (extra = {}) => ({
  'users/owner': {role: 'edit'},
  'users/mia': {role: 'read'},
  'users/fremd': {role: 'edit'},
  'users/admin': {role: 'admin'},
  'users/gast': {role: 'guest'},
  ...extra,
});
const run = (db, uid, overrides = {}) => authorizeListPush(db, FakeHttpsError, {
  auth: {uid}, actorId: uid, action: 'created', groupData: group, nowMs: NOW, ...overrides,
});
const rejectsWith = (promise, code) => assert.rejects(promise, (err) => err.code === code);

test('Eigentümer und Mitglied dürfen auslösen und werden gezählt', async () => {
  const db = makeDb(users());
  await run(db, 'owner');
  await run(db, 'mia', {action: 'added'});
  assert.equal(db.store.get('listPushLimits/owner_2026-10-21').count, 1);
  assert.equal(db.store.get('listPushLimits/mia_2026-10-21').count, 1);
});

test('Eine Person ohne Mitgliedschaft in der Liste wird abgewiesen', async () => {
  const db = makeDb(users());
  await rejectsWith(run(db, 'fremd'), 'permission-denied');
  assert.equal(db.store.size, Object.keys(users()).length);
});

test('actorId muss die eigene UID sein', async () => {
  const db = makeDb(users());
  await rejectsWith(run(db, 'owner', {actorId: 'mia'}), 'permission-denied');
});

test('Rolle guest und fehlendes Profil werden abgewiesen, auch wenn die UID in memberIds steht', async () => {
  const db = makeDb(users());
  const groupWithGuest = {...group, memberIds: ['owner', 'gast', 'ohneProfil']};
  await rejectsWith(run(db, 'gast', {groupData: groupWithGuest}), 'permission-denied');
  await rejectsWith(run(db, 'ohneProfil', {groupData: groupWithGuest}), 'permission-denied');
});

test('Admin darf auch ohne Mitgliedschaft', async () => {
  await run(makeDb(users()), 'admin');
});

test('Ohne Anmeldung unauthenticated, ungültige Aktion invalid-argument', async () => {
  const db = makeDb(users());
  await rejectsWith(authorizeListPush(db, FakeHttpsError, {auth: null, actorId: 'owner', groupData: group}), 'unauthenticated');
  await rejectsWith(run(db, 'owner', {action: 'geloescht'}), 'invalid-argument');
  await run(db, 'owner', {action: undefined});
});

test('Tageslimit: ab dem Limit resource-exhausted, am nächsten Tag wieder frei', async () => {
  const db = makeDb(users({'listPushLimits/owner_2026-10-21': {uid: 'owner', day: '2026-10-21', count: LIST_PUSH_PER_DAY}}));
  await rejectsWith(run(db, 'owner'), 'resource-exhausted');
  await run(db, 'owner', {nowMs: NOW + 24 * 3600 * 1000});
});

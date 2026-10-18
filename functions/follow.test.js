const test = require('node:test');
const assert = require('node:assert/strict');
const follow = require('./follow');

class FakeHttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const SERVER_TS = {__serverTimestamp: true};

const fakeAdmin = {
  firestore: {
    FieldValue: {serverTimestamp: () => SERVER_TS},
    Timestamp: {fromMillis: (ms) => ({toMillis: () => ms})},
  },
};

/** Minimaler Firestore-Ersatz: db.doc(path), Transaktionen, Pfad -> Daten. */
const makeDb = (seed = {}) => {
  const store = new Map(Object.entries(seed));
  const snap = (path) => ({
    exists: store.has(path),
    data: () => store.get(path),
  });
  const db = {
    store,
    doc: (path) => ({path, get: async () => snap(path)}),
    runTransaction: async (handler) => {
      const writes = [];
      const tx = {
        get: async (ref) => snap(ref.path),
        set: (ref, data) => writes.push(() => store.set(ref.path, data)),
        update: (ref, data) => writes.push(() => store.set(ref.path, {...store.get(ref.path), ...data})),
        delete: (ref) => writes.push(() => store.delete(ref.path)),
      };
      const result = await handler(tx);
      writes.forEach((write) => write());
      return result;
    },
  };
  return db;
};

const baseSeed = () => ({
  'users/anna': {role: 'read'},
  'users/ben': {role: 'edit'},
  'users/cleo': {role: 'read'},
  'users/gast': {role: 'guest'},
  'rolePermissions/read': {follow: true},
  'rolePermissions/edit': {follow: true},
  'rolePermissions/guest': {follow: true},
});

const auth = (uid, provider = 'password') => ({uid, token: {firebase: {sign_in_provider: provider}}});
const NOW = Date.UTC(2026, 9, 18, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

const request = (db, uid, followeeId, extra = {}) => follow.requestFollow(
    fakeAdmin, db, FakeHttpsError, {auth: auth(uid), followeeId, nowMs: NOW, ...extra});
const respond = (db, uid, followerId, action, extra = {}) => follow.respondFollow(
    fakeAdmin, db, FakeHttpsError, {auth: auth(uid), followerId, action, nowMs: NOW, ...extra});

const rejectsWith = (promise, code) => assert.rejects(promise, (err) => {
  assert.equal(err.code, code);
  return true;
});

test('requestFollow legt Anfrage und Inbox-Eintrag an', async () => {
  const db = makeDb(baseSeed());
  assert.deepEqual(await request(db, 'anna', 'ben'), {status: 'pending'});
  assert.deepEqual(db.store.get('follows/anna_ben'), {
    followerId: 'anna', followeeId: 'ben', status: 'pending', createdAt: SERVER_TS,
  });
  assert.ok(db.store.has('users/ben/followInbox/anna'));
});

test('requestFollow ist idempotent und gibt den bestehenden Status zurück', async () => {
  const db = makeDb(baseSeed());
  await request(db, 'anna', 'ben');
  await respond(db, 'ben', 'anna', 'accept');
  assert.deepEqual(await request(db, 'anna', 'ben'), {status: 'accepted'});
  assert.equal(db.store.has('users/ben/followInbox/anna'), false);
});

test('requestFollow lehnt Gäste, Anonyme, Selbstfolgen und ungültige IDs ab', async () => {
  const db = makeDb(baseSeed());
  await rejectsWith(request(db, 'gast', 'ben'), 'permission-denied');
  await rejectsWith(follow.requestFollow(fakeAdmin, db, FakeHttpsError,
      {auth: auth('anna', 'anonymous'), followeeId: 'ben', nowMs: NOW}), 'permission-denied');
  await rejectsWith(follow.requestFollow(fakeAdmin, db, FakeHttpsError,
      {auth: null, followeeId: 'ben', nowMs: NOW}), 'unauthenticated');
  await rejectsWith(request(db, 'anna', 'anna'), 'invalid-argument');
  await rejectsWith(request(db, 'anna', ''), 'invalid-argument');
  await rejectsWith(request(db, 'anna', 'x/y'), 'invalid-argument');
  await rejectsWith(request(db, 'anna', 42), 'invalid-argument');
  assert.equal(db.store.has('follows/anna_ben'), false);
});

test('requestFollow braucht das Flag follow auf beiden Seiten', async () => {
  const noFlag = baseSeed();
  noFlag['rolePermissions/read'] = {follow: false};
  const db = makeDb(noFlag);
  await rejectsWith(request(db, 'anna', 'ben'), 'permission-denied');
  // Ziel ohne Flag: gleiche Antwort wie "gibt es nicht"
  await rejectsWith(request(db, 'ben', 'anna'), 'not-found');
  await rejectsWith(request(db, 'ben', 'unbekannt'), 'not-found');
});

test('requestFollow schlägt geschlossen fehl, wenn rolePermissions fehlt', async () => {
  const seed = baseSeed();
  delete seed['rolePermissions/read'];
  const db = makeDb(seed);
  await rejectsWith(request(db, 'anna', 'ben'), 'permission-denied');
});

test('Tageslimit zählt jeden Aufruf und greift beim 21.', async () => {
  const db = makeDb(baseSeed());
  for (let i = 0; i < follow.FOLLOW_REQUESTS_PER_DAY; i++) {
    await request(db, 'anna', 'ben');
  }
  await rejectsWith(request(db, 'anna', 'cleo'), 'resource-exhausted');
  assert.equal(db.store.has('follows/anna_cleo'), false);
  // am nächsten Tag wieder frei
  assert.deepEqual(await request(db, 'anna', 'cleo', {nowMs: NOW + DAY}), {status: 'pending'});
});

test('Annehmen setzt status, räumt Inbox und Sperre ab', async () => {
  const db = makeDb(baseSeed());
  await request(db, 'anna', 'ben');
  assert.deepEqual(await respond(db, 'ben', 'anna', 'accept'), {status: 'accepted'});
  const doc = db.store.get('follows/anna_ben');
  assert.equal(doc.status, 'accepted');
  assert.equal(doc.respondedAt, SERVER_TS);
  assert.equal(db.store.has('users/ben/followInbox/anna'), false);
});

test('Nur der Gefolgte kann antworten', async () => {
  const db = makeDb(baseSeed());
  await request(db, 'anna', 'ben');
  // cleo hat keine Anfrage von anna
  await rejectsWith(respond(db, 'cleo', 'anna', 'accept'), 'not-found');
  // anna ist die Anfragende: ihre "Antwort" trifft follows/<anna als Gefolgte>
  await rejectsWith(respond(db, 'anna', 'ben', 'accept'), 'not-found');
  assert.equal(db.store.get('follows/anna_ben').status, 'pending');
});

test('Still ablehnen: follows bleibt pending, Inbox leer, 30 Tage Sperre', async () => {
  const db = makeDb(baseSeed());
  await request(db, 'anna', 'ben');
  assert.deepEqual(await respond(db, 'ben', 'anna', 'decline'), {status: 'declined'});
  assert.equal(db.store.get('follows/anna_ben').status, 'pending');
  assert.equal(db.store.has('users/ben/followInbox/anna'), false);
  assert.equal(db.store.get('followCooldowns/anna_ben').until.toMillis(), NOW + 30 * DAY);
});

test('Abgelehnte Anfrage lässt sich nicht nachträglich annehmen', async () => {
  const db = makeDb(baseSeed());
  await request(db, 'anna', 'ben');
  await respond(db, 'ben', 'anna', 'decline');
  await rejectsWith(respond(db, 'ben', 'anna', 'accept'), 'failed-precondition');
});

test('Neue Anfrage nach Zurückziehen innerhalb der Sperrfrist bleibt unsichtbar', async () => {
  const db = makeDb(baseSeed());
  await request(db, 'anna', 'ben');
  await respond(db, 'ben', 'anna', 'decline');
  db.store.delete('follows/anna_ben'); // Anfragende zieht zurück (Client-Delete)
  assert.deepEqual(await request(db, 'anna', 'ben', {nowMs: NOW + 5 * DAY}), {status: 'pending'});
  assert.equal(db.store.get('follows/anna_ben').status, 'pending');
  assert.equal(db.store.has('users/ben/followInbox/anna'), false);
});

test('Nach Ablauf der Sperrfrist kommt die Anfrage wieder in die Inbox', async () => {
  const db = makeDb(baseSeed());
  await request(db, 'anna', 'ben');
  await respond(db, 'ben', 'anna', 'decline');
  db.store.delete('follows/anna_ben');
  await request(db, 'anna', 'ben', {nowMs: NOW + 31 * DAY});
  assert.ok(db.store.has('users/ben/followInbox/anna'));
});

test('Blockieren löscht die Beziehung und sperrt dauerhaft', async () => {
  const db = makeDb(baseSeed());
  await request(db, 'anna', 'ben');
  await respond(db, 'ben', 'anna', 'accept');
  assert.deepEqual(await respond(db, 'ben', 'anna', 'block'), {status: 'blocked'});
  assert.equal(db.store.has('follows/anna_ben'), false);
  assert.equal(db.store.get('followCooldowns/anna_ben').blocked, true);
  // Auch nach einem Jahr: für Anna "Angefragt", für Ben nichts in der Inbox
  assert.deepEqual(await request(db, 'anna', 'ben', {nowMs: NOW + 365 * DAY}), {status: 'pending'});
  assert.equal(db.store.has('users/ben/followInbox/anna'), false);
});

test('Blockieren legt einen Eintrag in followBlocks an, Entsperren nimmt Sperre und Eintrag weg', async () => {
  const db = makeDb(baseSeed());
  await request(db, 'anna', 'ben');
  await respond(db, 'ben', 'anna', 'block');
  assert.ok(db.store.has('users/ben/followBlocks/anna'));
  assert.deepEqual(await respond(db, 'ben', 'anna', 'unblock'), {status: 'unblocked'});
  assert.equal(db.store.has('users/ben/followBlocks/anna'), false);
  assert.equal(db.store.has('followCooldowns/anna_ben'), false);
  // Anna kann wieder anfragen und landet in Bens Inbox
  db.store.delete('follows/anna_ben');
  await request(db, 'anna', 'ben');
  assert.ok(db.store.has('users/ben/followInbox/anna'));
});

test('Entsperren hebt eine Sperrfrist nach Ablehnung nicht auf', async () => {
  const db = makeDb(baseSeed());
  await request(db, 'anna', 'ben');
  await respond(db, 'ben', 'anna', 'decline');
  await respond(db, 'ben', 'anna', 'unblock');
  assert.ok(db.store.has('followCooldowns/anna_ben'));
});

test('Ablehnen einer bereits angenommenen Beziehung ist nicht möglich', async () => {
  const db = makeDb(baseSeed());
  await request(db, 'anna', 'ben');
  await respond(db, 'ben', 'anna', 'accept');
  await rejectsWith(respond(db, 'ben', 'anna', 'decline'), 'failed-precondition');
});

test('respondFollow prüft Aktion, ID, Gäste und das Flag des Antwortenden', async () => {
  const db = makeDb(baseSeed());
  await request(db, 'anna', 'ben');
  await rejectsWith(respond(db, 'ben', 'anna', 'mute'), 'invalid-argument');
  await rejectsWith(respond(db, 'ben', '', 'accept'), 'invalid-argument');
  await rejectsWith(follow.respondFollow(fakeAdmin, db, FakeHttpsError,
      {auth: auth('ben', 'anonymous'), followerId: 'anna', action: 'accept'}), 'permission-denied');
  await rejectsWith(follow.respondFollow(fakeAdmin, db, FakeHttpsError,
      {auth: null, followerId: 'anna', action: 'accept'}), 'unauthenticated');
  db.store.set('rolePermissions/edit', {follow: false});
  await rejectsWith(respond(db, 'ben', 'anna', 'accept'), 'permission-denied');
});

test('isCooldownActive', () => {
  assert.equal(follow.isCooldownActive(null, NOW), false);
  assert.equal(follow.isCooldownActive({blocked: true}, NOW), true);
  assert.equal(follow.isCooldownActive({until: {toMillis: () => NOW + 1}}, NOW), true);
  assert.equal(follow.isCooldownActive({until: {toMillis: () => NOW}}, NOW), false);
  assert.equal(follow.isCooldownActive({blocked: false}, NOW), false);
});

test('onNewRequest läuft einmal bei einer neuen, sichtbaren Anfrage', async () => {
  const db = makeDb(baseSeed());
  const calls = [];
  const onNewRequest = async (info) => calls.push(info);
  await request(db, 'anna', 'ben', {onNewRequest});
  assert.deepEqual(calls, [{followerId: 'anna', followeeId: 'ben'}]);
  // wiederholter Aufruf mit bestehender Anfrage: kein zweiter Push
  await request(db, 'anna', 'ben', {onNewRequest});
  assert.equal(calls.length, 1);
});

test('onNewRequest bleibt aus bei Sperre und bei noch stehender Inbox-Zeile', async () => {
  const db = makeDb(baseSeed());
  const calls = [];
  const onNewRequest = async (info) => calls.push(info);
  await request(db, 'anna', 'ben', {onNewRequest});
  // Anfragende zieht zurück und fragt neu an, die alte Inbox-Zeile steht noch
  db.store.delete('follows/anna_ben');
  await request(db, 'anna', 'ben', {onNewRequest});
  assert.equal(calls.length, 1);
  // Sperre (Ablehnung): Anfrage sieht normal aus, löst aber nichts aus
  await respond(db, 'ben', 'anna', 'decline');
  db.store.delete('follows/anna_ben');
  await request(db, 'anna', 'ben', {onNewRequest, nowMs: NOW + DAY});
  assert.equal(calls.length, 1);
});

test('Fehler im Push ändern die Antwort nicht', async () => {
  const db = makeDb(baseSeed());
  const original = console.error;
  console.error = () => {};
  try {
    const result = await request(db, 'anna', 'ben', {
      onNewRequest: async () => { throw new Error('fcm down'); },
    });
    assert.deepEqual(result, {status: 'pending'});
    assert.ok(db.store.has('users/ben/followInbox/anna'));
  } finally {
    console.error = original;
  }
});

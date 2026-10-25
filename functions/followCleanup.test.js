const test = require('node:test');
const assert = require('node:assert/strict');
const {cleanupFollowData} = require('./followCleanup');

const DOC_ID = Symbol('documentId');
const fakeAdmin = {firestore: {FieldPath: {documentId: () => DOC_ID}}};

/** Minimaler Firestore-Ersatz: Pfad -> Daten, Sammlungen mit where und Batches. */
const makeDb = (seed) => {
  const store = new Map(Object.entries(seed));
  const ref = (path) => ({path, id: path.split('/').pop()});
  const docsOf = (collection) => [...store.keys()]
      .filter((path) => path.startsWith(`${collection}/`) && !path.slice(collection.length + 1).includes('/'))
      .map((path) => ({id: path.split('/').pop(), ref: ref(path), data: () => store.get(path)}));
  const query = (collection, filters) => ({
    where: (field, op, value) => query(collection, [...filters, {field, op, value}]),
    get: async () => ({
      docs: docsOf(collection).filter((doc) => filters.every(({field, op, value}) => {
        const actual = field === DOC_ID ? doc.id : doc.data()[field];
        if (op === '==') return actual === value;
        if (op === '>=') return actual >= value;
        if (op === '<') return actual < value;
        throw new Error(`op ${op}`);
      })),
    }),
  });
  return {
    store,
    batches: [],
    doc: ref,
    collection: (collection) => query(collection, []),
    batch() {
      const ops = [];
      this.batches.push(ops);
      return {
        delete: (r) => ops.push(r.path),
        commit: async () => ops.forEach((path) => store.delete(path)),
      };
    },
  };
};

const seed = () => ({
  'follows/anna_ben': {followerId: 'anna', followeeId: 'ben', status: 'accepted'},
  'follows/cleo_anna': {followerId: 'cleo', followeeId: 'anna', status: 'pending'},
  'follows/cleo_ben': {followerId: 'cleo', followeeId: 'ben', status: 'accepted'},
  'followCooldowns/anna_ben': {blocked: false},
  'followCooldowns/cleo_anna': {blocked: true},
  'followCooldowns/anna_dora': {blocked: false},
  'followCooldowns/cleo_ben': {blocked: false},
  'followCooldowns/annabelle_ben': {blocked: false},
  'followLimits/anna_2026-10-25': {count: 3},
  'followLimits/annabelle_2026-10-25': {count: 1},
  'users/anna/followInbox/cleo': {},
  'users/anna/followBlocks/emil': {},
  'followCooldowns/emil_anna': {blocked: true},
  'users/anna/fuerDichEntdeckt/current': {},
  'users/ben/followInbox/anna': {},
  'users/ben/followBlocks/anna': {},
  'users/ben/followInbox/cleo': {},
  'users/anna': {role: 'read'},
});

test('löscht Follow-Daten des Mitglieds in beiden Richtungen samt Gegenstücken', async () => {
  const db = makeDb(seed());
  await cleanupFollowData(fakeAdmin, db, 'anna');
  for (const path of [
    'follows/anna_ben', 'follows/cleo_anna',
    'followCooldowns/anna_ben', 'followCooldowns/cleo_anna', 'followCooldowns/anna_dora',
    'followCooldowns/emil_anna', 'followLimits/anna_2026-10-25',
    'users/anna/followInbox/cleo', 'users/anna/followBlocks/emil', 'users/anna/fuerDichEntdeckt/current',
    'users/ben/followInbox/anna', 'users/ben/followBlocks/anna',
  ]) {
    assert.equal(db.store.has(path), false, `${path} sollte gelöscht sein`);
  }
});

test('lässt fremde Daten und Namen mit gleichem Präfix unberührt', async () => {
  const db = makeDb(seed());
  await cleanupFollowData(fakeAdmin, db, 'anna');
  for (const path of [
    'follows/cleo_ben', 'followCooldowns/cleo_ben', 'followCooldowns/annabelle_ben',
    'followLimits/annabelle_2026-10-25', 'users/ben/followInbox/cleo', 'users/anna',
  ]) {
    assert.equal(db.store.has(path), true, `${path} muss bleiben`);
  }
});

test('ohne Follow-Daten: nichts zu tun, kein Fehler', async () => {
  const db = makeDb({'users/zoe': {role: 'read'}});
  assert.equal(await cleanupFollowData(fakeAdmin, db, 'zoe'), 0);
});

test('lehnt ungültige UIDs ab, ohne zu löschen', async () => {
  const db = makeDb(seed());
  assert.equal(await cleanupFollowData(fakeAdmin, db, ''), 0);
  assert.equal(await cleanupFollowData(fakeAdmin, db, 'a/b'), 0);
  assert.equal(db.batches.length, 0);
});

test('teilt viele Löschungen in Batches unter dem Firestore-Limit', async () => {
  const many = {};
  for (let i = 0; i < 1000; i++) many[`follows/u${i}_anna`] = {followerId: `u${i}`, followeeId: 'anna'};
  const db = makeDb(many);
  await cleanupFollowData(fakeAdmin, db, 'anna');
  assert.ok(db.batches.every((ops) => ops.length <= 400));
  assert.equal([...db.store.keys()].filter((p) => p.startsWith('follows/')).length, 0);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const {deleteCookDatesOfUser} = require('./accountCleanup');

const makeDb = (seed) => {
  const store = new Map(Object.entries(seed));
  const batches = [];
  return {
    store,
    batches,
    collection: (name) => ({
      where: (field, op, value) => ({
        get: async () => ({
          docs: [...store.entries()]
              .filter(([path, data]) => path.startsWith(`${name}/`) && op === '==' && data[field] === value)
              .map(([path]) => ({ref: {path}})),
        }),
      }),
    }),
    batch() {
      const ops = [];
      batches.push(ops);
      return {delete: (ref) => ops.push(ref.path), commit: async () => ops.forEach((p) => store.delete(p))};
    },
  };
};

test('löscht nur die Einträge des Mitglieds', async () => {
  const db = makeDb({
    'cookDates/1': {userId: 'anna', recipeId: 'r1'},
    'cookDates/2': {userId: 'anna', recipeId: 'r2'},
    'cookDates/3': {userId: 'ben', recipeId: 'r1'},
  });
  assert.equal(await deleteCookDatesOfUser(db, 'anna'), 2);
  assert.deepEqual([...db.store.keys()], ['cookDates/3']);
});

test('ungültige UID: nichts gelöscht', async () => {
  const db = makeDb({'cookDates/1': {userId: 'anna'}});
  assert.equal(await deleteCookDatesOfUser(db, ''), 0);
  assert.equal(await deleteCookDatesOfUser(db, 'a/b'), 0);
  assert.equal(db.store.size, 1);
});

test('große Mengen in Batches bis 400', async () => {
  const seed = {};
  for (let i = 0; i < 950; i++) seed[`cookDates/${i}`] = {userId: 'anna'};
  const db = makeDb(seed);
  assert.equal(await deleteCookDatesOfUser(db, 'anna'), 950);
  assert.ok(db.batches.every((ops) => ops.length <= 400));
  assert.equal(db.store.size, 0);
});

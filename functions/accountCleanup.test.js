const test = require('node:test');
const assert = require('node:assert/strict');
const {deleteCookDatesOfUser, deleteNonPublicRecipesOfUser, isPublicRecipe} = require('./accountCleanup');

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
              .filter(([path, data]) => path.startsWith(`${name}/`) && !path.slice(name.length + 1).includes('/') &&
                op === '==' && data[field] === value)
              .map(([path, data]) => ({id: path.split('/').pop(), ref: {path}, data: () => data})),
        }),
      }),
    }),
    doc: (path) => ({get: async () => ({exists: store.has(path), data: () => store.get(path)})}),
    recursiveDelete: async (ref) => {
      [...store.keys()].filter((p) => p === ref.path || p.startsWith(`${ref.path}/`)).forEach((p) => store.delete(p));
    },
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

const storageUrl = (path) =>
  `https://firebasestorage.googleapis.com/v0/b/b/o/${encodeURIComponent(path)}?alt=media&token=t`;

const makeBucket = (failFor) => {
  const deleted = [];
  return {
    deleted,
    file: (path) => ({
      delete: async () => {
        if (path === failFor) throw new Error('boom');
        deleted.push(path);
      },
    }),
  };
};

const recipeSeed = () => ({
  'groups/g-public': {type: 'public'},
  'groups/g-private': {type: 'private', memberIds: ['anna', 'ben']},
  'recipes/draft': {authorId: 'anna', isPrivate: true, images: [{url: storageUrl('recipes/draft/a.jpg')}], image: 'data:image/png;base64,xx'},
  'recipes/privateList': {authorId: 'anna', groupId: 'g-private', image: storageUrl('recipes/privateList/b.jpg')},
  'recipes/privateList/ratings/ben': {value: 5},
  'recipes/orphanList': {authorId: 'anna', groupId: 'g-gone'},
  'recipes/published': {authorId: 'anna', groupId: 'g-private', publishedToPublic: true},
  'recipes/inPublicList': {authorId: 'anna', groupId: 'g-public'},
  'recipes/plain': {authorId: 'anna'},
  'recipes/foreign': {authorId: 'ben', groupId: 'g-private'},
  'cookDates/c1': {userId: 'ben', recipeId: 'privateList'},
  'cookDates/c2': {userId: 'ben', recipeId: 'plain'},
});

test('isPublicRecipe: Entwurf und private Liste sind nicht öffentlich', () => {
  const groups = new Map([['g-public', {type: 'public'}], ['g-private', {type: 'private'}]]);
  assert.equal(isPublicRecipe({isPrivate: true}, groups), false);
  assert.equal(isPublicRecipe({isPrivate: true, groupId: 'g-public'}, groups), false);
  assert.equal(isPublicRecipe({groupId: 'g-private'}, groups), false);
  assert.equal(isPublicRecipe({groupId: 'g-gone'}, groups), false);
  assert.equal(isPublicRecipe({groupId: 'g-private', publishedToPublic: true}, groups), true);
  assert.equal(isPublicRecipe({groupId: 'g-public'}, groups), true);
  assert.equal(isPublicRecipe({groupId: 'x', groupType: 'public'}, groups), true);
  assert.equal(isPublicRecipe({}, groups), true);
});

test('löscht Entwürfe und Rezepte in privaten Listen, öffentliche und fremde bleiben', async () => {
  const db = makeDb(recipeSeed());
  const bucket = makeBucket();
  assert.deepEqual(await deleteNonPublicRecipesOfUser({db, bucket}, 'anna'), {deleted: 3, kept: 3});
  for (const gone of ['recipes/draft', 'recipes/privateList', 'recipes/privateList/ratings/ben', 'recipes/orphanList']) {
    assert.equal(db.store.has(gone), false, gone);
  }
  for (const kept of ['recipes/published', 'recipes/inPublicList', 'recipes/plain', 'recipes/foreign']) {
    assert.equal(db.store.has(kept), true, kept);
  }
});

test('räumt Bilder im Storage und fremde cookDates auf den gelöschten Rezepten auf', async () => {
  const db = makeDb(recipeSeed());
  const bucket = makeBucket();
  await deleteNonPublicRecipesOfUser({db, bucket}, 'anna');
  assert.deepEqual(bucket.deleted.sort(), ['recipes/draft/a.jpg', 'recipes/privateList/b.jpg']);
  assert.equal(db.store.has('cookDates/c1'), false);
  assert.equal(db.store.has('cookDates/c2'), true);
});

test('ein Bild, das sich nicht löschen lässt, hält das Löschen des Rezepts nicht auf', async () => {
  const db = makeDb(recipeSeed());
  const bucket = makeBucket('recipes/draft/a.jpg');
  const logged = console.error;
  console.error = () => {};
  try {
    await deleteNonPublicRecipesOfUser({db, bucket}, 'anna');
  } finally {
    console.error = logged;
  }
  assert.equal(db.store.has('recipes/draft'), false);
});

test('Rezepte anderer Autoren und ungültige UID bleiben unberührt', async () => {
  const db = makeDb(recipeSeed());
  assert.deepEqual(await deleteNonPublicRecipesOfUser({db, bucket: makeBucket()}, 'a/b'), {deleted: 0, kept: 0});
  assert.deepEqual(await deleteNonPublicRecipesOfUser({db, bucket: makeBucket()}, 'zoe'), {deleted: 0, kept: 0});
  assert.equal(db.store.has('recipes/foreign'), true);
});

test('unlesbare Liste: Fehler statt Raten, nichts gelöscht', async () => {
  const db = makeDb(recipeSeed());
  db.doc = () => ({get: async () => { throw new Error('unavailable'); }});
  await assert.rejects(deleteNonPublicRecipesOfUser({db, bucket: makeBucket()}, 'anna'), /unavailable/);
  assert.equal(db.store.has('recipes/draft'), true);
});

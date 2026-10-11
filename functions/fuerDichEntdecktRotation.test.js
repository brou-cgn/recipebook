const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isRotationDue, pickRecipeIds, ROTATION_INTERVAL_MS,
} = require('./fuerDichEntdecktRotation');

const DAY = 24 * 60 * 60 * 1000;
const list = (rotatedAt) => ({systemKey: 'fuerDichEntdeckt', rotatedAt});

test('rotation is due for a new list and after a week, not before', () => {
  const now = 100 * DAY;
  assert.equal(isRotationDue(list(undefined), now), true);
  assert.equal(isRotationDue(list(now - 6 * DAY), now), false);
  assert.equal(isRotationDue(list(now - ROTATION_INTERVAL_MS), now), true);
  assert.equal(isRotationDue({name: 'Andere Liste'}, now), false);
});

test('rotatedAt may be a Firestore Timestamp', () => {
  const now = 100 * DAY;
  assert.equal(isRotationDue(list({toMillis: () => now - 8 * DAY}), now), true);
});

const pumpkins = Array.from({length: 7}, (_, i) => ({id: `t${i}`, title: `Kürbissuppe ${i}`}));

test('picks 5 theme recipes, title matches before ingredient matches', () => {
  const recipes = [
    {id: 'ing', title: 'Risotto', ingredients: [{name: 'Hokkaido'}]},
    ...pumpkins,
    {id: 'other', title: 'Pizza', ingredients: ['Tomate']},
  ];
  const ids = pickRecipeIds(recipes, [], () => 0.5);
  assert.equal(ids.length, 5);
  assert.ok(ids.every((id) => id.startsWith('t')));
});

test('prefers recipes the list did not hold last week', () => {
  const ids = pickRecipeIds(pumpkins, ['t0', 't1', 't2'], () => 0.5);
  assert.equal(ids.slice(0, 4).some((id) => ['t0', 't1', 't2'].includes(id)), false);
});

test('reuses last week\'s recipes when too few new ones exist', () => {
  const ids = pickRecipeIds(pumpkins.slice(0, 5), ['t0', 't1'], () => 0.5);
  assert.equal(ids.length, 5);
});

test('skips private, pending and group-locked recipes', () => {
  const ids = pickRecipeIds([
    {id: 'a', title: 'Kürbis', isPrivate: true},
    {id: 'b', title: 'Kürbis', isTemp: true},
    {id: 'c', title: 'Kürbis', groupId: 'g1'},
    {id: 'd', title: 'Kürbis', groupId: 'g1', publishedToPublic: true},
    {id: 'e', title: 'Kürbis'},
  ]);
  assert.deepEqual(ids.sort(), ['d', 'e']);
});

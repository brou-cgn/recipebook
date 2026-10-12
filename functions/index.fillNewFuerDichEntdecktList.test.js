/* eslint-disable require-jsdoc */
/**
 * Tests for fillNewFuerDichEntdecktList: a freshly created "Für dich entdeckt"
 * list is filled right away (instead of waiting for the 04:00 rotation), each
 * list draws its own topic, and a topic without recipes the owner may see is
 * not a candidate for that owner.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

let fillNewList;
let db; // { discoverTopics, recipes, groups, users, recipeSwipeFlags } -> { id: data }
let updates; // [{ collection, id, data }]

const serverTimestamp = {__serverTimestamp: true};

function snapshot(collection, id) {
  const data = db[collection][id];
  return {
    id,
    exists: data !== undefined,
    data: () => data,
    ref: {update: async (patch) => {
      updates.push({collection, id, data: patch});
      db[collection][id] = {...db[collection][id], ...patch};
    }},
  };
}

function loadFunction() {
  delete require.cache[require.resolve('./index')];
  const Module = require('module');
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain, ...args) {
    if (request === 'firebase-functions/v2/https') {
      return {onCall: (_o, h) => h, onRequest: (_o, h) => h, HttpsError: class extends Error {}};
    }
    if (request === 'firebase-functions/v2/firestore') {
      return {onDocumentCreated: (_o, h) => h, onDocumentWritten: (_o, h) => h};
    }
    if (request === 'firebase-functions/v2/scheduler') return {onSchedule: (_o, h) => h};
    if (request === 'firebase-functions/params') return {defineSecret: () => ({value: () => ''})};
    if (request === 'firebase-admin') {
      const firestore = () => ({
        collection: (name) => ({
          get: async () => ({
            docs: Object.keys(db[name] || {}).map((id) => snapshot(name, id)),
          }),
          doc: (id) => ({get: async () => snapshot(name, id)}),
          where: () => ({where: () => ({get: async () => ({docs: []})}), get: async () => ({docs: []})}),
        }),
      });
      firestore.FieldValue = {serverTimestamp: () => serverTimestamp, delete: () => null};
      return {initializeApp: () => {}, firestore};
    }
    return originalLoad.call(this, request, parent, isMain, ...args);
  };
  fillNewList = require('./index').fillNewFuerDichEntdecktList;
  Module._load = originalLoad;
}

const newListEvent = (id, data) => ({params: {groupId: id}, data: {data: () => data}});
const listData = (ownerId) => ({systemKey: 'fuerDichEntdeckt', ownerId, type: 'private', recipeIds: []});

test.beforeEach(() => {
  updates = [];
  db = {
    discoverTopics: {
      kuerbis: {isActive: true, beschreibung: 'Kürbiszeit', rubrik: 'Saison', recipeIds: ['r1', 'r2']},
      pilze: {isActive: true, beschreibung: 'Herbstlich', rubrik: 'Saison', recipeIds: ['r3']},
    },
    recipes: {
      r1: {title: 'Hokkaido-Suppe'},
      r2: {title: 'Butternut-Curry'},
      r3: {title: 'Pilzpfanne', isPrivate: true, authorId: 'someone-else'},
    },
    groups: {fuerDichEntdeckt_u1: listData('u1')},
    users: {u1: {role: 'edit'}},
  };
  loadFunction();
});

test('fills a new list with recipes of a topic and stamps rotatedAt', async () => {
  await fillNewList(newListEvent('fuerDichEntdeckt_u1', listData('u1')));
  assert.equal(updates.length, 1);
  const {data} = updates[0];
  assert.equal(data.themeId, 'kuerbis');
  assert.equal(data.description, 'Kürbiszeit');
  assert.equal(data.themeLabel, 'Saison');
  assert.deepEqual([...data.recipeIds].sort(), ['r1', 'r2']);
  assert.equal(data.rotatedAt, serverTimestamp);
});

test('ignores groups that are not "Für dich entdeckt" lists', async () => {
  await fillNewList(newListEvent('g1', {type: 'private', ownerId: 'u1'}));
  assert.equal(updates.length, 0);
});

test('a topic without recipes visible to the owner is not drawn for them', async () => {
  // Topic "pilze" only holds a draft by someone else: u1 may not see it, so u1
  // always gets "kuerbis" - never an empty list while another topic fits.
  for (let i = 0; i < 20; i++) {
    updates = [];
    await fillNewList(newListEvent('fuerDichEntdeckt_u1', listData('u1')));
    assert.equal(updates[0].data.themeId, 'kuerbis');
  }
});

test('the list stays empty when no topic has recipes visible to the owner', async () => {
  delete db.discoverTopics.kuerbis;
  await fillNewList(newListEvent('fuerDichEntdeckt_u1', listData('u1')));
  assert.equal(updates.length, 0);
});

test('the author of a draft can draw the topic that holds it', async () => {
  delete db.discoverTopics.kuerbis;
  db.users.u2 = {role: 'edit'};
  db.groups.fuerDichEntdeckt_u2 = listData('u2');
  db.recipes.r3.authorId = 'u2';
  await fillNewList(newListEvent('fuerDichEntdeckt_u2', listData('u2')));
  assert.equal(updates[0].data.themeId, 'pilze');
});

test('does nothing when no topic is relevant today', async () => {
  db.discoverTopics = {};
  await fillNewList(newListEvent('fuerDichEntdeckt_u1', listData('u1')));
  assert.equal(updates.length, 0);
});

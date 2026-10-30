const test = require('node:test');
const assert = require('node:assert/strict');
const {countNewRecipes, buildPushText, sendFuerDichEntdecktPush} = require('./fuerDichEntdecktPush');

function fakes(userData, sendResult) {
  const sent = [];
  const userUpdates = [];
  const userRef = {
    get: async () => ({exists: userData !== undefined, data: () => userData}),
    update: async (patch) => userUpdates.push(patch),
  };
  const db = {collection: () => ({doc: () => userRef})};
  const admin = {
    messaging: () => ({
      sendEachForMulticast: async (message) => {
        sent.push(message);
        return sendResult || {
          successCount: message.tokens.length,
          responses: message.tokens.map(() => ({success: true})),
        };
      },
    }),
  };
  return {admin, db, sent, userUpdates};
}

const info = {listId: 'fuerDichEntdeckt_u1', label: 'Kürbiszeit', newCount: 3};

test('countNewRecipes counts only recipes the list did not hold before', () => {
  assert.equal(countNewRecipes(['a', 'b'], ['b', 'c', 'd']), 2);
  assert.equal(countNewRecipes(undefined, ['a', 'a']), 1);
  assert.equal(countNewRecipes(['a'], ['a']), 0);
});

test('buildPushText uses singular and plural and works without a label', () => {
  assert.equal(buildPushText({listId: 'l', label: 'Kürbiszeit', newCount: 3}).body,
      'Kürbiszeit: 3 neue Rezepte warten auf dich.');
  assert.equal(buildPushText({listId: 'l', newCount: 1}).body, '1 neues Rezept wartet auf dich.');
});

test('sends one data push to all tokens of an opted-in owner', async () => {
  const {admin, db, sent} = fakes({backgroundUpdatesEnabled: true, fcmTokens: ['t1', 't2']});
  const count = await sendFuerDichEntdecktPush(admin, db, 'u1', info);
  assert.equal(count, 2);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].tokens, ['t1', 't2']);
  assert.equal(sent[0].data.type, 'fuer_dich_entdeckt');
  assert.equal(sent[0].data.title, 'Neu für dich entdeckt');
  assert.equal(sent[0].data.listId, 'fuerDichEntdeckt_u1');
});

test('sends nothing without opt-in, tokens, user or new recipes', async () => {
  for (const [userData, i] of [
    [{fcmTokens: ['t1']}, info],
    [{backgroundUpdatesEnabled: true, fcmTokens: []}, info],
    [undefined, info],
    [{backgroundUpdatesEnabled: true, fcmTokens: ['t1']}, {...info, newCount: 0}],
  ]) {
    const {admin, db, sent} = fakes(userData);
    assert.equal(await sendFuerDichEntdecktPush(admin, db, 'u1', i), 0);
    assert.equal(sent.length, 0);
  }
});

test('removes tokens that FCM reports as no longer valid', async () => {
  const {admin, db, userUpdates} = fakes(
      {backgroundUpdatesEnabled: true, fcmTokens: ['good', 'stale']},
      {
        successCount: 1,
        responses: [
          {success: true},
          {success: false, error: {code: 'messaging/registration-token-not-registered'}},
        ],
      });
  assert.equal(await sendFuerDichEntdecktPush(admin, db, 'u1', info), 1);
  assert.deepEqual(userUpdates, [{fcmTokens: ['good']}]);
});

test('never throws when sending fails', async () => {
  const {db} = fakes({backgroundUpdatesEnabled: true, fcmTokens: ['t1']});
  const admin = {messaging: () => ({sendEachForMulticast: async () => {
    throw new Error('boom');
  }})};
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal(await sendFuerDichEntdecktPush(admin, db, 'u1', info), 0);
  } finally {
    console.error = originalError;
  }
});

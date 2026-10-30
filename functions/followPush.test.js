const test = require('node:test');
const assert = require('node:assert/strict');
const {buildFollowPushText, sendFollowRequestPush} = require('./followPush');

function fakes({user, profile}, sendResult) {
  const sent = [];
  const userRef = {
    get: async () => ({exists: user !== undefined, data: () => user}),
    update: async () => {},
  };
  const db = {
    collection: () => ({doc: () => userRef}),
    doc: (path) => ({
      get: async () => ({
        exists: path === 'publicProfiles/anna' && profile !== undefined,
        data: () => profile,
      }),
    }),
  };
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
  return {admin, db, sent};
}

const optedIn = {backgroundUpdatesEnabled: true, fcmTokens: ['t1']};
const info = {followerId: 'anna', followeeId: 'ben'};

test('buildFollowPushText nennt den Namen oder "Jemand"', () => {
  assert.equal(buildFollowPushText({followerId: 'anna', name: 'Anna'}).body, 'Anna möchte dir folgen.');
  assert.equal(buildFollowPushText({followerId: 'anna'}).body, 'Jemand möchte dir folgen.');
  assert.equal(buildFollowPushText({followerId: 'anna'}).title, 'Neue Follow-Anfrage');
});

test('sendet eine Data-Nachricht mit Typ follow_request und Vornamen', async () => {
  const {admin, db, sent} = fakes({user: optedIn, profile: {vorname: ' Anna ', versteckt: false}});
  assert.equal(await sendFollowRequestPush(admin, db, info), 1);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].tokens, ['t1']);
  assert.equal(sent[0].data.type, 'follow_request');
  assert.equal(sent[0].data.title, 'Neue Follow-Anfrage');
  assert.equal(sent[0].data.body, 'Anna möchte dir folgen.');
});

test('ein versteckter Nutzer wird mit Namen genannt', async () => {
  const {admin, db, sent} = fakes({user: optedIn, profile: {vorname: 'Anna', versteckt: true}});
  await sendFollowRequestPush(admin, db, {followerId: 'anna', followeeId: 'ben'});
  assert.equal(sent[0].data.body, 'Anna möchte dir folgen.');
});

test('fehlendes Profil erscheint als "Jemand"', async () => {
  for (const profile of [undefined, {}]) {
    const {admin, db, sent} = fakes({user: optedIn, profile});
    await sendFollowRequestPush(admin, db, info);
    assert.equal(sent[0].data.body, 'Jemand möchte dir folgen.');
  }
});

test('sendet nichts ohne Opt-in, Token oder Nutzer', async () => {
  for (const user of [{fcmTokens: ['t1']}, {backgroundUpdatesEnabled: true, fcmTokens: []}, undefined]) {
    const {admin, db, sent} = fakes({user, profile: {vorname: 'Anna'}});
    assert.equal(await sendFollowRequestPush(admin, db, info), 0);
    assert.equal(sent.length, 0);
  }
});

test('wirft nie und sendet nichts ohne IDs', async () => {
  const {admin, db, sent} = fakes({user: optedIn});
  assert.equal(await sendFollowRequestPush(admin, db, {followerId: '', followeeId: 'ben'}), 0);
  assert.equal(sent.length, 0);
  const broken = {
    ...admin,
    messaging: () => ({sendEachForMulticast: async () => { throw new Error('fcm down'); }}),
  };
  const original = console.error;
  console.error = () => {};
  try {
    assert.equal(await sendFollowRequestPush(broken, db, info), 0);
  } finally {
    console.error = original;
  }
});

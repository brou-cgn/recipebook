const test = require('node:test');
const { setupEnv, seedUsers, seed, as, assertFails, assertSucceeds } = require('./helpers');

let env;
test.before(async () => { env = await setupEnv(); });
test.after(async () => { await env.cleanup(); });
test.beforeEach(async () => {
  await seedUsers(env);
  await seed(env, (db) => db.doc('settings/app/aiPromptHistory/h1').set({ prompt: 'alt', archivedBy: 'admin' }));
});

const entry = { prompt: 'alt', archivedBy: 'admin' };

test('aiPromptHistory: Admin kann lesen und Einträge anlegen', async () => {
  const db = as.user(env, 'admin');
  await assertSucceeds(db.collection('settings').doc('app').collection('aiPromptHistory').get());
  await assertSucceeds(db.collection('settings').doc('app').collection('aiPromptHistory').add(entry));
});

test('aiPromptHistory: Einträge sind unveränderlich', async () => {
  await assertFails(as.user(env, 'admin').doc('settings/app/aiPromptHistory/h1').update({ prompt: 'neu' }));
});

test('aiPromptHistory: Nicht-Admins haben keinen Zugriff', async () => {
  for (const uid of ['reader', 'ohneProfil']) {
    const db = as.user(env, uid);
    await assertFails(db.collection('settings').doc('app').collection('aiPromptHistory').get());
    await assertFails(db.collection('settings').doc('app').collection('aiPromptHistory').add(entry));
  }
  await assertFails(as.unauth(env).doc('settings/app/aiPromptHistory/h1').get());
});

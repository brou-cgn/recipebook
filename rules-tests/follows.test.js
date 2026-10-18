const test = require('node:test');
const { Timestamp } = require('firebase/firestore');
const { setupEnv, seedUsers, seed, as, assertFails, assertSucceeds } = require('./helpers');

let env;
test.before(async () => { env = await setupEnv(); });
test.after(async () => { await env.cleanup(); });
test.beforeEach(async () => {
  await seedUsers(env);
  await seed(env, async (db) => {
    // reader folgt other (offen), editor folgt reader (angenommen)
    await db.doc('follows/reader_other').set({
      followerId: 'reader', followeeId: 'other', status: 'pending', createdAt: Timestamp.now(),
    });
    await db.doc('follows/editor_reader').set({
      followerId: 'editor', followeeId: 'reader', status: 'accepted', createdAt: Timestamp.now(),
    });
    await db.doc('users/other/followInbox/reader').set({ followerId: 'reader', createdAt: Timestamp.now() });
    await db.doc('followCooldowns/reader_other').set({ blocked: true });
    await db.doc('followLimits/reader_2026-10-18').set({ uid: 'reader', count: 3 });
  });
});

test('follows: beide Beteiligten lesen, Außenstehende nicht', async () => {
  await assertSucceeds(as.user(env, 'reader').doc('follows/reader_other').get());
  await assertSucceeds(as.user(env, 'other').doc('follows/reader_other').get());
  await assertFails(as.user(env, 'editor').doc('follows/reader_other').get());
  await assertFails(as.user(env, 'admin').doc('follows/reader_other').get());
});

test('follows: nicht angemeldet und anonym lesen nichts', async () => {
  await assertFails(as.unauth(env).doc('follows/reader_other').get());
  await assertFails(as.anonymous(env, 'reader').doc('follows/reader_other').get());
});

test('follows: Abfrage nach eigenen Beziehungen geht, ohne Filter nicht', async () => {
  const db = as.user(env, 'reader');
  await assertSucceeds(db.collection('follows').where('followerId', '==', 'reader').limit(10).get());
  await assertSucceeds(db.collection('follows').where('followeeId', '==', 'reader').limit(10).get());
  await assertFails(db.collection('follows').limit(10).get());
  await assertFails(db.collection('follows').where('followerId', '==', 'editor').limit(10).get());
});

test('follows: kein Client darf anlegen oder ändern, auch nicht für sich selbst', async () => {
  const fresh = { followerId: 'reader', followeeId: 'editor', status: 'accepted', createdAt: Timestamp.now() };
  await assertFails(as.user(env, 'reader').doc('follows/reader_editor').set(fresh));
  await assertFails(as.user(env, 'admin').doc('follows/reader_editor').set(fresh));
  // Selbst-Freischalten: der Anfragende setzt seine Anfrage auf accepted
  await assertFails(as.user(env, 'reader').doc('follows/reader_other').update({ status: 'accepted' }));
  // Der Gefolgte setzt direkt, am Callable vorbei
  await assertFails(as.user(env, 'other').doc('follows/reader_other').update({ status: 'accepted' }));
});

test('follows: beide Seiten löschen, Außenstehende nicht', async () => {
  // Anfrage zurückziehen (Anfragender)
  await assertSucceeds(as.user(env, 'reader').doc('follows/reader_other').delete());
  // Follower entfernen (Gefolgter)
  await assertSucceeds(as.user(env, 'reader').doc('follows/editor_reader').delete());
});

test('follows: Außenstehende und Admin löschen nicht', async () => {
  await assertFails(as.user(env, 'editor').doc('follows/reader_other').delete());
  await assertFails(as.user(env, 'admin').doc('follows/reader_other').delete());
  await assertFails(as.unauth(env).doc('follows/reader_other').delete());
  await assertFails(as.anonymous(env, 'reader').doc('follows/reader_other').delete());
});

test('followInbox: nur der Eigentümer liest, niemand schreibt', async () => {
  await assertSucceeds(as.user(env, 'other').doc('users/other/followInbox/reader').get());
  await assertSucceeds(as.user(env, 'other').collection('users/other/followInbox').limit(10).get());
  // Der Anfragende darf nicht prüfen, ob seine Anfrage beim Gefolgten ankam
  await assertFails(as.user(env, 'reader').doc('users/other/followInbox/reader').get());
  await assertFails(as.user(env, 'admin').doc('users/other/followInbox/reader').get());
  await assertFails(as.unauth(env).doc('users/other/followInbox/reader').get());
  await assertFails(as.user(env, 'other').doc('users/other/followInbox/reader').delete());
  await assertFails(as.user(env, 'other').doc('users/other/followInbox/zoe').set({ followerId: 'zoe' }));
  await assertFails(as.user(env, 'reader').doc('users/reader/followInbox/other').set({ followerId: 'other' }));
});

test('followBlocks: nur der Eigentümer liest, niemand schreibt', async () => {
  await seed(env, async (db) => {
    await db.doc('users/other/followBlocks/reader').set({ followerId: 'reader' });
  });
  await assertSucceeds(as.user(env, 'other').collection('users/other/followBlocks').limit(10).get());
  await assertFails(as.user(env, 'reader').doc('users/other/followBlocks/reader').get());
  await assertFails(as.user(env, 'other').doc('users/other/followBlocks/reader').delete());
  await assertFails(as.user(env, 'other').doc('users/other/followBlocks/zoe').set({ followerId: 'zoe' }));
});

test('fuerDichEntdeckt/current: nur der Eigentümer liest, niemand schreibt', async () => {
  await seed(env, async (db) => {
    await db.doc('users/other/fuerDichEntdeckt/current').set({ recipes: {} });
  });
  await assertSucceeds(as.user(env, 'other').doc('users/other/fuerDichEntdeckt/current').get());
  await assertFails(as.user(env, 'reader').doc('users/other/fuerDichEntdeckt/current').get());
  await assertFails(as.user(env, 'other').doc('users/other/fuerDichEntdeckt/current').set({ recipes: {} }));
  await assertFails(as.user(env, 'other').doc('users/other/fuerDichEntdeckt/current').delete());
});

test('followCooldowns und followLimits: weder lesen noch schreiben', async () => {
  for (const uid of ['reader', 'other', 'admin']) {
    await assertFails(as.user(env, uid).doc('followCooldowns/reader_other').get());
    await assertFails(as.user(env, uid).doc('followCooldowns/reader_other').delete());
    await assertFails(as.user(env, uid).doc('followCooldowns/x').set({ blocked: false }));
    await assertFails(as.user(env, uid).doc('followLimits/reader_2026-10-18').get());
    await assertFails(as.user(env, uid).doc('followLimits/reader_2026-10-18').set({ uid: 'reader', count: 0 }));
  }
  await assertFails(as.unauth(env).doc('followCooldowns/reader_other').get());
});

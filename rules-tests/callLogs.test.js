const test = require('node:test');
const firebase = require('firebase/compat/app');
require('firebase/compat/firestore');
const { Timestamp } = require('firebase/firestore');
const { setupEnv, seedUsers, as, assertFails, assertSucceeds } = require('./helpers');

// Aufruf-Protokolle (Tech-Check S30): Anlegen nur mit genau den Feldern, die
// logAppCall (src/utils/appCallsFirestore.js) bzw. logRecipeCall
// (src/utils/recipeCallsFirestore.js) schreiben, mit Typ und Länge und dem
// Zeitstempel des Servers. Vorher reichte userId == eigene uid.

let env;
test.before(async () => { env = await setupEnv(); });
test.after(async () => { await env.cleanup(); });
test.beforeEach(async () => { await seedUsers(env); });

const now = () => firebase.firestore.FieldValue.serverTimestamp();

const appCall = (uid, extra = {}) => ({
  userId: uid, userVorname: 'Lea', userNachname: 'Muster', isGuest: false, timestamp: now(), ...extra,
});
const recipeCall = (uid, extra = {}) => ({
  recipeId: 'r1', recipeTitle: 'Rinderrouladen', ...appCall(uid), ...extra,
});

test('appCalls: Mitglieder und Gäste protokollieren ihre eigene Sitzung wie logAppCall', async () => {
  await assertSucceeds(as.user(env, 'reader').collection('appCalls').add(appCall('reader')));
  await assertSucceeds(as.anonymous(env, 'gast1').collection('appCalls').add(
    appCall('gast1', { userVorname: '', userNachname: '', isGuest: true })));
});

test('recipeCalls: Mitglieder und Gäste protokollieren einen Rezeptaufruf wie logRecipeCall', async () => {
  await assertSucceeds(as.user(env, 'reader').collection('recipeCalls').add(recipeCall('reader')));
  await assertSucceeds(as.anonymous(env, 'gast1').collection('recipeCalls').add(
    recipeCall('gast1', { recipeTitle: '', isGuest: true })));
});

for (const [collection, valid] of [['appCalls', appCall], ['recipeCalls', recipeCall]]) {
  test(`${collection}: kein frei gewählter Zeitstempel`, async () => {
    const db = as.user(env, 'reader');
    await assertFails(db.collection(collection).add(valid('reader', { timestamp: Timestamp.fromDate(new Date('2026-11-01')) })));
    await assertFails(db.collection(collection).add(valid('reader', { timestamp: Timestamp.now() })));
  });

  test(`${collection}: keine zusätzlichen oder fehlenden Felder`, async () => {
    const db = as.user(env, 'reader');
    await assertFails(db.collection(collection).add(valid('reader', { userEmail: 'reader@example.test' })));
    await assertFails(db.collection(collection).add(valid('reader', { count: 500 })));
    const { userNachname, ...ohneNachname } = valid('reader');
    await assertFails(db.collection(collection).add(ohneNachname));
  });

  test(`${collection}: falsche Typen und überlange Namen werden abgelehnt`, async () => {
    const db = as.user(env, 'reader');
    await assertFails(db.collection(collection).add(valid('reader', { isGuest: 'nein' })));
    await assertFails(db.collection(collection).add(valid('reader', { userVorname: 42 })));
    await assertFails(db.collection(collection).add(valid('reader', { userNachname: 'x'.repeat(101) })));
  });

  test(`${collection}: nur die eigene Sitzung, nicht als jemand anderes oder abgemeldet`, async () => {
    await assertFails(as.user(env, 'reader').collection(collection).add(valid('other')));
    await assertFails(as.unauth(env).collection(collection).add(valid('reader')));
  });
}

test('recipeCalls: recipeId muss ein nicht leerer Text sein, recipeTitle höchstens 1.000 Zeichen', async () => {
  const db = as.user(env, 'reader');
  await assertFails(db.collection('recipeCalls').add(recipeCall('reader', { recipeId: '' })));
  await assertFails(db.collection('recipeCalls').add(recipeCall('reader', { recipeId: 7 })));
  await assertFails(db.collection('recipeCalls').add(recipeCall('reader', { recipeTitle: 'x'.repeat(1001) })));
  await assertSucceeds(db.collection('recipeCalls').add(recipeCall('reader', { recipeTitle: 'x'.repeat(1000) })));
});

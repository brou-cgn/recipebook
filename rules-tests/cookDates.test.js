const test = require('node:test');
const { Timestamp } = require('firebase/firestore');
const { setupEnv, seedUsers, seed, as, assertFails, assertSucceeds } = require('./helpers');

let env;
test.before(async () => { env = await setupEnv(); });
test.after(async () => { await env.cleanup(); });
test.beforeEach(async () => {
  await seedUsers(env);
  await seed(env, (db) => db.doc('cookDates/c1').set({
    userId: 'other', recipeId: 'r1', date: Timestamp.fromDate(new Date('2026-01-02')), createdAt: Timestamp.now(),
  }));
});

const valid = (uid, extra = {}) => ({
  userId: uid, recipeId: 'r1', date: Timestamp.fromDate(new Date('2026-01-02')), createdAt: Timestamp.now(), ...extra,
});

test('cookDates: lesen nur für Mitglieder', async () => {
  await assertSucceeds(as.user(env, 'reader').doc('cookDates/c1').get());
  await assertFails(as.anonymous(env).doc('cookDates/c1').get());
  await assertFails(as.unauth(env).doc('cookDates/c1').get());
});

test('cookDates (bekannt, gewollt für Kochbuch-Dialog): jedes Mitglied kann fremde Einträge per userId abfragen', async () => {
  await assertSucceeds(as.user(env, 'reader').collection('cookDates').where('userId', '==', 'other').get());
});

test('cookDates: eigenen gültigen Eintrag anlegen', async () => {
  await assertSucceeds(as.user(env, 'reader').collection('cookDates').add(valid('reader')));
});

test('cookDates: Eintrag ohne createdAt ist erlaubt', async () => {
  const { createdAt, ...noCreated } = valid('reader');
  await assertSucceeds(as.user(env, 'reader').collection('cookDates').add(noCreated));
});

test('cookDates: Eintrag für einen anderen Nutzer ist verboten', async () => {
  await assertFails(as.user(env, 'reader').collection('cookDates').add(valid('other')));
});

test('cookDates: unbekannte Felder, fehlende Pflichtfelder und falsche Typen sind verboten', async () => {
  const db = as.user(env, 'reader');
  await assertFails(db.collection('cookDates').add(valid('reader', { extra: 'x' })));
  await assertFails(db.collection('cookDates').add(valid('reader', { shareWithFollowers: false })));
  const { recipeId, ...noRecipe } = valid('reader');
  await assertFails(db.collection('cookDates').add(noRecipe));
  await assertFails(db.collection('cookDates').add(valid('reader', { recipeId: '' })));
  await assertFails(db.collection('cookDates').add(valid('reader', { recipeId: 123 })));
  await assertFails(db.collection('cookDates').add(valid('reader', { recipeId: 'x'.repeat(129) })));
  await assertFails(db.collection('cookDates').add(valid('reader', { date: '2026-01-02' })));
  await assertFails(db.collection('cookDates').add(valid('reader', { createdAt: 'jetzt' })));
});

test('cookDates: Datum in der Zukunft ist verboten', async () => {
  const future = Timestamp.fromDate(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000));
  await assertFails(as.user(env, 'reader').collection('cookDates').add(valid('reader', { date: future })));
});

test('cookDates (bekannt): anonyme Gäste dürfen eigene Einträge anlegen', async () => {
  await assertSucceeds(as.anonymous(env, 'gast1').collection('cookDates').add(valid('gast1')));
});

test('cookDates: nicht angemeldet darf nichts anlegen', async () => {
  await assertFails(as.unauth(env).collection('cookDates').add(valid('reader')));
});

test('cookDates: löschen nur eigene Einträge, Editoren und Admins', async () => {
  await assertSucceeds(as.user(env, 'other').doc('cookDates/c1').delete());
  await seed(env, (db) => db.doc('cookDates/c2').set({ userId: 'other', recipeId: 'r1', date: Timestamp.now() }));
  await assertFails(as.user(env, 'reader').doc('cookDates/c2').delete());
  await assertSucceeds(as.user(env, 'editor').doc('cookDates/c2').delete());
});

test('cookDates: Einträge lassen sich nicht ändern', async () => {
  await assertFails(as.user(env, 'other').doc('cookDates/c1').update({ recipeId: 'r2' }));
  await assertFails(as.user(env, 'admin').doc('cookDates/c1').update({ recipeId: 'r2' }));
});

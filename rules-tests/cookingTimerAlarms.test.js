const test = require('node:test');
const { Timestamp } = require('firebase/firestore');
const { setupEnv, seedUsers, seed, as, assertFails, assertSucceeds } = require('./helpers');

// Weckrufe für Kochmodus-Timer (Tech-Check P8, functions/cookingTimerAlarms.js)

let env;
test.before(async () => { env = await setupEnv(); });
test.after(async () => { await env.cleanup(); });

const inMinutes = (minutes) => Timestamp.fromMillis(Date.now() + minutes * 60 * 1000);
const valid = (uid, extra = {}) => ({
  uid, token: 'tok-1', dueAt: inMinutes(5), body: 'Rinderrouladen: 90 Minuten', createdAt: Timestamp.now(), ...extra,
});
const OTHERS_ALARM = 'cookingTimerAlarms/other_r1_step-0_0_1';
const own = (db, uid = 'reader') => db.doc(`cookingTimerAlarms/${uid}_r1_step-0_0_123`);

test.beforeEach(async () => {
  await seedUsers(env);
  await seed(env, (db) => db.doc(OTHERS_ALARM).set(valid('other')));
});

test('cookingTimerAlarms: Mitglied legt einen eigenen Weckruf an', async () => {
  await assertSucceeds(own(as.user(env, 'reader')).set(valid('reader')));
});

test('cookingTimerAlarms: createdAt ist freiwillig', async () => {
  const { createdAt, ...noCreated } = valid('reader');
  await assertSucceeds(own(as.user(env, 'reader')).set(noCreated));
});

test('cookingTimerAlarms: fremde uid und eine ID, die nicht mit der eigenen uid beginnt, sind verboten', async () => {
  const db = as.user(env, 'reader');
  await assertFails(own(db, 'other').set(valid('other')));
  await assertFails(own(db).set(valid('other')));
  await assertFails(own(db, 'other').set(valid('reader')));
  await assertFails(db.doc('cookingTimerAlarms/reader').set(valid('reader')));
  await assertFails(db.doc('cookingTimerAlarms/xreader_r1').set(valid('reader')));
});

test('cookingTimerAlarms: unbekannte Felder, fehlende Pflichtfelder, falsche Typen und zu lange Werte sind verboten', async () => {
  const ref = own(as.user(env, 'reader'));
  await assertFails(ref.set(valid('reader', { extra: 1 })));
  await assertFails(ref.set(valid('reader', { claimedAt: Timestamp.now() })));
  for (const field of ['uid', 'token', 'dueAt', 'body']) {
    const data = valid('reader');
    delete data[field];
    await assertFails(ref.set(data));
  }
  await assertFails(ref.set(valid('reader', { token: '' })));
  await assertFails(ref.set(valid('reader', { token: 'x'.repeat(4097) })));
  await assertFails(ref.set(valid('reader', { body: 'x'.repeat(201) })));
  await assertFails(ref.set(valid('reader', { body: 5 })));
  await assertFails(ref.set(valid('reader', { dueAt: '2026-11-01T10:00:00Z' })));
  await assertFails(ref.set(valid('reader', { createdAt: 'jetzt' })));
});

test('cookingTimerAlarms: Endzeit höchstens 24 Stunden voraus', async () => {
  const ref = own(as.user(env, 'reader'));
  await assertFails(ref.set(valid('reader', { dueAt: inMinutes(25 * 60) })));
  await assertSucceeds(ref.set(valid('reader', { dueAt: inMinutes(23 * 60) })));
});

test('cookingTimerAlarms: anonyme Gäste, Nutzer ohne Profil und nicht Angemeldete legen nichts an', async () => {
  await assertFails(own(as.anonymous(env, 'gast1'), 'gast1').set(valid('gast1')));
  await assertFails(own(as.user(env, 'ohneProfil'), 'ohneProfil').set(valid('ohneProfil')));
  await assertFails(own(as.unauth(env)).set(valid('reader')));
});

test('cookingTimerAlarms: niemand liest oder ändert einen Weckruf', async () => {
  await assertFails(as.user(env, 'other').doc(OTHERS_ALARM).get());
  await assertFails(as.user(env, 'admin').doc(OTHERS_ALARM).get());
  await assertFails(as.user(env, 'other').doc(OTHERS_ALARM).update({ body: 'x' }));
  // Ein zweites Anlegen nach einem Neustart der App ist ein Ändern: der vorhandene Weckruf bleibt
  await assertFails(as.user(env, 'other').doc(OTHERS_ALARM).set(valid('other')));
});

test('cookingTimerAlarms: löschen darf nur der Eigentümer, auch einen schon verschickten', async () => {
  await assertFails(as.user(env, 'reader').doc(OTHERS_ALARM).delete());
  await assertSucceeds(as.user(env, 'other').doc(OTHERS_ALARM).delete());
  await assertSucceeds(as.user(env, 'reader').doc('cookingTimerAlarms/reader_verschickt').delete());
  await assertFails(as.unauth(env).doc('cookingTimerAlarms/reader_verschickt').delete());
});

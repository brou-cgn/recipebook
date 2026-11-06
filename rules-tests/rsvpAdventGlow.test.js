/**
 * RSVP-Seite "A little Advent Glow": rsvps_adventglow_2026/{uid}.
 * Gäste (anonym) schreiben nur ihr eigenes Dokument, Admins lesen und löschen alles.
 * Hinweis: Der Anmeldeschluss (13.12.2026 23:59:59 MEZ) hängt an request.time und lässt
 * sich im Emulator nicht verschieben; er ist hier nicht abgedeckt.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const firebase = require('firebase/compat/app');
const { setupEnv, seedUsers, seed, as, assertFails, assertSucceeds } = require('./helpers');

const COL = 'rsvps_adventglow_2026';
let env;
test.before(async () => { env = await setupEnv(); });
test.after(async () => { await env.cleanup(); });
test.beforeEach(async () => { await seedUsers(env); });

const ts = () => firebase.firestore.FieldValue.serverTimestamp();
const valid = (over = {}) => ({
  name: 'Lena & Tom', answer: 'yes', people: 2, nonAlcoholic: true, note: 'Kekse',
  eventId: 'advent-glow-2026', createdAt: ts(), updatedAt: ts(), ...over,
});

test('Gast legt eigene Antwort an und ändert sie ohne Duplikat', async () => {
  const a = as.anonymous(env, 'gastA');
  await assertSucceeds(a.doc(`${COL}/gastA`).set(valid()));
  const created = (await a.doc(`${COL}/gastA`).get()).data().createdAt;
  await assertSucceeds(a.doc(`${COL}/gastA`).set(valid({ people: 3, createdAt: created })));
  await seed(env, async (db) => { assert.equal((await db.collection(COL).get()).size, 1); });
});

test('Update darf createdAt nicht ändern', async () => {
  const a = as.anonymous(env, 'gastA');
  await assertSucceeds(a.doc(`${COL}/gastA`).set(valid()));
  await assertFails(a.doc(`${COL}/gastA`).set(valid())); // createdAt = neue Zeit
});

test('Gast A darf B weder lesen noch schreiben', async () => {
  const a = as.anonymous(env, 'gastA');
  await seed(env, (db) => db.doc(`${COL}/gastB`).set({ ...valid(), createdAt: new Date(), updatedAt: new Date() }));
  await assertFails(a.doc(`${COL}/gastB`).get());
  await assertFails(a.doc(`${COL}/gastB`).set(valid()));
  await assertSucceeds(a.doc(`${COL}/gastA`).get()); // eigenes (nicht vorhandenes) Dokument lesbar
});

test('Nicht angemeldet: nichts', async () => {
  const u = as.unauth(env);
  await assertFails(u.doc(`${COL}/gastA`).set(valid()));
  await assertFails(u.doc(`${COL}/gastA`).get());
});

test('Unbekannte Felder, falsche Typen und Längen werden abgelehnt', async () => {
  const a = as.anonymous(env, 'gastA');
  const bad = [
    { extra: 1 },
    { name: '' }, { name: '   ' }, { name: 'x'.repeat(81) }, { name: 5 },
    { answer: 'maybe' },
    { people: -1 }, { people: 9 }, { people: 1.5 }, { people: '2' },
    { nonAlcoholic: 'ja' },
    { note: 'x'.repeat(501) }, { note: 5 },
    { eventId: 'other' },
    { updatedAt: new Date('2020-01-01') },
    { createdAt: new Date('2020-01-01') },
  ];
  for (const over of bad) {
    await assertFails(a.doc(`${COL}/gastA`).set(valid(over)));
  }
  const { note, ...withoutNote } = valid();
  await assertFails(a.doc(`${COL}/gastA`).set(withoutNote));
  await assertSucceeds(a.doc(`${COL}/gastA`).set(valid({ name: 'x'.repeat(80), note: 'x'.repeat(500), people: 8 })));
});

test('Auflisten: Admin ja, Gast und Mitglied nein; Löschen nur Admin', async () => {
  await seed(env, (db) => db.doc(`${COL}/gastB`).set({ ...valid(), createdAt: new Date(), updatedAt: new Date() }));
  await assertSucceeds(as.user(env, 'admin').collection(COL).get());
  await assertSucceeds(as.user(env, 'admin').collection(COL).where('eventId', '==', 'advent-glow-2026').limit(500).get());
  await assertFails(as.anonymous(env, 'gastA').collection(COL).get());
  await assertFails(as.user(env, 'editor').collection(COL).get());
  await assertFails(as.unauth(env).collection(COL).get());
  await assertFails(as.anonymous(env, 'gastB').doc(`${COL}/gastB`).delete());
  await assertFails(as.user(env, 'editor').doc(`${COL}/gastB`).delete());
  await assertSucceeds(as.user(env, 'admin').doc(`${COL}/gastB`).delete());
});

/**
 * Wichteln: wichtelRunden/{rundeId} mit teilnehmer, zuordnungen, eintraege.
 * Alles läuft über die Callables wichtelVerwalten/wichtelTeilnahme (Admin SDK); kein Client –
 * auch nicht der Organisator oder ein Admin – darf direkt lesen oder schreiben, sonst wäre
 * die Zuordnung (wer wen gezogen hat) und jede Geschenkidee für alle sichtbar.
 */
const test = require('node:test');
const { setupEnv, seedUsers, seed, as, assertFails } = require('./helpers');

const RUNDE = 'wichtelRunden/runde1';
const PFADE = [
  RUNDE,
  `${RUNDE}/teilnehmer/t1`,
  `${RUNDE}/zuordnungen/t1`,
  `${RUNDE}/eintraege/e1`,
];

let env;
test.before(async () => { env = await setupEnv(); });
test.after(async () => { await env.cleanup(); });
test.beforeEach(async () => {
  await seedUsers(env);
  await seed(env, async (db) => {
    await db.doc(RUNDE).set({ ownerId: 'editor', titel: 'Advent', status: 'ausgelost', teilnehmerAnzahl: 3 });
    await db.doc(`${RUNDE}/teilnehmer/t1`).set({ name: 'Anna', token: 'x'.repeat(32), reihenfolge: 1 });
    await db.doc(`${RUNDE}/zuordnungen/t1`).set({ empfaengerId: 't2' });
    await db.doc(`${RUNDE}/eintraege/e1`).set({ autorId: 't3', ueberId: 't1', text: 'Idee' });
  });
});

const alle = (env) => ({
  'nicht angemeldet': as.unauth(env),
  'anonym': as.anonymous(env, 'gast1'),
  'Organisator (Eigentümer)': as.user(env, 'editor'),
  'Admin': as.user(env, 'admin'),
  'anderes Mitglied': as.user(env, 'reader'),
});

test('wichtelRunden: niemand liest Dokumente direkt, auch nicht Eigentümer oder Admin', async () => {
  for (const db of Object.values(alle(env))) {
    for (const pfad of PFADE) await assertFails(db.doc(pfad).get());
  }
});

test('wichtelRunden: niemand fragt Collections ab', async () => {
  for (const db of Object.values(alle(env))) {
    await assertFails(db.collection('wichtelRunden').where('ownerId', '==', 'editor').limit(10).get());
    await assertFails(db.collection(`${RUNDE}/teilnehmer`).where('token', '==', 'x'.repeat(32)).limit(1).get());
    await assertFails(db.collection(`${RUNDE}/zuordnungen`).limit(10).get());
    await assertFails(db.collection(`${RUNDE}/eintraege`).where('ueberId', '==', 't1').limit(10).get());
    await assertFails(db.collectionGroup('zuordnungen').limit(10).get());
    await assertFails(db.collectionGroup('eintraege').limit(10).get());
  }
});

test('wichtelRunden: niemand schreibt direkt', async () => {
  for (const db of Object.values(alle(env))) {
    await assertFails(db.doc('wichtelRunden/neu').set({ ownerId: 'editor', titel: 'x', status: 'offen' }));
    await assertFails(db.doc(RUNDE).update({ status: 'offen' }));
    await assertFails(db.doc(`${RUNDE}/teilnehmer/t9`).set({ name: 'Eve', token: 'y'.repeat(32) }));
    await assertFails(db.doc(`${RUNDE}/zuordnungen/t1`).set({ empfaengerId: 't3' }));
    await assertFails(db.doc(`${RUNDE}/eintraege/e9`).set({ autorId: 't1', ueberId: 't2', text: 'x' }));
    await assertFails(db.doc(`${RUNDE}/eintraege/e1`).delete());
    await assertFails(db.doc(RUNDE).delete());
  }
});

test('wichtelMailLimits: Tageszähler für Einladungs-Mails nur über Cloud Functions', async () => {
  await seed(env, async (db) => {
    await db.doc('wichtelMailLimits/editor_2026-12-01').set({ uid: 'editor', tag: '2026-12-01', anzahl: 3 });
  });
  for (const db of Object.values(alle(env))) {
    await assertFails(db.doc('wichtelMailLimits/editor_2026-12-01').get());
    await assertFails(db.collection('wichtelMailLimits').where('uid', '==', 'editor').limit(10).get());
    await assertFails(db.doc('wichtelMailLimits/editor_2026-12-01').set({ uid: 'editor', tag: '2026-12-01', anzahl: 0 }));
    await assertFails(db.doc('wichtelMailLimits/editor_2026-12-01').delete());
  }
});

test('wichtelNeuigkeiten: vorgemerkte Neuigkeiten-Mails nur über Cloud Functions', async () => {
  await seed(env, async (db) => {
    await db.doc('wichtelNeuigkeiten/runde1_geber1').set({ rundeId: 'runde1', geberId: 'geber1', zaehler: 1, fehlversuche: 0 });
  });
  for (const db of Object.values(alle(env))) {
    await assertFails(db.doc('wichtelNeuigkeiten/runde1_geber1').get());
    await assertFails(db.collection('wichtelNeuigkeiten').where('rundeId', '==', 'runde1').limit(10).get());
    await assertFails(db.doc('wichtelNeuigkeiten/runde1_geber1').set({ rundeId: 'runde1', geberId: 'geber1', zaehler: 0 }));
    await assertFails(db.doc('wichtelNeuigkeiten/runde1_geber1').delete());
  }
});

test('wichtelErinnerungen: vorgemerkte Erinnerungen nur über Cloud Functions', async () => {
  await seed(env, async (db) => {
    await db.doc('wichtelErinnerungen/runde1_teiln1').set({ rundeId: 'runde1', teilnehmerId: 'teiln1', fehlversuche: 0 });
  });
  for (const db of Object.values(alle(env))) {
    await assertFails(db.doc('wichtelErinnerungen/runde1_teiln1').get());
    await assertFails(db.collection('wichtelErinnerungen').where('rundeId', '==', 'runde1').limit(10).get());
    await assertFails(db.doc('wichtelErinnerungen/runde1_teiln1').set({ rundeId: 'runde1', teilnehmerId: 'teiln1', fehlversuche: 0 }));
    await assertFails(db.doc('wichtelErinnerungen/runde1_teiln1').delete());
  }
});

const test = require('node:test');
const { setupEnv, seedUsers, seed, as, assertFails, assertSucceeds } = require('./helpers');

// Zusammengefasste Aufruf-Protokolle (Tech-Check K2, functions/callLogConsolidation.js):
// schreiben nur der tägliche Job. Lesen wie appCalls (Berechtigung appCalls oder Admin);
// Rezept-Tage lesen Mitglieder wie recipeCalls, weil „Im Trend“ sie mitzählt.

let env;
test.before(async () => { env = await setupEnv(); });
test.after(async () => { await env.cleanup(); });

const AGGREGATE = {
  period: '2026-10', periodType: 'month', year: 2026, month: 10,
  userId: 'reader', isGuest: false, userVorname: 'reader', userNachname: '', count: 3,
};
const DAY = {
  day: '2026-11-03', year: 2026, month: 11, count: 2,
  users: { reader: { userId: 'reader', isGuest: false, userVorname: 'reader', userNachname: '', count: 2 } },
};

test.beforeEach(async () => {
  await seedUsers(env);
  await seed(env, async (db) => {
    await db.doc('rolePermissions/edit').set({ appCalls: true });
    await db.doc('appCallAggregates/2026-10_reader').set(AGGREGATE);
    await db.doc('recipeCallAggregates/2026-10_reader').set({ ...AGGREGATE, recipeCounts: { r1: 3 } });
    await db.doc('appCallDays/2026-11-03').set(DAY);
    await db.doc('recipeCallDays/2026-11-03').set(DAY);
  });
});

const ONLY_APP_CALLS_PERMISSION = [
  ['appCallAggregates', '2026-10_reader'],
  ['recipeCallAggregates', '2026-10_reader'],
  ['appCallDays', '2026-11-03'],
];

for (const [collection, id] of ONLY_APP_CALLS_PERMISSION) {
  test(`${collection}: Admins und Rollen mit der Berechtigung appCalls lesen`, async () => {
    await assertSucceeds(as.user(env, 'admin').collection(collection).get());
    await assertSucceeds(as.user(env, 'editor').collection(collection).get());
  });

  test(`${collection}: Mitglieder ohne Berechtigung, Gäste und Abgemeldete lesen nichts, auch nicht das eigene Dokument`, async () => {
    await assertFails(as.user(env, 'reader').doc(`${collection}/${id}`).get());
    await assertFails(as.user(env, 'reader').collection(collection).get());
    await assertFails(as.anonymous(env).collection(collection).get());
    await assertFails(as.unauth(env).collection(collection).get());
  });
}

test('recipeCallDays: Mitglieder lesen (für „Im Trend“), auch per Zeitfenster-Abfrage', async () => {
  await assertSucceeds(as.user(env, 'reader').doc('recipeCallDays/2026-11-03').get());
  await assertSucceeds(as.user(env, 'reader').collection('recipeCallDays')
    .where('day', '>=', '2026-11-01').orderBy('day', 'desc').limit(31).get());
});

test('recipeCallDays: Gäste und Abgemeldete lesen nichts', async () => {
  await assertFails(as.anonymous(env).collection('recipeCallDays').get());
  await assertFails(as.unauth(env).doc('recipeCallDays/2026-11-03').get());
});

for (const [collection, id] of [...ONLY_APP_CALLS_PERMISSION, ['recipeCallDays', '2026-11-03']]) {
  test(`${collection}: niemand schreibt, auch kein Admin (nur der tägliche Job)`, async () => {
    await assertFails(as.user(env, 'admin').doc(`${collection}/neu`).set({ count: 1 }));
    await assertFails(as.user(env, 'reader').doc(`${collection}/${id}`).update({ count: 99 }));
    await assertFails(as.user(env, 'admin').doc(`${collection}/${id}`).delete());
  });
}

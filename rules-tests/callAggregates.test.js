const test = require('node:test');
const { setupEnv, seedUsers, seed, as, assertFails, assertSucceeds } = require('./helpers');

// Zusammengefasste Aufruf-Protokolle (Tech-Check K2, functions/callLogConsolidation.js):
// lesen wie appCalls (Berechtigung appCalls oder Admin), schreiben nur der monatliche Job.

let env;
test.before(async () => { env = await setupEnv(); });
test.after(async () => { await env.cleanup(); });

const AGGREGATE = {
  period: '2026-10', periodType: 'month', year: 2026, month: 10,
  userId: 'reader', isGuest: false, userVorname: 'reader', userNachname: '', count: 3,
};

test.beforeEach(async () => {
  await seedUsers(env);
  await seed(env, async (db) => {
    await db.doc('rolePermissions/edit').set({ appCalls: true });
    await db.doc('appCallAggregates/2026-10_reader').set(AGGREGATE);
    await db.doc('recipeCallAggregates/2026-10_reader').set({ ...AGGREGATE, recipeCounts: { r1: 3 } });
  });
});

for (const collection of ['appCallAggregates', 'recipeCallAggregates']) {
  test(`${collection}: Admins und Rollen mit der Berechtigung appCalls lesen`, async () => {
    await assertSucceeds(as.user(env, 'admin').collection(collection).get());
    await assertSucceeds(as.user(env, 'editor').collection(collection).get());
  });

  test(`${collection}: Mitglieder ohne Berechtigung, Gäste und Abgemeldete lesen nichts, auch nicht das eigene Dokument`, async () => {
    await assertFails(as.user(env, 'reader').doc(`${collection}/2026-10_reader`).get());
    await assertFails(as.user(env, 'reader').collection(collection).get());
    await assertFails(as.anonymous(env).collection(collection).get());
    await assertFails(as.unauth(env).collection(collection).get());
  });

  test(`${collection}: niemand schreibt, auch kein Admin (nur der monatliche Job)`, async () => {
    await assertFails(as.user(env, 'admin').doc(`${collection}/2026-10_admin`).set({ ...AGGREGATE, userId: 'admin' }));
    await assertFails(as.user(env, 'reader').doc(`${collection}/2026-10_reader`).update({ count: 99 }));
    await assertFails(as.user(env, 'admin').doc(`${collection}/2026-10_reader`).delete());
  });
}

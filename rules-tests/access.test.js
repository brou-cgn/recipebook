/**
 * Hält fest, wer heute was lesen und schreiben darf. Einträge mit "BEKANNTE LÜCKE"
 * beschreiben Zustände, die nicht gewollt sind, sich aber nicht ohne Umbau des Clients
 * schließen lassen (Regeln filtern keine Abfragen: der Client liest recipes und groups
 * als ganze Collection und filtert selbst). Wer eine Lücke schließt, kehrt den Test um.
 */
const test = require('node:test');
const { setupEnv, seedUsers, seed, as, assertFails, assertSucceeds } = require('./helpers');

let env;
test.before(async () => { env = await setupEnv(); });
test.after(async () => { await env.cleanup(); });
test.beforeEach(async () => {
  await seedUsers(env);
  await seed(env, async (db) => {
    await db.doc('recipes/draft').set({ title: 'Entwurf', authorId: 'editor', isPrivate: true, groupId: 'g1' });
    await db.doc('recipes/open').set({ title: 'Offen', authorId: 'editor', groupId: 'g1', shareId: 'def' });
    await db.doc('groups/g1').set({
      type: 'private', ownerId: 'editor', memberIds: ['editor'], invitedEmails: ['jemand@example.test'],
    });
    await db.doc('publicProfiles/other').set({ vorname: 'Other', nachname: 'Test' });
  });
});

test('recipes: Mitglieder lesen, Gäste und nicht Angemeldete nicht', async () => {
  await assertSucceeds(as.user(env, 'reader').doc('recipes/open').get());
  await assertFails(as.anonymous(env).doc('recipes/open').get());
  await assertFails(as.unauth(env).doc('recipes/open').get());
});

test('recipes: Gäste und Abgemeldete listen nichts, auch nicht per shareId-Bereichsabfrage (Tech-Check S1)', async () => {
  await assertFails(as.anonymous(env).collection('recipes').get());
  await assertFails(as.anonymous(env).collection('recipes').where('shareId', '>=', '').get());
  await assertFails(as.unauth(env).doc('recipes/open').get());
  await assertFails(as.unauth(env).collection('recipes').where('shareId', '>=', '').get());
});

test('recipes (BEKANNTE LÜCKE, bewusst nicht umgesetzt, Tech-Check S2): jedes Mitglied kann fremde Entwürfe lesen, die Sichtbarkeit gilt nur im Client', async () => {
  await assertSucceeds(as.user(env, 'reader').doc('recipes/draft').get());
  await assertSucceeds(as.user(env, 'reader').collection('recipes').get());
});

test('recipes: anlegen nur ab Rolle edit', async () => {
  const recipe = { title: 'Neu', authorId: 'x', groupId: 'g1' };
  await assertFails(as.user(env, 'reader').collection('recipes').add(recipe));
  await assertSucceeds(as.user(env, 'editor').collection('recipes').add(recipe));
});

test('groups (BEKANNTE LÜCKE): auch anonyme Gäste lesen Listen samt eingeladener E-Mail-Adressen', async () => {
  const snap = await assertSucceeds(as.anonymous(env).doc('groups/g1').get());
  if (!snap.data().invitedEmails) throw new Error('Testannahme verletzt: invitedEmails fehlt');
  await assertFails(as.unauth(env).doc('groups/g1').get());
});

test('publicProfiles (BEKANNTE LÜCKE): auch anonyme Gäste lesen Vor- und Nachnamen aller Mitglieder', async () => {
  await assertSucceeds(as.user(env, 'reader').doc('publicProfiles/other').get());
  await assertSucceeds(as.anonymous(env).doc('publicProfiles/other').get());
  await assertSucceeds(as.anonymous(env).collection('publicProfiles').get());
  await assertFails(as.unauth(env).doc('publicProfiles/other').get());
});

test('publicProfiles: Schreiben nur für Admins', async () => {
  await assertFails(as.user(env, 'other').doc('publicProfiles/other').set({ vorname: 'X' }));
  await assertSucceeds(as.user(env, 'admin').doc('publicProfiles/other').set({ vorname: 'X' }));
});

test('users: fremde Profile (E-Mail, Rolle) lesen nur Admins', async () => {
  await assertSucceeds(as.user(env, 'reader').doc('users/reader').get());
  await assertFails(as.user(env, 'reader').doc('users/other').get());
  await assertSucceeds(as.user(env, 'admin').doc('users/other').get());
});

test('users: anonyme Gäste lesen und listen keine Nutzerprofile (Tech-Check S1)', async () => {
  await assertFails(as.anonymous(env).doc('users/reader').get());
  await assertFails(as.anonymous(env).collection('users').get());
});

test('users: die eigene Rolle lässt sich nicht ändern, andere eigene Felder schon', async () => {
  await assertFails(as.user(env, 'reader').doc('users/reader').update({ role: 'admin' }));
  await assertSucceeds(as.user(env, 'reader').doc('users/reader').update({ vorname: 'Neu' }));
});

test('users: anonyme Gäste legen kein Profil an, Mitglieder nur mit Rolle read', async () => {
  await assertFails(as.anonymous(env, 'gast9').doc('users/gast9').set({ role: 'read' }));
  await assertSucceeds(as.user(env, 'neu').doc('users/neu').set({ role: 'read' }));
  await assertFails(as.user(env, 'neu2').doc('users/neu2').set({ role: 'admin' }));
});

test('Sammlungen nur für Cloud Functions bleiben für Clients gesperrt', async () => {
  await assertFails(as.user(env, 'admin').doc('jobRequests/j1').get());
  await assertFails(as.user(env, 'admin').doc('users/admin/security/webImportPin').get());
  await assertFails(as.user(env, 'admin').doc('invitations/jemand@example.test').get());
});

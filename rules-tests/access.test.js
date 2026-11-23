/**
 * Hält fest, wer heute was lesen und schreiben darf. Einträge mit "BEKANNTE LÜCKE"
 * beschreiben Zustände, die nicht gewollt sind, sich aber nicht ohne Umbau des Clients
 * schließen lassen (Regeln filtern keine Abfragen: der Client liest recipes als ganze
 * Collection und filtert selbst). Wer eine Lücke schließt, kehrt den Test um.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const firebase = require('firebase/compat/app');
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
      type: 'private', ownerId: 'editor', memberIds: ['editor', 'reader'], invitedEmails: ['jemand@example.test'],
    });
    await db.doc('groups/pub').set({ type: 'public', name: 'Öffentlich', ownerId: null, memberIds: [] });
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

test('recipes (Tech-Check S29): ratingAvg, ratingCount und weinprofil ändern nur Cloud Functions', async () => {
  const profil = { rolle: 'hauptgericht', hauptkomponente: 'rind_lamm', inputHash: 'abc', schemaVersion: 1 };
  await seed(env, (db) => db.doc('recipes/open').update({ ratingAvg: 4, ratingCount: 2, weinprofil: profil }));
  for (const uid of ['editor', 'admin']) {
    const db = as.user(env, uid);
    await assertFails(db.doc('recipes/open').update({ ratingAvg: 5 }));
    await assertFails(db.doc('recipes/open').update({ ratingCount: 99 }));
    await assertFails(db.doc('recipes/open').update({ weinprofil: { ...profil, rolle: 'dessert' } }));
    await assertFails(db.doc('recipes/open').update({ weinprofil: firebase.firestore.FieldValue.delete() }));
  }
  // Speichern ohne diese Felder bleibt erlaubt, ebenso ein unverändert mitgeschickter Wert.
  await assertSucceeds(as.user(env, 'editor').doc('recipes/open').update({ title: 'Neu' }));
  await assertSucceeds(as.user(env, 'editor').doc('recipes/open').update({ title: 'Neuer', ratingAvg: 4, weinprofil: profil }));
});

test('recipes (Mehrsprachigkeit): titelUebersetzung ändern nur Cloud Functions, auch nicht beim Anlegen', async () => {
  const uebersetzung = { quelle: 'Offen', originalSprache: 'de', de: 'Offen', en: 'Open', fr: 'Ouvert' };
  await seed(env, (db) => db.doc('recipes/open').update({ titelUebersetzung: uebersetzung }));
  for (const uid of ['editor', 'admin']) {
    const db = as.user(env, uid);
    await assertFails(db.doc('recipes/open').update({ titelUebersetzung: { ...uebersetzung, en: 'Erfunden' } }));
    await assertFails(db.doc('recipes/open').update({ titelUebersetzung: firebase.firestore.FieldValue.delete() }));
    await assertFails(db.collection('recipes').add({ title: 'Neu', authorId: uid, groupId: 'g1', titelUebersetzung: uebersetzung }));
  }
  // Titel ändern bleibt erlaubt, ebenso ein unverändert mitgeschickter Wert.
  await assertSucceeds(as.user(env, 'editor').doc('recipes/open').update({ title: 'Neu' }));
  await assertSucceeds(as.user(env, 'editor').doc('recipes/open').update({ title: 'Neuer', titelUebersetzung: uebersetzung }));
});

test('rezeptUebersetzungen (Mehrsprachigkeit): Mitglieder lesen einzeln, niemand listet oder schreibt', async () => {
  await seed(env, (db) => db.doc('rezeptUebersetzungen/open').set({ quellHash: 'h', en: { zutaten: ['200 g lentils'], schritte: [] } }));
  await assertSucceeds(as.user(env, 'reader').doc('rezeptUebersetzungen/open').get());
  await assertFails(as.anonymous(env).doc('rezeptUebersetzungen/open').get());
  await assertFails(as.unauth(env).doc('rezeptUebersetzungen/open').get());
  await assertFails(as.user(env, 'reader').collection('rezeptUebersetzungen').get());
  for (const uid of ['editor', 'admin']) {
    await assertFails(as.user(env, uid).doc('rezeptUebersetzungen/open').set({ quellHash: 'erfunden' }));
    await assertFails(as.user(env, uid).doc('rezeptUebersetzungen/neu').set({ quellHash: 'erfunden' }));
    await assertFails(as.user(env, uid).doc('rezeptUebersetzungen/open').delete());
  }
});

test('settings/app (Mehrsprachigkeit): listenUebersetzungen pflegen wie die Listen, nur als Map', async () => {
  await seed(env, (db) => db.doc('settings/app').set({ cuisineTypes: ['Italienische Küche'] }));
  const uebersetzungen = { cuisineTypes: [{ wert: 'Italienische Küche', en: 'Italian cuisine', fr: 'Cuisine italienne' }] };
  await assertSucceeds(as.user(env, 'editor').doc('settings/app').update({ listenUebersetzungen: uebersetzungen }));
  await assertSucceeds(as.user(env, 'admin').doc('settings/app').update({ listenUebersetzungen: {} }));
  await assertFails(as.user(env, 'reader').doc('settings/app').update({ listenUebersetzungen: uebersetzungen }));
  await assertFails(as.user(env, 'editor').doc('settings/app').update({ listenUebersetzungen: 'kaputt' }));
  // Andere Felder bleiben für Editoren gesperrt, auch zusammen mit den Übersetzungen.
  await assertFails(as.user(env, 'editor').doc('settings/app').update({ listenUebersetzungen: uebersetzungen, headerSlogan: 'x' }));
});

test('aiListenUebersetzungLimits: Zähler nur für Cloud Functions', async () => {
  await assertFails(as.user(env, 'admin').doc('aiListenUebersetzungLimits/admin_2026-11-22').get());
  await assertFails(as.user(env, 'admin').doc('aiListenUebersetzungLimits/admin_2026-11-22').set({ count: 0 }));
});

test('aiInhaltUebersetzungLimits: Zähler nur für Cloud Functions', async () => {
  await assertFails(as.user(env, 'admin').doc('aiInhaltUebersetzungLimits/automatik_2026-11-22').get());
  await assertFails(as.user(env, 'admin').doc('aiInhaltUebersetzungLimits/admin_2026-11-22').set({ count: 0 }));
});

test('aiTitelUebersetzungLimits: Zähler nur für Cloud Functions', async () => {
  await assertFails(as.user(env, 'admin').doc('aiTitelUebersetzungLimits/automatik_2026-11-22').get());
  await assertFails(as.user(env, 'admin').doc('aiTitelUebersetzungLimits/admin_2026-11-22').set({ count: 0 }));
});

test('recipes (Tech-Check S29): ein neues Rezept bringt keine Bewertung und kein Weinprofil mit', async () => {
  const profil = { rolle: 'hauptgericht', hauptkomponente: 'rind_lamm', inputHash: 'abc', schemaVersion: 1 };
  const recipe = { title: 'Neu', authorId: 'editor', groupId: 'g1' };
  for (const uid of ['editor', 'admin']) {
    const db = as.user(env, uid);
    await assertFails(db.collection('recipes').add({ ...recipe, ratingAvg: 5, ratingCount: 40 }));
    await assertFails(db.collection('recipes').add({ ...recipe, ratingCount: 0 }));
    await assertFails(db.collection('recipes').add({ ...recipe, weinprofil: profil }));
    await assertFails(db.doc('recipes/gesetzt').set({ ...recipe, ratingAvg: 5 }));
  }
  await assertSucceeds(as.user(env, 'editor').collection('recipes').add(recipe));
});

test('recipes (Tech-Check S20): Clients legen keine Shortcut-Import-Jobs an, sonst startet der Trigger Gemini ohne Limit', async () => {
  const job = {
    title: 'Rezept-Import', authorId: 'editor', isTemp: true, importStatus: 'queued',
    importHeartbeatAt: Date.now(), importOrigin: 'shortcut', importSource: { type: 'web', url: 'https://example.test' },
  };
  await assertFails(as.user(env, 'editor').collection('recipes').add(job));
  await assertFails(as.user(env, 'editor').doc('recipes/neu').set(job));
  await assertFails(as.user(env, 'admin').collection('recipes').add(job));
  // Die In-App-Import-Queue legt weiter temporäre Jobs ohne das Flag an.
  const { importOrigin, ...appJob } = job;
  await assertSucceeds(as.user(env, 'editor').collection('recipes').add(appJob));
});

test('recipes (Tech-Check S20): das Shortcut-Flag lässt sich nachträglich nicht setzen, ein vorhandenes bleibt bei Updates unberührt', async () => {
  await seed(env, async (db) => {
    await db.doc('recipes/appJob').set({ title: 'App', authorId: 'editor', isTemp: true, importStatus: 'error' });
    await db.doc('recipes/shortcutJob').set({
      title: 'Rezept-Import', authorId: 'editor', isTemp: true, importStatus: 'queued', importOrigin: 'shortcut',
    });
  });
  const editor = as.user(env, 'editor');
  await assertFails(editor.doc('recipes/appJob').update({ importOrigin: 'shortcut', importStatus: 'queued' }));
  await assertFails(editor.doc('recipes/appJob').set({ title: 'App', importOrigin: 'shortcut' }, { merge: true }));
  // Fertige Shortcut-Imports prüft und speichert die App weiter, auch per vollständigem set().
  await assertSucceeds(editor.doc('recipes/shortcutJob').update({ title: 'Geprüft', isTemp: false }));
  await assertSucceeds(editor.doc('recipes/shortcutJob').update({ importOrigin: 'shortcut', importStatus: 'done' }));
  await assertSucceeds(editor.doc('recipes/shortcutJob').set({ title: 'Geprüft', importOrigin: 'shortcut' }));
  await assertSucceeds(editor.doc('recipes/appJob').update({ title: 'App 2' }));
});

test('groups (Tech-Check S16): Gäste lesen keine privaten Listen, auch nicht die eingeladenen E-Mail-Adressen', async () => {
  await assertFails(as.anonymous(env).doc('groups/g1').get());
  await assertFails(as.unauth(env).doc('groups/g1').get());
  // Auch gezielte Abfragen nach fremden Listen scheitern; nur die öffentliche Gruppe bleibt lesbar.
  await assertFails(as.anonymous(env).collection('groups').get());
  await assertFails(as.anonymous(env).collection('groups').where('ownerId', '==', 'editor').get());
  await assertFails(as.anonymous(env).collection('groups').where('memberIds', 'array-contains', 'editor').get());
  await assertSucceeds(as.anonymous(env).doc('groups/pub').get());
  const pub = await assertSucceeds(as.anonymous(env).collection('groups').where('type', '==', 'public').get());
  if (pub.size !== 1) throw new Error('öffentliche Gruppe nicht gefunden');
});

test('groups (Tech-Check S16): Eigentümer und Mitglieder lesen ihre Liste, andere Mitglieder nicht', async () => {
  await assertSucceeds(as.user(env, 'editor').doc('groups/g1').get());
  await assertSucceeds(as.user(env, 'reader').doc('groups/g1').get());
  await assertFails(as.user(env, 'other').doc('groups/g1').get());
  await assertSucceeds(as.user(env, 'admin').doc('groups/g1').get());
});

test('groups (Tech-Check S16): die drei Abfragen des Clients funktionieren, die ganze Collection nicht', async () => {
  const ids = async (query) => (await assertSucceeds(query.get())).docs.map((d) => d.id).sort();
  const reader = as.user(env, 'reader');
  assert.deepEqual(await ids(reader.collection('groups').where('type', '==', 'public')), ['pub']);
  assert.deepEqual(await ids(reader.collection('groups').where('ownerId', '==', 'reader')), []);
  assert.deepEqual(await ids(reader.collection('groups').where('memberIds', 'array-contains', 'reader')), ['g1']);
  assert.deepEqual(await ids(as.user(env, 'editor').collection('groups').where('ownerId', '==', 'editor')), ['g1']);
  assert.deepEqual(await ids(as.user(env, 'other').collection('groups').where('memberIds', 'array-contains', 'other')), []);
  await assertFails(reader.collection('groups').get());
  await assertFails(reader.collection('groups').where('memberIds', 'array-contains', 'editor').get());
});

test('groups: Schreiben bleibt wie bisher (Editoren dürfen, Leser nicht)', async () => {
  await assertSucceeds(as.user(env, 'editor').doc('groups/g1').update({ name: 'Neu' }));
  await assertFails(as.user(env, 'reader').doc('groups/g1').update({ name: 'Neu' }));
});

test('groups (Tech-Check S16): kein Client schreibt neue E-Mail-Adressen ins Listendokument', async () => {
  for (const uid of ['editor', 'admin']) {
    const db = as.user(env, uid);
    await assertFails(db.doc('groups/g1').update({ invitedEmails: ['jemand@example.test', 'neu@example.test'] }));
    await assertFails(db.doc('groups/g1').update({ invitedEmails: firebase.firestore.FieldValue.arrayUnion('neu@example.test') }));
    await assertFails(db.collection('groups').add({ type: 'private', ownerId: uid, memberIds: [uid], invitedEmails: ['neu@example.test'] }));
  }
  // Was ältere App-Versionen beim Hinzufügen von Mitgliedern schicken, bleibt erlaubt:
  // das Feld unverändert, leer oder ganz weg.
  const editor = as.user(env, 'editor');
  await assertSucceeds(editor.doc('groups/g1').update({ memberIds: ['editor', 'reader', 'other'], invitedEmails: ['jemand@example.test'] }));
  await assertSucceeds(editor.doc('groups/g1').update({ invitedEmails: [] }));
  await assertSucceeds(editor.doc('groups/g1').update({ invitedEmails: firebase.firestore.FieldValue.delete() }));
  await assertSucceeds(editor.doc('groups/g1').update({ memberIds: ['editor', 'reader'], invitedEmails: [] }));
  await assertSucceeds(editor.collection('groups').add({ type: 'private', ownerId: 'editor', memberIds: ['editor'], invitedEmails: [] }));
  await assertSucceeds(editor.collection('groups').add({ type: 'private', ownerId: 'editor', memberIds: ['editor'] }));
});

test('groupInvitations (Tech-Check S16): niemand liest oder schreibt, auch Eigentümer und Admins nicht', async () => {
  await seed(env, (db) => db.doc('groupInvitations/inv1').set({ groupId: 'g1', email: 'jemand@example.test', invitedBy: 'editor' }));
  const invitation = { groupId: 'g1', email: 'neu@example.test', invitedBy: 'editor' };
  for (const db of [as.unauth(env), as.anonymous(env), as.user(env, 'reader'), as.user(env, 'editor'), as.user(env, 'admin')]) {
    await assertFails(db.doc('groupInvitations/inv1').get());
    await assertFails(db.collection('groupInvitations').where('groupId', '==', 'g1').get());
    await assertFails(db.doc('groupInvitations/inv2').set(invitation));
    await assertFails(db.doc('groupInvitations/inv1').delete());
  }
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

test('users (Mehrsprachigkeit): die eigene Sprache ist nur de, en oder fr', async () => {
  const db = as.user(env, 'reader');
  await assertSucceeds(db.doc('users/reader').update({ sprache: 'en' }));
  await assertSucceeds(db.doc('users/reader').update({ sprache: 'fr' }));
  await assertSucceeds(db.doc('users/reader').update({ vorname: 'Neu', sprache: 'de' }));
  await assertFails(db.doc('users/reader').update({ sprache: 'es' }));
  await assertFails(db.doc('users/reader').update({ sprache: 'EN' }));
  await assertFails(db.doc('users/reader').update({ sprache: 1 }));
  await assertFails(db.doc('users/reader').update({ sprache: null }));
  // Ohne Änderung an der Sprache bleibt ein Update erlaubt, auch wenn sie schon steht.
  await assertSucceeds(db.doc('users/reader').update({ vorname: 'Noch neuer' }));
  // Fremde Profile ändert ein Mitglied auch mit gültiger Sprache nicht.
  await assertFails(as.user(env, 'reader').doc('users/other').update({ sprache: 'en' }));
});

test('users: anonyme Gäste legen kein Profil an, Mitglieder nur mit Rolle read', async () => {
  await assertFails(as.anonymous(env, 'gast9').doc('users/gast9').set({ role: 'read' }));
  await assertSucceeds(as.user(env, 'neu').doc('users/neu').set({ role: 'read' }));
  await assertFails(as.user(env, 'neu2').doc('users/neu2').set({ role: 'admin' }));
});

test('Sammlungen nur für Cloud Functions bleiben für Clients gesperrt', async () => {
  await assertFails(as.user(env, 'admin').doc('jobRequests/j1').get());
  await assertFails(as.user(env, 'admin').doc('users/admin/security/webImportPin').get());
  await assertFails(as.user(env, 'admin').doc('users/admin/security/shortcutToken').get());
  await assertFails(as.user(env, 'editor').doc('users/editor/security/shortcutToken').set({ hash: 'x' }));
  await assertFails(as.user(env, 'admin').doc('invitations/jemand@example.test').get());
});

test('KI-Tageszähler (Nährwerte, Umformulieren, Weinprofile, Import-Sweeper) sind für Clients weder les- noch schreibbar', async () => {
  for (const path of ['aiNutritionLimits/editor_2026-10-21', 'aiRephraseLimits/editor_2026-10-21', 'aiVersionLimits/editor_2026-10-21', 'aiWeinprofilLimits/editor_2026-10-21', 'importSweeperLimits/editor_2026-10-21']) {
    await assertFails(as.user(env, 'admin').doc(path).get());
    await assertFails(as.user(env, 'admin').doc(path).set({ userId: 'admin', count: 0 }));
    await assertFails(as.user(env, 'editor').doc(path).set({ userId: 'editor', count: 0 }));
  }
});

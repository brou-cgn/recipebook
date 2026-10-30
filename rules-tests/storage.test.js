const test = require('node:test');
const {
  setupStorageEnv, seedUsers, storageAs, assertFails, assertSucceeds,
} = require('./helpers');

// Getränkefotos in Storage (Tech-Check S25): Ablage unter drinks/{uid}/,
// hochladen nur Mitglieder in den eigenen Ordner, löschen Eigentümer oder Admin.

let env;
test.before(async () => { env = await setupStorageEnv(); });
test.after(async () => { await env.cleanup(); });
test.beforeEach(async () => {
  await seedUsers(env);
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const storage = ctx.storage();
    await storage.ref('drinks/reader/bier.png').put(PNG, IMAGE);
    await storage.ref('drinks/alt.png').put(PNG, IMAGE);
  });
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const IMAGE = { contentType: 'image/png' };
const upload = (storage, path, data = PNG, meta = IMAGE) => storage.ref(path).put(data, meta).then();

test('drinks: Mitglied lädt in den eigenen Ordner hoch, nicht in fremde', async () => {
  const reader = storageAs.user(env, 'reader');
  await assertSucceeds(upload(reader, 'drinks/reader/neu.png'));
  await assertFails(upload(reader, 'drinks/other/neu.png'));
  await assertFails(upload(reader, 'drinks/neu.png'));
});

test('drinks: anonyme Gäste und Abgemeldete laden nichts hoch', async () => {
  await assertFails(upload(storageAs.anonymous(env, 'gast1'), 'drinks/gast1/neu.png'));
  await assertFails(upload(storageAs.unauth(env), 'drinks/reader/neu.png'));
  // Konto ohne Profil-Dokument (keine Rolle)
  await assertFails(upload(storageAs.user(env, 'ohneProfil'), 'drinks/ohneProfil/neu.png'));
});

test('drinks: nur Bilder bis 5 MB', async () => {
  const reader = storageAs.user(env, 'reader');
  await assertFails(upload(reader, 'drinks/reader/text.txt', PNG, { contentType: 'text/plain' }));
  await assertFails(upload(reader, 'drinks/reader/gross.png', new Uint8Array(5 * 1024 * 1024)));
});

test('drinks: löschen dürfen Eigentümer und Admin, sonst niemand', async () => {
  await assertFails(storageAs.user(env, 'other').ref('drinks/reader/bier.png').delete());
  await assertFails(storageAs.anonymous(env).ref('drinks/reader/bier.png').delete());
  await assertFails(storageAs.unauth(env).ref('drinks/reader/bier.png').delete());
  await assertSucceeds(storageAs.user(env, 'reader').ref('drinks/reader/bier.png').delete());

  await env.withSecurityRulesDisabled((ctx) => ctx.storage().ref('drinks/reader/bier.png').put(PNG, IMAGE).then());
  await assertSucceeds(storageAs.user(env, 'admin').ref('drinks/reader/bier.png').delete());
});

test('drinks: Fotos sind öffentlich lesbar', async () => {
  await assertSucceeds(storageAs.unauth(env).ref('drinks/reader/bier.png').getMetadata());
  await assertSucceeds(storageAs.unauth(env).ref('drinks/alt.png').getMetadata());
});

test('drinks: Altbestand direkt unter drinks/ löscht nur ein Admin', async () => {
  await assertFails(storageAs.user(env, 'reader').ref('drinks/alt.png').delete());
  await assertFails(storageAs.anonymous(env).ref('drinks/alt.png').delete());
  await assertSucceeds(storageAs.user(env, 'admin').ref('drinks/alt.png').delete());
});

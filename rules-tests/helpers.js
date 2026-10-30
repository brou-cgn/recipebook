/**
 * Gemeinsame Hilfen für die Regel-Tests: Emulator mit firestore.rules, Testnutzer
 * pro Rolle und Seed-Daten. Läuft über `npm test` in diesem Ordner
 * (firebase emulators:exec startet den Emulator und setzt FIRESTORE_EMULATOR_HOST).
 */
const fs = require('node:fs');
const path = require('node:path');
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require('@firebase/rules-unit-testing');

const PROJECT_ID = 'demo-recipebook';

const readRules = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

const setupEnv = () => initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules: readRules('firestore.rules') },
});

// storage.rules liest die Rolle per firestore.get, deshalb beide Emulatoren.
const setupStorageEnv = () => initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules: readRules('firestore.rules') },
  storage: { rules: readRules('storage.rules') },
});

// users/{uid}.role je Testnutzer; 'ohneProfil' hat bewusst kein Dokument.
const USERS = {
  admin: 'admin',
  editor: 'edit',
  reader: 'read',
  other: 'read',
};

/** Legt users/{uid} an und räumt vorher alles weg. */
const seedUsers = async (env) => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [uid, role] of Object.entries(USERS)) {
      await db.doc(`users/${uid}`).set({ role, vorname: uid, email: `${uid}@example.test` });
    }
  });
};

/** Schreibt Daten an den Regeln vorbei (Seed). */
const seed = (env, fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));

const as = {
  unauth: (env) => env.unauthenticatedContext().firestore(),
  user: (env, uid) => env.authenticatedContext(uid).firestore(),
  anonymous: (env, uid = 'gast1') => env
    .authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } })
    .firestore(),
};

/** Storage-Instanzen je Rolle, analog zu `as`. */
const storageAs = {
  unauth: (env) => env.unauthenticatedContext().storage(),
  user: (env, uid) => env.authenticatedContext(uid).storage(),
  anonymous: (env, uid = 'gast1') => env
    .authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } })
    .storage(),
};

module.exports = {
  setupEnv, setupStorageEnv, seedUsers, seed, as, storageAs, assertFails, assertSucceeds, USERS,
};

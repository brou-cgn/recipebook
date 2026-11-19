/**
 * Helpers for the function tests, which load index.js with stubbed modules
 * (Module._load) and therefore need a fresh module graph per load.
 */
const path = require('node:path');
const Module = require('node:module');

// Wird beim ersten Laden erfasst, bevor ein Test Stubs installiert.
const TRUE_LOAD = Module._load;

/**
 * Drops every cached module of this package (index.js and the domain modules
 * it requires) so the next require() runs them against the current stubs.
 * node_modules and the test files themselves stay cached.
 */
function purgeFunctionsCache() {
  // Stubs der Tests bleiben nach dem require('./index') aktiv, weil Handler sharp,
  // nodemailer u. a. erst beim Aufruf laden; hier wird auf das echte Laden zurückgesetzt.
  Module._load = TRUE_LOAD;
  for (const file of Object.keys(require.cache)) {
    if (file.startsWith(__dirname + path.sep) &&
        !file.includes(path.sep + 'node_modules' + path.sep) &&
        !file.endsWith('.test.js') &&
        file !== __filename) {
      delete require.cache[file];
    }
  }
}

// Modulare Einstiegspunkte von firebase-admin, die der Functions-Code lädt (Tech-Check F18:
// die Namespace-API admin.firestore() usw. gibt es ab firebase-admin 14 nicht mehr).
const FIREBASE_ADMIN_MODULES = new Set([
  'firebase-admin/app',
  'firebase-admin/firestore',
  'firebase-admin/auth',
  'firebase-admin/storage',
  'firebase-admin/messaging',
]);

const NODE_MODULES = `${path.sep}node_modules${path.sep}`;

/**
 * Ob ein Module._load-Aufruf ein modularer firebase-admin-Import aus dem eigenen Code ist.
 * Importe aus node_modules bleiben echt: firebase-functions lädt firebase-admin/app u. a.
 * selbst, und das taten die Tests vor der Umstellung auch nicht nach.
 * @param {string} request - angefragter Modulname
 * @param {object} [parent] - anfragendes Modul (zweites Argument von Module._load)
 * @return {boolean}
 */
function isFirebaseAdminRequest(request, parent) {
  return FIREBASE_ADMIN_MODULES.has(request) &&
    !(parent && typeof parent.filename === 'string' && parent.filename.includes(NODE_MODULES));
}

/**
 * Exporte eines modularen firebase-admin-Subpfads, gebaut aus einem Test-Fake. Die Fakes
 * beschreiben firebase-admin weiter in einer Form: {initializeApp, firestore() samt
 * firestore.FieldValue/Timestamp/FieldPath, auth(), storage(), messaging(), app(), credential}.
 * Aufrufe gehen erst beim Aufruf an den Fake, wie früher admin.firestore() usw.
 * @param {string} request - z. B. 'firebase-admin/firestore'
 * @param {object} fake - Fake in der oben beschriebenen Form
 * @return {object} Exporte des Subpfads
 */
function firebaseAdminModule(request, fake) {
  switch (request) {
    case 'firebase-admin/app':
      return {
        initializeApp: (...args) => fake.initializeApp(...args),
        getApp: (...args) => fake.app(...args),
        applicationDefault: (...args) => fake.credential.applicationDefault(...args),
      };
    case 'firebase-admin/firestore':
      return {
        getFirestore: (...args) => fake.firestore(...args),
        FieldValue: fake.firestore?.FieldValue,
        Timestamp: fake.firestore?.Timestamp,
        FieldPath: fake.firestore?.FieldPath,
      };
    case 'firebase-admin/auth':
      return {getAuth: (...args) => fake.auth(...args)};
    case 'firebase-admin/storage':
      return {getStorage: (...args) => fake.storage(...args)};
    case 'firebase-admin/messaging':
      return {getMessaging: (...args) => fake.messaging(...args)};
    default:
      throw new Error(`firebaseAdminModule: kein Fake für ${request}`);
  }
}

module.exports = {purgeFunctionsCache, isFirebaseAdminRequest, firebaseAdminModule};

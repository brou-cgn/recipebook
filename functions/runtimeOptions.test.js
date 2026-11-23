/**
 * Dienstkonto aller Functions (Tech-Check S15, shared/runtimeOptions.js).
 *
 * Lädt index.js mit dem echten firebase-functions, damit die Deploy-Beschreibung jeder Function
 * (`__endpoint`) so entsteht wie beim Deploy. Geprüft wird:
 * - ohne eingetragenes Konto ändert sich nichts (Compute-Standardkonto wie bisher),
 * - mit eingetragenem Konto läuft jede exportierte Function darunter: index.js setzt es vor dem
 *   ersten Handler, und keine Function überschreibt es,
 * - eine falsche Adresse bricht ab, statt mit ihr zu deployen.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');
const {isFirebaseAdminRequest, firebaseAdminModule, purgeFunctionsCache} = require('./testSupport');
const {clearGlobalOptions, RESET_VALUE} = require('firebase-functions/v2/options');
const runtimeOptions = require('./shared/runtimeOptions');

const TEST_ACCOUNT = 'recipebook-functions@demo-recipebook.iam.gserviceaccount.com';

/**
 * Lädt index.js und liest die Deploy-Beschreibung jeder Function, solange die globalen Optionen
 * noch gesetzt sind (Storage-Trigger berechnen sie erst beim Lesen, wie beim Deploy).
 * @return {Array<[string, Object]>}
 */
function loadEndpoints({serviceAccount = null} = {}) {
  purgeFunctionsCache();
  clearGlobalOptions();
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain, ...args) {
    if (request === './shared/runtimeOptions' && parent && /[\\/]functions[\\/]index\.js$/.test(parent.filename)) {
      // Wie ein eingetragenes FUNCTIONS_SERVICE_ACCOUNT, aber über dieselbe Funktion wie im Code.
      const real = originalLoad.call(this, request, parent, isMain, ...args);
      return {...real, applyGlobalOptions: () => real.applyGlobalOptions(serviceAccount)};
    }
    if (isFirebaseAdminRequest(request, parent)) {
      const firestore = () => ({});
      firestore.FieldValue = {};
      firestore.FieldPath = {};
      return firebaseAdminModule(request, {
        initializeApp: () => {}, firestore, auth: () => ({}), storage: () => ({}), messaging: () => ({}),
      });
    }
    return originalLoad.call(this, request, parent, isMain, ...args);
  };
  try {
    return Object.entries(require('./index')).map(([name, fn]) => {
      assert.ok(fn && fn.__endpoint, `${name} hat keine Deploy-Beschreibung (__endpoint)`);
      return [name, fn.__endpoint];
    });
  } finally {
    Module._load = originalLoad;
    clearGlobalOptions();
  }
}

test('im Code ist noch kein eigenes Dienstkonto eingetragen (Umstellung erst nach dem IAM-Teil)', () => {
  assert.equal(runtimeOptions.FUNCTIONS_SERVICE_ACCOUNT, null);
});

test('ohne eingetragenes Konto bleibt jede Function beim Standardkonto', () => {
  const list = loadEndpoints();
  assert.ok(list.length > 50, `nur ${list.length} Functions gefunden`);
  for (const [name, endpoint] of list) {
    // Nicht gesetzt oder RESET_VALUE: Der Deploy nimmt dann das Standardkonto der Plattform.
    assert.ok(endpoint.serviceAccountEmail === undefined || endpoint.serviceAccountEmail === RESET_VALUE,
        `${name} setzt ein eigenes Dienstkonto`);
  }
});

test('mit eingetragenem Konto läuft jede exportierte Function darunter', () => {
  for (const [name, endpoint] of loadEndpoints({serviceAccount: TEST_ACCOUNT})) {
    assert.equal(endpoint.serviceAccountEmail, TEST_ACCOUNT, `${name} läuft nicht unter dem eingetragenen Konto`);
  }
});

test('nur die volle Adresse eines Dienstkontos ist erlaubt', () => {
  assert.equal(runtimeOptions.globalOptionsFor(null), null);
  assert.deepEqual(runtimeOptions.globalOptionsFor(TEST_ACCOUNT), {serviceAccount: TEST_ACCOUNT});
  for (const wrong of ['default', 'recipebook-functions@', 'jemand@gmail.com',
    'Recipebook@broubook.iam.gserviceaccount.com', 'ab@broubook.iam.gserviceaccount.com', '', 42]) {
    assert.throws(() => runtimeOptions.globalOptionsFor(wrong), /volle Adresse eines Dienstkontos/, String(wrong));
  }
});

// generateWeinprofile: Gericht-Profile der Weinbegleitung (docs/vorhaben/weinbegleitung.md).
// Geprüft wird serverseitig: Rolle ab edit, Sichtbarkeit je Rezept, Tageslimit je
// geschätztes Rezept, Hash-Skip ohne KI-Aufruf und das Verwerfen ungültiger Antworten.

const test = require('node:test');
const assert = require('node:assert/strict');
const {weinprofilInputHash} = require('./shared/weinprofil');

let userRoles;
let userLookupFails;
let store;
let quota;
let updates;
let updateFails;
let handlers;

function loadHandlers() {
  require('./testSupport').purgeFunctionsCache();

  const Module = require('module');
  const originalLoad = Module._load;

  Module._load = function(request, parent, isMain, ...args) {
    if (request === 'firebase-functions/v2/https') {
      class MockHttpsError extends Error {
        constructor(code, message) {
          super(message);
          this.code = code;
        }
      }
      return {
        onCall: (_opts, handler) => handler,
        onRequest: (_opts, handler) => handler,
        HttpsError: MockHttpsError,
      };
    }
    if (request === 'firebase-functions/v2/firestore') {
      return {onDocumentCreated: (_opts, handler) => handler, onDocumentWritten: (_opts, handler) => handler};
    }
    if (request === 'firebase-functions/v2/scheduler') {
      return {onSchedule: (_opts, handler) => handler};
    }
    if (request === 'firebase-functions/params') {
      return {defineSecret: () => ({value: () => 'test-secret'})};
    }
    if (request === 'firebase-admin') {
      const docRef = (name, id) => {
        const ref = {
          id,
          path: `${name}/${id}`,
          get: async () => {
            const data = store[name]?.[id];
            return {exists: data !== undefined, id, ref, data: () => data};
          },
          update: async (patch) => {
            if (updateFails) {
              const error = new Error('not found');
              error.code = 'not-found';
              throw error;
            }
            updates.push({path: `${name}/${id}`, patch});
          },
          set: async () => {},
        };
        return ref;
      };
      const firestoreFactory = () => ({
        collection: (name) => ({
          doc: (id) => docRef(name, id),
          where: () => ({limit: () => ({get: async () => ({empty: true, docs: []})})}),
        }),
        doc: (path) => ({
          get: async () => {
            if (userLookupFails) throw new Error('firestore unavailable');
            const uid = path.replace(/^users\//, '');
            return uid in userRoles
              ? {exists: true, data: () => ({role: userRoles[uid]})}
              : {exists: false, data: () => ({})};
          },
        }),
        runTransaction: async (fn) => fn({
          get: async (ref) => (ref.path in quota
            ? {exists: true, data: () => ({count: quota[ref.path]})}
            : {exists: false, data: () => ({})}),
          set: (ref, data) => {
            quota[ref.path] = data.count;
          },
          update: (ref) => {
            quota[ref.path] += 1;
          },
        }),
      });
      firestoreFactory.FieldValue = {serverTimestamp: () => ({}), increment: (n) => n};
      return {initializeApp: () => {}, firestore: firestoreFactory};
    }
    if (/^\.\.?\/nutritionNormalization$/.test(request)) {
      return {createNutritionNormalizationUtils: () => ({})};
    }
    if (request === '@google/genai') return {GoogleGenAI: class {}};
    if (request === 'nodemailer') return {createTransport: () => ({sendMail: async () => ({})})};
    if (request === 'sharp') {
      const chain = {rotate: () => chain, resize: () => chain, png: () => chain, toBuffer: async () => Buffer.from('')};
      return () => chain;
    }
    return originalLoad.call(this, request, parent, isMain, ...args);
  };

  return require('./index');
}

const auth = (uid) => ({uid, token: {firebase: {sign_in_provider: 'password'}}});
const call = (uid, data) => handlers.generateWeinprofile({auth: uid ? auth(uid) : null, data});

const heute = () => new Date().toLocaleDateString('sv-SE', {timeZone: 'Europe/Berlin'});
const quotaPfad = (uid) => `aiWeinprofilLimits/${uid}_${heute()}`;

const PROFIL = {
  rolle: 'hauptgericht',
  hauptkomponente: 'rind_lamm',
  zubereitung: 'geschmort',
  sauce: 'rotwein_jus',
  intensitaet: 5,
  komponenten: {saeure: 0, suesse: 0, salz: 2, fett: 2, schaerfe: 0, bitter: 0, umami: 2},
  konfidenz: 0.85,
};

const BRATEN = {
  title: 'Rinderschmorbraten',
  ingredients: [{type: 'ingredient', text: '1,2 kg Rinderschulter'}, '750 ml Rotwein'],
  steps: ['Anbraten.', {type: 'step', text: 'Drei Stunden schmoren.'}],
  speisekategorie: ['Hauptspeisen'],
  kulinarik: ['Deutsche Küche'],
  authorId: 'edit-1',
  groupId: 'pub',
};

let fetchCalls;
let geminiAntwort;
const realFetch = global.fetch;

function mockGemini() {
  global.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    fetchCalls.push({url, headers: init.headers, body});
    const {status = 200, text} = geminiAntwort(body.contents[0].parts[0].text);
    return {
      ok: status === 200,
      status,
      json: async () => ({candidates: [{content: {parts: [{text}]}}]}),
    };
  };
}

test.beforeEach(() => {
  userRoles = {'edit-1': 'edit', 'mod-1': 'moderator', 'admin-1': 'admin', 'read-1': 'read'};
  userLookupFails = false;
  updateFails = false;
  updates = [];
  quota = {};
  fetchCalls = [];
  store = {
    recipes: {
      braten: {...BRATEN},
      privat: {...BRATEN, title: 'Listenrezept', groupId: 'liste', authorId: 'jemand'},
      entwurf: {...BRATEN, title: 'Entwurf', isPrivate: true, authorId: 'jemand'},
      meins: {...BRATEN, title: 'Mein Entwurf', isPrivate: true, authorId: 'edit-1'},
    },
    groups: {
      pub: {type: 'public', memberIds: []},
      liste: {type: 'private', memberIds: ['jemand']},
    },
  };
  geminiAntwort = () => ({text: JSON.stringify(PROFIL)});
  mockGemini();
  handlers = loadHandlers();
});

test.afterEach(() => {
  global.fetch = realFetch;
});

test('lehnt Abgemeldete ab', async () => {
  await assert.rejects(() => call(null, {recipeIds: ['braten']}), (e) => e.code === 'unauthenticated');
});

test('lehnt Rollen unter edit ab, ohne Limit und ohne KI', async () => {
  await assert.rejects(() => call('read-1', {recipeIds: ['braten']}), (e) => e.code === 'permission-denied');
  await assert.rejects(() => call('ohne-profil', {recipeIds: ['braten']}), (e) => e.code === 'permission-denied');
  assert.deepEqual(quota, {});
  assert.equal(fetchCalls.length, 0);
});

test('schlägt geschlossen fehl, wenn die Rolle nicht lesbar ist', async () => {
  userLookupFails = true;
  await assert.rejects(() => call('edit-1', {recipeIds: ['braten']}), (e) => e.code === 'unavailable');
  assert.equal(fetchCalls.length, 0);
});

test('prüft recipeIds: 1 bis 20 nicht leere IDs ohne Schrägstrich', async () => {
  const zuViele = Array.from({length: 21}, (_, i) => `r${i}`);
  for (const recipeIds of [undefined, [], zuViele, [''], [' '], [5], ['a/b']]) {
    await assert.rejects(() => call('edit-1', {recipeIds}), (e) => e.code === 'invalid-argument');
  }
  assert.equal(fetchCalls.length, 0);
});

test('schätzt ein Rezept, schreibt nur weinprofil und zählt das Tageslimit', async () => {
  const ergebnis = await call('edit-1', {recipeIds: ['braten']});

  assert.equal(fetchCalls.length, 1);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].path, 'recipes/braten');
  assert.deepEqual(Object.keys(updates[0].patch), ['weinprofil']);
  const profil = updates[0].patch.weinprofil;
  assert.deepEqual({...profil, erstelltAm: 0}, {
    ...PROFIL,
    inputHash: weinprofilInputHash(BRATEN),
    modell: 'gemini-2.5-flash',
    schemaVersion: 1,
    erstelltAm: 0,
  });
  assert.equal(typeof profil.erstelltAm, 'number');

  assert.deepEqual(ergebnis.profile, {braten: profil});
  assert.deepEqual(ergebnis.uebersprungen, []);
  assert.deepEqual(ergebnis.fehlgeschlagen, []);
  assert.equal(quota[quotaPfad('edit-1')], 1);
  assert.equal(ergebnis.dailyLimit, 500);
  assert.equal(ergebnis.remainingRequests, 499);
});

test('fragt Gemini mit temperature 0, JSON und festen Listen, ohne Weinnamen', async () => {
  await call('edit-1', {recipeIds: ['braten']});
  const {body, headers, url} = fetchCalls[0];
  assert.match(url, /gemini-2\.5-flash:generateContent$/);
  assert.equal(headers['x-goog-api-key'], 'test-secret');
  assert.equal(body.generationConfig.temperature, 0);
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  const schema = body.generationConfig.responseSchema;
  assert.ok(schema.properties.hauptkomponente.enum.includes('rind_lamm'));
  assert.ok(schema.properties.sauce.enum.includes('keine'));
  assert.deepEqual(schema.properties.komponenten.required, ['saeure', 'suesse', 'salz', 'fett', 'schaerfe', 'bitter', 'umami']);
  const prompt = body.contents[0].parts[0].text;
  assert.match(prompt, /KEINE Weine/);
  assert.match(prompt, /Rinderschmorbraten/);
  assert.match(prompt, /Hauptspeisen/);
  assert.match(prompt, /Drei Stunden schmoren/);
});

test('überspringt ein Rezept mit aktuellem Profil: kein KI-Aufruf, kein Limit', async () => {
  const vorhanden = {...PROFIL, inputHash: weinprofilInputHash(BRATEN), modell: 'x', schemaVersion: 1, erstelltAm: 1};
  store.recipes.braten = {...BRATEN, weinprofil: vorhanden};

  const ergebnis = await call('edit-1', {recipeIds: ['braten']});

  assert.equal(fetchCalls.length, 0);
  assert.equal(updates.length, 0);
  assert.deepEqual(quota, {});
  assert.deepEqual(ergebnis.uebersprungen, ['braten']);
  assert.deepEqual(ergebnis.profile, {braten: vorhanden});
});

test('schätzt neu, wenn sich der Rezeptinhalt seit dem Profil geändert hat', async () => {
  const alt = {...PROFIL, inputHash: weinprofilInputHash(BRATEN), modell: 'x', schemaVersion: 1, erstelltAm: 1};
  store.recipes.braten = {...BRATEN, title: 'Rinderschmorbraten mit Pilzen', weinprofil: alt};

  const ergebnis = await call('edit-1', {recipeIds: ['braten']});

  assert.equal(fetchCalls.length, 1);
  assert.notEqual(updates[0].patch.weinprofil.inputHash, alt.inputHash);
  assert.deepEqual(ergebnis.uebersprungen, []);
});

test('schätzt neu, wenn das gespeicherte Profil ungültig ist oder eine andere schemaVersion hat', async () => {
  const hash = weinprofilInputHash(BRATEN);
  store.recipes.braten = {...BRATEN, weinprofil: {...PROFIL, inputHash: hash, schemaVersion: 0}};
  store.recipes.meins = {...BRATEN, title: 'Mein Entwurf', isPrivate: true,
    weinprofil: {...PROFIL, intensitaet: 9, inputHash: weinprofilInputHash({...BRATEN, title: 'Mein Entwurf'}), schemaVersion: 1}};

  await call('edit-1', {recipeIds: ['braten', 'meins']});
  assert.equal(fetchCalls.length, 2);
});

test('verwirft ungültige KI-Antworten, ohne zu speichern', async () => {
  const ungueltig = [
    JSON.stringify({...PROFIL, hauptkomponente: 'tofu'}),
    JSON.stringify({...PROFIL, intensitaet: 7}),
    JSON.stringify({...PROFIL, komponenten: {...PROFIL.komponenten, umami: 4}}),
    JSON.stringify({...PROFIL, konfidenz: 1.5}),
    JSON.stringify({...PROFIL, sauce: 'Riesling'}),
    'Dazu passt ein Riesling.',
  ];
  for (const text of ungueltig) {
    updates = [];
    geminiAntwort = () => ({text});
    const ergebnis = await call('edit-1', {recipeIds: ['braten']});
    assert.deepEqual(ergebnis.fehlgeschlagen, ['braten'], text);
    assert.deepEqual(ergebnis.fehlerGruende, {braten: 'kiUngueltig'});
    assert.equal(updates.length, 0);
  }
});

test('ein Gemini-Fehler trifft nur das betroffene Rezept', async () => {
  geminiAntwort = (prompt) => (prompt.includes('Mein Entwurf') ? {status: 503, text: ''} : {text: JSON.stringify(PROFIL)});

  const ergebnis = await call('edit-1', {recipeIds: ['braten', 'meins']});

  assert.deepEqual(Object.keys(ergebnis.profile), ['braten']);
  assert.deepEqual(ergebnis.fehlgeschlagen, ['meins']);
  assert.deepEqual(ergebnis.fehlerGruende, {meins: 'kiFehler'});
});

test('schätzt nur Rezepte, die die Person sehen darf', async () => {
  const ergebnis = await call('edit-1', {recipeIds: ['privat', 'entwurf', 'meins', 'fehlt']});

  assert.deepEqual(Object.keys(ergebnis.profile), ['meins']);
  assert.deepEqual(ergebnis.fehlerGruende, {privat: 'keinZugriff', entwurf: 'keinZugriff', fehlt: 'nichtGefunden'});
  assert.equal(fetchCalls.length, 1);
  assert.equal(quota[quotaPfad('edit-1')], 1);
});

test('Admins dürfen alle Rezepte einschätzen lassen und haben ein höheres Limit', async () => {
  const ergebnis = await call('admin-1', {recipeIds: ['privat', 'entwurf']});
  assert.deepEqual(Object.keys(ergebnis.profile).sort(), ['entwurf', 'privat']);
  assert.equal(ergebnis.dailyLimit, 5000);
});

test('zählt doppelte IDs nur einmal', async () => {
  const ergebnis = await call('edit-1', {recipeIds: ['braten', 'braten', ' braten ']});
  assert.equal(fetchCalls.length, 1);
  assert.deepEqual(Object.keys(ergebnis.profile), ['braten']);
});

test('Tageslimit: was übrig ist, wird geschätzt, der Rest als tageslimit gemeldet', async () => {
  quota[quotaPfad('edit-1')] = 499;

  const ergebnis = await call('edit-1', {recipeIds: ['braten', 'meins']});

  assert.equal(fetchCalls.length, 1);
  assert.deepEqual(Object.keys(ergebnis.profile), ['braten']);
  assert.deepEqual(ergebnis.fehlerGruende, {meins: 'tageslimit'});
  assert.equal(quota[quotaPfad('edit-1')], 500);
});

test('Tageslimit erschöpft und nichts übersprungen: resource-exhausted ohne KI-Aufruf', async () => {
  quota[quotaPfad('edit-1')] = 500;
  await assert.rejects(() => call('edit-1', {recipeIds: ['braten']}), (e) => e.code === 'resource-exhausted');
  assert.equal(fetchCalls.length, 0);
});

test('Tageslimit erschöpft, aber übersprungene Profile kommen trotzdem zurück', async () => {
  quota[quotaPfad('edit-1')] = 500;
  const vorhanden = {...PROFIL, inputHash: weinprofilInputHash(BRATEN), modell: 'x', schemaVersion: 1, erstelltAm: 1};
  store.recipes.braten = {...BRATEN, weinprofil: vorhanden};

  const ergebnis = await call('edit-1', {recipeIds: ['braten', 'meins']});

  assert.deepEqual(ergebnis.uebersprungen, ['braten']);
  assert.deepEqual(ergebnis.fehlerGruende, {meins: 'tageslimit'});
  assert.equal(fetchCalls.length, 0);
});

test('meldet einen Speicherfehler (z. B. Rezept inzwischen gelöscht) je Rezept', async () => {
  updateFails = true;
  const ergebnis = await call('edit-1', {recipeIds: ['braten']});
  assert.deepEqual(ergebnis.fehlerGruende, {braten: 'speichern'});
  assert.deepEqual(ergebnis.profile, {});
});

test('begrenzt die Parallelität und schafft 20 Rezepte in einem Aufruf', async () => {
  const ids = Array.from({length: 20}, (_, i) => `r${i}`);
  ids.forEach((id) => {
    store.recipes[id] = {...BRATEN, title: `Gericht ${id}`};
  });
  let laufend = 0;
  let maxLaufend = 0;
  global.fetch = async () => {
    laufend += 1;
    maxLaufend = Math.max(maxLaufend, laufend);
    await new Promise((resolve) => setTimeout(resolve, 5));
    laufend -= 1;
    return {ok: true, status: 200, json: async () => ({candidates: [{content: {parts: [{text: JSON.stringify(PROFIL)}]}}]})};
  };

  const ergebnis = await call('edit-1', {recipeIds: ids});

  assert.equal(Object.keys(ergebnis.profile).length, 20);
  assert.ok(maxLaufend <= 4, `höchstens 4 gleichzeitig, waren ${maxLaufend}`);
  assert.equal(quota[quotaPfad('edit-1')], 20);
});

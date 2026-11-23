// Mehrsprachigkeit (docs/vorhaben/mehrsprachigkeit.md, PR 5 und 6t): Übersetzungen für
// Auswahllisten. Geprüft wird für die Vorschläge (Callable): Prüfung von Anfrage und Antwort, nur
// Admins, Tageslimit, Fehler des KI-Dienstes, sie schreibt nichts. Für die Automatik (Trigger auf
// settings/app): fehlende Werte finden, nur leere Felder füllen und markieren, nur bei Änderungen
// an den Listen aufwachen, frisch lesen, Tageslimit, Schreiben nur bei Neuem.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  pruefeListenEingabe,
  baueListenPrompt,
  pruefeListenAntwort,
  fehlendeListenwerte,
  ergaenzeListenUebersetzungen,
  listenStand,
} = require('./shared/listenUebersetzung');
const {isFirebaseAdminRequest, firebaseAdminModule} = require('./testSupport');

let userRoles;
let quota;
let geschrieben;
let dokumente;
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
      return {onCall: (_opts, handler) => handler, onRequest: (_opts, handler) => handler, HttpsError: MockHttpsError};
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
    if (isFirebaseAdminRequest(request, parent)) {
      const docRef = (pfad) => ({
        path: pfad,
        get: async () => (pfad in dokumente ?
          {exists: true, data: () => structuredClone(dokumente[pfad])} :
          {exists: false, data: () => undefined}),
        set: async () => geschrieben.push(pfad),
        update: async () => geschrieben.push(pfad),
      });
      const firestoreFactory = () => ({
        collection: (name) => ({doc: (id) => docRef(`${name}/${id}`)}),
        doc: (pfad) => ({
          get: async () => {
            const uid = pfad.replace(/^users\//, '');
            return uid in userRoles ?
              {exists: true, data: () => ({role: userRoles[uid]})} :
              {exists: false, data: () => ({})};
          },
        }),
        runTransaction: async (fn) => fn({
          get: async (ref) => {
            if (ref.path in quota) return {exists: true, data: () => ({count: quota[ref.path]})};
            if (ref.path in dokumente) return {exists: true, data: () => structuredClone(dokumente[ref.path])};
            return {exists: false, data: () => ({})};
          },
          set: (ref, data) => {
            quota[ref.path] = data.count;
          },
          update: (ref, patch) => {
            if (ref.path in dokumente) {
              dokumente[ref.path] = {...dokumente[ref.path], ...structuredClone(patch)};
              geschrieben.push(ref.path);
              return;
            }
            quota[ref.path] += 1;
          },
        }),
      });
      firestoreFactory.FieldValue = {serverTimestamp: () => ({}), increment: (n) => n};
      firestoreFactory.FieldPath = {documentId: () => '__id__'};
      return firebaseAdminModule(request, {initializeApp: () => {}, firestore: firestoreFactory});
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

const heute = () => new Date().toLocaleDateString('sv-SE', {timeZone: 'Europe/Berlin'});
const quotaPfad = (uid) => `aiListenUebersetzungLimits/${uid}_${heute()}`;

let fetchCalls;
let geminiAntwort;
const realFetch = global.fetch;

const datenAusPrompt = (prompt) => JSON.parse(prompt.slice(prompt.lastIndexOf('\n') + 1));
const antworte = (daten) => ({
  eintraege: daten.map((eintrag) => (eintrag.einheit ?
    {nr: eintrag.nr, en_einzahl: 'serving', en_mehrzahl: 'servings', fr_einzahl: 'portion', fr_mehrzahl: 'portions'} :
    {nr: eintrag.nr, en: `EN ${eintrag.text}`, fr: `FR ${eintrag.text}`})),
});

function mockGemini() {
  global.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    const daten = datenAusPrompt(body.contents[0].parts[0].text);
    fetchCalls.push(daten);
    const {status = 200, json} = geminiAntwort(daten);
    return {ok: status === 200, status, json: async () => ({candidates: [{content: {parts: [{text: JSON.stringify(json)}]}}]})};
  };
}

const EINTRAEGE = [
  {liste: 'cuisineTypes', wert: 'Italienische Küche'},
  {liste: 'mealCategories', wert: 'Hauptspeisen', text: 'Hauptspeisen'},
  {liste: 'portionUnits', wert: 'portion', einzahl: 'Portion', mehrzahl: 'Portionen'},
];

test.beforeEach(() => {
  userRoles = {'edit-1': 'edit', 'mod-1': 'moderator', 'admin-1': 'admin'};
  quota = {};
  geschrieben = [];
  dokumente = {};
  fetchCalls = [];
  geminiAntwort = (daten) => ({json: antworte(daten)});
  mockGemini();
  handlers = loadHandlers();
});

test.afterEach(() => {
  global.fetch = realFetch;
});

test('pruefeListenEingabe: Texte und Einheiten, Nummern in Reihenfolge, Fehler bei Ungültigem', () => {
  assert.deepEqual(pruefeListenEingabe(EINTRAEGE), [
    {nr: 1, liste: 'cuisineTypes', wert: 'Italienische Küche', einheit: false, text: 'Italienische Küche'},
    {nr: 2, liste: 'mealCategories', wert: 'Hauptspeisen', einheit: false, text: 'Hauptspeisen'},
    {nr: 3, liste: 'portionUnits', wert: 'portion', einheit: true, einzahl: 'Portion', mehrzahl: 'Portionen'},
  ]);
  assert.throws(() => pruefeListenEingabe([]), /1 bis 100/);
  assert.throws(() => pruefeListenEingabe(Array.from({length: 101}, () => EINTRAEGE[0])), /1 bis 100/);
  assert.throws(() => pruefeListenEingabe([{liste: 'adjektive', wert: 'frisch'}]), /ungültig/);
  assert.throws(() => pruefeListenEingabe([{liste: 'portionUnits', wert: 'x'}]), /einzahl/);
  assert.throws(() => pruefeListenEingabe([{liste: 'units', wert: 'a\nb'}]), /ungültig/);
});

test('baueListenPrompt: Einträge als JSON am Ende, Einheiten mit Einzahl und Mehrzahl', () => {
  const daten = datenAusPrompt(baueListenPrompt(pruefeListenEingabe(EINTRAEGE)));
  assert.deepEqual(daten[2], {nr: 3, liste: 'portionUnits', einheit: true, einzahl: 'Portion', mehrzahl: 'Portionen'});
  assert.deepEqual(daten[0], {nr: 1, liste: 'cuisineTypes', text: 'Italienische Küche'});
});

test('pruefeListenAntwort: ordnet nach Nummer zu und verwirft Unvollständiges', () => {
  const eintraege = pruefeListenEingabe(EINTRAEGE);
  const vorschlaege = pruefeListenAntwort({
    eintraege: [
      {nr: 1, en: 'Italian cuisine', fr: 'Cuisine italienne'},
      {nr: 2, en: 'Main courses'},
      {nr: 3, en_einzahl: 'serving', en_mehrzahl: 'servings', fr_einzahl: 'portion', fr_mehrzahl: 'portions'},
      {nr: 9, en: 'x', fr: 'y'},
    ],
  }, eintraege);
  assert.deepEqual(vorschlaege, [
    {liste: 'cuisineTypes', wert: 'Italienische Küche', en: 'Italian cuisine', fr: 'Cuisine italienne'},
    {liste: 'portionUnits', wert: 'portion', en: {einzahl: 'serving', mehrzahl: 'servings'}, fr: {einzahl: 'portion', mehrzahl: 'portions'}},
  ]);
  assert.deepEqual(pruefeListenAntwort(null, eintraege), []);
});

const auth = (uid) => ({uid, token: {firebase: {sign_in_provider: 'password'}}});
const aufruf = (uid, data) => handlers.uebersetzeListenwerte({auth: uid ? auth(uid) : null, data});

test('Callable: liefert Vorschläge für Admins und schreibt nichts außer dem Zähler', async () => {
  const ergebnis = await aufruf('admin-1', {eintraege: EINTRAEGE});
  assert.equal(fetchCalls.length, 1);
  assert.equal(ergebnis.vorschlaege.length, 3);
  assert.deepEqual(ergebnis.vorschlaege[0], {liste: 'cuisineTypes', wert: 'Italienische Küche', en: 'EN Italienische Küche', fr: 'FR Italienische Küche'});
  assert.equal(ergebnis.dailyLimit, 100);
  assert.equal(quota[quotaPfad('admin-1')], 1);
  assert.deepEqual(geschrieben, []);
});

test('Callable: lehnt Abgemeldete, ungültige Anfragen und Nicht-Admins ab, ohne KI und Zähler', async () => {
  await assert.rejects(() => aufruf(null, {eintraege: EINTRAEGE}), (e) => e.code === 'unauthenticated');
  await assert.rejects(() => aufruf('admin-1', {eintraege: []}), (e) => e.code === 'invalid-argument');
  for (const uid of ['edit-1', 'mod-1']) {
    await assert.rejects(() => aufruf(uid, {eintraege: EINTRAEGE}), (e) => e.code === 'permission-denied');
  }
  assert.deepEqual(fetchCalls, []);
  assert.deepEqual(quota, {});
});

test('Callable: am Tageslimit kein KI-Aufruf, bei Fehler des KI-Dienstes unavailable', async () => {
  quota[quotaPfad('admin-1')] = 100;
  await assert.rejects(() => aufruf('admin-1', {eintraege: EINTRAEGE}), (e) => e.code === 'resource-exhausted');
  assert.deepEqual(fetchCalls, []);

  delete quota[quotaPfad('admin-1')];
  geminiAntwort = () => ({status: 503, json: {}});
  await assert.rejects(() => aufruf('admin-1', {eintraege: EINTRAEGE}), (e) => e.code === 'unavailable');
});

// ── Automatik (PR 6t) ─────────────────────────────────────────────────────────

const PORTION = {id: 'portion', singular: 'Portion', plural: 'Portionen'};
const STUECK = {id: 'stueck', singular: 'Stück', plural: 'Stück'};
const EINSTELLUNGEN = {
  cuisineTypes: ['Italienische Küche', 'Peruanische Küche', 'Italienische Küche'],
  cuisineGroups: [{name: 'Europa', children: ['Italienische Küche']}],
  mealCategories: ['Hauptspeisen'],
  units: ['EL'],
  portionUnits: [PORTION, STUECK],
  headerSlogan: 'Kochen mit Freude',
  listenUebersetzungen: {
    cuisineTypes: [{wert: 'Italienische Küche', en: 'Italian cuisine', fr: 'Cuisine italienne'}],
    mealCategories: [{wert: 'Hauptspeisen', en: 'Main courses'}],
    units: [{wert: 'EL', en: 'tbsp', fr: 'c. à s.'}],
    portionUnits: [{wert: 'stueck', en: {einzahl: 'piece', mehrzahl: ''}, fr: {einzahl: 'pièce', mehrzahl: 'pièces'}}],
  },
};

test('fehlendeListenwerte: Texte, Gruppen über den Namen, Einheiten mit Lücke, ohne Doppelte', () => {
  assert.deepEqual(fehlendeListenwerte(EINSTELLUNGEN), [
    {liste: 'cuisineTypes', wert: 'Peruanische Küche', text: 'Peruanische Küche'},
    {liste: 'cuisineGroups', wert: 'Europa', text: 'Europa'},
    {liste: 'mealCategories', wert: 'Hauptspeisen', text: 'Hauptspeisen'},
    {liste: 'portionUnits', wert: 'portion', einzahl: 'Portion', mehrzahl: 'Portionen'},
    {liste: 'portionUnits', wert: 'stueck', einzahl: 'Stück', mehrzahl: 'Stück'},
  ]);
  assert.deepEqual(fehlendeListenwerte({}), []);
});

test('fehlendeListenwerte: lässt Werte aus, die pruefeListenEingabe nicht bestünden', () => {
  const lang = 'x'.repeat(81);
  const fehlend = fehlendeListenwerte({
    cuisineTypes: [' Thai', 'Thai', lang, 'a\nb'],
    portionUnits: [{id: 'teller', singular: lang, plural: 'Teller'}, {id: 'tasse', singular: 'Tasse'}],
  });
  assert.deepEqual(fehlend, [
    {liste: 'cuisineTypes', wert: 'Thai', text: 'Thai'},
    {liste: 'portionUnits', wert: 'tasse', einzahl: 'Tasse', mehrzahl: 'Tasse'},
  ]);
  assert.doesNotThrow(() => pruefeListenEingabe(fehlend));
});

const VORSCHLAEGE = [
  {liste: 'cuisineTypes', wert: 'Peruanische Küche', en: 'Peruvian cuisine', fr: 'Cuisine péruvienne'},
  {liste: 'mealCategories', wert: 'Hauptspeisen', en: 'Mains', fr: 'Plats principaux'},
  {liste: 'portionUnits', wert: 'stueck', en: {einzahl: 'item', mehrzahl: 'items'}, fr: {einzahl: 'x', mehrzahl: 'y'}},
];

test('ergaenzeListenUebersetzungen: füllt nur leere Felder und markiert sie als ungeprüft', () => {
  const vorher = structuredClone(EINSTELLUNGEN);
  const {listenUebersetzungen, neu} = ergaenzeListenUebersetzungen(EINSTELLUNGEN, fehlendeListenwerte(EINSTELLUNGEN), VORSCHLAEGE);
  assert.equal(neu, 4); // Sprachfelder: Peruanisch en und fr, Hauptspeisen fr, Stück en
  assert.deepEqual(listenUebersetzungen.cuisineTypes, [
    {wert: 'Italienische Küche', en: 'Italian cuisine', fr: 'Cuisine italienne'},
    {wert: 'Peruanische Küche', en: 'Peruvian cuisine', fr: 'Cuisine péruvienne', kiUngeprueft: ['en', 'fr']},
  ]);
  // Von Hand: „Main courses“ bleibt, nur Französisch kommt dazu
  assert.deepEqual(listenUebersetzungen.mealCategories, [
    {wert: 'Hauptspeisen', en: 'Main courses', fr: 'Plats principaux', kiUngeprueft: ['fr']},
  ]);
  // Einheit: nur die fehlende englische Mehrzahl, Französisch war vollständig
  assert.deepEqual(listenUebersetzungen.portionUnits, [
    {wert: 'stueck', en: {einzahl: 'piece', mehrzahl: 'items'}, fr: {einzahl: 'pièce', mehrzahl: 'pièces'}, kiUngeprueft: ['en']},
  ]);
  assert.deepEqual(listenUebersetzungen.units, EINSTELLUNGEN.listenUebersetzungen.units);
  assert.deepEqual(EINSTELLUNGEN, vorher);
});

test('ergaenzeListenUebersetzungen: nichts für entfernte oder geänderte Werte, Doppelte zusammengefasst', () => {
  const anfrage = fehlendeListenwerte(EINSTELLUNGEN);
  const jetzt = {
    ...EINSTELLUNGEN,
    cuisineTypes: ['Italienische Küche'],
    portionUnits: [PORTION, {...STUECK, plural: 'Stücke'}],
    listenUebersetzungen: {
      ...EINSTELLUNGEN.listenUebersetzungen,
      mealCategories: [{wert: 'Hauptspeisen', fr: 'alt'}, {wert: 'Hauptspeisen', en: 'Main courses', kiUngeprueft: ['en']}],
    },
  };
  const {listenUebersetzungen, neu} = ergaenzeListenUebersetzungen(jetzt, anfrage, VORSCHLAEGE);
  assert.equal(neu, 1);
  assert.equal(listenUebersetzungen.cuisineTypes.length, 1);
  assert.deepEqual(listenUebersetzungen.portionUnits, EINSTELLUNGEN.listenUebersetzungen.portionUnits);
  assert.deepEqual(listenUebersetzungen.mealCategories, [
    {wert: 'Hauptspeisen', en: 'Main courses', fr: 'Plats principaux', kiUngeprueft: ['en', 'fr']},
  ]);
  assert.deepEqual(ergaenzeListenUebersetzungen(jetzt, [], VORSCHLAEGE).neu, 0);
});

test('listenStand: nur Listen und Übersetzungen zählen, Reihenfolge der Felder nicht', () => {
  const umsortiert = Object.fromEntries(Object.entries(EINSTELLUNGEN).reverse());
  umsortiert.portionUnits = [{plural: 'Portionen', singular: 'Portion', id: 'portion'}, STUECK];
  assert.equal(listenStand(umsortiert), listenStand(EINSTELLUNGEN));
  assert.equal(listenStand({...EINSTELLUNGEN, headerSlogan: 'Neu'}), listenStand(EINSTELLUNGEN));
  assert.notEqual(listenStand({...EINSTELLUNGEN, units: ['EL', 'TL']}), listenStand(EINSTELLUNGEN));
  assert.notEqual(listenStand({...EINSTELLUNGEN, listenUebersetzungen: {}}), listenStand(EINSTELLUNGEN));
});

const APP = 'settings/app';
const snapshot = (daten) => (daten ? {exists: true, data: () => structuredClone(daten)} : {exists: false, data: () => undefined});
const schreibe = (vorher, nachher) => handlers.uebersetzeListenwerteAutomatisch({
  data: {before: snapshot(vorher), after: snapshot(nachher)},
});
const automatikPfad = () => quotaPfad('automatik');

test('Automatik: übersetzt neue Werte, füllt nur Lücken, zählt einen Aufruf unter automatik', async () => {
  dokumente[APP] = structuredClone(EINSTELLUNGEN);
  await schreibe({...EINSTELLUNGEN, cuisineTypes: ['Italienische Küche']}, EINSTELLUNGEN);
  assert.equal(fetchCalls.length, 1);
  assert.deepEqual(fetchCalls[0].map((eintrag) => eintrag.text || eintrag.einzahl),
      ['Peruanische Küche', 'Europa', 'Hauptspeisen', 'Portion', 'Stück']);
  assert.equal(quota[automatikPfad()], 1);
  const uebersetzungen = dokumente[APP].listenUebersetzungen;
  assert.deepEqual(uebersetzungen.cuisineTypes[1],
      {wert: 'Peruanische Küche', en: 'EN Peruanische Küche', fr: 'FR Peruanische Küche', kiUngeprueft: ['en', 'fr']});
  assert.deepEqual(uebersetzungen.mealCategories,
      [{wert: 'Hauptspeisen', en: 'Main courses', fr: 'FR Hauptspeisen', kiUngeprueft: ['fr']}]);
  assert.deepEqual(uebersetzungen.portionUnits.find((eintrag) => eintrag.wert === 'portion'), {
    wert: 'portion',
    en: {einzahl: 'serving', mehrzahl: 'servings'},
    fr: {einzahl: 'portion', mehrzahl: 'portions'},
    kiUngeprueft: ['en', 'fr'],
  });
  assert.equal(dokumente[APP].headerSlogan, 'Kochen mit Freude');
  assert.deepEqual(fehlendeListenwerte(dokumente[APP]), []);

  // Das eigene Schreiben weckt den Trigger erneut: nichts mehr offen, kein KI-Aufruf
  await schreibe(EINSTELLUNGEN, dokumente[APP]);
  assert.equal(fetchCalls.length, 1);
  assert.equal(quota[automatikPfad()], 1);
});

test('Automatik: andere Änderungen an settings/app wecken nichts, auch wenn etwas fehlt', async () => {
  dokumente[APP] = structuredClone(EINSTELLUNGEN);
  await schreibe(EINSTELLUNGEN, {...EINSTELLUNGEN, headerSlogan: 'Neu'});
  await schreibe(EINSTELLUNGEN, null);
  assert.deepEqual(fetchCalls, []);
  assert.deepEqual(quota, {});
  assert.deepEqual(geschrieben, []);
});

test('Automatik: liest frisch – was ein früherer Lauf schon übersetzt hat, kostet nichts', async () => {
  dokumente[APP] = {
    ...structuredClone(EINSTELLUNGEN),
    cuisineTypes: ['Italienische Küche'],
    cuisineGroups: [],
    mealCategories: [],
    portionUnits: [],
  };
  // Das Ereignis zeigt noch den alten Stand mit fehlenden Werten
  await schreibe({...EINSTELLUNGEN, units: []}, EINSTELLUNGEN);
  assert.deepEqual(fetchCalls, []);
  assert.deepEqual(quota, {});
});

test('Automatik: von Hand Eingetragenes während des KI-Aufrufs bleibt', async () => {
  dokumente[APP] = structuredClone(EINSTELLUNGEN);
  const antwort = geminiAntwort;
  geminiAntwort = (daten) => {
    dokumente[APP].listenUebersetzungen.cuisineTypes.push({wert: 'Peruanische Küche', en: 'Peruvian (manual)'});
    dokumente[APP].cuisineGroups = [];
    return antwort(daten);
  };
  await schreibe(null, EINSTELLUNGEN);
  const uebersetzungen = dokumente[APP].listenUebersetzungen;
  assert.deepEqual(uebersetzungen.cuisineTypes.find((eintrag) => eintrag.wert === 'Peruanische Küche'),
      {wert: 'Peruanische Küche', en: 'Peruvian (manual)', fr: 'FR Peruanische Küche', kiUngeprueft: ['fr']});
  assert.equal(uebersetzungen.cuisineGroups, undefined);
});

test('Automatik: Tageslimit, Fehler des KI-Dienstes und leere Antworten schreiben nichts', async () => {
  dokumente[APP] = structuredClone(EINSTELLUNGEN);
  quota[automatikPfad()] = 50;
  await schreibe(null, EINSTELLUNGEN);
  assert.deepEqual(fetchCalls, []);

  delete quota[automatikPfad()];
  geminiAntwort = () => ({status: 503, json: {}});
  await schreibe(null, EINSTELLUNGEN);
  geminiAntwort = () => ({json: {eintraege: []}});
  await schreibe(null, EINSTELLUNGEN);
  assert.equal(fetchCalls.length, 2);
  assert.equal(quota[automatikPfad()], 2);
  assert.deepEqual(geschrieben, []);
  assert.deepEqual(dokumente[APP], EINSTELLUNGEN);
});

test('Automatik: höchstens 100 Werte je Lauf', async () => {
  const viele = Array.from({length: 130}, (_, index) => `Küche ${index + 1}`);
  dokumente[APP] = {cuisineTypes: viele};
  await schreibe(null, dokumente[APP]);
  assert.equal(fetchCalls[0].length, 100);
  assert.equal(dokumente[APP].listenUebersetzungen.cuisineTypes.length, 100);
  assert.equal(fehlendeListenwerte(dokumente[APP]).length, 30);
});

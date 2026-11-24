// Mehrsprachigkeit (docs/vorhaben/mehrsprachigkeit.md, PR 6u): Namen und Beschreibungen privater
// Listen übersetzen. Geprüft wird: Prompt und Prüfung der Gemini-Antwort (Deutsch ist das Original, eine
// leere Beschreibung bleibt leer), der Trigger auf groups/{id} (nur bei neuem oder geändertem Namen oder
// geänderter Beschreibung, nicht für die öffentliche Systemliste, eigener Tageszähler, Vorbedingung gegen
// überholte Stände) und der Backfill (nur Admins, seitenweise, mehrere Listen je Gemini-Aufruf).

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  LISTEN_TEXT_VERSION,
  LISTEN_TEXT_RESPONSE_SCHEMA,
  quelleAusListe,
  baueListenTextPrompt,
  pruefeListenTextAntwort,
  brauchtListenTextUebersetzung,
  baueListenTextUebersetzung,
} = require('./shared/listenTextUebersetzung');
const {isFirebaseAdminRequest, firebaseAdminModule} = require('./testSupport');

const DOC_ID = Symbol('documentId');

let userRoles;
let store;
let quota;
let updates;
let abfragen;
let ueberholt;
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
      const docRef = (name, id) => {
        const ref = {
          id,
          path: `${name}/${id}`,
          get: async () => {
            const data = store[name]?.[id];
            return {exists: data !== undefined, id, ref, data: () => data};
          },
          update: async (patch, vorbedingung) => {
            if (ueberholt.has(id)) {
              const error = new Error('9 FAILED_PRECONDITION: geändert');
              error.code = 9;
              throw error;
            }
            updates.push({path: `${name}/${id}`, patch, vorbedingung});
            store[name][id] = {...store[name][id], ...patch};
          },
          set: async () => {},
        };
        return ref;
      };
      const abfrage = (name, zustand) => ({
        limit: (anzahl) => abfrage(name, {...zustand, limit: anzahl}),
        startAfter: (id) => abfrage(name, {...zustand, startAfter: id}),
        get: async () => {
          abfragen.push(zustand);
          const ids = Object.keys(store[name] || {}).sort();
          const ab = zustand.startAfter == null ? ids : ids.filter((id) => id > zustand.startAfter);
          const docs = ab.slice(0, zustand.limit).map((id) => ({
            id,
            ref: docRef(name, id),
            updateTime: `stand-${id}`,
            data: () => store[name][id],
          }));
          return {docs, size: docs.length, empty: docs.length === 0};
        },
      });
      const firestoreFactory = () => ({
        collection: (name) => ({
          doc: (id) => docRef(name, id),
          orderBy: (feld) => abfrage(name, {orderBy: feld, limit: Infinity, startAfter: null}),
          count: () => ({get: async () => ({data: () => ({count: Object.keys(store[name] || {}).length})})}),
          where: () => ({limit: () => ({get: async () => ({empty: true, docs: []})})}),
        }),
        doc: (path) => ({
          get: async () => {
            const uid = path.replace(/^users\//, '');
            return uid in userRoles ?
              {exists: true, data: () => ({role: userRoles[uid]})} :
              {exists: false, data: () => ({})};
          },
        }),
        runTransaction: async (fn) => fn({
          get: async (ref) => (ref.path in quota ?
            {exists: true, data: () => ({count: quota[ref.path]})} :
            {exists: false, data: () => ({})}),
          set: (ref, data) => {
            quota[ref.path] = data.count;
          },
          update: (ref) => {
            quota[ref.path] += 1;
          },
        }),
      });
      firestoreFactory.FieldValue = {serverTimestamp: () => ({}), increment: (n) => n};
      firestoreFactory.FieldPath = {documentId: () => DOC_ID};
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
const quotaPfad = (uid) => `aiTitelUebersetzungLimits/${uid}_${heute()}`;

let fetchCalls;
let geminiAntwort;
const realFetch = global.fetch;

/** Listen aus dem Prompt (die JSON-Liste am Ende). */
const listenAusPrompt = (prompt) => JSON.parse(prompt.slice(prompt.lastIndexOf('\n') + 1));

const texteFuer = (sprache, {name, description}) => ({
  name: `${sprache.toUpperCase()} ${name}`,
  description: description ? `${sprache.toUpperCase()} ${description}` : '',
});
const uebersetzt = (liste) => ({
  listen: liste.map((eintrag) => ({nr: eintrag.nr, en: texteFuer('en', eintrag), fr: texteFuer('fr', eintrag)})),
});

function mockGemini() {
  global.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    const prompt = body.contents[0].parts[0].text;
    const liste = listenAusPrompt(prompt);
    fetchCalls.push(liste.map((eintrag) => eintrag.name));
    const {status = 200, json} = geminiAntwort(liste);
    return {ok: status === 200, status, json: async () => ({candidates: [{content: {parts: [{text: JSON.stringify(json)}]}}]})};
  };
}

const privat = (name, description = '', weiteres = {}) => ({type: 'private', name, description, ...weiteres});
const mitUebersetzung = (name, description = '') => ({
  ...privat(name, description),
  textUebersetzung: {
    quelle: {name, description},
    originalSprache: 'de',
    en: texteFuer('en', {name, description}),
    fr: texteFuer('fr', {name, description}),
    version: LISTEN_TEXT_VERSION,
  },
});

test.beforeEach(() => {
  userRoles = {'edit-1': 'edit', 'admin-1': 'admin'};
  updates = [];
  quota = {};
  abfragen = [];
  ueberholt = new Set();
  fetchCalls = [];
  store = {groups: {}};
  geminiAntwort = (liste) => ({json: uebersetzt(liste)});
  mockGemini();
  handlers = loadHandlers();
});

test.afterEach(() => {
  global.fetch = realFetch;
});

// ── Prüfung und Prompt ─────────────────────────────────────────────────────────

test('quelleAusListe: private Listen mit Namen, ohne die öffentliche Systemliste und zu lange Texte', () => {
  assert.deepEqual(quelleAusListe(privat(' Sonntagsessen ', ' Für die Familie ')), {name: 'Sonntagsessen', description: 'Für die Familie'});
  assert.deepEqual(quelleAusListe({name: 'Ohne Art'}), {name: 'Ohne Art', description: ''});
  assert.equal(quelleAusListe({type: 'public', name: 'Öffentlich'}), null);
  assert.equal(quelleAusListe(privat('  ')), null);
  assert.equal(quelleAusListe(privat('Zeile\nUmbruch')), null);
  assert.equal(quelleAusListe(privat('x'.repeat(201))), null);
  assert.equal(quelleAusListe(privat('Lang', 'x'.repeat(1001))), null);
  assert.equal(quelleAusListe(null), null);
});

test('pruefeListenTextAntwort: übernimmt Name und Beschreibung nach Nummer, verwirft ungültige', () => {
  const listen = [
    {name: 'Sonntagsessen', description: 'Für die Familie'},
    {name: 'Grillen', description: ''},
    {name: 'Kaputt', description: 'Mit Beschreibung'},
    {name: 'Umbruch', description: 'Zeile eins\nZeile zwei'},
  ];
  const ergebnis = pruefeListenTextAntwort({
    listen: [
      {nr: 2, en: {name: ' Barbecue ', description: 'erfunden'}, fr: {name: 'Barbecue', description: ''}},
      {nr: 1, en: {name: 'Sunday dinner', description: 'For the family'}, fr: {name: 'Repas du dimanche', description: 'Pour la famille'}},
      {nr: 1, en: {name: 'doppelt', description: 'doppelt'}, fr: {name: 'doppelt', description: 'doppelt'}},
      {nr: 3, en: {name: 'Broken', description: ''}, fr: {name: 'Cassé', description: 'Avec description'}},
      {nr: 4, en: {name: 'Line break', description: 'Line one\nLine two'}, fr: {name: 'Saut', description: 'Ligne un\nLigne deux'}},
      {nr: 9, en: {name: 'zu weit', description: ''}, fr: {name: 'y', description: ''}},
    ],
  }, listen);
  assert.deepEqual(ergebnis, [
    {en: {name: 'Sunday dinner', description: 'For the family'}, fr: {name: 'Repas du dimanche', description: 'Pour la famille'}},
    {en: {name: 'Barbecue', description: ''}, fr: {name: 'Barbecue', description: ''}},
    null,
    {en: {name: 'Line break', description: 'Line one\nLine two'}, fr: {name: 'Saut', description: 'Ligne un\nLigne deux'}},
  ]);
  assert.deepEqual(pruefeListenTextAntwort({listen: 'kaputt'}, listen.slice(0, 2)), [null, null]);
  assert.deepEqual(pruefeListenTextAntwort(null, listen.slice(0, 1)), [null]);
});

test('pruefeListenTextAntwort: ein Name mit Zeilenumbruch oder eine ausufernde Beschreibung zählt nicht', () => {
  const listen = [{name: 'A', description: 'kurz'}, {name: 'B', description: ''}];
  const ergebnis = pruefeListenTextAntwort({
    listen: [
      {nr: 1, en: {name: 'A', description: 'x'.repeat(101)}, fr: {name: 'A', description: 'court'}},
      {nr: 2, en: {name: 'B\nC', description: ''}, fr: {name: 'B', description: ''}},
    ],
  }, listen);
  assert.deepEqual(ergebnis, [null, null]);
});

test('baueListenTextPrompt und Schema: Texte als JSON am Ende, nur Englisch und Französisch', () => {
  const prompt = baueListenTextPrompt([{name: 'Omas "beste" Kuchen', description: ''}, {name: 'Meal Prep', description: 'Für die Woche'}]);
  assert.deepEqual(listenAusPrompt(prompt), [
    {nr: 1, name: 'Omas "beste" Kuchen', description: ''},
    {nr: 2, name: 'Meal Prep', description: 'Für die Woche'},
  ]);
  assert.match(prompt, /ins Englische \(en\)\nund Französische \(fr\)/);
  assert.match(prompt, /Jeder Text ist das deutsche Original/);
  assert.match(prompt, /Was nicht deutsch ist, ist ein feststehender Begriff/);
  assert.match(prompt, /Ist description leer, bleibt sie in beiden Sprachen leer/);
  const eintrag = LISTEN_TEXT_RESPONSE_SCHEMA.properties.listen.items;
  assert.deepEqual(eintrag.required, ['nr', 'en', 'fr']);
  assert.deepEqual(Object.keys(eintrag.properties), ['nr', 'en', 'fr']);
  assert.deepEqual(eintrag.properties.en.required, ['name', 'description']);
});

test('brauchtListenTextUebersetzung: neue, geänderte und nach älteren Regeln übersetzte Listen', () => {
  assert.equal(brauchtListenTextUebersetzung(privat('Sonntagsessen')), true);
  assert.equal(brauchtListenTextUebersetzung(mitUebersetzung('Sonntagsessen', 'Für die Familie')), false);
  assert.equal(brauchtListenTextUebersetzung({...mitUebersetzung('Sonntagsessen'), name: 'Sonntagsbraten'}), true);
  assert.equal(brauchtListenTextUebersetzung({...mitUebersetzung('Sonntagsessen'), description: 'Neu'}), true);
  assert.equal(brauchtListenTextUebersetzung({...mitUebersetzung('Sonntagsessen'), name: ' Sonntagsessen '}), false, 'Leerzeichen zählen nicht');
  const ohneVersion = mitUebersetzung('Sonntagsessen');
  delete ohneVersion.textUebersetzung.version;
  assert.equal(brauchtListenTextUebersetzung(ohneVersion), true);
  assert.equal(brauchtListenTextUebersetzung({type: 'public', name: 'Öffentlich'}), false);
  assert.equal(brauchtListenTextUebersetzung(privat('')), false);
});

test('baueListenTextUebersetzung: Quelle, Englisch, Französisch, Version, Modell und Zeit', () => {
  const feld = baueListenTextUebersetzung(
      {name: 'Meal Prep', description: 'Für die Woche'},
      {en: {name: 'Meal Prep', description: 'For the week'}, fr: {name: 'Meal Prep', description: 'Pour la semaine'}},
      'm',
      42,
  );
  assert.deepEqual(feld, {
    quelle: {name: 'Meal Prep', description: 'Für die Woche'},
    originalSprache: 'de',
    en: {name: 'Meal Prep', description: 'For the week'},
    fr: {name: 'Meal Prep', description: 'Pour la semaine'},
    version: LISTEN_TEXT_VERSION,
    modell: 'm',
    erstelltAm: 42,
  });
});

// ── Trigger ────────────────────────────────────────────────────────────────────

const ereignis = (id, {updateTime = 'stand-1'} = {}) => ({
  params: {groupId: id},
  data: {
    after: {
      exists: store.groups[id] !== undefined,
      id,
      ref: {
        id,
        update: async (patch, vorbedingung) => {
          if (ueberholt.has(id)) {
            const error = new Error('9 FAILED_PRECONDITION: geändert');
            error.code = 9;
            throw error;
          }
          updates.push({path: `groups/${id}`, patch, vorbedingung});
        },
      },
      updateTime,
      data: () => store.groups[id],
    },
  },
});

test('Trigger: übersetzt eine neue Liste und schreibt nur textUebersetzung', async () => {
  store.groups.g1 = privat('Sonntagsessen', 'Für die Familie', {updatedAt: 'unverändert'});
  await handlers.uebersetzeListenTexte(ereignis('g1'));
  assert.deepEqual(fetchCalls, [['Sonntagsessen']]);
  assert.equal(updates.length, 1);
  const {patch, vorbedingung} = updates[0];
  assert.deepEqual(Object.keys(patch), ['textUebersetzung']);
  assert.deepEqual(patch.textUebersetzung.quelle, {name: 'Sonntagsessen', description: 'Für die Familie'});
  assert.deepEqual(patch.textUebersetzung.en, {name: 'EN Sonntagsessen', description: 'EN Für die Familie'});
  assert.deepEqual(patch.textUebersetzung.fr, {name: 'FR Sonntagsessen', description: 'FR Für die Familie'});
  assert.equal(patch.textUebersetzung.originalSprache, 'de');
  assert.equal(patch.textUebersetzung.version, LISTEN_TEXT_VERSION);
  assert.deepEqual(vorbedingung, {lastUpdateTime: 'stand-1'});
  assert.equal(quota[quotaPfad('automatikListen')], 1);
  assert.equal(quota[quotaPfad('automatik')], undefined, 'eigener Zähler, die Rezepttitel bleiben unberührt');
});

test('Trigger: tut nichts bei passender Übersetzung, öffentlicher Liste, ohne Namen oder nach dem Löschen', async () => {
  store.groups.aktuell = {...mitUebersetzung('Grillen'), recipeIds: ['neu']};
  store.groups.oeffentlich = {type: 'public', name: 'Öffentlich'};
  store.groups.leer = privat('');
  for (const id of ['aktuell', 'oeffentlich', 'leer', 'geloescht']) {
    await handlers.uebersetzeListenTexte(ereignis(id));
  }
  assert.deepEqual(fetchCalls, []);
  assert.deepEqual(updates, []);
  assert.deepEqual(quota, {});
});

test('Trigger: eine geänderte Beschreibung wird neu übersetzt', async () => {
  store.groups.g1 = {...mitUebersetzung('Grillen'), description: 'Sommerabende'};
  await handlers.uebersetzeListenTexte(ereignis('g1'));
  assert.deepEqual(fetchCalls, [['Grillen']]);
  assert.deepEqual(updates[0].patch.textUebersetzung.quelle, {name: 'Grillen', description: 'Sommerabende'});
});

test('Trigger: am Tageslimit kein KI-Aufruf und nichts geschrieben', async () => {
  store.groups.g1 = privat('Grillen');
  quota[quotaPfad('automatikListen')] = 500;
  await handlers.uebersetzeListenTexte(ereignis('g1'));
  assert.deepEqual(fetchCalls, []);
  assert.deepEqual(updates, []);
});

test('Trigger: ungültige oder fehlende KI-Antwort schreibt nichts und wirft nicht', async () => {
  store.groups.g1 = privat('Grillen', 'Sommer');
  geminiAntwort = () => ({json: {listen: [{nr: 1, en: {name: 'Barbecue', description: ''}, fr: {name: 'Barbecue', description: 'Été'}}]}});
  await handlers.uebersetzeListenTexte(ereignis('g1'));
  geminiAntwort = () => ({status: 500, json: {}});
  await handlers.uebersetzeListenTexte(ereignis('g1'));
  assert.deepEqual(updates, []);
  assert.equal(fetchCalls.length, 2);
});

test('Trigger: wurde die Liste inzwischen geändert, bleibt es beim neueren Stand', async () => {
  store.groups.g1 = privat('Grillen');
  ueberholt.add('g1');
  await assert.doesNotReject(() => handlers.uebersetzeListenTexte(ereignis('g1')));
  assert.deepEqual(updates, []);
});

// ── Backfill ───────────────────────────────────────────────────────────────────

const auth = (uid) => ({uid, token: {firebase: {sign_in_provider: 'password'}}});
const backfill = (uid, data) => handlers.backfillListenUebersetzungen({auth: uid ? auth(uid) : null, data});

test('Backfill: lehnt Abgemeldete und Nicht-Admins ab, ohne zu lesen', async () => {
  await assert.rejects(() => backfill(null, {}), (e) => e.code === 'unauthenticated');
  for (const uid of ['edit-1', 'ohne-profil']) {
    await assert.rejects(() => backfill(uid, {}), (e) => e.code === 'permission-denied');
  }
  await assert.rejects(() => backfill('admin-1', {cursor: 'a/b'}), (e) => e.code === 'invalid-argument' && /Listen-ID/.test(e.message));
  assert.deepEqual(abfragen, []);
  assert.deepEqual(fetchCalls, []);
});

test('Backfill: übersetzt seitenweise nur, was fehlt, mit einem Gemini-Aufruf je Block', async () => {
  store.groups = {
    a: mitUebersetzung('Grillen'),
    b: privat('Brunch', 'Am Wochenende'),
    c: {type: 'public', name: 'Öffentlich'},
    d: privat('Dinnerparty'),
    e: privat('Eintöpfe'),
  };
  const erste = await backfill('admin-1', {anzahl: 4});
  assert.deepEqual(fetchCalls, [['Brunch', 'Dinnerparty']]);
  assert.equal(erste.geprueft, 4);
  assert.equal(erste.neu, 2);
  assert.equal(erste.uebersprungen, 2);
  assert.equal(erste.naechsterCursor, 'd');
  assert.equal(erste.fertig, false);
  assert.equal(erste.gesamt, 5);
  assert.deepEqual(updates.map((u) => [u.path, u.vorbedingung.lastUpdateTime]), [
    ['groups/b', 'stand-b'],
    ['groups/d', 'stand-d'],
  ]);
  assert.deepEqual(store.groups.b.textUebersetzung.en, {name: 'EN Brunch', description: 'EN Am Wochenende'});
  assert.deepEqual(store.groups.d.textUebersetzung.fr, {name: 'FR Dinnerparty', description: ''});

  const zweite = await backfill('admin-1', {cursor: erste.naechsterCursor, anzahl: 4});
  assert.deepEqual(fetchCalls[1], ['Eintöpfe']);
  assert.equal(zweite.neu, 1);
  assert.equal(zweite.fertig, true);
  assert.equal(zweite.gesamt, null);
  assert.equal(quota[quotaPfad('admin-1')], 3);
});

test('Backfill: KI-Fehler und überholte Listen treffen nur diese Listen', async () => {
  store.groups = {a: privat('Brunch'), b: privat('Dinnerparty'), c: privat('Eintöpfe')};
  geminiAntwort = (liste) => ({json: uebersetzt(liste.filter((eintrag) => eintrag.name !== 'Dinnerparty'))});
  ueberholt.add('c');
  const ergebnis = await backfill('admin-1', {});
  assert.equal(ergebnis.neu, 1);
  assert.deepEqual(ergebnis.fehlgeschlagen, ['b']);
  assert.deepEqual(ergebnis.fehlerGruende, {b: 'ki'});
  assert.equal(ergebnis.uebersprungen, 1);
  assert.equal(ergebnis.fertig, true);
});

test('Backfill: am Tageslimit endet die Seite vor der ersten nicht mehr erlaubten Liste', async () => {
  store.groups = {a: privat('Brunch'), b: privat('Dinnerparty')};
  quota[quotaPfad('admin-1')] = 9999;
  const ergebnis = await backfill('admin-1', {});
  assert.equal(ergebnis.neu, 1);
  assert.equal(ergebnis.tageslimitErreicht, true);
  assert.equal(ergebnis.naechsterCursor, 'a');
  await assert.rejects(() => backfill('admin-1', {cursor: 'a'}), (e) => e.code === 'resource-exhausted');
});

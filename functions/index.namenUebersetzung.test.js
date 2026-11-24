// Mehrsprachigkeit (docs/vorhaben/mehrsprachigkeit.md, PR 6u): Namen und Beschreibungen von Listen, Menüs
// und Events übersetzen. Geprüft wird: Prompt und Prüfung der Gemini-Antwort (Deutsch ist das Original, eine
// leere Beschreibung bleibt leer), die Trigger auf groups/{id}, menus/{id} und users/{uid}/events/{id} (nur
// bei neuem Dokument oder geändertem Namen bzw. geänderter Beschreibung, nicht für die öffentliche
// Systemliste, gemeinsamer Tageszähler, Vorbedingung gegen überholte Stände) und der Backfill (nur Admins,
// seitenweise über alle drei Arten, mehrere Dokumente je Gemini-Aufruf).

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  NAMEN_VERSION,
  NAMEN_RESPONSE_SCHEMA,
  quelleAus,
  baueNamenPrompt,
  pruefeNamenAntwort,
  brauchtNamenUebersetzung,
  baueNamenUebersetzung,
} = require('./shared/namenUebersetzung');
const {isFirebaseAdminRequest, firebaseAdminModule} = require('./testSupport');

const DOC_ID = Symbol('documentId');

let userRoles;
/** store[sammlung][id]; bei Events ist der Schlüssel der Pfad users/<uid>/events/<id>. */
let store;
let quota;
let updates;
let abfragen;
let ueberholt;
let handlers;
let fetchCalls;
let geminiAntwort;
const realFetch = global.fetch;

const pfadVon = (name, id) => (name === 'events' ? id : `${name}/${id}`);

function docRef(name, id) {
  const pfad = pfadVon(name, id);
  return {
    id: pfad.split('/').pop(),
    path: pfad,
    update: async (patch, vorbedingung) => {
      if (ueberholt.has(pfad)) {
        const error = new Error('9 FAILED_PRECONDITION: geändert');
        error.code = 9;
        throw error;
      }
      updates.push({path: pfad, patch, vorbedingung});
      store[name][id] = {...store[name][id], ...patch};
    },
  };
}

function abfrage(name, zustand) {
  return {
    limit: (anzahl) => abfrage(name, {...zustand, limit: anzahl}),
    startAfter: (nach) => abfrage(name, {...zustand, startAfter: typeof nach === 'object' ? nach.path : nach}),
    get: async () => {
      abfragen.push({name, ...zustand});
      const ids = Object.keys(store[name] || {}).sort();
      const ab = zustand.startAfter == null ? ids : ids.filter((id) => id > zustand.startAfter);
      const docs = ab.slice(0, zustand.limit).map((id) => ({
        id: pfadVon(name, id).split('/').pop(),
        ref: docRef(name, id),
        updateTime: `stand-${pfadVon(name, id)}`,
        data: () => store[name][id],
      }));
      return {docs, size: docs.length, empty: docs.length === 0};
    },
  };
}

function sammlung(name) {
  return {
    id: name,
    doc: (id) => docRef(name, id),
    orderBy: (feld) => abfrage(name, {orderBy: feld, limit: Infinity, startAfter: null}),
    count: () => ({get: async () => ({data: () => ({count: Object.keys(store[name] || {}).length})})}),
    where: () => ({limit: () => ({get: async () => ({empty: true, docs: []})})}),
  };
}

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
      const firestoreFactory = () => ({
        collection: (name) => sammlung(name),
        collectionGroup: (name) => sammlung(name),
        doc: (path) => ({
          path,
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

/** Einträge aus dem Prompt (die JSON-Liste am Ende). */
const eintraegeAusPrompt = (prompt) => JSON.parse(prompt.slice(prompt.lastIndexOf('\n') + 1));

const texteFuer = (sprache, {name, description}) => ({
  name: `${sprache.toUpperCase()} ${name}`,
  description: description ? `${sprache.toUpperCase()} ${description}` : '',
});
const uebersetzt = (liste) => ({
  eintraege: liste.map((eintrag) => ({nr: eintrag.nr, en: texteFuer('en', eintrag), fr: texteFuer('fr', eintrag)})),
});

function mockGemini() {
  global.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    const prompt = body.contents[0].parts[0].text;
    const liste = eintraegeAusPrompt(prompt);
    fetchCalls.push(liste.map((eintrag) => eintrag.name));
    const {status = 200, json} = geminiAntwort(liste);
    return {ok: status === 200, status, json: async () => ({candidates: [{content: {parts: [{text: JSON.stringify(json)}]}}]})};
  };
}

const privat = (name, description = '', weiteres = {}) => ({type: 'private', name, description, ...weiteres});
const mitUebersetzung = (daten, name, description = '') => ({
  ...daten,
  textUebersetzung: {
    quelle: {name, description},
    originalSprache: 'de',
    en: texteFuer('en', {name, description}),
    fr: texteFuer('fr', {name, description}),
    version: NAMEN_VERSION,
  },
});

test.beforeEach(() => {
  userRoles = {'edit-1': 'edit', 'admin-1': 'admin'};
  updates = [];
  quota = {};
  abfragen = [];
  ueberholt = new Set();
  fetchCalls = [];
  store = {groups: {}, menus: {}, events: {}};
  geminiAntwort = (liste) => ({json: uebersetzt(liste)});
  mockGemini();
  handlers = loadHandlers();
});

test.afterEach(() => {
  global.fetch = realFetch;
});

// ── Prüfung und Prompt ─────────────────────────────────────────────────────────

test('quelleAus: Felder je Art, ohne die öffentliche Systemliste und zu lange Texte', () => {
  assert.deepEqual(quelleAus('liste', privat(' Sonntagsessen ', ' Für die Familie ')), {name: 'Sonntagsessen', description: 'Für die Familie'});
  assert.deepEqual(quelleAus('liste', {name: 'Ohne Art'}), {name: 'Ohne Art', description: ''});
  assert.equal(quelleAus('liste', {type: 'public', name: 'Öffentlich'}), null);
  assert.deepEqual(quelleAus('menue', {name: 'Weihnachten', description: 'Bei Oma'}), {name: 'Weihnachten', description: 'Bei Oma'});
  assert.deepEqual(quelleAus('event', {eventName: 'Gartenparty', description: 'gibt es nicht'}), {name: 'Gartenparty', description: ''});
  assert.equal(quelleAus('event', {name: 'falsches Feld'}), null);
  assert.equal(quelleAus('liste', privat('  ')), null);
  assert.equal(quelleAus('menue', {name: 'Zeile\nUmbruch'}), null);
  assert.equal(quelleAus('menue', {name: 'x'.repeat(201)}), null);
  assert.equal(quelleAus('menue', {name: 'Lang', description: 'x'.repeat(2001)}), null);
  assert.equal(quelleAus('liste', null), null);
  assert.throws(() => quelleAus('rezept', {name: 'x'}), /Unbekannte Art/);
});

test('pruefeNamenAntwort: übernimmt Name und Beschreibung nach Nummer, verwirft ungültige', () => {
  const quellen = [
    {name: 'Sonntagsessen', description: 'Für die Familie'},
    {name: 'Grillen', description: ''},
    {name: 'Kaputt', description: 'Mit Beschreibung'},
    {name: 'Umbruch', description: 'Zeile eins\nZeile zwei'},
  ];
  const ergebnis = pruefeNamenAntwort({
    eintraege: [
      {nr: 2, en: {name: ' Barbecue ', description: 'erfunden'}, fr: {name: 'Barbecue', description: ''}},
      {nr: 1, en: {name: 'Sunday dinner', description: 'For the family'}, fr: {name: 'Repas du dimanche', description: 'Pour la famille'}},
      {nr: 1, en: {name: 'doppelt', description: 'doppelt'}, fr: {name: 'doppelt', description: 'doppelt'}},
      {nr: 3, en: {name: 'Broken', description: ''}, fr: {name: 'Cassé', description: 'Avec description'}},
      {nr: 4, en: {name: 'Line break', description: 'Line one\nLine two'}, fr: {name: 'Saut', description: 'Ligne un\nLigne deux'}},
      {nr: 9, en: {name: 'zu weit', description: ''}, fr: {name: 'y', description: ''}},
    ],
  }, quellen);
  assert.deepEqual(ergebnis, [
    {en: {name: 'Sunday dinner', description: 'For the family'}, fr: {name: 'Repas du dimanche', description: 'Pour la famille'}},
    {en: {name: 'Barbecue', description: ''}, fr: {name: 'Barbecue', description: ''}},
    null,
    {en: {name: 'Line break', description: 'Line one\nLine two'}, fr: {name: 'Saut', description: 'Ligne un\nLigne deux'}},
  ]);
  assert.deepEqual(pruefeNamenAntwort({eintraege: 'kaputt'}, quellen.slice(0, 2)), [null, null]);
  assert.deepEqual(pruefeNamenAntwort(null, quellen.slice(0, 1)), [null]);
});

test('pruefeNamenAntwort: ein Name mit Zeilenumbruch oder eine ausufernde Beschreibung zählt nicht', () => {
  const quellen = [{name: 'A', description: 'kurz'}, {name: 'B', description: ''}];
  const ergebnis = pruefeNamenAntwort({
    eintraege: [
      {nr: 1, en: {name: 'A', description: 'x'.repeat(101)}, fr: {name: 'A', description: 'court'}},
      {nr: 2, en: {name: 'B\nC', description: ''}, fr: {name: 'B', description: ''}},
    ],
  }, quellen);
  assert.deepEqual(ergebnis, [null, null]);
});

test('baueNamenPrompt und Schema: Texte als JSON am Ende, Kontext je Art, nur Englisch und Französisch', () => {
  const prompt = baueNamenPrompt('liste', [{name: 'Omas "beste" Kuchen', description: ''}, {name: 'Meal Prep', description: 'Für die Woche'}]);
  assert.deepEqual(eintraegeAusPrompt(prompt), [
    {nr: 1, name: 'Omas "beste" Kuchen', description: ''},
    {nr: 2, name: 'Meal Prep', description: 'Für die Woche'},
  ]);
  assert.match(prompt, /ins Englische \(en\) und\nFranzösische \(fr\)/);
  assert.match(prompt, /Es sind Rezeptlisten/);
  assert.match(baueNamenPrompt('menue', [{name: 'M', description: ''}]), /Es sind Menüs/);
  assert.match(baueNamenPrompt('event', [{name: 'E', description: ''}]), /Es sind Events\..*description ist immer leer/s);
  assert.match(prompt, /Jeder Text ist das deutsche Original/);
  assert.match(prompt, /Was nicht deutsch ist, ist ein feststehender Begriff/);
  assert.match(prompt, /Ist description leer, bleibt sie in beiden Sprachen leer/);
  const eintrag = NAMEN_RESPONSE_SCHEMA.properties.eintraege.items;
  assert.deepEqual(eintrag.required, ['nr', 'en', 'fr']);
  assert.deepEqual(Object.keys(eintrag.properties), ['nr', 'en', 'fr']);
  assert.deepEqual(eintrag.properties.en.required, ['name', 'description']);
});

test('brauchtNamenUebersetzung: neue, geänderte und nach älteren Regeln übersetzte Dokumente', () => {
  assert.equal(brauchtNamenUebersetzung('liste', privat('Sonntagsessen')), true);
  const liste = mitUebersetzung(privat('Sonntagsessen', 'Für die Familie'), 'Sonntagsessen', 'Für die Familie');
  assert.equal(brauchtNamenUebersetzung('liste', liste), false);
  assert.equal(brauchtNamenUebersetzung('liste', {...liste, name: 'Sonntagsbraten'}), true);
  assert.equal(brauchtNamenUebersetzung('liste', {...liste, description: 'Neu'}), true);
  assert.equal(brauchtNamenUebersetzung('liste', {...liste, name: ' Sonntagsessen '}), false, 'Leerzeichen zählen nicht');
  const ohneVersion = mitUebersetzung(privat('Sonntagsessen'), 'Sonntagsessen');
  delete ohneVersion.textUebersetzung.version;
  assert.equal(brauchtNamenUebersetzung('liste', ohneVersion), true);
  assert.equal(brauchtNamenUebersetzung('liste', {type: 'public', name: 'Öffentlich'}), false);
  const event = mitUebersetzung({eventName: 'Gartenparty', guests: {adults: 4}}, 'Gartenparty');
  assert.equal(brauchtNamenUebersetzung('event', event), false);
  assert.equal(brauchtNamenUebersetzung('event', {...event, eventName: 'Sommerfest'}), true);
});

test('baueNamenUebersetzung: Quelle, Englisch, Französisch, Version, Modell und Zeit', () => {
  const feld = baueNamenUebersetzung(
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
    version: NAMEN_VERSION,
    modell: 'm',
    erstelltAm: 42,
  });
});

// ── Trigger ────────────────────────────────────────────────────────────────────

const ereignis = (name, id) => ({
  data: {
    after: {
      exists: store[name][id] !== undefined,
      id,
      ref: docRef(name, id),
      updateTime: 'stand-1',
      data: () => store[name][id],
    },
  },
});

test('Trigger: übersetzt eine neue Liste und schreibt nur textUebersetzung', async () => {
  store.groups.g1 = privat('Sonntagsessen', 'Für die Familie', {updatedAt: 'unverändert'});
  await handlers.uebersetzeListenTexte(ereignis('groups', 'g1'));
  assert.deepEqual(fetchCalls, [['Sonntagsessen']]);
  assert.equal(updates.length, 1);
  const {path, patch, vorbedingung} = updates[0];
  assert.equal(path, 'groups/g1');
  assert.deepEqual(Object.keys(patch), ['textUebersetzung']);
  assert.deepEqual(patch.textUebersetzung.quelle, {name: 'Sonntagsessen', description: 'Für die Familie'});
  assert.deepEqual(patch.textUebersetzung.en, {name: 'EN Sonntagsessen', description: 'EN Für die Familie'});
  assert.deepEqual(patch.textUebersetzung.fr, {name: 'FR Sonntagsessen', description: 'FR Für die Familie'});
  assert.equal(patch.textUebersetzung.originalSprache, 'de');
  assert.equal(patch.textUebersetzung.version, NAMEN_VERSION);
  assert.deepEqual(vorbedingung, {lastUpdateTime: 'stand-1'});
  assert.equal(quota[quotaPfad('automatikTexte')], 1);
  assert.equal(quota[quotaPfad('automatik')], undefined, 'eigener Zähler, die Rezepttitel bleiben unberührt');
});

test('Trigger: übersetzt ein neues Menü mit Beschreibung', async () => {
  store.menus.m1 = {name: 'Weihnachtsessen', description: 'Mit der ganzen Familie', recipeIds: ['r1']};
  await handlers.uebersetzeMenueTexte(ereignis('menus', 'm1'));
  assert.deepEqual(fetchCalls, [['Weihnachtsessen']]);
  assert.equal(updates[0].path, 'menus/m1');
  assert.deepEqual(updates[0].patch.textUebersetzung.en, {name: 'EN Weihnachtsessen', description: 'EN Mit der ganzen Familie'});
});

test('Trigger: übersetzt den Namen eines neuen Events, ohne Beschreibung', async () => {
  const pfad = 'users/u1/events/e1';
  store.events[pfad] = {eventName: 'Gartenparty', guests: {adults: 10}, status: 'geplant'};
  await handlers.uebersetzeEventTexte(ereignis('events', pfad));
  assert.deepEqual(fetchCalls, [['Gartenparty']]);
  assert.equal(updates[0].path, pfad);
  assert.deepEqual(Object.keys(updates[0].patch), ['textUebersetzung']);
  assert.deepEqual(updates[0].patch.textUebersetzung.quelle, {name: 'Gartenparty', description: ''});
  assert.deepEqual(updates[0].patch.textUebersetzung.fr, {name: 'FR Gartenparty', description: ''});
  assert.equal(quota[quotaPfad('automatikTexte')], 1);
});

test('Trigger: tut nichts bei passender Übersetzung, öffentlicher Liste, ohne Namen oder nach dem Löschen', async () => {
  store.groups.aktuell = {...mitUebersetzung(privat('Grillen'), 'Grillen'), recipeIds: ['neu']};
  store.groups.oeffentlich = {type: 'public', name: 'Öffentlich'};
  store.groups.leer = privat('');
  for (const id of ['aktuell', 'oeffentlich', 'leer', 'geloescht']) {
    await handlers.uebersetzeListenTexte(ereignis('groups', id));
  }
  store.events['users/u1/events/e1'] = {...mitUebersetzung({eventName: 'Party'}, 'Party'), status: 'berechnet'};
  await handlers.uebersetzeEventTexte(ereignis('events', 'users/u1/events/e1'));
  assert.deepEqual(fetchCalls, []);
  assert.deepEqual(updates, []);
  assert.deepEqual(quota, {});
});

test('Trigger: eine geänderte Beschreibung wird neu übersetzt', async () => {
  store.menus.m1 = {...mitUebersetzung({name: 'Grillen'}, 'Grillen'), name: 'Grillen', description: 'Sommerabende'};
  await handlers.uebersetzeMenueTexte(ereignis('menus', 'm1'));
  assert.deepEqual(fetchCalls, [['Grillen']]);
  assert.deepEqual(updates[0].patch.textUebersetzung.quelle, {name: 'Grillen', description: 'Sommerabende'});
});

test('Trigger: am gemeinsamen Tageslimit kein KI-Aufruf und nichts geschrieben', async () => {
  store.groups.g1 = privat('Grillen');
  store.menus.m1 = {name: 'Brunch'};
  quota[quotaPfad('automatikTexte')] = 1000;
  await handlers.uebersetzeListenTexte(ereignis('groups', 'g1'));
  await handlers.uebersetzeMenueTexte(ereignis('menus', 'm1'));
  assert.deepEqual(fetchCalls, []);
  assert.deepEqual(updates, []);
});

test('Trigger: ungültige oder fehlende KI-Antwort schreibt nichts und wirft nicht', async () => {
  store.groups.g1 = privat('Grillen', 'Sommer');
  geminiAntwort = () => ({json: {eintraege: [{nr: 1, en: {name: 'Barbecue', description: ''}, fr: {name: 'Barbecue', description: 'Été'}}]}});
  await handlers.uebersetzeListenTexte(ereignis('groups', 'g1'));
  geminiAntwort = () => ({status: 500, json: {}});
  await handlers.uebersetzeListenTexte(ereignis('groups', 'g1'));
  assert.deepEqual(updates, []);
  assert.equal(fetchCalls.length, 2);
});

test('Trigger: wurde das Dokument inzwischen geändert, bleibt es beim neueren Stand', async () => {
  store.menus.m1 = {name: 'Grillen'};
  ueberholt.add('menus/m1');
  await assert.doesNotReject(() => handlers.uebersetzeMenueTexte(ereignis('menus', 'm1')));
  assert.deepEqual(updates, []);
});

// ── Backfill ───────────────────────────────────────────────────────────────────

const auth = (uid) => ({uid, token: {firebase: {sign_in_provider: 'password'}}});
const backfill = (uid, data) => handlers.backfillTextUebersetzungen({auth: uid ? auth(uid) : null, data});

test('Backfill: lehnt Abgemeldete, Nicht-Admins und kaputte Cursor ab, ohne zu lesen', async () => {
  await assert.rejects(() => backfill(null, {}), (e) => e.code === 'unauthenticated');
  for (const uid of ['edit-1', 'ohne-profil']) {
    await assert.rejects(() => backfill(uid, {}), (e) => e.code === 'permission-denied');
  }
  for (const cursor of ['', 'g1', 'rezept|r1', 'liste|a/b', 'event|e1', 'event|users/u1/menus/m1', 'menue| m1', {}]) {
    await assert.rejects(() => backfill('admin-1', {cursor}), (e) => e.code === 'invalid-argument', String(cursor));
  }
  for (const data of [{anzahl: 0}, {anzahl: 51}, {anzahl: 2.5}]) {
    await assert.rejects(() => backfill('admin-1', data), (e) => e.code === 'invalid-argument');
  }
  assert.deepEqual(abfragen, []);
  assert.deepEqual(fetchCalls, []);
});

test('Backfill: geht Listen, Menüs und Events nacheinander durch und übersetzt nur, was fehlt', async () => {
  store.groups = {
    a: mitUebersetzung(privat('Grillen'), 'Grillen'),
    b: privat('Brunch', 'Am Wochenende'),
    c: {type: 'public', name: 'Öffentlich'},
  };
  store.menus = {m1: {name: 'Weihnachtsessen', description: 'Bei Oma'}, m2: mitUebersetzung({name: 'Ostern'}, 'Ostern')};
  store.events = {
    'users/u1/events/e1': {eventName: 'Gartenparty'},
    'users/u2/events/e2': {eventName: 'Silvester'},
  };

  const listen = await backfill('admin-1', {anzahl: 3});
  assert.deepEqual(fetchCalls, [['Brunch']]);
  assert.equal(listen.geprueft, 3);
  assert.equal(listen.neu, 1);
  assert.equal(listen.uebersprungen, 2);
  assert.equal(listen.naechsterCursor, 'liste|c');
  assert.equal(listen.fertig, false);
  assert.equal(listen.gesamt, 7);

  const listenEnde = await backfill('admin-1', {cursor: listen.naechsterCursor, anzahl: 3});
  assert.equal(listenEnde.geprueft, 0);
  assert.equal(listenEnde.naechsterCursor, 'menue|');
  assert.equal(listenEnde.gesamt, null);

  const menues = await backfill('admin-1', {cursor: listenEnde.naechsterCursor, anzahl: 3});
  assert.deepEqual(fetchCalls[1], ['Weihnachtsessen']);
  assert.equal(menues.neu, 1);
  assert.equal(menues.naechsterCursor, 'event|');

  const events = await backfill('admin-1', {cursor: menues.naechsterCursor, anzahl: 1});
  assert.deepEqual(fetchCalls[2], ['Gartenparty']);
  assert.equal(events.naechsterCursor, 'event|users/u1/events/e1');
  const letzte = await backfill('admin-1', {cursor: events.naechsterCursor, anzahl: 1});
  assert.deepEqual(fetchCalls[3], ['Silvester']);
  assert.equal(letzte.naechsterCursor, 'event|users/u2/events/e2');
  const ende = await backfill('admin-1', {cursor: letzte.naechsterCursor, anzahl: 1});
  assert.equal(ende.fertig, true);
  assert.equal(ende.naechsterCursor, null);

  assert.deepEqual(updates.map((u) => [u.path, u.vorbedingung.lastUpdateTime]), [
    ['groups/b', 'stand-groups/b'],
    ['menus/m1', 'stand-menus/m1'],
    ['users/u1/events/e1', 'stand-users/u1/events/e1'],
    ['users/u2/events/e2', 'stand-users/u2/events/e2'],
  ]);
  assert.deepEqual(store.groups.b.textUebersetzung.en, {name: 'EN Brunch', description: 'EN Am Wochenende'});
  assert.deepEqual(store.events['users/u2/events/e2'].textUebersetzung.fr, {name: 'FR Silvester', description: ''});
  assert.equal(quota[quotaPfad('admin-1')], 4);
});

test('Backfill: KI-Fehler und überholte Dokumente treffen nur diese', async () => {
  store.menus = {a: {name: 'Brunch'}, b: {name: 'Dinnerparty'}, c: {name: 'Eintöpfe'}};
  geminiAntwort = (liste) => ({json: uebersetzt(liste.filter((eintrag) => eintrag.name !== 'Dinnerparty'))});
  ueberholt.add('menus/c');
  const ergebnis = await backfill('admin-1', {cursor: 'menue|'});
  assert.equal(ergebnis.neu, 1);
  assert.deepEqual(ergebnis.fehlgeschlagen, ['menue|b']);
  assert.deepEqual(ergebnis.fehlerGruende, {'menue|b': 'ki'});
  assert.equal(ergebnis.uebersprungen, 1);
  assert.equal(ergebnis.naechsterCursor, 'event|');
});

test('Backfill: am Tageslimit endet die Seite vor dem ersten nicht mehr erlaubten Dokument', async () => {
  store.groups = {a: privat('Brunch'), b: privat('Dinnerparty')};
  quota[quotaPfad('admin-1')] = 9999;
  const ergebnis = await backfill('admin-1', {});
  assert.equal(ergebnis.neu, 1);
  assert.equal(ergebnis.tageslimitErreicht, true);
  assert.equal(ergebnis.naechsterCursor, 'liste|a');
  assert.equal(ergebnis.fertig, false);
  await assert.rejects(() => backfill('admin-1', {cursor: 'liste|a'}), (e) => e.code === 'resource-exhausted');
});

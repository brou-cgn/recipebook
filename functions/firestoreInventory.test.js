const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  fetchFirestoreInventory,
  buildFirestoreInventorySection,
  AGE_FIELDS,
  SUBCOLLECTION_GROUPS,
  SNAPSHOT_DOC,
} = require('./firestoreInventory');

// 17.11.2026, 02:00 in Berlin (MEZ = UTC+1).
const NOW = new Date('2026-11-17T01:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days) => new Date(NOW.getTime() - days * DAY_MS);

// Firestore vergleicht nur Werte gleichen Typs: ein Datum nie mit einem Text.
function lessThan(stored, limit) {
  if (stored instanceof Date && limit instanceof Date) return stored.getTime() < limit.getTime();
  if (typeof stored === 'string' && typeof limit === 'string') return stored < limit;
  return false;
}

/**
 * Nachbau der benutzten Admin-SDK-Oberfläche: listCollections, collectionGroup,
 * where('<'), count().get(), doc().get()/set().
 */
function fakeDb({collections = {}, groups = {}, snapshot = {}, failing = []} = {}) {
  const countCalls = [];
  const makeQuery = (key, docs, filters = []) => ({
    id: key,
    where: (field, op, value) => {
      assert.equal(op, '<');
      return makeQuery(key, docs, [...filters, {field, value}]);
    },
    count: () => ({
      get: async () => {
        countCalls.push({key, filters});
        if (failing.includes(key)) throw new Error('Quota exceeded');
        const matched = docs.filter((doc) => filters.every(({field, value}) => lessThan(doc[field], value)));
        return {data: () => ({count: matched.length})};
      },
    }),
  });
  const db = {
    listCollections: async () => Object.entries(collections).map(([name, docs]) => makeQuery(name, docs)),
    collectionGroup: (group) => makeQuery(`group:${group}`, groups[group] || []),
    doc: (docPath) => {
      assert.equal(docPath, SNAPSHOT_DOC);
      return {
        get: async () => {
          if (snapshot.failGet) throw new Error('Lesen verweigert');
          return {exists: Boolean(snapshot.data), data: () => snapshot.data};
        },
        set: async (data) => {
          if (snapshot.failSet) throw new Error('Schreiben verweigert');
          snapshot.data = data;
          snapshot.writes = (snapshot.writes || 0) + 1;
        },
      };
    },
  };
  return {db, countCalls, snapshot};
}

const docsOf = (count, fields = {}) => Array.from({length: count}, () => ({...fields}));

test('fetchFirestoreInventory counts every collection, old documents by age field, sorted by size', async () => {
  const {db, countCalls} = fakeDb({
    collections: {
      appCalls: [...docsOf(3, {timestamp: daysAgo(200)}), ...docsOf(2, {timestamp: daysAgo(10)})],
      aiScanLimits: [{date: '2026-01-05'}, {date: '2026-08-19'}, {date: '2026-08-20'}, {date: '2026-11-16'}],
      recipes: docsOf(7, {createdAt: daysAgo(400)}),
    },
    groups: {favorites: docsOf(4)},
  });

  const inventory = await fetchFirestoreInventory({
    db,
    now: NOW,
    ageFields: {appCalls: {field: 'timestamp', type: 'timestamp'}, aiScanLimits: {field: 'date', type: 'day'}},
    subcollectionGroups: [{group: 'favorites', label: 'users/*/favorites'}],
  });

  assert.deepEqual(
      inventory.rows.map(({label, total, old}) => ({label, total, old})),
      [
        {label: 'recipes', total: 7, old: null},
        {label: 'appCalls', total: 5, old: 3},
        {label: 'aiScanLimits', total: 4, old: 1},
        {label: 'users/*/favorites', total: 4, old: null},
      ],
  );
  // Grenze: 90 Tage vor jetzt; Tageszähler als Text (19.08.2026 zählt nicht mehr als alt).
  const dayFilter = countCalls.find((call) => call.key === 'aiScanLimits' && call.filters.length > 0);
  assert.deepEqual(dayFilter.filters, [{field: 'date', value: '2026-08-19'}]);
  const timeFilter = countCalls.find((call) => call.key === 'appCalls' && call.filters.length > 0);
  assert.equal(timeFilter.filters[0].value.toISOString(), daysAgo(90).toISOString());
  // Rezepte haben bewusst kein Altersfeld: nur eine Zählung, kein Filter.
  assert.equal(countCalls.filter((call) => call.key === 'recipes').length, 1);
  assert.equal(inventory.previousDay, null);
  assert.equal(inventory.at, NOW);
});

test('fetchFirestoreInventory compares with the newest snapshot of an earlier day and stores today', async () => {
  const snapshots = {};
  for (let day = 7; day <= 16; day += 1) {
    snapshots[`2026-11-${String(day).padStart(2, '0')}`] = {counts: {appCalls: 100 + day}};
  }
  // Ein Lauf von heute früh wird überschrieben, nicht als Vergleich genommen.
  snapshots['2026-11-17'] = {counts: {appCalls: 999}};
  snapshots['2026-11-16'] = {counts: {'appCalls': 4, 'recipeCalls': 9, 'group:favorites': 3, 'tutorials': 2}};
  const {db, snapshot} = fakeDb({
    collections: {appCalls: docsOf(5), cookDates: docsOf(2)},
    groups: {favorites: docsOf(3)},
    snapshot: {data: {snapshots}},
  });

  const inventory = await fetchFirestoreInventory({
    db,
    now: NOW,
    ageFields: {},
    subcollectionGroups: [{group: 'favorites', label: 'users/*/favorites'}],
  });

  assert.equal(inventory.previousDay, '2026-11-16');
  assert.equal(inventory.snapshotError, null);
  const byLabel = Object.fromEntries(inventory.rows.map((row) => [row.label, row]));
  assert.equal(byLabel.appCalls.delta, 1);
  assert.equal(byLabel['users/*/favorites'].delta, 0);
  // Neu seit gestern: zählt voll als Zuwachs.
  assert.equal(byLabel.cookDates.delta, 2);
  assert.equal(byLabel.cookDates.isNew, true);
  // Heute leer (listCollections liefert sie nicht mehr): als 0 mit Abgang.
  assert.deepEqual(
      [byLabel.recipeCalls.total, byLabel.recipeCalls.delta, byLabel.tutorials.delta],
      [0, -9, -2],
  );

  assert.equal(snapshot.writes, 1);
  const storedDays = Object.keys(snapshot.data.snapshots).sort();
  assert.equal(storedDays.length, 8);
  assert.equal(storedDays[0], '2026-11-10');
  assert.equal(storedDays[7], '2026-11-17');
  assert.deepEqual(snapshot.data.snapshots['2026-11-17'].counts, {'appCalls': 5, 'cookDates': 2, 'group:favorites': 3});
});

test('fetchFirestoreInventory keeps going when one count fails and does not store the failed row', async () => {
  const {db, snapshot} = fakeDb({
    collections: {appCalls: docsOf(5), recipeCalls: docsOf(8)},
    failing: ['recipeCalls'],
  });

  const inventory = await fetchFirestoreInventory({db, now: NOW, ageFields: {}, subcollectionGroups: []});

  const failed = inventory.rows.find((row) => row.label === 'recipeCalls');
  assert.equal(failed.total, null);
  assert.equal(failed.error, 'Quota exceeded');
  assert.equal(inventory.rows.find((row) => row.label === 'appCalls').total, 5);
  assert.deepEqual(snapshot.data.snapshots['2026-11-17'].counts, {appCalls: 5});
});

test('fetchFirestoreInventory writes nothing when the old snapshot cannot be read', async () => {
  const {db, snapshot} = fakeDb({collections: {appCalls: docsOf(5)}, snapshot: {failGet: true}});

  const inventory = await fetchFirestoreInventory({db, now: NOW, ageFields: {}, subcollectionGroups: []});

  assert.equal(inventory.snapshotError, 'Lesen verweigert');
  assert.equal(inventory.previousDay, null);
  assert.equal(snapshot.writes, undefined);
  assert.equal(inventory.rows[0].total, 5);
});

test('fetchFirestoreInventory gives up after the timeout', async () => {
  const db = {listCollections: () => new Promise(() => {})};
  await assert.rejects(
      fetchFirestoreInventory({db, now: NOW, timeoutMs: 20}),
      /Zeitüberschreitung/,
  );
});

test('buildFirestoreInventorySection lists totals, old share and change since the compared day', () => {
  const section = buildFirestoreInventorySection({
    at: NOW,
    previousDay: '2026-11-16',
    snapshotError: null,
    oldAfterDays: 90,
    rows: [
      {label: 'recipeCalls', total: 14200, old: 12070, delta: 43, isNew: false, error: null},
      {label: 'appCalls', total: 5130, old: 4812, delta: 12, isNew: false, error: null},
      {label: 'recipes', total: 1234, old: null, delta: 0, isNew: false, error: null},
      {label: 'cookDates', total: 2, old: null, delta: 2, isNew: true, error: null},
      {label: 'tutorials', total: 0, old: null, delta: -2, isNew: false, error: null},
      {label: 'rsvps_adventglow_2026', total: 0, old: null, delta: 0, isNew: false, error: null},
      {label: 'users/*/favorites', total: null, old: null, delta: null, isNew: false, error: 'Quota exceeded'},
    ],
  });

  assert.match(section.text, /^\nFirestore-Bestand je Collection \(Stand 17\.11\.2026, 02:00\)\n/);
  assert.match(section.text, /Gesamt: 20\.566 Dokumente in 4 Collections, \+55 seit 16\.11\./);
  assert.match(section.text, /Meiste alte Dokumente \(älter als 90 Tage\): recipeCalls 12\.070 von 14\.200 \(85 %\), appCalls 4\.812 von 5\.130 \(94 %\)\./);
  assert.match(section.text, /Collection \| Dokumente \| älter als 90 Tage \| ± seit 16\.11\.\n/);
  assert.match(section.text, /recipeCalls \| 14\.200 \| 12\.070 \(85 %\) \| \+43\n/);
  assert.match(section.text, /recipes \| 1\.234 \| – \| ±0\n/);
  assert.match(section.text, /cookDates \| 2 \| – \| \+2 \(neu\)\n/);
  assert.match(section.text, /tutorials \| 0 \| – \| -2\n/);
  assert.match(section.text, /users\/\*\/favorites \| Fehler \| – \| –\n/);
  assert.match(section.text, /Zählung fehlgeschlagen: users\/\*\/favorites \(Quota exceeded\)\./);
  // Leer und unverändert: keine Zeile.
  assert.doesNotMatch(section.text, /rsvps_adventglow_2026/);
  assert.match(section.text, /Usage insights/);
  // Der Abschnitt darf die Tabelle der Firestore-Nutzung nicht nachahmen
  // (die geplante Aufgabe „K1-Recalc“ liest dort „Tag | Lesen | …“).
  assert.doesNotMatch(section.text, /Tag \| Lesen/);

  assert.match(section.html, /<h3>Firestore-Bestand je Collection \(Stand 17\.11\.2026, 02:00\)<\/h3>/);
  assert.match(section.html, /<td style="padding-right:12px">recipeCalls<\/td><td [^>]*>14\.200<\/td><td [^>]*>12\.070 \(85 %\)<\/td><td [^>]*>\+43<\/td>/);
});

test('buildFirestoreInventorySection says when there is nothing to compare yet', () => {
  const section = buildFirestoreInventorySection({
    at: NOW,
    previousDay: null,
    snapshotError: null,
    rows: [{label: 'appCalls', total: 5, old: 0, delta: null, isNew: false, error: null}],
  });

  assert.match(section.text, /Gesamt: 5 Dokumente in 1 Collection\.\n/);
  assert.match(section.text, /Veränderung ab dem nächsten Bericht/);
  assert.match(section.text, /± Vortag/);
  assert.match(section.text, /appCalls \| 5 \| 0 \(0 %\) \| –\n/);
  assert.doesNotMatch(section.text, /Meiste alte Dokumente/);
});

test('buildFirestoreInventorySection names the reason when the snapshot failed', () => {
  const section = buildFirestoreInventorySection({
    at: NOW,
    previousDay: null,
    snapshotError: 'Lesen verweigert',
    rows: [{label: 'appCalls', total: 5, old: null, delta: null, isNew: false, error: null}],
  });

  assert.match(section.text, /Veränderung nicht verfügbar: Lesen verweigert\./);
  assert.doesNotMatch(section.text, /ab dem nächsten Bericht/);
});

test('buildFirestoreInventorySection gives a hint instead of numbers on failure', () => {
  const section = buildFirestoreInventorySection({error: 'Zeitüberschreitung nach 60 s'});

  assert.equal(section.text, '\nFirestore-Bestand je Collection\nNicht verfügbar: Zeitüberschreitung nach 60 s.\n');
  assert.match(section.html, /<p>Nicht verfügbar: Zeitüberschreitung nach 60 s\.<\/p>/);
});

test('buildFirestoreInventorySection escapes names in the HTML part', () => {
  const section = buildFirestoreInventorySection({
    at: NOW,
    previousDay: null,
    rows: [{label: '<b>x</b>', total: 1, old: null, delta: null, isNew: false, error: null}],
  });

  assert.match(section.html, /&lt;b&gt;x&lt;\/b&gt;/);
  assert.doesNotMatch(section.html, /<b>x<\/b>/);
});

/**
 * Collection-Pfade aus firestore.rules, verschachtelte match-Blöcke
 * zusammengesetzt, ohne den Rahmen /databases/{database}/documents.
 */
function rulePaths() {
  const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
  const stack = [];
  const paths = [];
  let depth = 0;
  for (const line of rules.split('\n')) {
    const code = line.replace(/\/\/.*$/, '');
    const match = code.match(/^\s*match\s+(\/\S+)\s*\{/);
    const before = depth;
    depth += (code.match(/\{/g) || []).length - (code.match(/\}/g) || []).length;
    if (match) {
      const parent = stack.length > 0 ? stack[stack.length - 1].segments : [];
      const segments = [...parent, ...match[1].split('/').filter(Boolean)];
      // Ein Block, der in derselben Zeile schließt, ist kein Elternteil.
      if (depth > before) stack.push({segments, depth});
      const [first, second, third] = segments;
      paths.push(first === 'databases' && second === '{database}' && third === 'documents' ? segments.slice(3) : segments);
    }
    while (stack.length > 0 && stack[stack.length - 1].depth > depth) stack.pop();
  }
  return paths.filter((segments) => segments.length > 0);
}

test('rule-path parser sees nested and collection-group rules (self-check)', () => {
  const joined = rulePaths().map((segments) => segments.join('/'));
  assert.ok(joined.includes('recipes/{recipeId}/ratings/{raterKey}'));
  assert.ok(joined.includes('wichtelRunden/{rundeId}/eintraege/{eintragId}'));
  assert.ok(joined.includes('{path=**}/events/{eventId}'));
  assert.ok(joined.includes('appCalls/{callId}'));
});

test('SUBCOLLECTION_GROUPS matches the subcollections in firestore.rules', () => {
  const fromRules = new Set();
  for (const segments of rulePaths()) {
    if (segments[0].includes('=**')) {
      // match /{path=**}/<gruppe>/{id}: Collection-Group-Regel.
      if (segments[1] && !segments[1].startsWith('{')) fromRules.add(segments[1]);
      continue;
    }
    // Pfade wechseln Collection/Dokument: Untersammlungen stehen an Index 2, 4, …
    for (let index = 2; index < segments.length; index += 2) {
      if (!segments[index].startsWith('{')) fromRules.add(segments[index]);
    }
  }
  const configured = new Set(SUBCOLLECTION_GROUPS.map(({group}) => group));

  assert.deepEqual(
      [...fromRules].filter((group) => !configured.has(group)),
      [],
      'Neue Untersammlung in firestore.rules: in SUBCOLLECTION_GROUPS (functions/firestoreInventory.js) ergänzen.',
  );
  assert.deepEqual(
      [...configured].filter((group) => !fromRules.has(group)),
      [],
      'SUBCOLLECTION_GROUPS nennt eine Untersammlung, die firestore.rules nicht kennt.',
  );
});

test('every collection in AGE_FIELDS is a root collection in firestore.rules', () => {
  const roots = new Set(rulePaths()
      .filter((segments) => !segments[0].startsWith('{'))
      .map((segments) => segments[0]));

  assert.deepEqual(Object.keys(AGE_FIELDS).filter((name) => !roots.has(name)), []);
  for (const [name, age] of Object.entries(AGE_FIELDS)) {
    assert.ok(['timestamp', 'day'].includes(age.type), `${name}: unbekannter Typ ${age.type}`);
  }
});

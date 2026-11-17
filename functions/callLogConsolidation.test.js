const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_BATCH_WRITES,
  PAGE_SIZE,
  consolidateCallLogs,
  consolidationCutoff,
  formatConsolidationSummary,
  normalizeTrendingDays,
  planBatches,
  startOfBerlinMonth,
} = require('./callLogConsolidation');

class FakeTimestamp {
  constructor(ms) {
    this.ms = ms;
  }
  toDate() {
    return new Date(this.ms);
  }
  toMillis() {
    return this.ms;
  }
}
const ts = (iso) => new FakeTimestamp(Date.parse(iso));

const FieldValue = {
  increment: (n) => ({__op: 'increment', n}),
  serverTimestamp: () => ({__op: 'serverTimestamp'}),
};

const comparable = (value) => {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  return value;
};

/** set(..., {merge: true}) mit increment und serverTimestamp, verschachtelte Maps werden gemischt. */
function applyMerge(existing, update) {
  const out = {...(existing || {})};
  for (const [key, value] of Object.entries(update)) {
    if (value && value.__op === 'increment') {
      out[key] = (typeof out[key] === 'number' ? out[key] : 0) + value.n;
    } else if (value && value.__op === 'serverTimestamp') {
      out[key] = 'SERVER_TIME';
    } else if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof FakeTimestamp)) {
      out[key] = applyMerge(out[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Minimaler Firestore-Ersatz: Pfad -> Daten; Abfragen mit where (==, <), orderBy,
 * limit; Batches atomar mit der Vorbedingung exists und der Prüfung, dass kein
 * Dokument zweimal im selben Batch geschrieben wird.
 */
function makeDb(seed = {}) {
  const store = new Map(Object.entries(seed));
  const ref = (path) => ({path, id: path.split('/').pop()});
  const snapshotOf = (path) => ({id: path.split('/').pop(), ref: ref(path), data: () => store.get(path)});
  const db = {
    store,
    batches: [],
    queries: [],
    beforeCommit: null,
    failQuery: null,
    collection: (name) => query(name, {filters: [], order: null, limit: null}),
    batch() {
      const ops = [];
      db.batches.push(ops);
      return {
        set: (r, data, options) => {
          ops.push({type: 'set', path: r.path, data, options});
        },
        delete: (r, precondition) => {
          ops.push({type: 'delete', path: r.path, precondition});
        },
        commit: async () => {
          if (db.beforeCommit) db.beforeCommit(ops);
          const seen = new Set();
          for (const op of ops) {
            if (seen.has(op.path)) throw new Error(`${op.path} zweimal im selben Batch`);
            seen.add(op.path);
            if (op.type === 'delete' && op.precondition && op.precondition.exists && !store.has(op.path)) {
              throw new Error(`NOT_FOUND: ${op.path}`);
            }
          }
          if (ops.length > 500) throw new Error('mehr als 500 Schreibvorgänge');
          for (const op of ops) {
            if (op.type === 'delete') store.delete(op.path);
            else store.set(op.path, applyMerge(op.options && op.options.merge ? store.get(op.path) : {}, op.data));
          }
        },
      };
    },
  };
  function query(name, state) {
    return {
      where: (field, op, value) => query(name, {...state, filters: [...state.filters, {field, op, value}]}),
      orderBy: (field) => query(name, {...state, order: field}),
      limit: (n) => query(name, {...state, limit: n}),
      doc: (id) => ref(`${name}/${id}`),
      get: async () => {
        db.queries.push({name, ...state});
        if (db.failQuery && db.failQuery(name)) throw new Error(`Abfrage auf ${name} fehlgeschlagen`);
        let docs = [...store.keys()]
            .filter((path) => path.startsWith(`${name}/`) && !path.slice(name.length + 1).includes('/'))
            .map(snapshotOf)
            .filter((doc) => state.filters.every(({field, op, value}) => {
              const actual = doc.data()[field];
              if (actual === undefined) return false;
              if (op === '==') return actual === value;
              if (op === '<') return comparable(actual) < comparable(value);
              throw new Error(`op ${op}`);
            }));
        if (state.order) docs.sort((a, b) => comparable(a.data()[state.order]) - comparable(b.data()[state.order]));
        if (state.limit) docs = docs.slice(0, state.limit);
        return {docs, empty: docs.length === 0, size: docs.length};
      },
    };
  }
  return db;
}

let seq = 0;
const call = (collection, userId, iso, extra = {}) => ({
  [`${collection}/c${String(++seq).padStart(5, '0')}`]: {
    userId,
    userVorname: `Vor-${userId}`,
    userNachname: `Nach-${userId}`,
    isGuest: false,
    timestamp: ts(iso),
    ...extra,
  },
});
const appCall = (userId, iso, extra) => call('appCalls', userId, iso, extra);
const recipeCall = (userId, recipeId, iso, extra) =>
  call('recipeCalls', userId, iso, {recipeId, recipeTitle: `Rezept ${recipeId}`, ...extra});
const guestCall = (uid, iso) => appCall(uid, iso, {isGuest: true, userVorname: 'Gast', userNachname: ''});
const pathsIn = (db, collection) => [...db.store.keys()].filter((path) => path.startsWith(`${collection}/`)).sort();

// Lauf am 1.12.2026 um 4:30 Berliner Zeit (MEZ, UTC+1).
const DEC_RUN = new Date('2026-12-01T03:30:00Z');

test('Stichtag: Beginn des Vormonats in Berliner Zeit, Sommer- und Winterzeit beachtet', () => {
  assert.equal(consolidationCutoff(DEC_RUN, 30).toISOString(), '2026-10-31T23:00:00.000Z');
  // Mitte November: Stichtag 1. Oktober, 0 Uhr MESZ.
  assert.equal(consolidationCutoff(new Date('2026-11-17T10:00:00Z'), 30).toISOString(), '2026-09-30T22:00:00.000Z');
  // Januar-Lauf: Stichtag 1. Dezember des Vorjahres.
  assert.equal(consolidationCutoff(new Date('2027-01-01T03:30:00Z'), 30).toISOString(), '2026-11-30T23:00:00.000Z');
  assert.equal(startOfBerlinMonth(2026, 4).toISOString(), '2026-03-31T22:00:00.000Z');
  assert.equal(startOfBerlinMonth(2026, 11).toISOString(), '2026-10-31T23:00:00.000Z');
  assert.equal(startOfBerlinMonth(2027, 0).toISOString(), '2026-11-30T23:00:00.000Z');
});

test('Stichtag ohne Trend-Zeitfenster (appCalls): immer der Beginn des Vormonats', () => {
  assert.equal(consolidationCutoff(DEC_RUN).toISOString(), '2026-10-31T23:00:00.000Z');
  assert.equal(consolidationCutoff(new Date('2027-03-01T03:30:00Z')).toISOString(), '2027-01-31T23:00:00.000Z');
});

test('Stichtag: das Trend-Zeitfenster bleibt roh, auch wenn es länger als ein Monat ist', () => {
  // 90 Tage vor dem 1.12. ist der 2.9. -> ganzer September bleibt roh.
  assert.equal(consolidationCutoff(DEC_RUN, 90).toISOString(), '2026-08-31T22:00:00.000Z');
  // Nach dem kurzen Februar reichen 30 Tage bis in den Januar zurück.
  assert.equal(consolidationCutoff(new Date('2027-03-01T03:30:00Z'), 30).toISOString(), '2026-12-31T23:00:00.000Z');
  // Kürzeres Fenster ändert nichts: mindestens der Vormonat bleibt roh.
  assert.equal(consolidationCutoff(DEC_RUN, 7).toISOString(), '2026-10-31T23:00:00.000Z');
});

test('Trend-Zeitfenster aus den Einstellungen: wie im Client, unbrauchbare Werte ergeben 30 Tage', () => {
  assert.equal(normalizeTrendingDays(undefined), 30);
  assert.equal(normalizeTrendingDays(null), 30);
  assert.equal(normalizeTrendingDays(0), 30);
  assert.equal(normalizeTrendingDays(Number.NaN), 30);
  assert.equal(normalizeTrendingDays('abc'), 30);
  assert.equal(normalizeTrendingDays('45'), 45);
  assert.equal(normalizeTrendingDays(14.2), 15);
  assert.equal(normalizeTrendingDays(365), 365);
});

test('Batches bleiben unter dem Limit, jede Gruppe höchstens einmal je Batch, nichts geht verloren', () => {
  const items = (n, prefix) => Array.from({length: n}, (_, i) => ({ref: {path: `${prefix}/${i}`}}));
  const groups = [
    {key: 'a', items: items(1000, 'a')},
    {key: 'b', items: items(3, 'b')},
    {key: 'c', items: items(448, 'c')},
  ];
  const batches = planBatches(groups);
  for (const parts of batches) {
    const writes = parts.reduce((sum, part) => sum + part.items.length + 1, 0);
    assert.ok(writes <= MAX_BATCH_WRITES, `${writes} Schreibvorgänge`);
    const keys = parts.map((part) => part.key);
    assert.equal(new Set(keys).size, keys.length);
  }
  for (const group of groups) {
    const planned = batches.flat().filter((part) => part.key === group.key).flatMap((part) => part.items);
    assert.deepEqual(planned, group.items);
  }
});

test('fasst ganze Monate je Anwender zusammen, frühere Jahre je Anwender und Jahr, Gäste gemeinsam', async () => {
  const db = makeDb({
    ...appCall('anna', '2026-09-10T08:00:00Z'),
    ...appCall('anna', '2026-09-11T08:00:00Z'),
    ...appCall('anna', '2026-10-02T08:00:00Z'),
    ...appCall('anna', '2026-10-15T08:00:00Z', {userNachname: 'Neu'}),
    // 31.10. 23:30 Berliner Zeit: noch Oktober.
    ...appCall('anna', '2026-10-31T22:30:00Z', {userVorname: 'Anni', userNachname: 'Neu'}),
    // 1.11. 0:30 Berliner Zeit: November, bleibt roh.
    ...appCall('anna', '2026-10-31T23:30:00Z'),
    ...appCall('anna', '2026-11-20T08:00:00Z'),
    ...guestCall('gast1', '2026-10-03T08:00:00Z'),
    ...guestCall('gast2', '2026-10-04T08:00:00Z'),
    ...guestCall('gast2', '2026-10-05T08:00:00Z'),
    // 31.12.2025 23:30 Berliner Zeit -> Jahr 2025; 1.1.2026 0:30 -> Januar 2026.
    ...appCall('ben', '2025-12-31T22:30:00Z'),
    ...appCall('ben', '2025-12-31T23:30:00Z'),
    ...recipeCall('anna', 'r1', '2026-10-02T09:00:00Z'),
    ...recipeCall('anna', 'r1', '2026-10-03T09:00:00Z'),
    ...recipeCall('anna', 'r2', '2026-10-04T09:00:00Z'),
    ...recipeCall('anna', 'r2', '2026-11-04T09:00:00Z'),
    ...recipeCall('gast3', 'r1', '2026-10-05T09:00:00Z', {isGuest: true, userVorname: 'Gast', userNachname: ''}),
  });

  const outcome = await consolidateCallLogs({db, FieldValue, now: DEC_RUN, trendingDays: 30});

  assert.deepEqual(outcome.results, [
    {source: 'appCalls', cutoff: new Date('2026-10-31T23:00:00Z'), consolidated: 10, folded: 0,
      complete: true, timedOut: false, error: null},
    {source: 'recipeCalls', cutoff: new Date('2026-10-31T23:00:00Z'), consolidated: 4, folded: 0,
      complete: true, timedOut: false, error: null},
  ]);
  assert.equal(pathsIn(db, 'appCalls').length, 2, 'nur die Novemberaufrufe bleiben roh');
  assert.equal(pathsIn(db, 'recipeCalls').length, 1);

  assert.deepEqual(db.store.get('appCallAggregates/2026-10_anna'), {
    period: '2026-10', periodType: 'month', year: 2026, month: 10,
    userId: 'anna', isGuest: false, userVorname: 'Anni', userNachname: 'Neu',
    count: 3, updatedAt: 'SERVER_TIME',
  });
  assert.equal(db.store.get('appCallAggregates/2026-09_anna').count, 2);
  assert.deepEqual(db.store.get('appCallAggregates/2026-10_gaeste'), {
    period: '2026-10', periodType: 'month', year: 2026, month: 10,
    userId: null, isGuest: true, userVorname: 'Gast', userNachname: '',
    count: 3, updatedAt: 'SERVER_TIME',
  });
  assert.deepEqual(db.store.get('appCallAggregates/2025_ben'), {
    period: '2025', periodType: 'year', year: 2025,
    userId: 'ben', isGuest: false, userVorname: 'Vor-ben', userNachname: 'Nach-ben',
    count: 1, updatedAt: 'SERVER_TIME',
  });
  assert.equal(db.store.get('appCallAggregates/2026-01_ben').count, 1);

  const annaRecipes = db.store.get('recipeCallAggregates/2026-10_anna');
  assert.equal(annaRecipes.count, 3);
  assert.deepEqual(annaRecipes.recipeCounts, {r1: 2, r2: 1});
  assert.deepEqual(db.store.get('recipeCallAggregates/2026-10_gaeste').recipeCounts, {r1: 1});
});

test('ein zweiter Lauf ändert nichts', async () => {
  const db = makeDb({
    ...appCall('anna', '2026-10-02T08:00:00Z'),
    ...appCall('anna', '2026-11-02T08:00:00Z'),
  });
  await consolidateCallLogs({db, FieldValue, now: DEC_RUN});
  const before = new Map(db.store);
  const batchesBefore = db.batches.length;
  const outcome = await consolidateCallLogs({db, FieldValue, now: DEC_RUN});
  assert.deepEqual(outcome.results.map((row) => row.consolidated), [0, 0]);
  assert.equal(db.batches.length, batchesBefore);
  assert.deepEqual(db.store, before);
});

test('zählt auf ein vorhandenes Monatsdokument auf (Rest eines abgebrochenen Laufs)', async () => {
  const db = makeDb({
    'recipeCallAggregates/2026-10_anna': {
      period: '2026-10', periodType: 'month', year: 2026, month: 10, userId: 'anna', isGuest: false,
      userVorname: 'Vor-anna', userNachname: 'Nach-anna', count: 5, recipeCounts: {r1: 4, r9: 1},
    },
    ...recipeCall('anna', 'r1', '2026-10-20T09:00:00Z'),
    ...recipeCall('anna', 'r2', '2026-10-21T09:00:00Z'),
  });
  await consolidateCallLogs({db, FieldValue, now: DEC_RUN});
  const aggregate = db.store.get('recipeCallAggregates/2026-10_anna');
  assert.equal(aggregate.count, 7);
  assert.deepEqual(aggregate.recipeCounts, {r1: 5, r9: 1, r2: 1});
});

test('Januar-Lauf: Monate des Vorjahres wandern ins Jahresdokument, der Dezember bleibt roh', async () => {
  const db = makeDb({
    'appCallAggregates/2026-09_anna': {
      period: '2026-09', periodType: 'month', year: 2026, month: 9, userId: 'anna', isGuest: false,
      userVorname: 'Alt', userNachname: 'Name', count: 2,
    },
    'appCallAggregates/2026-10_anna': {
      period: '2026-10', periodType: 'month', year: 2026, month: 10, userId: 'anna', isGuest: false,
      userVorname: 'Vor-anna', userNachname: 'Nach-anna', count: 3,
    },
    'appCallAggregates/2026-10_gaeste': {
      period: '2026-10', periodType: 'month', year: 2026, month: 10, userId: null, isGuest: true,
      userVorname: 'Gast', userNachname: '', count: 4,
    },
    'appCallAggregates/2025_anna': {
      period: '2025', periodType: 'year', year: 2025, userId: 'anna', isGuest: false,
      userVorname: 'Vor-anna', userNachname: 'Nach-anna', count: 40,
    },
    'recipeCallAggregates/2026-10_anna': {
      period: '2026-10', periodType: 'month', year: 2026, month: 10, userId: 'anna', isGuest: false,
      userVorname: 'Vor-anna', userNachname: 'Nach-anna', count: 3, recipeCounts: {r1: 2, r2: 1},
    },
    ...appCall('anna', '2026-11-05T08:00:00Z', {userVorname: 'Anni'}),
    ...appCall('anna', '2026-11-06T08:00:00Z', {userVorname: 'Anni'}),
    ...appCall('anna', '2026-12-05T08:00:00Z'),
    ...recipeCall('anna', 'r1', '2026-11-07T09:00:00Z'),
  });

  const outcome = await consolidateCallLogs({db, FieldValue, now: new Date('2027-01-01T03:30:00Z')});

  assert.deepEqual(outcome.results.map(({folded, consolidated, complete}) => ({folded, consolidated, complete})), [
    {folded: 3, consolidated: 2, complete: true},
    {folded: 1, consolidated: 1, complete: true},
  ]);
  assert.deepEqual(pathsIn(db, 'appCallAggregates'), [
    'appCallAggregates/2025_anna', 'appCallAggregates/2026_anna', 'appCallAggregates/2026_gaeste',
  ]);
  assert.deepEqual(db.store.get('appCallAggregates/2026_anna'), {
    period: '2026', periodType: 'year', year: 2026,
    userId: 'anna', isGuest: false, userVorname: 'Anni', userNachname: 'Nach-anna',
    count: 7, updatedAt: 'SERVER_TIME',
  });
  assert.equal(db.store.get('appCallAggregates/2026_gaeste').count, 4);
  assert.equal(db.store.get('appCallAggregates/2025_anna').count, 40, 'ältere Jahre bleiben unberührt');
  assert.equal(pathsIn(db, 'appCalls').length, 1, 'der Dezember bleibt bis zum Februar-Lauf roh');

  const year = db.store.get('recipeCallAggregates/2026_anna');
  assert.equal(year.count, 4);
  assert.deepEqual(year.recipeCounts, {r1: 3, r2: 1});
});

test('Monatsdokumente des laufenden Jahres werden nicht gefaltet', async () => {
  const month = {
    period: '2027-01', periodType: 'month', year: 2027, month: 1, userId: 'anna', isGuest: false,
    userVorname: 'Vor-anna', userNachname: 'Nach-anna', count: 9,
  };
  const db = makeDb({'appCallAggregates/2027-01_anna': month});
  await consolidateCallLogs({db, FieldValue, now: new Date('2027-04-01T02:30:00Z')});
  assert.deepEqual(db.store.get('appCallAggregates/2027-01_anna'), month);
  assert.equal(db.batches.length, 0);
});

test('langes Trend-Zeitfenster: Rezeptaufrufe nur vor dem Fenster, App-Aufrufe unabhängig davon', async () => {
  const db = makeDb({
    ...recipeCall('anna', 'r1', '2026-08-20T09:00:00Z'),
    ...recipeCall('anna', 'r1', '2026-09-20T09:00:00Z'),
    ...recipeCall('anna', 'r1', '2026-10-20T09:00:00Z'),
    ...appCall('anna', '2026-09-20T09:00:00Z'),
    ...appCall('anna', '2026-10-20T09:00:00Z'),
  });
  await consolidateCallLogs({db, FieldValue, now: DEC_RUN, trendingDays: 90});
  assert.equal(db.store.get('recipeCallAggregates/2026-08_anna').count, 1);
  assert.equal(pathsIn(db, 'recipeCalls').length, 2);
  assert.equal(db.store.get('appCallAggregates/2026-10_anna').count, 1);
  assert.equal(pathsIn(db, 'appCalls').length, 0);
});

test('viele Aufrufe: mehrere Seiten und Batches, Summe stimmt', async () => {
  const seed = {};
  for (let i = 0; i < 1000; i++) {
    Object.assign(seed, appCall('anna', new Date(Date.parse('2026-10-01T08:00:00Z') + i * 60000).toISOString()));
  }
  const db = makeDb(seed);
  const outcome = await consolidateCallLogs({db, FieldValue, now: DEC_RUN});
  assert.equal(outcome.results[0].consolidated, 1000);
  assert.equal(db.store.get('appCallAggregates/2026-10_anna').count, 1000);
  assert.equal(pathsIn(db, 'appCalls').length, 0);
  assert.ok(db.batches.every((ops) => ops.length <= MAX_BATCH_WRITES));
  assert.ok(db.queries.filter((q) => q.name === 'appCalls').every((q) => q.limit > 0), 'Rohdaten nur seitenweise');
});

test('Zeitbudget erschöpft: stoppt zwischen zwei Batches, Zähler und Löschungen passen zusammen', async () => {
  const seed = {};
  for (let i = 0; i < 1000; i++) {
    Object.assign(seed, appCall('anna', new Date(Date.parse('2026-10-01T08:00:00Z') + i * 60000).toISOString()));
  }
  const db = makeDb(seed);
  let now = 0;
  const clock = () => now;
  db.beforeCommit = () => {
    now += 1;
  };
  const outcome = await consolidateCallLogs({db, FieldValue, now: DEC_RUN, deadline: 2, clock});

  const row = outcome.results[0];
  assert.equal(row.complete, false);
  assert.equal(row.timedOut, true);
  assert.match(row.error, /Zeitbudget/);
  // Eine Seite (400 Aufrufe + 1 Zieldokument) passt in einen Batch: nach zwei Batches ist Schluss.
  assert.equal(row.consolidated, 2 * PAGE_SIZE);
  assert.equal(db.store.get('appCallAggregates/2026-10_anna').count, row.consolidated);
  assert.equal(pathsIn(db, 'appCalls').length, 1000 - row.consolidated);

  // Der nächste Lauf setzt beim Rest an.
  await consolidateCallLogs({db, FieldValue, now: DEC_RUN});
  assert.equal(db.store.get('appCallAggregates/2026-10_anna').count, 1000);
  assert.equal(pathsIn(db, 'appCalls').length, 0);
});

test('nebenläufiger Lauf: fehlt ein Quelldokument schon, scheitert der Batch ganz, nichts wird doppelt gezählt', async () => {
  const db = makeDb({
    ...appCall('anna', '2026-10-02T08:00:00Z'),
    ...appCall('anna', '2026-10-03T08:00:00Z'),
  });
  db.beforeCommit = (ops) => {
    // Ein anderer Lauf hat einen der Aufrufe gerade verarbeitet.
    db.store.delete(ops.find((op) => op.type === 'delete').path);
    db.beforeCommit = null;
  };
  const outcome = await consolidateCallLogs({db, FieldValue, now: DEC_RUN});
  assert.equal(outcome.results[0].complete, false);
  assert.equal(outcome.results[0].timedOut, false);
  assert.match(outcome.results[0].error, /NOT_FOUND/);
  assert.equal(db.store.has('appCallAggregates/2026-10_anna'), false);
  assert.equal(pathsIn(db, 'appCalls').length, 1);
  assert.equal(outcome.results[1].complete, true, 'das andere Protokoll läuft weiter');
});

test('ein Fehler in einem Protokoll hält das andere nicht auf', async () => {
  const db = makeDb({
    ...appCall('anna', '2026-10-02T08:00:00Z'),
    ...recipeCall('anna', 'r1', '2026-10-02T09:00:00Z'),
  });
  db.failQuery = (name) => name === 'appCalls';
  const outcome = await consolidateCallLogs({db, FieldValue, now: DEC_RUN});
  assert.match(outcome.results[0].error, /appCalls/);
  assert.equal(outcome.results[1].consolidated, 1);
  assert.equal(db.store.get('recipeCallAggregates/2026-10_anna').count, 1);
});

test('Aufrufe ohne uid landen in einem eigenen Topf, ungültige Rezept-IDs zählen nur insgesamt', async () => {
  const db = makeDb({
    ...recipeCall('', 'r1', '2026-10-02T09:00:00Z'),
    ...recipeCall('anna', '', '2026-10-02T09:00:00Z'),
    ...recipeCall('anna', 'a/b', '2026-10-03T09:00:00Z'),
  });
  await consolidateCallLogs({db, FieldValue, now: DEC_RUN});
  assert.equal(db.store.get('recipeCallAggregates/2026-10_unbekannt').count, 1);
  const anna = db.store.get('recipeCallAggregates/2026-10_anna');
  assert.equal(anna.count, 2);
  assert.equal(anna.recipeCounts, undefined);
});

test('Zusammenfassung fürs Log nennt Zahlen und Stichtag, keine uids', async () => {
  const db = makeDb({...appCall('geheime-uid', '2026-10-02T08:00:00Z')});
  const outcome = await consolidateCallLogs({db, FieldValue, now: DEC_RUN});
  const summary = formatConsolidationSummary(outcome);
  assert.match(summary, /appCalls vor 1\.11\.2026: 1 zusammengefasst/);
  assert.match(summary, /recipeCalls vor 1\.11\.2026: 0 zusammengefasst/);
  assert.doesNotMatch(summary, /geheime-uid/);
});

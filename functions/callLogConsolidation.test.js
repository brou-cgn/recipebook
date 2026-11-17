const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_BATCH_WRITES,
  PAGE_SIZE,
  consolidateCallLogs,
  consolidationCutoff,
  dailyCutoff,
  formatConsolidationSummary,
  normalizeTrendingDays,
  planBatches,
  startOfBerlinDay,
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


const monthDoc = (period, user, extra = {}) => ({
  period, periodType: 'month', year: Number(period.slice(0, 4)), month: Number(period.slice(5)),
  userId: user, isGuest: false, userVorname: `Vor-${user}`, userNachname: `Nach-${user}`, count: 1, ...extra,
});
const dayDoc = (day, users) => ({
  day, year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)),
  count: Object.values(users).reduce((sum, entry) => sum + entry.count, 0), users,
});
const dayUser = (user, count, extra = {}) => ({
  userId: user, isGuest: false, userVorname: `Vor-${user}`, userNachname: `Nach-${user}`, count, ...extra,
});
const rowSummary = ({consolidated, foldedDays, foldedMonths, complete, error}) => ({consolidated, foldedDays, foldedMonths, complete, error});

test('Grenzen: 14 Tage für Einzelaufrufe, Beginn des Vormonats für Monate, jeweils Berliner Zeit', () => {
  // 1.12. 4:30 -> Einzelaufrufe ab 17.11. 0:00, Monate vor dem 1.11. 0:00 (MEZ).
  assert.equal(dailyCutoff(DEC_RUN).toISOString(), '2026-11-16T23:00:00.000Z');
  assert.equal(consolidationCutoff(DEC_RUN).toISOString(), '2026-10-31T23:00:00.000Z');
  // 10.4. 4:30 MESZ -> 27.3. 0:00 MEZ, vor der Umstellung am 29.3.
  assert.equal(dailyCutoff(new Date('2026-04-10T02:30:00Z')).toISOString(), '2026-03-26T23:00:00.000Z');
  assert.equal(consolidationCutoff(new Date('2026-11-17T10:00:00Z')).toISOString(), '2026-09-30T22:00:00.000Z');
  assert.equal(consolidationCutoff(new Date('2027-01-01T03:30:00Z')).toISOString(), '2026-11-30T23:00:00.000Z');
  assert.equal(startOfBerlinMonth(2026, 4).toISOString(), '2026-03-31T22:00:00.000Z');
  assert.equal(startOfBerlinMonth(2027, 0).toISOString(), '2026-11-30T23:00:00.000Z');
  // Tage der Zeitumstellung: Mitternacht liegt jeweils noch in der alten Zeit.
  assert.equal(startOfBerlinDay(2026, 3, 29).toISOString(), '2026-03-28T23:00:00.000Z');
  assert.equal(startOfBerlinDay(2026, 3, 30).toISOString(), '2026-03-29T22:00:00.000Z');
  assert.equal(startOfBerlinDay(2026, 10, 25).toISOString(), '2026-10-24T22:00:00.000Z');
  assert.equal(startOfBerlinDay(2026, 10, 26).toISOString(), '2026-10-25T23:00:00.000Z');
});

test('Monatsgrenze mit Trend-Zeitfenster: die Tage des Fensters bleiben Tagesdokumente', () => {
  // 90 Tage vor dem 1.12. ist der 2.9. -> Monate erst vor September.
  assert.equal(consolidationCutoff(DEC_RUN, 90).toISOString(), '2026-08-31T22:00:00.000Z');
  // Nach dem kurzen Februar reichen 30 Tage bis in den Januar zurück.
  assert.equal(consolidationCutoff(new Date('2027-03-01T03:30:00Z'), 30).toISOString(), '2026-12-31T23:00:00.000Z');
  assert.equal(consolidationCutoff(new Date('2027-03-01T03:30:00Z')).toISOString(), '2027-01-31T23:00:00.000Z');
  // Kürzeres Fenster ändert nichts: mindestens der Vormonat bleibt.
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

test('Batches: unter dem Limit, jedes Ziel einmal je Batch, eine Quelle nie geteilt, nichts geht verloren', () => {
  const source = (id, ...targets) => ({ref: {id}, contributions: targets.map((path) => ({target: {path}}))});
  const sources = [
    ...Array.from({length: 1000}, (_, i) => source(`a${i}`, 'agg/a')),
    source('tag1', 'agg/x', 'agg/y', 'agg/a'),
    ...Array.from({length: 3}, (_, i) => source(`b${i}`, 'agg/b')),
    ...Array.from({length: 448}, (_, i) => source(`c${i}`, `agg/c${i % 7}`)),
  ];
  const batches = planBatches(sources);
  for (const batch of batches) {
    const targets = new Set(batch.flatMap((s) => s.contributions.map((c) => c.target.path)));
    assert.ok(targets.size + batch.length <= MAX_BATCH_WRITES, `${targets.size + batch.length} Schreibvorgänge`);
  }
  assert.deepEqual(batches.flat(), sources);
  assert.throws(
      () => planBatches([source('voll', ...Array.from({length: MAX_BATCH_WRITES}, (_, i) => `agg/u${i}`))]),
      /passen in keinen Batch/);
});

test('Einzelaufrufe: älter als 14 Tage je Tag, vor dem Vormonat je Anwender und Monat, frühere Jahre je Anwender und Jahr', async () => {
  const db = makeDb({
    ...appCall('anna', '2026-09-10T08:00:00Z'),
    ...appCall('anna', '2026-09-11T08:00:00Z'),
    ...appCall('anna', '2026-10-02T08:00:00Z'),
    ...appCall('anna', '2026-10-15T08:00:00Z', {userNachname: 'Neu'}),
    // 31.10. 23:30 Berliner Zeit: noch Oktober.
    ...appCall('anna', '2026-10-31T22:30:00Z', {userVorname: 'Anni', userNachname: 'Neu'}),
    // 1.11. 0:30 Berliner Zeit: Tagesdokument 1.11.
    ...appCall('anna', '2026-10-31T23:30:00Z'),
    ...appCall('anna', '2026-11-05T08:00:00Z'),
    // 16.11. 23:30 Berliner Zeit: noch älter als 14 Tage; 17.11. 0:30 bleibt einzeln.
    ...appCall('anna', '2026-11-16T22:30:00Z'),
    ...appCall('anna', '2026-11-16T23:30:00Z'),
    ...appCall('anna', '2026-11-28T08:00:00Z'),
    ...guestCall('gast1', '2026-10-03T08:00:00Z'),
    ...guestCall('gast2', '2026-10-04T08:00:00Z'),
    ...guestCall('gast2', '2026-10-05T08:00:00Z'),
    ...guestCall('gast3', '2026-11-05T09:00:00Z'),
    // 31.12.2025 23:30 Berliner Zeit -> Jahr 2025; 1.1.2026 0:30 -> Januar 2026.
    ...appCall('ben', '2025-12-31T22:30:00Z'),
    ...appCall('ben', '2025-12-31T23:30:00Z'),
    ...recipeCall('anna', 'r1', '2026-10-02T09:00:00Z'),
    ...recipeCall('anna', 'r1', '2026-10-03T09:00:00Z'),
    ...recipeCall('anna', 'r2', '2026-10-04T09:00:00Z'),
    ...recipeCall('anna', 'r2', '2026-11-04T09:00:00Z'),
    ...recipeCall('anna', 'r2', '2026-11-04T10:00:00Z'),
    ...recipeCall('anna', 'r1', '2026-11-28T09:00:00Z'),
    ...recipeCall('gast4', 'r1', '2026-10-05T09:00:00Z', {isGuest: true, userVorname: 'Gast', userNachname: ''}),
  });

  const outcome = await consolidateCallLogs({db, FieldValue, now: DEC_RUN, trendingDays: 30});

  assert.deepEqual(outcome.results.map(rowSummary), [
    {consolidated: 14, foldedDays: 0, foldedMonths: 0, complete: true, error: null},
    {consolidated: 6, foldedDays: 0, foldedMonths: 0, complete: true, error: null},
  ]);
  assert.equal(pathsIn(db, 'appCalls').length, 2, 'nur die letzten 14 Tage bleiben einzeln');
  assert.equal(pathsIn(db, 'recipeCalls').length, 1);

  assert.deepEqual(pathsIn(db, 'appCallDays'), [
    'appCallDays/2026-11-01', 'appCallDays/2026-11-05', 'appCallDays/2026-11-16',
  ]);
  assert.deepEqual(db.store.get('appCallDays/2026-11-05'), {
    day: '2026-11-05', year: 2026, month: 11, count: 2,
    users: {
      anna: {userId: 'anna', isGuest: false, userVorname: 'Vor-anna', userNachname: 'Nach-anna', count: 1},
      gaeste: {userId: null, isGuest: true, userVorname: 'Gast', userNachname: '', count: 1},
    },
    updatedAt: 'SERVER_TIME',
  });
  assert.deepEqual(db.store.get('appCallAggregates/2026-10_anna'), {
    period: '2026-10', periodType: 'month', year: 2026, month: 10,
    userId: 'anna', isGuest: false, userVorname: 'Anni', userNachname: 'Neu',
    count: 3, updatedAt: 'SERVER_TIME',
  });
  assert.equal(db.store.get('appCallAggregates/2026-09_anna').count, 2);
  assert.equal(db.store.get('appCallAggregates/2026-10_gaeste').count, 3);
  assert.equal(db.store.get('appCallAggregates/2026-10_gaeste').userId, null);
  assert.deepEqual(db.store.get('appCallAggregates/2025_ben'), {
    period: '2025', periodType: 'year', year: 2025,
    userId: 'ben', isGuest: false, userVorname: 'Vor-ben', userNachname: 'Nach-ben',
    count: 1, updatedAt: 'SERVER_TIME',
  });
  assert.equal(db.store.get('appCallAggregates/2026-01_ben').count, 1);

  assert.deepEqual(db.store.get('recipeCallAggregates/2026-10_anna').recipeCounts, {r1: 2, r2: 1});
  assert.deepEqual(db.store.get('recipeCallAggregates/2026-10_gaeste').recipeCounts, {r1: 1});
  assert.deepEqual(db.store.get('recipeCallDays/2026-11-04').users.anna, {
    userId: 'anna', isGuest: false, userVorname: 'Vor-anna', userNachname: 'Nach-anna', count: 2, recipeCounts: {r2: 2},
  });
  assert.equal(db.store.get('recipeCallDays/2026-11-04').count, 2);
});

test('ein zweiter Lauf ändert nichts', async () => {
  const db = makeDb({
    ...appCall('anna', '2026-10-02T08:00:00Z'),
    ...appCall('anna', '2026-11-02T08:00:00Z'),
    ...appCall('anna', '2026-11-25T08:00:00Z'),
  });
  await consolidateCallLogs({db, FieldValue, now: DEC_RUN});
  const before = new Map(db.store);
  const batchesBefore = db.batches.length;
  const outcome = await consolidateCallLogs({db, FieldValue, now: DEC_RUN});
  assert.deepEqual(outcome.results.map((row) => row.consolidated + row.foldedDays + row.foldedMonths), [0, 0]);
  assert.equal(db.batches.length, batchesBefore);
  assert.deepEqual(db.store, before);
});

test('der tägliche Lauf zählt auf vorhandene Tages- und Monatsdokumente auf', async () => {
  const db = makeDb({
    'recipeCallAggregates/2026-10_anna': monthDoc('2026-10', 'anna', {count: 5, recipeCounts: {r1: 4, r9: 1}}),
    'recipeCallDays/2026-11-04': dayDoc('2026-11-04', {anna: dayUser('anna', 1, {recipeCounts: {r2: 1}})}),
    ...recipeCall('anna', 'r1', '2026-10-20T09:00:00Z'),
    ...recipeCall('anna', 'r2', '2026-11-04T11:00:00Z'),
    ...recipeCall('ben', 'r3', '2026-11-04T12:00:00Z'),
  });
  await consolidateCallLogs({db, FieldValue, now: DEC_RUN});
  const month = db.store.get('recipeCallAggregates/2026-10_anna');
  assert.equal(month.count, 6);
  assert.deepEqual(month.recipeCounts, {r1: 5, r9: 1});
  const day = db.store.get('recipeCallDays/2026-11-04');
  assert.equal(day.count, 3);
  assert.deepEqual(day.users.anna.recipeCounts, {r2: 2});
  assert.equal(day.users.anna.count, 2);
  assert.deepEqual(day.users.ben.recipeCounts, {r3: 1});
});

test('Monatswechsel: Tage vor dem Vormonat werden je Anwender zu Monaten, im Januar zu Jahren', async () => {
  const db = makeDb({
    'appCallAggregates/2026-09_anna': monthDoc('2026-09', 'anna', {count: 2, userVorname: 'Alt'}),
    'appCallAggregates/2026-10_anna': monthDoc('2026-10', 'anna', {count: 3}),
    'appCallAggregates/2026-10_gaeste': monthDoc('2026-10', null, {count: 4, isGuest: true, userVorname: 'Gast', userNachname: ''}),
    'appCallAggregates/2025_anna': {
      period: '2025', periodType: 'year', year: 2025, userId: 'anna', isGuest: false,
      userVorname: 'Vor-anna', userNachname: 'Nach-anna', count: 40,
    },
    'appCallDays/2026-11-03': dayDoc('2026-11-03', {
      anna: dayUser('anna', 2, {userVorname: 'Anni'}),
      gaeste: dayUser(null, 1, {isGuest: true, userVorname: 'Gast', userNachname: ''}),
    }),
    'appCallDays/2026-11-20': dayDoc('2026-11-20', {anna: dayUser('anna', 1, {userVorname: 'Anna', userNachname: 'Neu'})}),
    'appCallDays/2026-12-05': dayDoc('2026-12-05', {anna: dayUser('anna', 1)}),
    'recipeCallAggregates/2026-10_anna': monthDoc('2026-10', 'anna', {count: 3, recipeCounts: {r1: 2, r2: 1}}),
    'recipeCallDays/2026-11-07': dayDoc('2026-11-07', {anna: dayUser('anna', 1, {recipeCounts: {r1: 1}})}),
    ...appCall('anna', '2026-12-10T08:00:00Z'),
    ...appCall('anna', '2026-12-20T08:00:00Z'),
  });

  const outcome = await consolidateCallLogs({db, FieldValue, now: new Date('2027-01-01T03:30:00Z')});

  assert.deepEqual(outcome.results.map(rowSummary), [
    {consolidated: 1, foldedDays: 2, foldedMonths: 3, complete: true, error: null},
    {consolidated: 0, foldedDays: 1, foldedMonths: 1, complete: true, error: null},
  ]);
  assert.deepEqual(pathsIn(db, 'appCallAggregates'), [
    'appCallAggregates/2025_anna', 'appCallAggregates/2026_anna', 'appCallAggregates/2026_gaeste',
  ]);
  assert.deepEqual(db.store.get('appCallAggregates/2026_anna'), {
    period: '2026', periodType: 'year', year: 2026,
    userId: 'anna', isGuest: false, userVorname: 'Anna', userNachname: 'Neu',
    count: 8, updatedAt: 'SERVER_TIME',
  });
  assert.equal(db.store.get('appCallAggregates/2026_gaeste').count, 5);
  assert.equal(db.store.get('appCallAggregates/2025_anna').count, 40, 'ältere Jahre bleiben unberührt');
  assert.deepEqual(pathsIn(db, 'appCallDays'), ['appCallDays/2026-12-05', 'appCallDays/2026-12-10']);
  assert.equal(pathsIn(db, 'appCalls').length, 1, 'die letzten 14 Tage bleiben einzeln');

  const year = db.store.get('recipeCallAggregates/2026_anna');
  assert.equal(year.count, 4);
  assert.deepEqual(year.recipeCounts, {r1: 3, r2: 1});
  assert.deepEqual(pathsIn(db, 'recipeCallDays'), []);
});

test('Tage im laufenden Jahr werden zu Monaten, Monate des laufenden Jahres bleiben', async () => {
  const month = monthDoc('2027-01', 'anna', {count: 9});
  const db = makeDb({
    'appCallAggregates/2027-01_anna': month,
    'appCallDays/2027-02-10': dayDoc('2027-02-10', {anna: dayUser('anna', 2)}),
    'appCallDays/2027-03-10': dayDoc('2027-03-10', {anna: dayUser('anna', 1)}),
  });
  await consolidateCallLogs({db, FieldValue, now: new Date('2027-04-01T02:30:00Z')});
  assert.deepEqual(db.store.get('appCallAggregates/2027-01_anna'), month);
  assert.equal(db.store.get('appCallAggregates/2027-02_anna').count, 2);
  assert.equal(db.store.get('appCallAggregates/2027-02_anna').month, 2);
  assert.deepEqual(pathsIn(db, 'appCallDays'), ['appCallDays/2027-03-10'], 'der Vormonat bleibt in Tagen');
});

test('langes Trend-Zeitfenster: Rezept-Tage bleiben Tage, App-Aufrufe werden trotzdem zu Monaten', async () => {
  const db = makeDb({
    'recipeCallDays/2026-09-05': dayDoc('2026-09-05', {anna: dayUser('anna', 1, {recipeCounts: {r1: 1}})}),
    ...recipeCall('anna', 'r1', '2026-08-20T09:00:00Z'),
    ...recipeCall('anna', 'r1', '2026-09-20T09:00:00Z'),
    ...recipeCall('anna', 'r1', '2026-10-20T09:00:00Z'),
    ...appCall('anna', '2026-09-20T09:00:00Z'),
    ...appCall('anna', '2026-10-20T09:00:00Z'),
  });
  await consolidateCallLogs({db, FieldValue, now: DEC_RUN, trendingDays: 90});
  assert.equal(db.store.get('recipeCallAggregates/2026-08_anna').count, 1);
  assert.deepEqual(pathsIn(db, 'recipeCallDays'), [
    'recipeCallDays/2026-09-05', 'recipeCallDays/2026-09-20', 'recipeCallDays/2026-10-20',
  ]);
  assert.equal(pathsIn(db, 'recipeCalls').length, 0);
  assert.equal(db.store.get('appCallAggregates/2026-09_anna').count, 1);
  assert.equal(db.store.get('appCallAggregates/2026-10_anna').count, 1);
  assert.deepEqual(pathsIn(db, 'appCallDays'), []);
});

test('viele Aufrufe: mehrere Seiten und Batches, Summen stimmen', async () => {
  const seed = {};
  const minutes = (iso, i) => new Date(Date.parse(iso) + i * 60000).toISOString();
  for (let i = 0; i < 1000; i++) Object.assign(seed, appCall('anna', minutes('2026-10-01T08:00:00Z', i)));
  for (let i = 0; i < 600; i++) Object.assign(seed, appCall(`u${i % 3}`, minutes('2026-11-05T06:00:00Z', i)));
  const db = makeDb(seed);
  const outcome = await consolidateCallLogs({db, FieldValue, now: DEC_RUN});
  assert.equal(outcome.results[0].consolidated, 1600);
  assert.equal(db.store.get('appCallAggregates/2026-10_anna').count, 1000);
  const day = db.store.get('appCallDays/2026-11-05');
  assert.equal(day.count, 600);
  assert.deepEqual(Object.values(day.users).map((entry) => entry.count), [200, 200, 200]);
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
  assert.equal(row.failed, false, 'ein erschöpftes Zeitbudget ist kein Fehler');
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
    ...appCall('anna', '2026-11-02T08:00:00Z'),
    ...appCall('anna', '2026-11-03T08:00:00Z'),
  });
  db.beforeCommit = (ops) => {
    // Ein anderer Lauf hat einen der Aufrufe gerade verarbeitet.
    db.store.delete(ops.find((op) => op.type === 'delete').path);
    db.beforeCommit = null;
  };
  const outcome = await consolidateCallLogs({db, FieldValue, now: DEC_RUN});
  assert.equal(outcome.results[0].complete, false);
  assert.equal(outcome.results[0].failed, true);
  assert.equal(outcome.results[0].timedOut, false);
  assert.match(outcome.results[0].error, /NOT_FOUND/);
  assert.deepEqual(pathsIn(db, 'appCallDays'), []);
  assert.equal(pathsIn(db, 'appCalls').length, 1);
  assert.equal(outcome.results[1].complete, true, 'das andere Protokoll läuft weiter');
});

test('ein Tagesdokument wird nur ganz gefaltet: scheitert der Batch, bleibt es samt allen Anwendern', async () => {
  const db = makeDb({
    'appCallDays/2026-10-07': dayDoc('2026-10-07', {anna: dayUser('anna', 2), ben: dayUser('ben', 3)}),
  });
  db.beforeCommit = () => {
    throw new Error('UNAVAILABLE');
  };
  const outcome = await consolidateCallLogs({db, FieldValue, now: DEC_RUN});
  assert.match(outcome.results[0].error, /UNAVAILABLE/);
  assert.ok(db.store.has('appCallDays/2026-10-07'));
  assert.equal(db.store.has('appCallAggregates/2026-10_anna'), false);
});

test('ein fehlgeschlagener Schritt hält die übrigen nicht auf', async () => {
  const db = makeDb({
    ...appCall('anna', '2026-11-02T08:00:00Z'),
    ...recipeCall('anna', 'r1', '2026-11-02T09:00:00Z'),
  });
  // z. B. fehlender Index für die Jahresfaltung direkt nach dem Deploy
  db.failQuery = (name) => name === 'appCallAggregates';
  const outcome = await consolidateCallLogs({db, FieldValue, now: DEC_RUN});
  assert.equal(outcome.results[0].complete, false);
  assert.equal(outcome.results[0].failed, true);
  assert.match(outcome.results[0].error, /appCallAggregates/);
  assert.equal(outcome.results[0].consolidated, 1, 'die Einzelaufrufe wurden trotzdem verdichtet');
  assert.equal(db.store.get('appCallDays/2026-11-02').count, 1);
  assert.equal(outcome.results[1].complete, true);
});

test('Tagesdokument mit Anzahl, aber ohne Anwender wird nicht gelöscht', async () => {
  const db = makeDb({'appCallDays/2026-10-07': {day: '2026-10-07', year: 2026, month: 10, count: 4}});
  const outcome = await consolidateCallLogs({db, FieldValue, now: DEC_RUN});
  assert.match(outcome.results[0].error, /keine Anwender/);
  assert.ok(db.store.has('appCallDays/2026-10-07'));
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

test('Zusammenfassung fürs Log nennt Zahlen und Grenzen, keine uids', async () => {
  const db = makeDb({...appCall('geheime-uid', '2026-11-02T08:00:00Z')});
  const outcome = await consolidateCallLogs({db, FieldValue, now: DEC_RUN});
  const summary = formatConsolidationSummary(outcome);
  assert.match(summary, /appCalls: 1 Einzelaufrufe vor 17\.11\.2026, 0 Tage vor 1\.11\.2026, 0 Monate früherer Jahre/);
  assert.match(summary, /recipeCalls: 0 Einzelaufrufe/);
  assert.doesNotMatch(summary, /geheime-uid/);
});

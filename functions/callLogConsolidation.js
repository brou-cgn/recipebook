/**
 * Konsolidierung der Aufruf-Protokolle appCalls und recipeCalls (Tech-Check K2).
 * Jeder Login und jeder Rezeptaufruf legt ein Dokument an; die Seite
 * Küchenbetrieb las bisher beide Historien komplett. Ältere Aufrufe werden in
 * Stufen zusammengefasst (Kalender Europe/Berlin, nur ganze Tage und Monate):
 *
 *   älter als 14 Tage              -> ein Dokument je Tag
 *                                     appCallDays/{JJJJ-MM-TT}, recipeCallDays/{JJJJ-MM-TT}
 *   vor Beginn des Vormonats       -> ein Dokument je Anwender und Monat
 *                                     appCallAggregates/{JJJJ-MM}_{uid}, recipeCallAggregates/…
 *   aus früheren Kalenderjahren    -> ein Dokument je Anwender und Jahr
 *                                     appCallAggregates/{JJJJ}_{uid}, recipeCallAggregates/…
 *
 * Ein Tagesdokument hält die Aufrufe des Tages aller Anwender, aufgeschlüsselt im
 * Feld users (Name, Anzahl, bei Rezeptaufrufen die Anzahl je Rezept-ID); daraus
 * entstehen später die Monatsdokumente je Anwender. Monatsdokumente eines
 * vergangenen Jahres werden ins Jahresdokument gefaltet. Gäste (anonyme Sitzungen,
 * je Gerät eine eigene uid) zählen je Zeitraum gemeinsam (Schlüssel `gaeste`).
 *
 * „Im Trend“ zählt die Rezeptaufrufe der letzten X Tage (settings/app.trendingDays)
 * aus Einzelaufrufen und recipeCallDays. Tagesdokumente innerhalb dieses Fensters
 * werden deshalb nicht zu Monaten verdichtet; ist es länger als ein Monat, bleiben
 * entsprechend mehr Tage stehen. appCalls hängen nicht daran.
 *
 * Absturzsicher und nebenläufig sicher: Jeder Batch erhöht die Zähler der Ziele
 * (FieldValue.increment) und löscht genau die gezählten Quelldokumente, atomar.
 * Die Löschungen tragen die Vorbedingung `exists: true`; hat ein zweiter Lauf ein
 * Dokument schon verarbeitet, scheitert der ganze Batch, statt doppelt zu zählen.
 * Ein Tagesdokument wird nie über zwei Batches verteilt. Bricht ein Lauf ab
 * (Fehler, Zeitbudget), setzt der nächste beim Rest an.
 *
 * Die Logik hängt nur an `db` und `FieldValue`, damit sie ohne Emulator testbar
 * ist; die geplante Function steht in handlers/admin.js.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const TIME_ZONE = 'Europe/Berlin';
// Wie DEFAULT_TRENDING_DAYS in src/utils/customLists.js.
const DEFAULT_TRENDING_DAYS = 30;
// So viele Tage bleiben Aufrufe einzeln (Küche und „Meine Küchenstars“ lesen 14 Tage roh).
const RAW_DAYS = 14;
const GUEST_KEY = 'gaeste';
const UNKNOWN_KEY = 'unbekannt';
const PAGE_SIZE = 400;
// Firestore erlaubt 500 Schreibvorgänge je Batch; Abstand wie in den übrigen Jobs.
const MAX_BATCH_WRITES = 450;

// perRecipe: Zähler je Rezept-ID; trendWindow: Tage des Trend-Zeitfensters bleiben Tagesdokumente.
const CALL_LOGS = Object.freeze([
  Object.freeze({
    source: 'appCalls', days: 'appCallDays', target: 'appCallAggregates', perRecipe: false, trendWindow: false,
  }),
  Object.freeze({
    source: 'recipeCalls', days: 'recipeCallDays', target: 'recipeCallAggregates', perRecipe: true, trendWindow: true,
  }),
]);

const pad2 = (value) => String(value).padStart(2, '0');

/**
 * Kalendertag eines Zeitpunkts in Berlin.
 * @param {Date} date
 * @return {{year: number, month: number, day: number, key: string}} key: JJJJ-MM-TT
 */
function berlinDate(date) {
  const key = date.toLocaleDateString('sv-SE', {timeZone: TIME_ZONE});
  const [year, month, day] = key.split('-').map(Number);
  return {year, month, day, key};
}

/**
 * Abstand der Berliner Ortszeit zu UTC in Minuten (60 im Winter, 120 im Sommer).
 * @param {Date} date
 * @return {number}
 */
function berlinOffsetMinutes(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (type) => Number(parts.find((part) => part.type === type).value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/**
 * Beginn eines Kalendertags (0:00 Berliner Zeit) als Zeitpunkt. Monat und Tag
 * dürfen über- oder unterlaufen (Tag 0 = letzter Tag des Vormonats).
 * @param {number} year
 * @param {number} month - 1–12
 * @param {number} day
 * @return {Date}
 */
function startOfBerlinDay(year, month, day) {
  const midnightUtc = Date.UTC(year, month - 1, day);
  const guess = midnightUtc - berlinOffsetMinutes(new Date(midnightUtc)) * 60000;
  // Zweiter Blick mit dem Abstand zur geschätzten Ortsmitternacht, falls dazwischen
  // eine Zeitumstellung läge (in Berlin nie um Mitternacht, aber billig).
  return new Date(midnightUtc - berlinOffsetMinutes(new Date(guess)) * 60000);
}

/**
 * Beginn eines Monats (1. um 0:00 Berliner Zeit).
 * @param {number} year
 * @param {number} month - 1–12, darf über- oder unterlaufen (0 = Dezember des Vorjahres)
 * @return {Date}
 */
function startOfBerlinMonth(year, month) {
  return startOfBerlinDay(year, month, 1);
}

/**
 * Zeitfenster „Im Trend“ aus settings/app wie im Client (getSortSettings):
 * fehlt der Wert oder ist er unbrauchbar, gelten 30 Tage.
 * @param {*} value - settings/app.trendingDays
 * @return {number}
 */
function normalizeTrendingDays(value) {
  const days = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return Number.isFinite(days) && days >= 1 ? Math.ceil(days) : DEFAULT_TRENDING_DAYS;
}

/**
 * Grenze für Einzelaufrufe: Aufrufe davor sind älter als 14 Tage und werden zu
 * Tagesdokumenten. Immer der Beginn eines Berliner Tags.
 * @param {Date} now
 * @return {Date}
 */
function dailyCutoff(now) {
  const {year, month, day} = berlinDate(now);
  return startOfBerlinDay(year, month, day - RAW_DAYS);
}

/**
 * Grenze für Monate: Aufrufe und Tagesdokumente davor werden zu Monats- bzw.
 * Jahresdokumenten je Anwender. Immer der Beginn eines Berliner Monats: der Beginn
 * des Vormonats, oder früher, wenn ein Trend-Zeitfenster weiter zurückreicht.
 * @param {Date} now
 * @param {?number} [trendingDays=null] - null: ohne Trend-Zeitfenster
 * @return {Date}
 */
function consolidationCutoff(now, trendingDays = null) {
  const {year, month} = berlinDate(now);
  const previousMonth = startOfBerlinMonth(year, month - 1);
  if (trendingDays === null) return previousMonth;
  const windowStart = berlinDate(new Date(now.getTime() - normalizeTrendingDays(trendingDays) * DAY_MS));
  const trendMonth = startOfBerlinMonth(windowStart.year, windowStart.month);
  return trendMonth < previousMonth ? trendMonth : previousMonth;
}

const isKey = (value) => typeof value === 'string' && value.length > 0 && value.length <= 128 && !value.includes('/');
const isRecipeKey = (value) => typeof value === 'string' && value.length > 0 && value.length <= 200 && !value.includes('/');
const text = (value) => (typeof value === 'string' ? value : '');
const positiveCount = (value) => (Number.isFinite(value) && value > 0 ? value : 0);

function toDate(value) {
  if (value && typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

function cleanRecipeCounts(value) {
  const counts = {};
  if (value && typeof value === 'object') {
    for (const [recipeId, count] of Object.entries(value)) {
      if (isRecipeKey(recipeId) && positiveCount(count) > 0) counts[recipeId] = count;
    }
  }
  return Object.keys(counts).length > 0 ? counts : null;
}

/** Schlüssel des Anwenders: Gäste gemeinsam, sonst die uid. */
function userBucket(data) {
  if (data.isGuest === true) return {userKey: GUEST_KEY, userId: null, isGuest: true};
  if (isKey(data.userId)) return {userKey: data.userId, userId: data.userId, isGuest: false};
  return {userKey: UNKNOWN_KEY, userId: null, isGuest: false};
}

/**
 * Monat im laufenden Jahr, sonst das Jahr.
 * @param {number} year
 * @param {number} month
 * @param {number} currentYear - Berliner Jahr des Laufs
 * @return {{period: string, periodType: string, year: number, month: ?number}}
 */
function periodFor(year, month, currentYear) {
  if (year < currentYear) return {period: String(year), periodType: 'year', year, month: null};
  return {period: `${year}-${pad2(month)}`, periodType: 'month', year, month};
}

/** Ziel: Monats- oder Jahresdokument eines Anwenders. */
function userTarget(collection, period, user) {
  return {
    kind: 'user',
    path: `${collection}/${period.period}_${user.userKey}`,
    collection,
    id: `${period.period}_${user.userKey}`,
    head: {...period, userId: user.userId, isGuest: user.isGuest},
  };
}

/** Ziel: Tagesdokument (alle Anwender eines Tages). */
function dayTarget(collection, date) {
  return {kind: 'day', path: `${collection}/${date.key}`, collection, id: date.key, head: date};
}

/**
 * Einzelaufruf -> Quelle mit einem Beitrag: vor der Monatsgrenze zum Monat bzw.
 * Jahr des Anwenders, sonst zum Tagesdokument.
 */
function rawSource(doc, ctx) {
  const data = doc.data() || {};
  const date = toDate(data.timestamp);
  if (!date) throw new Error(`Aufruf ${doc.id} hat keinen gültigen Zeitstempel`);
  const user = userBucket(data);
  const day = berlinDate(date);
  const target = date < ctx.monthCutoff ?
    userTarget(ctx.log.target, periodFor(day.year, day.month, ctx.currentYear), user) :
    dayTarget(ctx.log.days, day);
  return {
    ref: doc.ref,
    contributions: [{
      target,
      item: {
        ...user,
        count: 1,
        recipeCounts: ctx.log.perRecipe && isRecipeKey(data.recipeId) ? {[data.recipeId]: 1} : null,
        userVorname: text(data.userVorname),
        userNachname: text(data.userNachname),
      },
    }],
  };
}

/** Tagesdokument -> Quelle mit einem Beitrag je Anwender (Monat bzw. Jahr). */
function daySource(doc, ctx) {
  const data = doc.data() || {};
  const {year, month} = data;
  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    throw new Error(`Tagesdokument ${doc.id} hat kein gültiges Jahr oder keinen gültigen Monat`);
  }
  const period = periodFor(year, month, ctx.currentYear);
  const users = data.users && typeof data.users === 'object' ? data.users : {};
  const contributions = Object.entries(users).map(([userKey, entry]) => {
    const value = entry && typeof entry === 'object' ? entry : {};
    const user = {
      userKey: isKey(userKey) ? userKey : UNKNOWN_KEY,
      userId: isKey(value.userId) ? value.userId : null,
      isGuest: value.isGuest === true,
    };
    return {
      target: userTarget(ctx.log.target, period, user),
      item: {
        ...user,
        count: positiveCount(value.count),
        recipeCounts: ctx.log.perRecipe ? cleanRecipeCounts(value.recipeCounts) : null,
        userVorname: text(value.userVorname),
        userNachname: text(value.userNachname),
      },
    };
  });
  if (contributions.length === 0 && positiveCount(data.count) > 0) {
    throw new Error(`Tagesdokument ${doc.id} zählt Aufrufe, aber keine Anwender`);
  }
  return {ref: doc.ref, contributions};
}

/** Monatsdokument eines vergangenen Jahres -> Quelle mit einem Beitrag zum Jahr. */
function monthSource(doc, ctx) {
  const data = doc.data() || {};
  if (!Number.isInteger(data.year)) throw new Error(`Monatsdokument ${doc.id} hat kein gültiges Jahr`);
  const user = userBucket(data);
  const year = {period: String(data.year), periodType: 'year', year: data.year, month: null};
  return {
    ref: doc.ref,
    contributions: [{
      target: userTarget(ctx.log.target, year, user),
      item: {
        ...user,
        count: positiveCount(data.count),
        recipeCounts: ctx.log.perRecipe ? cleanRecipeCounts(data.recipeCounts) : null,
        userVorname: text(data.userVorname),
        userNachname: text(data.userNachname),
      },
    }],
  };
}

/**
 * Teilt Quellen (älteste zuerst) so auf Batches auf, dass jeder Batch höchstens
 * maxWrites Schreibvorgänge hat: je verschiedenem Ziel ein set, je Quelle ein
 * delete. Eine Quelle bleibt mit allen ihren Beiträgen in einem Batch, und jedes
 * Ziel wird je Batch genau einmal geschrieben.
 * @param {Array<{ref: Object, contributions: Array}>} sources
 * @param {number} [maxWrites]
 * @return {Array<Array<Object>>}
 */
function planBatches(sources, maxWrites = MAX_BATCH_WRITES) {
  const batches = [];
  let current = [];
  let targets = new Set();
  for (const source of sources) {
    const paths = new Set(source.contributions.map(({target}) => target.path));
    if (paths.size + 1 > maxWrites) {
      throw new Error(`${source.ref.id}: ${paths.size} Ziele passen in keinen Batch`);
    }
    const added = [...paths].filter((path) => !targets.has(path)).length;
    if (current.length > 0 && targets.size + added + current.length + 1 > maxWrites) {
      batches.push(current);
      current = [];
      targets = new Set();
    }
    current.push(source);
    paths.forEach((path) => targets.add(path));
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

function sumRecipeCounts(items) {
  const totals = {};
  for (const item of items) {
    for (const [recipeId, n] of Object.entries(item.recipeCounts || {})) {
      totals[recipeId] = (totals[recipeId] || 0) + n;
    }
  }
  return totals;
}

const increments = (counts, FieldValue) =>
  Object.fromEntries(Object.entries(counts).map(([key, n]) => [key, FieldValue.increment(n)]));

/**
 * Felder für set(..., {merge: true}) auf ein Monats- oder Jahresdokument. Namen
 * stammen vom jüngsten Beitrag; die Zähler werden erhöht.
 */
function userUpdate(target, items, FieldValue, perRecipe) {
  const newest = items[items.length - 1];
  const update = {
    period: target.head.period,
    periodType: target.head.periodType,
    year: target.head.year,
    userId: target.head.userId,
    isGuest: target.head.isGuest,
    userVorname: newest.userVorname,
    userNachname: newest.userNachname,
    count: FieldValue.increment(items.reduce((sum, item) => sum + item.count, 0)),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (target.head.month !== null) update.month = target.head.month;
  const recipeCounts = perRecipe ? sumRecipeCounts(items) : {};
  if (Object.keys(recipeCounts).length > 0) update.recipeCounts = increments(recipeCounts, FieldValue);
  return update;
}

/** Felder für set(..., {merge: true}) auf ein Tagesdokument: Summe und je Anwender. */
function dayUpdate(target, items, FieldValue, perRecipe) {
  const byUser = new Map();
  for (const item of items) {
    if (!byUser.has(item.userKey)) byUser.set(item.userKey, []);
    byUser.get(item.userKey).push(item);
  }
  const users = {};
  for (const [userKey, userItems] of byUser) {
    const newest = userItems[userItems.length - 1];
    const entry = {
      userId: newest.userId,
      isGuest: newest.isGuest,
      userVorname: newest.userVorname,
      userNachname: newest.userNachname,
      count: FieldValue.increment(userItems.reduce((sum, item) => sum + item.count, 0)),
    };
    const recipeCounts = perRecipe ? sumRecipeCounts(userItems) : {};
    if (Object.keys(recipeCounts).length > 0) entry.recipeCounts = increments(recipeCounts, FieldValue);
    users[userKey] = entry;
  }
  return {
    day: target.head.key,
    year: target.head.year,
    month: target.head.month,
    count: FieldValue.increment(items.reduce((sum, item) => sum + item.count, 0)),
    users,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

class OutOfTime extends Error {}

/**
 * Schreibt die Quellen Batch für Batch: Zähler der Ziele erhöhen, Quellen löschen.
 * onCommitted erhält nach jedem Batch die Zahl der verarbeiteten Quelldokumente.
 */
async function commitSources({db, FieldValue, ctx, sources, onCommitted}) {
  for (const batchSources of planBatches(sources)) {
    if (ctx.clock() >= ctx.deadline) throw new OutOfTime();
    const groups = new Map();
    for (const {contributions} of batchSources) {
      for (const {target, item} of contributions) {
        if (!groups.has(target.path)) groups.set(target.path, {target, items: []});
        groups.get(target.path).items.push(item);
      }
    }
    const batch = db.batch();
    for (const {target, items} of groups.values()) {
      const update = target.kind === 'day' ?
        dayUpdate(target, items, FieldValue, ctx.log.perRecipe) :
        userUpdate(target, items, FieldValue, ctx.log.perRecipe);
      batch.set(db.collection(target.collection).doc(target.id), update, {merge: true});
    }
    batchSources.forEach((source) => batch.delete(source.ref, {exists: true}));
    await batch.commit();
    onCommitted(batchSources.length);
  }
}

/**
 * Liest eine Abfrage seitenweise, macht jedes Dokument zur Quelle und schreibt.
 * Verarbeitete Dokumente sind danach gelöscht; die nächste Seite beginnt deshalb
 * wieder am Anfang.
 */
async function drain({db, FieldValue, ctx, query, toSource, sort, onCommitted}) {
  for (;;) {
    if (ctx.clock() >= ctx.deadline) throw new OutOfTime();
    const snapshot = await query().limit(PAGE_SIZE).get();
    if (snapshot.empty) return;
    const docs = sort ? [...snapshot.docs].sort(sort) : snapshot.docs;
    await commitSources({db, FieldValue, ctx, sources: docs.map((doc) => toSource(doc, ctx)), onCommitted});
  }
}

/**
 * Die drei Schritte je Protokoll, älteste Daten zuerst, damit Namen in den Zielen
 * vom jüngsten Aufruf stammen. Ein Fehler stoppt nur seinen Schritt.
 */
function steps(db, ctx) {
  const {log} = ctx;
  return [
    {
      // Monatsdokumente vergangener Jahre (Index periodType + year, firestore.indexes.json).
      counter: 'foldedMonths',
      query: () => db.collection(log.target).where('periodType', '==', 'month').where('year', '<', ctx.currentYear),
      toSource: monthSource,
      sort: (a, b) => String(a.data().period).localeCompare(String(b.data().period)),
    },
    {
      counter: 'foldedDays',
      query: () => db.collection(log.days).where('day', '<', berlinDate(ctx.monthCutoff).key).orderBy('day'),
      toSource: daySource,
    },
    {
      counter: 'consolidated',
      query: () => db.collection(log.source).where('timestamp', '<', ctx.dayCutoff).orderBy('timestamp'),
      toSource: rawSource,
    },
  ];
}

/**
 * Konsolidiert beide Aufruf-Protokolle. Scheitert ein Schritt, laufen die übrigen
 * weiter; der Fehler steht in der Zeile des Protokolls.
 *
 * @param {Object} deps
 * @param {Object} deps.db - Firestore (Admin SDK)
 * @param {Object} deps.FieldValue - FieldValue aus firebase-admin/firestore
 * @param {Date} [deps.now=new Date()]
 * @param {number} [deps.trendingDays=30] - settings/app.trendingDays
 * @param {number} [deps.deadline=Infinity] - Zeitpunkt (ms), ab dem kein neuer Batch mehr beginnt
 * @param {Function} [deps.clock=Date.now]
 * @param {Array} [deps.logs=CALL_LOGS]
 * @return {Promise<{currentYear: number, results: Array<{source: string, dayCutoff: Date,
 *   monthCutoff: Date, consolidated: number, foldedDays: number, foldedMonths: number,
 *   complete: boolean, failed: boolean, timedOut: boolean, error: ?string}>}>}
 *   failed: ein Schritt ist mit einem Fehler gescheitert (nicht nur das Zeitbudget).
 */
async function consolidateCallLogs({
  db,
  FieldValue,
  now = new Date(),
  trendingDays = DEFAULT_TRENDING_DAYS,
  deadline = Infinity,
  clock = Date.now,
  logs = CALL_LOGS,
}) {
  const currentYear = berlinDate(now).year;
  const dayCutoff = dailyCutoff(now);
  const results = [];
  for (const log of logs) {
    const ctx = {
      log, currentYear, dayCutoff, deadline, clock,
      monthCutoff: consolidationCutoff(now, log.trendWindow ? trendingDays : null),
    };
    const row = {
      source: log.source, dayCutoff, monthCutoff: ctx.monthCutoff,
      consolidated: 0, foldedDays: 0, foldedMonths: 0,
      complete: false, failed: false, timedOut: false, error: null,
    };
    const failures = [];
    for (const step of steps(db, ctx)) {
      try {
        await drain({db, FieldValue, ctx, ...step, onCommitted: (n) => { row[step.counter] += n; }});
      } catch (error) {
        if (error instanceof OutOfTime) {
          row.timedOut = true;
          break;
        }
        failures.push((error && error.message) || String(error));
      }
    }
    const messages = [...failures, ...(row.timedOut ? ['Zeitbudget erschöpft, der Rest folgt im nächsten Lauf'] : [])];
    row.failed = failures.length > 0;
    row.complete = messages.length === 0;
    row.error = messages.length > 0 ? messages.join('; ') : null;
    results.push(row);
  }
  return {currentYear, results};
}

/**
 * Eine Zeile fürs Log, ohne Namen oder uids.
 * @param {{results: Array}} outcome
 * @return {string}
 */
function formatConsolidationSummary({results}) {
  const date = (value) => value.toLocaleDateString('de-DE', {timeZone: TIME_ZONE});
  return results.map((row) =>
    `${row.source}: ${row.consolidated} Einzelaufrufe vor ${date(row.dayCutoff)}, ` +
    `${row.foldedDays} Tage vor ${date(row.monthCutoff)}, ` +
    `${row.foldedMonths} Monate früherer Jahre zusammengefasst` +
    (row.complete ? '' : ` (unvollständig: ${row.error})`)).join('; ');
}

module.exports = {
  CALL_LOGS,
  DEFAULT_TRENDING_DAYS,
  GUEST_KEY,
  MAX_BATCH_WRITES,
  PAGE_SIZE,
  RAW_DAYS,
  UNKNOWN_KEY,
  berlinDate,
  consolidateCallLogs,
  consolidationCutoff,
  dailyCutoff,
  formatConsolidationSummary,
  normalizeTrendingDays,
  planBatches,
  startOfBerlinDay,
  startOfBerlinMonth,
};

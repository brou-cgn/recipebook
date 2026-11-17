/**
 * Monatliche Konsolidierung der Aufruf-Protokolle appCalls und recipeCalls
 * (Tech-Check K2). Jeder Login und jeder Rezeptaufruf legt ein Dokument an; die
 * Seite Küchenbetrieb las bisher beide Historien komplett. Ältere Aufrufe werden
 * deshalb zu einem Dokument je Anwender und Zeitraum zusammengefasst:
 *
 *   appCalls    -> appCallAggregates
 *   recipeCalls -> recipeCallAggregates
 *
 * Zeiträume (Kalender Europe/Berlin):
 * - Ganze Monate, die vollständig älter als einen Monat sind (vor Beginn des
 *   Vormonats), werden zu einem Dokument je Anwender und Monat (`2026-10_<uid>`).
 * - Aufrufe aus früheren Kalenderjahren landen in einem Dokument je Anwender und
 *   Jahr (`2025_<uid>`); Monatsdokumente eines vergangenen Jahres werden dort
 *   hineingefaltet und gelöscht.
 * - recipeCalls: Das Trend-Zeitfenster (settings/app.trendingDays, „Im Trend“
 *   zählt rohe recipeCalls der letzten X Tage) bleibt immer roh. Ist es länger
 *   als ein Monat, wird entsprechend weniger zusammengefasst. appCalls hängen
 *   nicht daran.
 *
 * Gäste (anonyme Sitzungen, je Gerät eine eigene uid) gehen je Zeitraum in ein
 * gemeinsames Dokument (`<zeitraum>_gaeste`), sonst entstünde fast ein Dokument
 * je Aufruf. recipeCallAggregates zählen zusätzlich je Rezept (recipeCounts),
 * damit die Information, welches Rezept wie oft aufgerufen wurde, beim Löschen
 * der Rohdaten nicht verloren geht.
 *
 * Absturzsicher und nebenläufig sicher: Jeder Batch erhöht die Zähler
 * (FieldValue.increment) und löscht genau die gezählten Quelldokumente, atomar.
 * Die Löschungen tragen die Vorbedingung `exists: true`; hat ein zweiter Lauf ein
 * Dokument schon verarbeitet, scheitert der ganze Batch, statt doppelt zu zählen.
 * Bricht ein Lauf ab (Fehler, Zeitbudget), setzt der nächste beim Rest an.
 *
 * Die Logik hängt nur an `db` und `FieldValue`, damit sie ohne Emulator testbar
 * ist; die geplante Function steht in handlers/admin.js.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const TIME_ZONE = 'Europe/Berlin';
// Wie DEFAULT_TRENDING_DAYS in src/utils/customLists.js.
const DEFAULT_TRENDING_DAYS = 30;
const GUEST_KEY = 'gaeste';
const UNKNOWN_KEY = 'unbekannt';
const PAGE_SIZE = 400;
// Firestore erlaubt 500 Schreibvorgänge je Batch; Abstand wie in den übrigen Jobs.
const MAX_BATCH_WRITES = 450;

// perRecipe: Zähler je Rezept-ID; trendWindow: das Trend-Zeitfenster bleibt roh.
const CALL_LOGS = Object.freeze([
  Object.freeze({source: 'appCalls', target: 'appCallAggregates', perRecipe: false, trendWindow: false}),
  Object.freeze({source: 'recipeCalls', target: 'recipeCallAggregates', perRecipe: true, trendWindow: true}),
]);

const pad2 = (value) => String(value).padStart(2, '0');

/**
 * Jahr und Monat (1–12) eines Zeitpunkts im Berliner Kalender.
 * @param {Date} date
 * @return {{year: number, month: number}}
 */
function berlinYearMonth(date) {
  const [year, month] = date.toLocaleDateString('sv-SE', {timeZone: TIME_ZONE}).split('-').map(Number);
  return {year, month};
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
 * Beginn eines Monats (1. um 0:00 Berliner Zeit) als Zeitpunkt.
 * @param {number} year
 * @param {number} month - 1–12, darf über- oder unterlaufen (0 = Dezember des Vorjahres)
 * @return {Date}
 */
function startOfBerlinMonth(year, month) {
  const midnightUtc = Date.UTC(year, month - 1, 1);
  const guess = midnightUtc - berlinOffsetMinutes(new Date(midnightUtc)) * 60000;
  // Zweiter Blick mit dem Abstand zur geschätzten Ortsmitternacht, falls dazwischen
  // eine Zeitumstellung läge (in Berlin nie am Monatsersten, aber billig).
  return new Date(midnightUtc - berlinOffsetMinutes(new Date(guess)) * 60000);
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
 * Grenze der Konsolidierung: Aufrufe davor werden zusammengefasst. Immer der
 * Beginn eines Berliner Monats, damit nur ganze Monate wandern: der Beginn des
 * Vormonats, oder früher, wenn ein Trend-Zeitfenster weiter zurückreicht.
 * @param {Date} now
 * @param {?number} [trendingDays=null] - null: ohne Trend-Zeitfenster
 * @return {Date}
 */
function consolidationCutoff(now, trendingDays = null) {
  const {year, month} = berlinYearMonth(now);
  const previousMonth = startOfBerlinMonth(year, month - 1);
  if (trendingDays === null) return previousMonth;
  const windowStart = berlinYearMonth(new Date(now.getTime() - normalizeTrendingDays(trendingDays) * DAY_MS));
  const trendMonth = startOfBerlinMonth(windowStart.year, windowStart.month);
  return trendMonth < previousMonth ? trendMonth : previousMonth;
}

const isUid = (value) => typeof value === 'string' && value.length > 0 && value.length <= 128 && !value.includes('/');
const isRecipeKey = (value) => typeof value === 'string' && value.length > 0 && value.length <= 200 && !value.includes('/');
const text = (value) => (typeof value === 'string' ? value : '');

function toDate(value) {
  if (value && typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

/** Schlüssel des Anwenders: Gäste gemeinsam, sonst die uid. */
function userBucket(data) {
  if (data.isGuest === true) return {userKey: GUEST_KEY, userId: null, isGuest: true};
  if (isUid(data.userId)) return {userKey: data.userId, userId: data.userId, isGuest: false};
  return {userKey: UNKNOWN_KEY, userId: null, isGuest: false};
}

/**
 * Zeitraum eines Aufrufs: Monat im laufenden Jahr, sonst das Jahr.
 * @param {Date} date
 * @param {number} currentYear - Berliner Jahr des Laufs
 * @return {{period: string, periodType: string, year: number, month: ?number}}
 */
function periodOf(date, currentYear) {
  const {year, month} = berlinYearMonth(date);
  if (year < currentYear) return {period: String(year), periodType: 'year', year, month: null};
  return {period: `${year}-${pad2(month)}`, periodType: 'month', year, month};
}

/**
 * Fasst Quelldokumente in Gruppen je Zieldokument zusammen; die Reihenfolge der
 * Eingabe (älteste zuerst) bleibt in jeder Gruppe erhalten.
 * @param {Array<{key: string, head: Object, item: Object}>} entries
 * @return {Array<Object>}
 */
function groupEntries(entries) {
  const groups = new Map();
  for (const {key, head, item} of entries) {
    if (!groups.has(key)) groups.set(key, {key, ...head, items: []});
    groups.get(key).items.push(item);
  }
  return [...groups.values()];
}

/**
 * Rohe Aufrufe (älteste zuerst) -> Gruppen je Zieldokument.
 * @param {Array} docs - Firestore-Dokumente aus appCalls oder recipeCalls
 * @param {number} currentYear
 * @param {boolean} perRecipe
 * @return {Array<Object>}
 */
function groupRawCalls(docs, currentYear, perRecipe) {
  return groupEntries(docs.map((doc) => {
    const data = doc.data() || {};
    const date = toDate(data.timestamp);
    if (!date) throw new Error(`Aufruf ${doc.id} hat keinen gültigen Zeitstempel`);
    const period = periodOf(date, currentYear);
    const user = userBucket(data);
    const recipeCounts = perRecipe && isRecipeKey(data.recipeId) ? {[data.recipeId]: 1} : null;
    return {
      key: `${period.period}_${user.userKey}`,
      head: {...period, userId: user.userId, isGuest: user.isGuest},
      item: {ref: doc.ref, count: 1, recipeCounts, userVorname: text(data.userVorname), userNachname: text(data.userNachname)},
    };
  }));
}

/**
 * Monatsdokumente vergangener Jahre (älteste zuerst) -> Gruppen je Jahresdokument.
 * @param {Array} docs
 * @return {Array<Object>}
 */
function groupMonthAggregates(docs) {
  return groupEntries(docs.map((doc) => {
    const data = doc.data() || {};
    const user = userBucket(data);
    const recipeCounts = {};
    if (data.recipeCounts && typeof data.recipeCounts === 'object') {
      for (const [recipeId, count] of Object.entries(data.recipeCounts)) {
        if (isRecipeKey(recipeId) && Number.isFinite(count) && count > 0) recipeCounts[recipeId] = count;
      }
    }
    return {
      key: `${data.year}_${user.userKey}`,
      head: {period: String(data.year), periodType: 'year', year: data.year, month: null, userId: user.userId, isGuest: user.isGuest},
      item: {
        ref: doc.ref,
        count: Number.isFinite(data.count) && data.count > 0 ? data.count : 0,
        recipeCounts: Object.keys(recipeCounts).length > 0 ? recipeCounts : null,
        userVorname: text(data.userVorname),
        userNachname: text(data.userNachname),
      },
    };
  }));
}

/**
 * Teilt Gruppen so auf Batches auf, dass jeder Batch höchstens maxWrites
 * Schreibvorgänge hat (je Teil ein Zieldokument plus seine Löschungen). Eine
 * Gruppe kommt je Batch höchstens einmal vor, ein Dokument wird also nie zweimal
 * im selben Batch geschrieben.
 * @param {Array<Object>} groups
 * @param {number} [maxWrites]
 * @return {Array<Array<Object>>}
 */
function planBatches(groups, maxWrites = MAX_BATCH_WRITES) {
  const batches = [];
  let current = [];
  let writes = 0;
  for (const group of groups) {
    let offset = 0;
    while (offset < group.items.length) {
      if (maxWrites - writes < 2) {
        batches.push(current);
        current = [];
        writes = 0;
      }
      const take = Math.min(group.items.length - offset, maxWrites - writes - 1);
      current.push({...group, items: group.items.slice(offset, offset + take)});
      writes += take + 1;
      offset += take;
    }
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/**
 * Felder für set(..., {merge: true}) auf das Zieldokument eines Batch-Teils.
 * Namen stammen vom jüngsten Quelldokument; die Zähler werden erhöht.
 * @param {Object} part
 * @param {Object} FieldValue - admin.firestore.FieldValue
 * @param {boolean} perRecipe
 * @return {Object}
 */
function aggregateUpdate(part, FieldValue, perRecipe) {
  const newest = part.items[part.items.length - 1];
  const count = part.items.reduce((sum, item) => sum + item.count, 0);
  const update = {
    period: part.period,
    periodType: part.periodType,
    year: part.year,
    userId: part.userId,
    isGuest: part.isGuest,
    userVorname: newest.userVorname,
    userNachname: newest.userNachname,
    count: FieldValue.increment(count),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (part.month !== null) update.month = part.month;
  if (perRecipe) {
    const totals = {};
    for (const item of part.items) {
      for (const [recipeId, n] of Object.entries(item.recipeCounts || {})) {
        totals[recipeId] = (totals[recipeId] || 0) + n;
      }
    }
    if (Object.keys(totals).length > 0) {
      update.recipeCounts = Object.fromEntries(
          Object.entries(totals).map(([recipeId, n]) => [recipeId, FieldValue.increment(n)]));
    }
  }
  return update;
}

class OutOfTime extends Error {}

/**
 * Schreibt die Gruppen Batch für Batch: Zähler erhöhen, Quellen löschen.
 * onCommitted erhält nach jedem Batch die Zahl der verarbeiteten Quelldokumente.
 */
async function commitGroups({db, FieldValue, target, perRecipe, groups, deadline, clock, onCommitted}) {
  for (const parts of planBatches(groups)) {
    if (clock() >= deadline) throw new OutOfTime();
    const batch = db.batch();
    for (const part of parts) {
      batch.set(db.collection(target).doc(part.key), aggregateUpdate(part, FieldValue, perRecipe), {merge: true});
      part.items.forEach((item) => batch.delete(item.ref, {exists: true}));
    }
    await batch.commit();
    onCommitted(parts.reduce((sum, part) => sum + part.items.length, 0));
  }
}

/**
 * Faltet Monatsdokumente vergangener Jahre in Jahresdokumente. Liest alle
 * Monatsdokumente (nach jedem vollständigen Lauf höchstens Anwender × 11).
 */
async function foldPreviousYears({db, FieldValue, log, currentYear, deadline, clock, onCommitted}) {
  if (clock() >= deadline) throw new OutOfTime();
  const snapshot = await db.collection(log.target).where('periodType', '==', 'month').get();
  const docs = snapshot.docs
      .filter((doc) => {
        const year = (doc.data() || {}).year;
        return Number.isInteger(year) && year < currentYear;
      })
      .sort((a, b) => String(a.data().period).localeCompare(String(b.data().period)));
  if (docs.length === 0) return;
  await commitGroups({
    db, FieldValue, target: log.target, perRecipe: log.perRecipe,
    groups: groupMonthAggregates(docs), deadline, clock, onCommitted,
  });
}

/**
 * Fasst rohe Aufrufe vor dem Stichtag zusammen, seitenweise, älteste zuerst.
 * Verarbeitete Aufrufe sind danach gelöscht; die nächste Seite beginnt deshalb
 * wieder am Anfang.
 */
async function consolidateRawCalls({db, FieldValue, log, cutoff, currentYear, deadline, clock, onCommitted}) {
  for (;;) {
    if (clock() >= deadline) throw new OutOfTime();
    const snapshot = await db.collection(log.source)
        .where('timestamp', '<', cutoff)
        .orderBy('timestamp')
        .limit(PAGE_SIZE)
        .get();
    if (snapshot.empty) return;
    await commitGroups({
      db, FieldValue, target: log.target, perRecipe: log.perRecipe,
      groups: groupRawCalls(snapshot.docs, currentYear, log.perRecipe), deadline, clock, onCommitted,
    });
  }
}

/**
 * Konsolidiert beide Aufruf-Protokolle. Scheitert eines, läuft das andere weiter;
 * der Fehler steht in seiner Zeile.
 *
 * @param {Object} deps
 * @param {Object} deps.db - Firestore (Admin SDK)
 * @param {Object} deps.FieldValue - admin.firestore.FieldValue
 * @param {Date} [deps.now=new Date()]
 * @param {number} [deps.trendingDays=30] - settings/app.trendingDays
 * @param {number} [deps.deadline=Infinity] - Zeitpunkt (ms), ab dem kein neuer Batch mehr beginnt
 * @param {Function} [deps.clock=Date.now]
 * @param {Array} [deps.logs=CALL_LOGS]
 * @return {Promise<{currentYear: number, results: Array<{source: string, cutoff: Date, folded: number,
 *   consolidated: number, complete: boolean, timedOut: boolean, error: ?string}>}>}
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
  const currentYear = berlinYearMonth(now).year;
  const results = [];
  for (const log of logs) {
    const cutoff = consolidationCutoff(now, log.trendWindow ? trendingDays : null);
    const row = {
      source: log.source, cutoff, folded: 0, consolidated: 0, complete: false, timedOut: false, error: null,
    };
    const shared = {db, FieldValue, log, currentYear, deadline, clock};
    try {
      // Erst falten, dann Rohdaten: so stammen die Namen im Jahresdokument vom jüngsten Aufruf.
      await foldPreviousYears({...shared, onCommitted: (n) => { row.folded += n; }});
      await consolidateRawCalls({...shared, cutoff, onCommitted: (n) => { row.consolidated += n; }});
      row.complete = true;
    } catch (error) {
      row.timedOut = error instanceof OutOfTime;
      row.error = row.timedOut ?
        'Zeitbudget erschöpft, der Rest folgt im nächsten Lauf' :
        (error && error.message) || String(error);
    }
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
  return results.map((row) =>
    `${row.source} vor ${row.cutoff.toLocaleDateString('de-DE', {timeZone: TIME_ZONE})}: ` +
    `${row.consolidated} zusammengefasst, ${row.folded} Monatsdokumente in Jahre gefaltet` +
    (row.complete ? '' : ` (unvollständig: ${row.error})`)).join('; ');
}

module.exports = {
  CALL_LOGS,
  DEFAULT_TRENDING_DAYS,
  GUEST_KEY,
  MAX_BATCH_WRITES,
  PAGE_SIZE,
  UNKNOWN_KEY,
  aggregateUpdate,
  berlinYearMonth,
  consolidateCallLogs,
  consolidationCutoff,
  formatConsolidationSummary,
  normalizeTrendingDays,
  planBatches,
  startOfBerlinMonth,
};

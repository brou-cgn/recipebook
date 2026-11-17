/**
 * Bestand der Firestore-Collections für den täglichen Recalc-Bericht: wie
 * viele Dokumente je Collection liegen, wie viele davon älter als 90 Tage sind
 * und wie sich der Bestand seit dem Bericht eines Vortags verändert hat.
 *
 * Zweck: Collections finden, in denen sich alte, nicht mehr benötigte
 * Dokumente sammeln. Lesevorgänge je Collection gibt Firestore nicht über eine
 * dokumentierte API heraus (nur die Cloud Console unter „Usage insights“);
 * der Bestand ist die Größe, die Abfragen ohne Zeitfenster teuer macht.
 *
 * Kosten: Zählabfragen (count()) lesen keine Dokumente. Firestore berechnet je
 * angefangene 1.000 gezählte Indexeinträge einen Lesevorgang, mindestens einen
 * je Abfrage. Dazu kommen ein Lese- und ein Schreibvorgang für den
 * Vergleichsstand in appConfig/firestoreInventory.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const OLD_AFTER_DAYS = 90;
const SNAPSHOT_DOC = 'appConfig/firestoreInventory';
// Ein Stand je Berliner Tag; acht reichen für den Vergleich mit dem Vortag,
// auch wenn ein Lauf ausfällt.
const KEEP_SNAPSHOTS = 8;
const COUNT_CONCURRENCY = 8;
const DEFAULT_TIMEOUT_MS = 60000;
const TOP_OLD_COLLECTIONS = 3;
const MAX_LISTED_ERRORS = 5;

/**
 * Collections, bei denen hohes Alter auf Ballast hindeutet: Protokolle,
 * Aufträge und Tageszähler. „timestamp“ ist ein Firestore-Zeitstempel, „day“
 * ein Tag als Text (JJJJ-MM-TT). Inhalte wie Rezepte, Menüs oder Listen fehlen
 * bewusst: Ein altes Rezept ist kein Ballast.
 */
const AGE_FIELDS = Object.freeze({
  appCalls: {field: 'timestamp', type: 'timestamp'},
  recipeCalls: {field: 'timestamp', type: 'timestamp'},
  failedWebImports: {field: 'createdAt', type: 'timestamp'},
  jobRequests: {field: 'requestedAt', type: 'timestamp'},
  cookingTimerAlarms: {field: 'createdAt', type: 'timestamp'},
  recipeSwipeFlags: {field: 'createdAt', type: 'timestamp'},
  aiScanLimits: {field: 'date', type: 'day'},
  aiNutritionLimits: {field: 'date', type: 'day'},
  aiRephraseLimits: {field: 'date', type: 'day'},
  aiVersionLimits: {field: 'date', type: 'day'},
  aiWeinprofilLimits: {field: 'date', type: 'day'},
  importSweeperLimits: {field: 'date', type: 'day'},
  followLimits: {field: 'day', type: 'day'},
  listPushLimits: {field: 'day', type: 'day'},
  wichtelMailLimits: {field: 'tag', type: 'day'},
});

/**
 * Untersammlungen, gezählt über alle Elterndokumente hinweg (Collection-Group).
 * Root-Collections findet listCollections() selbst, Untersammlungen nicht.
 * Die Liste spiegelt firestore.rules; firestoreInventory.test.js prüft, dass
 * beide übereinstimmen.
 */
const SUBCOLLECTION_GROUPS = Object.freeze([
  {group: 'ratings', label: 'recipes/*/ratings'},
  {group: 'security', label: 'users/*/security'},
  {group: 'favorites', label: 'users/*/favorites'},
  {group: 'menuFavorites', label: 'users/*/menuFavorites'},
  {group: 'events', label: 'users/*/events'},
  {group: 'customDrinks', label: 'users/*/customDrinks'},
  {group: 'guestProfiles', label: 'users/*/guestProfiles'},
  {group: 'erfahrungswerte', label: 'users/*/erfahrungswerte'},
  {group: 'followInbox', label: 'users/*/followInbox'},
  {group: 'followBlocks', label: 'users/*/followBlocks'},
  {group: 'fuerDichEntdeckt', label: 'users/*/fuerDichEntdeckt'},
  {group: 'profiles', label: 'guests/*/profiles'},
  {group: 'aiPromptHistory', label: 'settings/app/aiPromptHistory'},
  {group: 'teilnehmer', label: 'wichtelRunden/*/teilnehmer'},
  {group: 'zuordnungen', label: 'wichtelRunden/*/zuordnungen'},
  {group: 'eintraege', label: 'wichtelRunden/*/eintraege'},
]);

/**
 * @param {Object} query - Collection, Collection-Group oder Abfrage
 * @return {Promise<number>}
 */
async function countQuery(query) {
  const snapshot = await query.count().get();
  return snapshot.data().count;
}

/**
 * Führt fn für alle Einträge aus, höchstens limit gleichzeitig; die
 * Reihenfolge der Ergebnisse folgt der Eingabe. fn darf nicht werfen.
 *
 * @param {Array} items
 * @param {number} limit
 * @param {Function} fn
 * @return {Promise<Array>}
 */
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({length: Math.min(limit, items.length)}, worker));
  return results;
}

function berlinDay(date) {
  return date.toLocaleDateString('sv-SE', {timeZone: 'Europe/Berlin'});
}

function errorMessage(error) {
  return (error && error.message) || String(error);
}

/**
 * Zählt die Dokumente aller Root-Collections und der bekannten
 * Untersammlungen, bei Collections mit Altersfeld zusätzlich die älteren als
 * oldAfterDays. Scheitert eine Zählung, steht der Fehler in ihrer Zeile; die
 * übrigen laufen weiter.
 *
 * @param {Object} deps
 * @param {Object} deps.db - Firestore (Admin SDK)
 * @param {Date} [deps.now=new Date()]
 * @param {number} [deps.oldAfterDays=90]
 * @param {Object} [deps.ageFields=AGE_FIELDS]
 * @param {Array} [deps.subcollectionGroups=SUBCOLLECTION_GROUPS]
 * @return {Promise<Array<{key: string, label: string, total: ?number, old: ?number, error: ?string}>>}
 */
async function fetchCollectionCounts({
  db,
  now = new Date(),
  oldAfterDays = OLD_AFTER_DAYS,
  ageFields = AGE_FIELDS,
  subcollectionGroups = SUBCOLLECTION_GROUPS,
}) {
  const roots = await db.listCollections();
  const cutoff = new Date(now.getTime() - oldAfterDays * DAY_MS);
  const ageFieldOf = (id) => (Object.prototype.hasOwnProperty.call(ageFields, id) ? ageFields[id] : null);
  const targets = [
    ...roots.map((ref) => ({key: ref.id, label: ref.id, query: ref, age: ageFieldOf(ref.id)})),
    ...subcollectionGroups.map(({group, label}) => ({
      key: `group:${group}`,
      label,
      query: db.collectionGroup(group),
      age: null,
    })),
  ];

  return mapWithConcurrency(targets, COUNT_CONCURRENCY, async ({key, label, query, age}) => {
    try {
      const total = await countQuery(query);
      let old = null;
      if (age) {
        // Tageszähler speichern den Tag als Text; der Vergleich ist dann ein
        // Textvergleich, für JJJJ-MM-TT dieselbe Reihenfolge.
        const limit = age.type === 'day' ? cutoff.toISOString().slice(0, 10) : cutoff;
        old = await countQuery(query.where(age.field, '<', limit));
      }
      return {key, label, total, old, error: null};
    } catch (error) {
      return {key, label, total: null, old: null, error: errorMessage(error)};
    }
  });
}

/**
 * Legt den heutigen Stand in appConfig/firestoreInventory ab (ein Stand je
 * Berliner Tag, die letzten acht) und liefert den jüngsten Stand eines
 * Vortags. Ein zweiter Lauf am selben Tag überschreibt den Tagesstand. Lässt
 * sich der alte Stand nicht lesen, wird nichts geschrieben (sonst ginge die
 * Historie verloren).
 *
 * @param {Object} deps
 * @param {Object} deps.db
 * @param {Array} deps.rows - Ergebnis von fetchCollectionCounts
 * @param {Date} deps.now
 * @return {Promise<{previousDay: ?string, previousCounts: ?Object, snapshotError: ?string}>}
 */
async function storeSnapshotAndGetPrevious({db, rows, now}) {
  const ref = db.doc(SNAPSHOT_DOC);
  const today = berlinDay(now);
  let stored;
  try {
    const snap = await ref.get();
    const data = snap.exists ? (snap.data() || {}) : {};
    stored = data.snapshots && typeof data.snapshots === 'object' ? data.snapshots : {};
  } catch (error) {
    return {previousDay: null, previousCounts: null, snapshotError: errorMessage(error)};
  }

  const previousDay = Object.keys(stored).filter((day) => day < today).sort().pop() || null;
  const previousCounts = previousDay ? ((stored[previousDay] && stored[previousDay].counts) || {}) : null;

  const counts = {};
  rows.forEach((row) => {
    if (Number.isFinite(row.total)) counts[row.key] = row.total;
  });
  const next = {...stored, [today]: {counts}};
  const kept = Object.keys(next).sort().slice(-KEEP_SNAPSHOTS);
  try {
    await ref.set({
      snapshots: Object.fromEntries(kept.map((day) => [day, next[day]])),
      updatedAt: now,
    });
  } catch (error) {
    return {previousDay, previousCounts, snapshotError: errorMessage(error)};
  }
  return {previousDay, previousCounts, snapshotError: null};
}

/**
 * Hängt die Veränderung zum Vergleichsstand an jede Zeile. Eine Collection,
 * die im Vergleichsstand fehlt, gilt als neu; eine, die heute fehlt, als leer
 * (listCollections liefert leere Collections nicht).
 *
 * @param {Array} counted
 * @param {?Object} previousCounts
 * @param {Array} subcollectionGroups
 * @return {Array}
 */
function withDeltas(counted, previousCounts, subcollectionGroups) {
  const rows = counted.map((row) => {
    if (!previousCounts || !Number.isFinite(row.total)) return {...row, delta: null, isNew: false};
    const before = previousCounts[row.key];
    if (!Number.isFinite(before)) return {...row, delta: row.total, isNew: row.total > 0};
    return {...row, delta: row.total - before, isNew: false};
  });
  if (previousCounts) {
    const present = new Set(rows.map((row) => row.key));
    const labels = new Map(subcollectionGroups.map(({group, label}) => [`group:${group}`, label]));
    Object.entries(previousCounts).forEach(([key, before]) => {
      if (present.has(key) || !Number.isFinite(before) || before <= 0) return;
      rows.push({key, label: labels.get(key) || key, total: 0, old: null, error: null, delta: -before, isNew: false});
    });
  }
  return rows;
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Zeitüberschreitung nach ${Math.round(ms / 1000)} s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Bestand für den Recalc-Bericht: zählt, legt den Tagesstand ab und rechnet
 * die Veränderung zum letzten Stand eines Vortags aus. Zeilen sortiert nach
 * Dokumentenzahl, größte zuerst.
 *
 * @param {Object} deps
 * @param {Object} deps.db - Firestore (Admin SDK)
 * @param {Date} [deps.now=new Date()]
 * @param {number} [deps.timeoutMs=60000]
 * @param {Object} [deps.ageFields]
 * @param {Array} [deps.subcollectionGroups]
 * @return {Promise<{rows: Array, previousDay: ?string, snapshotError: ?string, at: Date, oldAfterDays: number}>}
 */
async function fetchFirestoreInventory({
  db,
  now = new Date(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  ageFields = AGE_FIELDS,
  subcollectionGroups = SUBCOLLECTION_GROUPS,
}) {
  const run = async () => {
    const counted = await fetchCollectionCounts({db, now, ageFields, subcollectionGroups});
    const {previousDay, previousCounts, snapshotError} = await storeSnapshotAndGetPrevious({db, rows: counted, now});
    const rows = withDeltas(counted, previousCounts, subcollectionGroups).sort((a, b) =>
      (Number.isFinite(b.total) ? b.total : -1) - (Number.isFinite(a.total) ? a.total : -1) ||
      a.label.localeCompare(b.label));
    return {rows, previousDay, snapshotError, at: now, oldAfterDays: OLD_AFTER_DAYS};
  };
  return withTimeout(run(), timeoutMs);
}

function formatCount(value) {
  return Math.round(value).toLocaleString('de-DE');
}

function formatShare(part, whole) {
  return whole > 0 ? `${Math.round((part / whole) * 100)} %` : '–';
}

function formatSigned(value) {
  if (value > 0) return `+${formatCount(value)}`;
  return value < 0 ? formatCount(value) : '±0';
}

function formatDelta(row) {
  if (!Number.isFinite(row.delta)) return '–';
  return `${formatSigned(row.delta)}${row.isNew ? ' (neu)' : ''}`;
}

function formatShortDay(day) {
  const [, month, date] = String(day).split('-');
  return `${date}.${month}.`;
}

function escapeHtml(value) {
  return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
}

/**
 * Abschnitt für den Recalc-Bericht.
 *
 * @param {{rows?: Array, previousDay?: string, snapshotError?: string, at?: Date, oldAfterDays?: number, error?: string}} inventory
 *   Ergebnis von fetchFirestoreInventory oder {error}
 * @return {{text: string, html: string}}
 */
function buildFirestoreInventorySection(inventory) {
  const heading = 'Firestore-Bestand je Collection';
  if (!inventory || inventory.error || !Array.isArray(inventory.rows)) {
    const hint = `Nicht verfügbar: ${(inventory && inventory.error) || 'keine Daten'}.`;
    return {
      text: `\n${heading}\n${hint}\n`,
      html: `<h3>${heading}</h3><p>${escapeHtml(hint)}</p>`,
    };
  }

  const {previousDay, snapshotError} = inventory;
  const oldAfterDays = inventory.oldAfterDays || OLD_AFTER_DAYS;
  const at = inventory.at instanceof Date ? inventory.at : new Date();
  const stand = at.toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const title = `${heading} (Stand ${stand})`;

  // Leere Collections ohne Veränderung sind nur Rauschen.
  const rows = inventory.rows.filter((row) => row.error || row.total > 0 || (Number.isFinite(row.delta) && row.delta !== 0));
  const counted = rows.filter((row) => Number.isFinite(row.total));
  const failed = rows.filter((row) => row.error);
  const totalDocs = counted.reduce((sum, row) => sum + row.total, 0);
  const deltaSum = counted
      .filter((row) => Number.isFinite(row.delta))
      .reduce((sum, row) => sum + row.delta, 0);
  const deltaHeader = previousDay ? `± seit ${formatShortDay(previousDay)}` : '± Vortag';
  const oldHeader = `älter als ${oldAfterDays} Tage`;

  const nonEmpty = counted.filter((row) => row.total > 0).length;
  const lines = [];
  lines.push(`Gesamt: ${formatCount(totalDocs)} Dokumente in ${nonEmpty} ${nonEmpty === 1 ? 'Collection' : 'Collections'}` +
    (previousDay ? `, ${formatSigned(deltaSum)} seit ${formatShortDay(previousDay)}.` : '.'));
  const oldest = counted
      .filter((row) => Number.isFinite(row.old) && row.old > 0)
      .sort((a, b) => b.old - a.old)
      .slice(0, TOP_OLD_COLLECTIONS);
  if (oldest.length > 0) {
    lines.push(`Meiste alte Dokumente (${oldHeader}): ` +
      oldest.map((row) => `${row.label} ${formatCount(row.old)} von ${formatCount(row.total)} (${formatShare(row.old, row.total)})`).join(', ') + '.');
  }
  if (snapshotError) {
    lines.push(`Veränderung nicht verfügbar: ${snapshotError}.`);
  } else if (!previousDay) {
    lines.push('Veränderung ab dem nächsten Bericht (heute erster Stand gespeichert).');
  }
  if (failed.length > 0) {
    lines.push(`Zählung fehlgeschlagen: ${failed.slice(0, MAX_LISTED_ERRORS).map((row) => `${row.label} (${row.error})`).join('; ')}` +
      (failed.length > MAX_LISTED_ERRORS ? ` und ${failed.length - MAX_LISTED_ERRORS} weitere.` : '.'));
  }
  const note = `„${oldHeader}“ nur für Protokolle, Aufträge und Tageszähler; „–“ heißt nicht erhoben ` +
    '(z. B. Rezepte, bei denen Alter kein Ballast ist). Alte Dokumente kosten Lesevorgänge, wenn eine Abfrage ' +
    'die ganze Collection ohne Zeitfenster liest. Lesevorgänge je Collection zeigt nur die Cloud Console ' +
    '(Firestore, Usage insights).';

  const cells = (row) => {
    if (row.error) return ['Fehler', '–', '–'];
    return [
      formatCount(row.total),
      Number.isFinite(row.old) ? `${formatCount(row.old)} (${formatShare(row.old, row.total)})` : '–',
      formatDelta(row),
    ];
  };

  let text = `\n${title}\n${lines.join('\n')}\n`;
  text += `Collection | Dokumente | ${oldHeader} | ${deltaHeader}\n`;
  rows.forEach((row) => {
    text += `${row.label} | ${cells(row).join(' | ')}\n`;
  });
  text += `${note}\n`;

  const cell = 'style="padding:2px 12px 2px 0;text-align:right"';
  const html = `
      <h3>${escapeHtml(title)}</h3>
      ${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}
      <table style="border-collapse:collapse">
        <tr><th style="text-align:left;padding-right:12px">Collection</th><th ${cell}>Dokumente</th><th ${cell}>${escapeHtml(oldHeader)}</th><th ${cell}>${escapeHtml(deltaHeader)}</th></tr>
        ${rows.map((row) => `<tr><td style="padding-right:12px">${escapeHtml(row.label)}</td>` +
          cells(row).map((value) => `<td ${cell}>${escapeHtml(value)}</td>`).join('') + '</tr>').join('')}
      </table>
      <p style="color:#666;font-size:12px">${escapeHtml(note)}</p>`;
  return {text, html};
}

module.exports = {
  fetchFirestoreInventory,
  fetchCollectionCounts,
  buildFirestoreInventorySection,
  AGE_FIELDS,
  SUBCOLLECTION_GROUPS,
  SNAPSHOT_DOC,
  OLD_AFTER_DAYS,
};

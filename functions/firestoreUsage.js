/**
 * Firestore-Nutzung der letzten Tage aus Cloud Monitoring, für den täglichen
 * Recalc-Bericht (Tech-Check K1: Entscheidungsgrundlage, ob der Vollabruf der
 * Rezepte ein Kostenthema ist).
 *
 * Liest die Messwerte document/read_count, write_count und delete_count des
 * Projekts, summiert je UTC-Tag. Das Laufzeit-Dienstkonto der Functions
 * braucht dafür die Berechtigung monitoring.timeSeries.list (enthalten in
 * roles/monitoring.viewer oder Editor). Fehlt sie, liefert der Bericht statt
 * der Zahlen einen Hinweis; die Mail geht trotzdem raus.
 */

const MONITORING_API = 'https://monitoring.googleapis.com/v3';
const DAY_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10000;

// Kostenloses Tageskontingent von Firestore (Spark/Blaze), je Vorgangsart.
const FREE_TIER_PER_DAY = {reads: 50000, writes: 20000, deletes: 20000};

const METRICS = {
  reads: 'firestore.googleapis.com/document/read_count',
  writes: 'firestore.googleapis.com/document/write_count',
  deletes: 'firestore.googleapis.com/document/delete_count',
};

/**
 * Tagessummen eines Messwerts, Schlüssel ist der UTC-Tag (YYYY-MM-DD) des
 * Fensterbeginns.
 *
 * @param {Object} deps
 * @param {string} deps.projectId
 * @param {string} deps.accessToken
 * @param {Function} deps.fetchImpl
 * @param {string} metricType
 * @param {Date} start - Beginn (UTC-Mitternacht)
 * @param {Date} end - Ende (UTC-Mitternacht)
 * @return {Promise<Map<string, number>>}
 */
async function fetchDailySums({projectId, accessToken, fetchImpl}, metricType, start, end) {
  const params = new URLSearchParams({
    'filter': `metric.type="${metricType}"`,
    'interval.startTime': start.toISOString(),
    'interval.endTime': end.toISOString(),
    'aggregation.alignmentPeriod': '86400s',
    'aggregation.perSeriesAligner': 'ALIGN_SUM',
    'aggregation.crossSeriesReducer': 'REDUCE_SUM',
  });
  const response = await fetchImpl(
      `${MONITORING_API}/projects/${encodeURIComponent(projectId)}/timeSeries?${params}`,
      {
        headers: {Authorization: `Bearer ${accessToken}`},
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
  );
  if (!response.ok) {
    throw new Error(`Cloud Monitoring antwortete mit HTTP ${response.status}`);
  }
  const body = await response.json();
  const sums = new Map();
  for (const series of body.timeSeries || []) {
    for (const point of series.points || []) {
      // Die Ausrichtung endet am Fensterende; der Tag ist der davor.
      const endMs = Date.parse(point.interval && point.interval.endTime);
      if (Number.isNaN(endMs)) continue;
      const day = new Date(endMs - DAY_MS).toISOString().slice(0, 10);
      const value = Number(point.value && (point.value.int64Value ?? point.value.doubleValue));
      if (!Number.isFinite(value)) continue;
      sums.set(day, (sums.get(day) || 0) + value);
    }
  }
  return sums;
}

/**
 * Lese-, Schreib- und Löschvorgänge je abgeschlossenem UTC-Tag, neuester
 * zuerst. Tage ohne Datenpunkt zählen als 0 (Cloud Monitoring liefert für
 * Tage ohne Vorgang keinen Punkt).
 *
 * @param {Object} deps
 * @param {string} deps.projectId
 * @param {Function} deps.getAccessToken - liefert {access_token}
 * @param {Function} [deps.fetchImpl=fetch]
 * @param {Date} [deps.now=new Date()]
 * @param {number} [deps.days=7]
 * @return {Promise<Array<{day: string, reads: number, writes: number, deletes: number}>>}
 */
async function fetchFirestoreDailyUsage({projectId, getAccessToken, fetchImpl = fetch, now = new Date(), days = 7}) {
  if (!projectId) throw new Error('Projekt-ID unbekannt');
  const token = await getAccessToken();
  const accessToken = token && token.access_token;
  if (!accessToken) throw new Error('Kein Zugriffstoken');

  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end.getTime() - days * DAY_MS);
  const deps = {projectId, accessToken, fetchImpl};
  const [reads, writes, deletes] = await Promise.all([
    fetchDailySums(deps, METRICS.reads, start, end),
    fetchDailySums(deps, METRICS.writes, start, end),
    fetchDailySums(deps, METRICS.deletes, start, end),
  ]);

  const rows = [];
  for (let i = 1; i <= days; i += 1) {
    const day = new Date(end.getTime() - i * DAY_MS).toISOString().slice(0, 10);
    rows.push({
      day,
      reads: reads.get(day) || 0,
      writes: writes.get(day) || 0,
      deletes: deletes.get(day) || 0,
    });
  }
  return rows;
}

function formatCount(value) {
  return Math.round(value).toLocaleString('de-DE');
}

function formatShare(value, limit) {
  return `${Math.round((value / limit) * 100)} %`;
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
 * @param {{rows?: Array, error?: string}} usage - Ergebnis oder Fehlertext
 * @return {{text: string, html: string}}
 */
function buildFirestoreUsageSection(usage) {
  const heading = 'Firestore-Nutzung (letzte 7 Tage, UTC)';
  if (!usage || usage.error || !Array.isArray(usage.rows) || usage.rows.length === 0) {
    const reason = (usage && usage.error) || 'keine Daten';
    const hint = `Nicht verfügbar: ${reason}. Das Dienstkonto der Functions braucht die Rolle Monitoring-Betrachter (roles/monitoring.viewer).`;
    return {
      text: `\n${heading}\n${hint}\n`,
      html: `<h3>${heading}</h3><p>${escapeHtml(hint)}</p>`,
    };
  }

  const {rows} = usage;
  const peak = rows.reduce((max, row) => (row.reads > max.reads ? row : max), rows[0]);
  const average = rows.reduce((sum, row) => sum + row.reads, 0) / rows.length;
  const summary = `Lesen: Spitze ${formatCount(peak.reads)} am ${peak.day} ` +
    `(${formatShare(peak.reads, FREE_TIER_PER_DAY.reads)} des Gratis-Kontingents von ` +
    `${formatCount(FREE_TIER_PER_DAY.reads)}/Tag), Schnitt ${formatCount(average)}/Tag.`;

  let text = `\n${heading}\n${summary}\n`;
  text += 'Tag | Lesen | Schreiben | Löschen\n';
  rows.forEach((row) => {
    text += `${row.day} | ${formatCount(row.reads)} | ${formatCount(row.writes)} | ${formatCount(row.deletes)}\n`;
  });

  const cell = 'style="padding:2px 12px 2px 0;text-align:right"';
  const html = `
      <h3>${heading}</h3>
      <p>${escapeHtml(summary)}</p>
      <table style="border-collapse:collapse">
        <tr><th style="text-align:left;padding-right:12px">Tag</th><th ${cell}>Lesen</th><th ${cell}>Schreiben</th><th ${cell}>Löschen</th></tr>
        ${rows.map((row) => `<tr><td style="padding-right:12px">${row.day}</td>` +
          `<td ${cell}>${formatCount(row.reads)} (${formatShare(row.reads, FREE_TIER_PER_DAY.reads)})</td>` +
          `<td ${cell}>${formatCount(row.writes)} (${formatShare(row.writes, FREE_TIER_PER_DAY.writes)})</td>` +
          `<td ${cell}>${formatCount(row.deletes)} (${formatShare(row.deletes, FREE_TIER_PER_DAY.deletes)})</td></tr>`).join('')}
      </table>
      <p style="color:#666;font-size:12px">In Klammern: Anteil am Gratis-Kontingent pro Tag. Das Kontingent setzt um Mitternacht pazifischer Zeit zurück, die Tage hier sind UTC-Tage.</p>`;
  return {text, html};
}

module.exports = {
  fetchFirestoreDailyUsage,
  buildFirestoreUsageSection,
  FREE_TIER_PER_DAY,
};

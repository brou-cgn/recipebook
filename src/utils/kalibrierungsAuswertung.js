/**
 * Auswertung der Kalibrierungs-Snapshots (siehe functions/submitConsumption.js):
 * vergleicht pro Getraenke-Kategorie den berechneten Soll-Bedarf (ohne Puffer)
 * mit dem tatsaechlichen Ist-Verbrauch. Rein lesend -- schreibt keine Gewichte.
 */

/** Ab dieser Event-Anzahl pro Kategorie gilt die Abweichung als belastbar (Schaetzwert). */
export const MIN_EVENTS_FOR_TREND = 5;

const median = (values) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const isPositiveNumber = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
const isNonNegativeNumber = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/**
 * Aggregiert Snapshots je Kategorie. Mehrere Zeilen derselben Kategorie in einem
 * Event (mehrere Getraenke) werden zuerst pro Event aufsummiert, damit ein Event
 * nur einmal zaehlt.
 * @param {Object[]} snapshots Dokumente aus kalibrierungsSnapshots.
 * @return {Object[]} Zeilen { kategorie, events, sollLiter, istLiter, abweichung,
 *   medianAbweichung, belastbar }, sortiert nach Event-Anzahl absteigend.
 *   abweichung = Ist/Soll - 1 (0,12 = 12 % mehr verbraucht als geplant).
 */
export const aggregateCalibration = (snapshots) => {
  const perCategory = {};
  (snapshots || []).forEach((snapshot, snapshotIdx) => {
    const perEvent = {};
    (snapshot?.kategorien || []).forEach((row) => {
      const key = row.drinkKategorie || row.rowKategorie;
      if (!key || !isPositiveNumber(row.sollLiter) || !isNonNegativeNumber(row.istLiter)) return;
      perEvent[key] = perEvent[key] || { soll: 0, ist: 0 };
      perEvent[key].soll += row.sollLiter;
      perEvent[key].ist += row.istLiter;
    });
    Object.entries(perEvent).forEach(([key, sums]) => {
      perCategory[key] = perCategory[key] || [];
      perCategory[key].push({ ...sums, id: snapshot?.eventId || String(snapshotIdx) });
    });
  });

  return Object.entries(perCategory)
    .map(([kategorie, entries]) => {
      const sollLiter = entries.reduce((s, e) => s + e.soll, 0);
      const istLiter = entries.reduce((s, e) => s + e.ist, 0);
      return {
        kategorie,
        events: entries.length,
        sollLiter,
        istLiter,
        abweichung: istLiter / sollLiter - 1,
        medianAbweichung: median(entries.map((e) => e.ist / e.soll - 1)),
        belastbar: entries.length >= MIN_EVENTS_FOR_TREND
      };
    })
    .sort((a, b) => b.events - a.events || a.kategorie.localeCompare(b.kategorie));
};

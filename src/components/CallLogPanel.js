import { useMemo, useState } from 'react';

// Eigene Aufrufe des App-Betreibers lassen sich im Reiter App-Aufrufe ausblenden.
const isOwnerEntry = (entry) => entry.userVorname === 'Benjamin' && entry.userNachname === 'Rousselli';

const MONTH_LABEL = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/**
 * Zeitraum eines zusammengefassten Eintrags: „Oktober 2026“ oder „Jahr 2025“.
 * @param {Object} aggregate - Dokument aus appCallAggregates/recipeCallAggregates
 * @returns {string}
 */
export function formatCallPeriod(aggregate) {
  const { periodType, year, month, period } = aggregate || {};
  if (periodType === 'month' && Number.isInteger(year) && Number.isInteger(month)) {
    return MONTH_LABEL.format(new Date(Date.UTC(year, month - 1, 1)));
  }
  if (periodType === 'year' && Number.isInteger(year)) return `Jahr ${year}`;
  return period ? String(period) : '–';
}

const countOf = (aggregate) => (Number.isFinite(aggregate.count) ? aggregate.count : 0);
const formatNumber = (value) => Number(value).toLocaleString('de-DE');
const nameKey = (entry) => `${entry.userNachname || ''} ${entry.userVorname || ''}`;

/** Neuester Zeitraum zuerst, darin die meisten Aufrufe zuerst. */
function sortAggregates(aggregates) {
  return [...aggregates].sort((a, b) => {
    const periodA = String(a.period || '');
    const periodB = String(b.period || '');
    if (periodA !== periodB) return periodA < periodB ? 1 : -1;
    return countOf(b) - countOf(a) || nameKey(a).localeCompare(nameKey(b), 'de');
  });
}

const formatCallTime = (call) => (call.timestamp?.toDate ? call.timestamp.toDate().toLocaleString('de-DE') : '–');

/**
 * Inhalt der Reiter „App-Aufrufe“ und „Rezeptaufrufe“ (Seite Küchenbetrieb):
 * die noch nicht zusammengefassten Einzelaufrufe und darunter die vom
 * monatlichen Job zusammengefassten Aufrufe je Anwender und Monat bzw. Jahr
 * (Tech-Check K2).
 *
 * @param {Object} props
 * @param {'app'|'recipe'} props.kind
 * @param {{loading: boolean, calls: Array, aggregates: Array}} props.log - aus useCallLog
 * @param {number} props.limit - Obergrenze der gelesenen Einzelaufrufe
 * @param {boolean} props.canSeeEmails - E-Mail-Spalte (nur Admins)
 * @param {Function} props.getEmail - userId -> E-Mail aus den Nutzerprofilen
 * @param {boolean} [props.ownerFilter] - Schalter „Benjamin Rousselli ausblenden“
 */
function CallLogPanel({ kind, log, limit, canSeeEmails, getEmail, ownerFilter = false }) {
  const [hideOwner, setHideOwner] = useState(true);
  const filterActive = ownerFilter && hideOwner;
  const isRecipe = kind === 'recipe';

  const calls = useMemo(
    () => (filterActive ? log.calls.filter((call) => !isOwnerEntry(call)) : log.calls),
    [log.calls, filterActive]
  );
  const aggregates = useMemo(
    () => sortAggregates(filterActive ? log.aggregates.filter((entry) => !isOwnerEntry(entry)) : log.aggregates),
    [log.aggregates, filterActive]
  );
  const aggregatedCalls = aggregates.reduce((sum, entry) => sum + countOf(entry), 0);

  if (log.loading) return <div className="app-calls-empty">Laden...</div>;
  if (log.calls.length === 0 && log.aggregates.length === 0) {
    return (
      <div className="app-calls-empty">
        {isRecipe ? 'Noch keine Rezeptaufrufe vorhanden.' : 'Noch keine Appaufrufe vorhanden.'}
      </div>
    );
  }

  const emailOf = (entry) => (entry.userId ? getEmail(entry.userId) : '');

  return (
    <>
      {ownerFilter && (
        <div className="app-calls-filter-row">
          <label className="app-calls-filter-label">
            <input
              type="checkbox"
              checked={hideOwner}
              onChange={(e) => setHideOwner(e.target.checked)}
              className="app-calls-filter-checkbox"
            />
            Benjamin Rousselli ausblenden
          </label>
        </div>
      )}
      {log.calls.length > 0 ? (
        <>
          <div className="app-calls-table-container">
            <table className="app-calls-table">
              <thead>
                <tr>
                  <th>Datum &amp; Uhrzeit</th>
                  {isRecipe && <th>Rezept</th>}
                  <th>Vorname</th>
                  <th>Nachname</th>
                  {canSeeEmails && <th className="app-calls-col-desktop">E-Mail</th>}
                  <th className="app-calls-col-desktop">Art</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((call) => (
                  <tr key={call.id}>
                    <td>{formatCallTime(call)}</td>
                    {isRecipe && <td>{call.recipeTitle}</td>}
                    <td>{call.userVorname}</td>
                    <td>{call.userNachname}</td>
                    {canSeeEmails && <td className="app-calls-col-desktop">{emailOf(call)}</td>}
                    <td className="app-calls-col-desktop">{call.isGuest ? 'Gast' : 'Angemeldet'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="app-calls-stats">
            Gesamt: <strong>{calls.length}</strong>
            {filterActive && calls.length !== log.calls.length
              ? <> von {log.calls.length} Einträgen (gefiltert)</>
              : <> Einträge</>}
          </div>
          {log.calls.length >= limit && (
            <p className="app-calls-info-text app-calls-limit-hint">
              Angezeigt werden die neuesten {formatNumber(limit)} Einzelaufrufe.
            </p>
          )}
        </>
      ) : (
        <div className="app-calls-empty">Keine Einzelaufrufe seit dem letzten Zusammenfassen.</div>
      )}
      {log.aggregates.length > 0 && (
        <section className="app-calls-aggregates" aria-labelledby={`${kind}-call-aggregates-title`}>
          <h3 id={`${kind}-call-aggregates-title`}>Zusammengefasste Aufrufe</h3>
          <p className="app-calls-info-text">
            Ältere Aufrufe je Anwender und Monat, aus früheren Jahren je Anwender und Jahr.
            Gäste sind je Zeitraum zusammengefasst.
          </p>
          <div className="app-calls-table-container">
            <table className="app-calls-table">
              <thead>
                <tr>
                  <th>Zeitraum</th>
                  <th>Vorname</th>
                  <th>Nachname</th>
                  {canSeeEmails && <th className="app-calls-col-desktop">E-Mail</th>}
                  <th className="app-calls-col-desktop">Art</th>
                  <th className="app-calls-col-count">Aufrufe</th>
                </tr>
              </thead>
              <tbody>
                {aggregates.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatCallPeriod(entry)}</td>
                    <td>{entry.isGuest ? 'Alle Gäste' : entry.userVorname}</td>
                    <td>{entry.isGuest ? '' : entry.userNachname}</td>
                    {canSeeEmails && <td className="app-calls-col-desktop">{emailOf(entry)}</td>}
                    <td className="app-calls-col-desktop">{entry.isGuest ? 'Gast' : 'Angemeldet'}</td>
                    <td className="app-calls-col-count">{formatNumber(countOf(entry))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="app-calls-stats">
            Zusammengefasst: <strong>{formatNumber(aggregatedCalls)}</strong> Aufrufe
            in {formatNumber(aggregates.length)} {aggregates.length === 1 ? 'Eintrag' : 'Einträgen'}
            {filterActive && aggregates.length !== log.aggregates.length ? ' (gefiltert)' : ''}
          </div>
        </section>
      )}
    </>
  );
}

export default CallLogPanel;

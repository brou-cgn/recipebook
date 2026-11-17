import { useMemo, useState } from 'react';

// Eigene Aufrufe des App-Betreibers lassen sich im Reiter App-Aufrufe ausblenden.
const isOwnerEntry = (entry) => entry.userVorname === 'Benjamin' && entry.userNachname === 'Rousselli';

const MONTH_LABEL = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const DAY_LABEL = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Zeitraum eines zusammengefassten Eintrags: „03.11.2026“, „Oktober 2026“ oder „Jahr 2025“.
 * @param {Object} aggregate - Eintrag aus expandCallDays oder appCallAggregates/recipeCallAggregates
 * @returns {string}
 */
export function formatCallPeriod(aggregate) {
  const { periodType, year, month, period } = aggregate || {};
  const day = periodType === 'day' && DAY_KEY.exec(String(period));
  if (day) return DAY_LABEL.format(new Date(Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3]))));
  if (periodType === 'month' && Number.isInteger(year) && Number.isInteger(month)) {
    return MONTH_LABEL.format(new Date(Date.UTC(year, month - 1, 1)));
  }
  if (periodType === 'year' && Number.isInteger(year)) return `Jahr ${year}`;
  return period ? String(period) : '–';
}

/**
 * Tagesdokumente (appCallDays/recipeCallDays, alle Anwender eines Tages im Feld
 * users) als Zeilen je Anwender und Tag, im Format der Monats- und Jahreseinträge.
 * @param {Array} days
 * @returns {Array}
 */
export function expandCallDays(days) {
  return (days || []).flatMap((dayDoc) => {
    const period = String(dayDoc?.day || dayDoc?.id || '');
    return Object.entries(dayDoc?.users || {}).map(([userKey, entry]) => ({
      id: `${period}_${userKey}`,
      period,
      periodType: 'day',
      userId: entry?.userId || null,
      isGuest: entry?.isGuest === true,
      userVorname: entry?.userVorname || '',
      userNachname: entry?.userNachname || '',
      count: entry?.count,
    }));
  });
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
 * die Einzelaufrufe der letzten 14 Tage und darunter die vom nächtlichen Job
 * zusammengefassten Aufrufe je Anwender und Tag, Monat bzw. Jahr (Tech-Check K2).
 *
 * @param {Object} props
 * @param {'app'|'recipe'} props.kind
 * @param {{loading: boolean, calls: Array, days: Array, aggregates: Array}} props.log - aus useCallLog
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
  const allAggregates = useMemo(
    () => [...expandCallDays(log.days), ...(log.aggregates || [])],
    [log.days, log.aggregates]
  );
  const aggregates = useMemo(
    () => sortAggregates(filterActive ? allAggregates.filter((entry) => !isOwnerEntry(entry)) : allAggregates),
    [allAggregates, filterActive]
  );
  const aggregatedCalls = aggregates.reduce((sum, entry) => sum + countOf(entry), 0);

  if (log.loading) return <div className="app-calls-empty">Laden...</div>;
  if (log.calls.length === 0 && allAggregates.length === 0) {
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
        <div className="app-calls-empty">Keine Einzelaufrufe in den letzten 14 Tagen.</div>
      )}
      {allAggregates.length > 0 && (
        <section className="app-calls-aggregates" aria-labelledby={`${kind}-call-aggregates-title`}>
          <h3 id={`${kind}-call-aggregates-title`}>Zusammengefasste Aufrufe</h3>
          <p className="app-calls-info-text">
            Aufrufe älter als 14 Tage je Anwender und Tag, vor dem Vormonat je Anwender und Monat,
            aus früheren Jahren je Anwender und Jahr. Gäste sind je Zeitraum zusammengefasst.
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
            {filterActive && aggregates.length !== allAggregates.length ? ' (gefiltert)' : ''}
          </div>
        </section>
      )}
    </>
  );
}

export default CallLogPanel;

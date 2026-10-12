import React, { useEffect, useMemo, useState } from 'react';
import { getKalibrierungsSnapshotsOnce } from '../utils/drinkWeightsFirestore';
import { aggregateCalibration, MIN_EVENTS_FOR_TREND } from '../utils/kalibrierungsAuswertung';
import { getDrinkCategoryLabel } from '../utils/drinkCategories';

const formatLiter = (n) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 });
const formatPercent = (n) => {
  if (n === null || n === undefined) return '—';
  const pct = Math.round(n * 100);
  return `${pct > 0 ? '+' : ''}${pct} %`;
};

/**
 * Admin-Ansicht "Soll vs. Ist": zeigt pro Kategorie, wie stark der tatsaechliche
 * Verbrauch vom berechneten Bedarf abwich. Nur lesend, aendert keine Gewichte.
 */
function KalibrierungsAuswertung() {
  const [snapshots, setSnapshots] = useState(null);

  useEffect(() => {
    let active = true;
    getKalibrierungsSnapshotsOnce().then((data) => {
      if (active) setSnapshots(data);
    });
    return () => { active = false; };
  }, []);

  const rows = useMemo(() => aggregateCalibration(snapshots), [snapshots]);

  if (snapshots === null) return null;

  return (
    <div className="drink-weights-calibration">
      <h3>Soll vs. Ist (Kalibrierung)</h3>
      <p className="section-description">
        Vergleicht den berechneten Bedarf (ohne Puffer) mit dem tatsächlichen Verbrauch
        abgeschlossener Events. Basis: {snapshots.length} {snapshots.length === 1 ? 'Event' : 'Events'}.
        Die Werte sind erst ab {MIN_EVENTS_FOR_TREND} Events je Kategorie aussagekräftig und
        ändern keine Gewichte.
      </p>
      {rows.length === 0 ? (
        <p className="section-description">Noch keine auswertbaren Daten.</p>
      ) : (
        <div className="events-table-container">
          <table className="events-table">
            <thead>
              <tr>
                <th>Kategorie</th>
                <th className="events-table-amount">Events</th>
                <th className="events-table-amount">Soll (l)</th>
                <th className="events-table-amount">Ist (l)</th>
                <th className="events-table-amount">Abweichung</th>
                <th className="events-table-amount">Median</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.kategorie}>
                  <td>{getDrinkCategoryLabel(row.kategorie)}</td>
                  <td className="events-table-amount">{row.events}</td>
                  <td className="events-table-amount">{formatLiter(row.sollLiter)}</td>
                  <td className="events-table-amount">{formatLiter(row.istLiter)}</td>
                  <td className="events-table-amount">
                    {formatPercent(row.abweichung)}
                    {!row.belastbar && (
                      <span title={`Weniger als ${MIN_EVENTS_FOR_TREND} Events – noch nicht belastbar`}> ⚠</span>
                    )}
                  </td>
                  <td className="events-table-amount">{formatPercent(row.medianAbweichung)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default KalibrierungsAuswertung;

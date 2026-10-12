import { aggregateCalibration, MIN_EVENTS_FOR_TREND } from './kalibrierungsAuswertung';

const snap = (eventId, kategorien) => ({ eventId, kategorien });

describe('aggregateCalibration', () => {
  it('berechnet Abweichung und Median pro Kategorie', () => {
    const rows = aggregateCalibration([
      snap('a', [{ drinkKategorie: 'bier', sollLiter: 10, istLiter: 12 }]),
      snap('b', [{ drinkKategorie: 'bier', sollLiter: 10, istLiter: 8 }])
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kategorie: 'bier', events: 2, sollLiter: 20, istLiter: 20 });
    expect(rows[0].abweichung).toBeCloseTo(0);
    expect(rows[0].medianAbweichung).toBeCloseTo(0);
    expect(rows[0].belastbar).toBe(false);
  });

  it('zählt mehrere Zeilen einer Kategorie im selben Event nur einmal', () => {
    const rows = aggregateCalibration([
      snap('a', [
        { drinkKategorie: 'wein', sollLiter: 3, istLiter: 3 },
        { drinkKategorie: 'wein', sollLiter: 3, istLiter: 6 }
      ])
    ]);
    expect(rows[0].events).toBe(1);
    expect(rows[0].abweichung).toBeCloseTo(0.5);
  });

  it('ignoriert Zeilen ohne gültigen Soll/Ist-Wert und fällt auf rowKategorie zurück', () => {
    const rows = aggregateCalibration([
      snap('a', [
        { drinkKategorie: 'bier', sollLiter: null, istLiter: 5 },
        { drinkKategorie: 'sekt', sollLiter: 2, istLiter: null },
        { rowKategorie: 'saft', sollLiter: 2, istLiter: 0 }
      ])
    ]);
    expect(rows.map((r) => r.kategorie)).toEqual(['saft']);
    expect(rows[0].abweichung).toBeCloseTo(-1);
  });

  it('markiert Kategorien ab MIN_EVENTS_FOR_TREND als belastbar', () => {
    const snapshots = Array.from({ length: MIN_EVENTS_FOR_TREND }, (_, i) =>
      snap(`e${i}`, [{ drinkKategorie: 'bier', sollLiter: 10, istLiter: 11 }]));
    expect(aggregateCalibration(snapshots)[0].belastbar).toBe(true);
  });

  it('liefert [] bei leerer Eingabe', () => {
    expect(aggregateCalibration(null)).toEqual([]);
  });
});

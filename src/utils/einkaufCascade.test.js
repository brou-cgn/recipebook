import { calculateCascadingEinkauf } from './einkaufCascade';

describe('calculateCascadingEinkauf', () => {
  it('kaskadiert Fass (groß, kein Gebinde) und Flasche (klein, mit Gebinde Kasten)', () => {
    const units = [
      { key: 'fass', einheitsgroesseLiter: 50, gebindeGroesseLiter: null },
      { key: 'flasche', einheitsgroesseLiter: 0.33, gebindeGroesseLiter: 24 * 0.33 },
    ];
    const { values, warnings } = calculateCascadingEinkauf(units, 62.7);
    expect(values.fass).toBe(1);
    expect(values.flasche).toBeCloseTo(1.75, 6);
    expect(warnings).toHaveLength(0);
  });

  it('rundet 2,4 auf 2,5 und 2,8 auf 3,0', () => {
    const units = [{ key: 'flasche', einheitsgroesseLiter: 0.33, gebindeGroesseLiter: 1 }];
    expect(calculateCascadingEinkauf(units, 2.4).values.flasche).toBeCloseTo(2.5, 6);
    expect(calculateCascadingEinkauf(units, 2.8).values.flasche).toBeCloseTo(3.0, 6);
  });

  it('funktioniert mit nur einer Einheit (kein Fass, nur Flasche)', () => {
    const units = [{ key: 'flasche', einheitsgroesseLiter: 0.33, gebindeGroesseLiter: 7.92 }];
    const { values, warnings } = calculateCascadingEinkauf(units, 12.7);
    expect(values.flasche).toBeCloseTo(1.75, 6);
    expect(warnings).toHaveLength(0);
  });

  it('lässt das Feld leer und warnt, wenn eine große Einheit keine Größe hat', () => {
    const units = [
      { key: 'fass', einheitsgroesseLiter: 0, gebindeGroesseLiter: null },
      { key: 'flasche', einheitsgroesseLiter: 0.33, gebindeGroesseLiter: 7.92 },
    ];
    const { values, warnings } = calculateCascadingEinkauf(units, 62.7);
    expect(values.fass).toBeNull();
    // Fass entfällt komplett, voller Bedarf (62.7) geht auf die Flasche: 62.7 / 7.92 = 7.9166... -> Stufe 1 -> 8.0
    expect(values.flasche).toBeCloseTo(8.0, 6);
    expect(warnings.length).toBe(1);
  });

  it('lässt eine mittlere Einheit ohne gültige Größe aus, ohne die übrigen Einheiten zu stören', () => {
    const units = [
      { key: 'fass', einheitsgroesseLiter: 50, gebindeGroesseLiter: null },
      { key: 'mittelgebinde', einheitsgroesseLiter: 0, gebindeGroesseLiter: null },
      { key: 'flasche', einheitsgroesseLiter: 0.33, gebindeGroesseLiter: 24 * 0.33 },
    ];
    const { values, warnings } = calculateCascadingEinkauf(units, 62.7);
    expect(values.fass).toBe(1);
    expect(values.mittelgebinde).toBeNull();
    expect(values.flasche).toBeCloseTo(1.75, 6);
    expect(warnings.length).toBe(1);
  });

  it('lässt das Feld leer und warnt, wenn die einzige (kleinste) Einheit keine gültige Größe hat', () => {
    const units = [{ key: 'flasche', einheitsgroesseLiter: 0, gebindeGroesseLiter: null }];
    const { values, warnings } = calculateCascadingEinkauf(units, 62.7);
    expect(values.flasche).toBeNull();
    expect(warnings.length).toBe(1);
  });

  it('nutzt die eigene Größe als Basis und rundet ganzzahlig, wenn keine Gebindeeinheit vorhanden ist', () => {
    const units = [{ key: 'flasche', einheitsgroesseLiter: 0.33, gebindeGroesseLiter: null }];
    const { values } = calculateCascadingEinkauf(units, 0.5);
    // 0.5 / 0.33 = 1.515... -> ohne Gebindeeinheit ganzzahlig aufgerundet -> 2
    expect(values.flasche).toBe(2);
  });

  it('gibt leere values zurück, wenn keine Einheiten übergeben werden', () => {
    expect(calculateCascadingEinkauf([], 10).values).toEqual({});
    expect(calculateCascadingEinkauf(undefined, 10).values).toEqual({});
  });

  it('befuellt eine mittlere (nicht kleinste) Einheit mit eigenem Gebinde in Gebindeeinheiten, nicht in Einzel-Einheiten', () => {
    // große Flasche (0,5 l) mit Gebinde Kasten (10 l) und kleine Flasche
    // (0,33 l) mit Gebinde Kasten (7,92 l). Die große Flasche ist nicht die
    // kleinste Einheit, hat aber trotzdem ein eigenes Gebinde -- die Anzahl
    // muss in Kästen (nicht in Einzelflaschen) übergeben werden.
    const units = [
      { key: 'grosseFlasche', einheitsgroesseLiter: 0.5, gebindeGroesseLiter: 10 },
      { key: 'kleineFlasche', einheitsgroesseLiter: 0.33, gebindeGroesseLiter: 7.92 },
    ];
    const { values, warnings } = calculateCascadingEinkauf(units, 22);
    // 22 / 10 = 2,2 -> 2 ganze Kästen (nicht 44 Einzelflaschen), Rest 2 l
    expect(values.grosseFlasche).toBe(2);
    // Rest 2 l / 7,92 = 0,2525... -> naechste Stufe 1/3 -> 0,333...
    expect(values.kleineFlasche).toBeCloseTo(0.333, 3);
    expect(warnings).toHaveLength(0);
  });

  it('behandelt Bedarf 0 als 0 in allen Feldern', () => {
    const units = [
      { key: 'fass', einheitsgroesseLiter: 50, gebindeGroesseLiter: null },
      { key: 'flasche', einheitsgroesseLiter: 0.33, gebindeGroesseLiter: 7.92 },
    ];
    const { values } = calculateCascadingEinkauf(units, 0);
    expect(values.fass).toBe(0);
    expect(values.flasche).toBe(0);
  });

  it('bevorzugt ein Fass ohne Gebinde vor einem Kasten mit gleicher Basisgroesse', () => {
    // 500-ml-Flasche im 20er-Kasten (Basis 10 l) und 10-l-Faesschen ohne
    // Gebinde (Basis 10 l) sind gleich gross -- das Fass muss trotzdem
    // zuerst (per floor) ausgeschoepft werden.
    const units = [
      { key: 'kasten500', einheitsgroesseLiter: 0.5, gebindeGroesseLiter: 10 },
      { key: 'fass10', einheitsgroesseLiter: 10, gebindeGroesseLiter: null },
    ];
    const { values } = calculateCascadingEinkauf(units, 10);
    expect(values.fass10).toBe(1);
    expect(values.kasten500).toBe(0);
  });

  it('bevorzugt ein Fass sogar dann, wenn seine Basisgroesse kleiner als die eines Kastens ist', () => {
    const units = [
      { key: 'kasten500', einheitsgroesseLiter: 0.5, gebindeGroesseLiter: 10 },
      { key: 'fass5', einheitsgroesseLiter: 5, gebindeGroesseLiter: null },
    ];
    const { values } = calculateCascadingEinkauf(units, 15);
    // Fass zuerst: floor(15/5) = 3 Faesser, Rest 0 -> Kasten bekommt 0.
    expect(values.fass5).toBe(3);
    expect(values.kasten500).toBe(0);
  });
});

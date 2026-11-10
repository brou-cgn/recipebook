import { MAX_TREFFER, istGueltigeEmail, normalisiereSuche, sucheGaeste } from './wichtelGaeste';

const gast = (id, vorname, nachname, extra = {}) => ({ id, vorname, nachname, ...extra });
const GAESTE = [
  gast('g1', 'Anna', 'Muster'),
  gast('g2', 'Anna-Lena', 'Berg'),
  gast('g3', 'Ben', 'Beispiel'),
  gast('g4', 'Bernd', 'Andres'),
  gast('g5', 'Zoë', 'von Österreich'),
  gast('g6', 'Johanna', 'Groß'),
];
const namen = (treffer) => treffer.map((g) => `${g.vorname} ${g.nachname}`);

describe('normalisiereSuche', () => {
  it('ohne Groß-/Kleinschreibung, Akzente und doppelten Leerraum', () => {
    expect(normalisiereSuche('  Zoë   ÖSTERREICH ')).toBe('zoe osterreich');
    expect(normalisiereSuche('Groß')).toBe('gross');
    expect(normalisiereSuche(undefined)).toBe('');
  });
});

describe('sucheGaeste', () => {
  it('findet nichts, solange beide Felder leer sind', () => {
    expect(sucheGaeste(GAESTE, { vorname: '', nachname: ' ' })).toEqual([]);
    expect(sucheGaeste(GAESTE)).toEqual([]);
  });

  it('Vorname sucht am Anfang des Vornamens oder eines Namensteils, nicht mitten im Wort', () => {
    expect(namen(sucheGaeste(GAESTE, { vorname: 'an' }))).toEqual(['Anna Muster', 'Anna-Lena Berg']);
    expect(namen(sucheGaeste(GAESTE, { vorname: 'lena' }))).toEqual(['Anna-Lena Berg']);
    // „Johanna“ enthält „anna“, beginnt aber nicht damit; „Andres“ ist ein Nachname.
    expect(namen(sucheGaeste(GAESTE, { vorname: 'anna' }))).toEqual(['Anna Muster', 'Anna-Lena Berg']);
  });

  it('Nachname sucht im Nachnamen, beide Felder zusammen müssen passen', () => {
    expect(namen(sucheGaeste(GAESTE, { nachname: 'b' }))).toEqual(['Anna-Lena Berg', 'Ben Beispiel']);
    expect(namen(sucheGaeste(GAESTE, { vorname: 'b', nachname: 'b' }))).toEqual(['Ben Beispiel']);
    expect(namen(sucheGaeste(GAESTE, { vorname: 'anna', nachname: 'x' }))).toEqual([]);
  });

  it('ohne Akzente und mit Namensteilen wie „von“', () => {
    expect(namen(sucheGaeste(GAESTE, { vorname: 'zoe' }))).toEqual(['Zoë von Österreich']);
    expect(namen(sucheGaeste(GAESTE, { nachname: 'oster' }))).toEqual(['Zoë von Österreich']);
    // ß und ss gelten als gleich
    expect(namen(sucheGaeste(GAESTE, { nachname: 'GROSS' }))).toEqual(['Johanna Groß']);
    expect(namen(sucheGaeste(GAESTE, { nachname: 'groß' }))).toEqual(['Johanna Groß']);
  });

  it('der ganze Name im Vornamenfeld findet den Gast ebenfalls', () => {
    expect(namen(sucheGaeste(GAESTE, { vorname: 'Anna Mu' }))).toEqual(['Anna Muster']);
  });

  it('höchstens MAX_TREFFER, nach Namen sortiert; verträgt unvollständige Einträge', () => {
    const viele = Array.from({ length: 12 }, (_, i) => gast(`v${i}`, `Anna ${String.fromCharCode(76 - i)}`, 'X'));
    const treffer = sucheGaeste([...viele, null, { id: 'leer' }], { vorname: 'anna' });
    expect(treffer).toHaveLength(MAX_TREFFER);
    expect(namen(treffer)[0]).toBe('Anna A X');
    expect(sucheGaeste(null, { vorname: 'a' })).toEqual([]);
  });
});

describe('istGueltigeEmail', () => {
  it('nimmt an, was der Server annimmt', () => {
    ['anna@example.com', ' Anna.Muster+wichteln@example.co.uk '].forEach((email) => {
      expect(istGueltigeEmail(email)).toBe(true);
    });
    ['', 'anna', 'anna@example', 'a,b@example.com', '<anna@example.com>', 'anna @example.com', 'a"b@example.com',
      `${'x'.repeat(250)}@example.com`].forEach((email) => {
      expect(istGueltigeEmail(email)).toBe(false);
    });
  });
});

import { RANDNOTIZ, handschriftFaktor, handschriftWoerter, textHash } from './handschrift';

describe('handschriftWoerter', () => {
  test('zerlegt in Wörter, Leerraum bekommt keine Abweichung', () => {
    const woerter = handschriftWoerter('Unsere besten Momente');
    expect(woerter.map((wort) => wort.map((teil) => teil.zeichen).join(''))).toEqual(['Unsere', 'besten', 'Momente']);
  });

  // Werte aus dem Canvas-Entwurf „Randnotiz“ (Variation 7): Die App soll genau so aussehen.
  test('entspricht dem Entwurf', () => {
    const zeichen = handschriftWoerter('Unsere besten Momente').flat();
    expect(zeichen).toHaveLength(19);
    expect(zeichen[0]).toEqual({ zeichen: 'U', transform: 'translateY(-0.046em) rotate(3.47deg) scale(1.013)', deckkraft: 0.85 });
    expect(zeichen[1]).toEqual({ zeichen: 'n', transform: 'translateY(-0.045em) rotate(1.73deg) scale(0.978)', deckkraft: 0.99 });
    expect(zeichen[18]).toEqual({ zeichen: 'e', transform: 'translateY(0.022em) rotate(0.27deg) scale(0.942)', deckkraft: 0.83 });
  });

  test('gleicher Text sieht immer gleich aus, anderer Text anders', () => {
    expect(handschriftWoerter('Our best moments')).toEqual(handschriftWoerter('Our best moments'));
    expect(handschriftWoerter('Nos meilleurs moments')[0]).not.toEqual(handschriftWoerter('Unsere besten Momente')[0]);
  });

  test('gleiche Buchstaben bekommen unterschiedliche Abweichungen', () => {
    const es = handschriftWoerter('Unsere besten Momente').flat().filter((teil) => teil.zeichen === 'e');
    expect(es).toHaveLength(6);
    expect(new Set(es.map((teil) => teil.transform)).size).toBe(6);
  });

  test('bleibt in den Grenzen der Randnotiz', () => {
    handschriftWoerter('Rezepte, Menüs und Abende mit Familie und Freunden').flat().forEach(({ transform, deckkraft }) => {
      const [, versatz, drehung, groesse] = transform.match(/translateY\((-?[\d.]+)em\) rotate\((-?[\d.]+)deg\) scale\(([\d.]+)\)/).map(Number);
      expect(Math.abs(versatz)).toBeLessThanOrEqual(RANDNOTIZ.versatz);
      expect(Math.abs(drehung)).toBeLessThanOrEqual(RANDNOTIZ.drehung);
      expect(Math.abs(groesse - 1)).toBeLessThanOrEqual(RANDNOTIZ.groesse);
      expect(deckkraft).toBeGreaterThanOrEqual(RANDNOTIZ.deckkraftMin);
      expect(deckkraft).toBeLessThanOrEqual(1);
    });
  });

  test('leerer oder fehlender Text ergibt nichts', () => {
    expect(handschriftWoerter('')).toEqual([]);
    expect(handschriftWoerter('   ')).toEqual([]);
    expect(handschriftWoerter(undefined)).toEqual([]);
  });

  test('Umlaute und Akzente sind ein Zeichen', () => {
    expect(handschriftWoerter('Grüße à tous').flat().map((teil) => teil.zeichen)).toEqual(['G', 'r', 'ü', 'ß', 'e', 'à', 't', 'o', 'u', 's']);
  });
});

describe('textHash', () => {
  test('ist stabil und 32 Bit ohne Vorzeichen', () => {
    expect(textHash('brouBook')).toBe(textHash('brouBook'));
    expect(textHash('brouBook')).toBeGreaterThanOrEqual(0);
    expect(textHash('brouBook')).toBeLessThan(2 ** 32);
  });
});

describe('handschriftFaktor', () => {
  test('bis 22 Zeichen volle Größe', () => {
    expect(handschriftFaktor('Unsere besten Momente')).toBe(1);
    expect(handschriftFaktor('')).toBe(1);
  });

  test('längere Texte werden kleiner', () => {
    const text = 'Rezepte, Menüs und Abende mit Familie und Freunden';
    expect(handschriftFaktor(text)).toBeCloseTo(22 / [...text].length, 3);
  });
});

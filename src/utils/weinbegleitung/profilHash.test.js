/**
 * Client und Cloud Function müssen dasselbe unter dem Gericht-Profil verstehen:
 * gleiche Wertelisten und gleicher inputHash (Muster: guestPreferences.test.js mit
 * functions/shared/sprachen.js). Weicht eins ab, hielte die App jedes Profil für
 * veraltet oder ein veraltetes für aktuell.
 */
import { webcrypto } from 'crypto';
import { TextEncoder as NodeTextEncoder } from 'util';
import {
  HASH_KENNUNG,
  weinprofilHashEingabe,
  weinprofilInputHash,
  istWeinprofilAktuell,
} from './profilHash';
import {
  SCHEMA_VERSION,
  ROLLEN,
  HAUPTKOMPONENTEN,
  ZUBEREITUNGEN,
  SAUCEN,
  KOMPONENTEN,
} from './profilSchema';
import { G5_RINDERSCHMORBRATEN } from './__fixtures__/profile';

const functionsSeite = require('../../../functions/shared/weinprofil');

const { subtle } = webcrypto;

beforeAll(() => {
  if (typeof globalThis.TextEncoder === 'undefined') globalThis.TextEncoder = NodeTextEncoder;
});

const REZEPTE = [
  {
    title: '  Rinderschmorbraten ',
    ingredients: [{ type: 'ingredient', text: '1,2 kg Rinderschulter' }, '750 ml Rotwein', { type: 'heading', text: 'Sauce' }, '', null],
    steps: ['Anbraten.', { type: 'step', text: ' Drei Stunden schmoren. ' }, { type: 'heading', text: 'Servieren' }],
    speisekategorie: ['Hauptspeisen', 'Grillrezepte'],
    kulinarik: ['Deutsche Küche'],
  },
  { title: 'Alt', ingredients: ['Mehl'], steps: ['Backen.'], speisekategorie: 'Desserts', kulinarik: 'Österreichische Küche' },
  { title: 'Leer' },
  {},
  { title: 'Umlaute & Zeichen: ÄÖÜß „Zitat“ – 3/4', ingredients: ['½ TL Salz'], steps: [], speisekategorie: [], kulinarik: [] },
];

describe('Konsistenz mit functions/shared/weinprofil.js', () => {
  it('hat dieselben Wertelisten und dieselbe Schema-Version', () => {
    expect(functionsSeite.SCHEMA_VERSION).toBe(SCHEMA_VERSION);
    expect(functionsSeite.ROLLEN).toEqual(ROLLEN);
    expect(functionsSeite.HAUPTKOMPONENTEN).toEqual(HAUPTKOMPONENTEN);
    expect(functionsSeite.ZUBEREITUNGEN).toEqual(ZUBEREITUNGEN);
    expect(functionsSeite.SAUCEN).toEqual(SAUCEN);
    expect(functionsSeite.KOMPONENTEN).toEqual(KOMPONENTEN);
    expect(functionsSeite.HASH_KENNUNG).toBe(HASH_KENNUNG);
  });

  it.each(REZEPTE.map((rezept, index) => [index, rezept]))('bildet für Rezept %i dieselbe Hash-Eingabe', (_index, rezept) => {
    expect(weinprofilHashEingabe(rezept)).toBe(functionsSeite.weinprofilHashEingabe(rezept));
  });

  it.each(REZEPTE.map((rezept, index) => [index, rezept]))('berechnet für Rezept %i denselben sha256', async (_index, rezept) => {
    await expect(weinprofilInputHash(rezept, { subtle })).resolves.toBe(functionsSeite.weinprofilInputHash(rezept));
  });
});

describe('Hash-Eingabe', () => {
  it('ignoriert die Reihenfolge von Speisekategorie und Kulinarik', () => {
    const a = { title: 'X', speisekategorie: ['B', 'A'], kulinarik: ['Z', 'Y'] };
    const b = { title: 'X', speisekategorie: ['A', 'B'], kulinarik: ['Y', 'Z'] };
    expect(weinprofilHashEingabe(a)).toBe(weinprofilHashEingabe(b));
  });

  it('ändert sich mit Titel, Zutaten und Schritten', () => {
    const basis = REZEPTE[0];
    const eingabe = weinprofilHashEingabe(basis);
    expect(weinprofilHashEingabe({ ...basis, title: 'Anders' })).not.toBe(eingabe);
    expect(weinprofilHashEingabe({ ...basis, ingredients: ['500 g Rinderschulter'] })).not.toBe(eingabe);
    expect(weinprofilHashEingabe({ ...basis, steps: ['Grillen.'] })).not.toBe(eingabe);
  });

  it('ändert sich nicht durch Felder außerhalb des Inhalts', () => {
    const basis = REZEPTE[0];
    expect(weinprofilHashEingabe({ ...basis, shareId: 'abc', updatedAt: 5, portionen: 6, ratingAvg: 4 }))
      .toBe(weinprofilHashEingabe(basis));
  });
});

describe('istWeinprofilAktuell', () => {
  const rezept = REZEPTE[0];

  it('ist wahr für ein gültiges Profil zum aktuellen Inhalt', async () => {
    const inputHash = await weinprofilInputHash(rezept, { subtle });
    const weinprofil = { ...G5_RINDERSCHMORBRATEN, inputHash, schemaVersion: SCHEMA_VERSION };
    await expect(istWeinprofilAktuell({ ...rezept, weinprofil }, { subtle })).resolves.toBe(true);
  });

  it('ist falsch nach einer Änderung am Rezept', async () => {
    const inputHash = await weinprofilInputHash(rezept, { subtle });
    const weinprofil = { ...G5_RINDERSCHMORBRATEN, inputHash, schemaVersion: SCHEMA_VERSION };
    await expect(istWeinprofilAktuell({ ...rezept, title: 'Neu', weinprofil }, { subtle })).resolves.toBe(false);
  });

  it('ist falsch ohne Profil, bei anderer Schema-Version oder ungültigem Profil', async () => {
    const inputHash = await weinprofilInputHash(rezept, { subtle });
    await expect(istWeinprofilAktuell(rezept, { subtle })).resolves.toBe(false);
    await expect(istWeinprofilAktuell({ ...rezept, weinprofil: { ...G5_RINDERSCHMORBRATEN, inputHash, schemaVersion: 2 } }, { subtle }))
      .resolves.toBe(false);
    await expect(istWeinprofilAktuell({ ...rezept, weinprofil: { ...G5_RINDERSCHMORBRATEN, intensitaet: 0, inputHash, schemaVersion: 1 } }, { subtle }))
      .resolves.toBe(false);
  });

  it('meldet fehlendes Web Crypto deutlich', async () => {
    await expect(weinprofilInputHash(rezept, { subtle: undefined })).rejects.toThrow('SHA-256');
  });
});

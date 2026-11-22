/**
 * Client und Cloud Function müssen denselben quellHash bilden (Muster: profilHash.test.js der
 * Weinbegleitung). Weicht er ab, hielte die App jede Übersetzung für veraltet.
 */
import { webcrypto } from 'crypto';
import { TextEncoder as NodeTextEncoder } from 'util';
import {
  HASH_KENNUNG,
  SCHEMA_VERSION,
  anzeigbareUebersetzung,
  inhaltHashEingabe,
  inhaltQuellHash,
  mitUebersetztemText,
} from './rezeptInhalt';

const functionsSeite = require('../../functions/shared/inhaltUebersetzung');

const { subtle } = webcrypto;

beforeAll(() => {
  if (typeof globalThis.TextEncoder === 'undefined') globalThis.TextEncoder = NodeTextEncoder;
});

const REZEPTE = [
  {
    ingredients: [{ type: 'heading', text: 'Teig' }, '200 g Mehl', { type: 'ingredient', text: ' 1,5 l Milch ', ingredientID: 'x' }, '', null, '1 Teil #recipe:a:B'],
    steps: ['Rühren.', { type: 'heading', text: 'Backen' }, { type: 'step', text: '20 Minuten backen.' }],
  },
  { ingredients: ['Umlaute & Zeichen: ÄÖÜß „Zitat“ – 3/4'], steps: [] },
  { title: 'Nur Titel' },
  {},
];

describe('Konsistenz mit functions/shared/inhaltUebersetzung.js', () => {
  it('hat dieselbe Kennung und Schema-Version', () => {
    expect(functionsSeite.HASH_KENNUNG).toBe(HASH_KENNUNG);
    expect(functionsSeite.SCHEMA_VERSION).toBe(SCHEMA_VERSION);
  });

  it.each(REZEPTE.map((rezept, index) => [index, rezept]))('bildet für Rezept %i dieselbe Hash-Eingabe', (_index, rezept) => {
    expect(inhaltHashEingabe(rezept)).toBe(functionsSeite.inhaltHashEingabe(rezept));
  });

  it.each(REZEPTE.map((rezept, index) => [index, rezept]))('berechnet für Rezept %i denselben sha256', async (_index, rezept) => {
    await expect(inhaltQuellHash(rezept, { subtle })).resolves.toBe(functionsSeite.inhaltQuellHash(rezept));
  });
});

describe('mitUebersetztemText', () => {
  it('ersetzt nur den Text und behält die übrigen Felder', () => {
    const original = [{ type: 'heading', text: 'Teig' }, '200 g Mehl', { type: 'ingredient', text: 'Milch', ingredientID: 'x' }];
    expect(mitUebersetztemText(original, ['Dough', '200 g flour', 'milk'])).toEqual([
      { type: 'heading', text: 'Dough' }, '200 g flour', { type: 'ingredient', text: 'milk', ingredientID: 'x' },
    ]);
  });
});

describe('anzeigbareUebersetzung', () => {
  const rezept = { ingredients: ['200 g Mehl'], steps: ['Rühren.'] };
  const dokument = {
    quellHash: 'h', originalSprache: 'de', schemaVersion: SCHEMA_VERSION,
    en: { zutaten: ['200 g flour'], schritte: ['Stir.'] },
  };

  it('liefert die Übersetzung, wenn Hash, Sprache und Listen passen', () => {
    expect(anzeigbareUebersetzung(rezept, dokument, 'en', 'h')).toEqual({ zutaten: ['200 g flour'], schritte: ['Stir.'] });
  });

  it('sonst null: veraltet, Originalsprache, fehlende Sprache, falsche Länge, anderes Schema', () => {
    expect(anzeigbareUebersetzung(rezept, dokument, 'en', 'anderer')).toBeNull();
    expect(anzeigbareUebersetzung(rezept, dokument, 'de', 'h')).toBeNull();
    expect(anzeigbareUebersetzung(rezept, dokument, 'fr', 'h')).toBeNull();
    expect(anzeigbareUebersetzung({ ...rezept, steps: ['A', 'B'] }, dokument, 'en', 'h')).toBeNull();
    expect(anzeigbareUebersetzung(rezept, { ...dokument, schemaVersion: 2 }, 'en', 'h')).toBeNull();
    expect(anzeigbareUebersetzung(rezept, null, 'en', 'h')).toBeNull();
  });
});

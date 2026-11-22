import fs from 'fs';
import path from 'path';
import { createElement } from 'react';
import { erstelleT, fuelleText } from './texte';
import { SPRACH_IDS, STANDARD_SPRACHE } from './sprachen';

const NBSP = '\u00a0';
const normal = (text) => text.replace(/\s/g, ' ');
const platzhalter = (text) => new Set([...text.matchAll(/\{(\w+)\}/g)].map((treffer) => treffer[1]));
const formen = (eintrag) => (typeof eintrag === 'string' ? [eintrag] : Object.values(eintrag));

const BEISPIEL = {
  de: {
    titel: 'Rezepte',
    gruss: 'Hallo {name}!',
    portionen: { one: '{anzahl} Portion', other: '{anzahl} Portionen' },
    nurDeutsch: 'Nur hier',
  },
  en: {
    titel: 'Recipes',
    gruss: 'Hello {name}!',
    portionen: { one: '{anzahl} serving', other: '{anzahl} servings' },
  },
  fr: {
    titel: 'Recettes',
    gruss: `Bonjour {name}${NBSP}!`,
    portionen: { one: '{anzahl} portion', other: '{anzahl} portions' },
  },
};

describe('erstelleT', () => {
  it('liefert den Text der gewählten Sprache', () => {
    expect(erstelleT(BEISPIEL, 'de')('titel')).toBe('Rezepte');
    expect(erstelleT(BEISPIEL, 'en')('titel')).toBe('Recipes');
    expect(erstelleT(BEISPIEL, 'fr')('titel')).toBe('Recettes');
  });

  it('füllt Platzhalter', () => {
    expect(erstelleT(BEISPIEL, 'en')('gruss', { name: 'Anna' })).toBe('Hello Anna!');
  });

  it('fehlt ein Text in der Sprache, gilt der deutsche; fehlt er ganz, der Schlüssel', () => {
    expect(erstelleT(BEISPIEL, 'en')('nurDeutsch')).toBe('Nur hier');
    expect(erstelleT(BEISPIEL, 'fr')('gibtEsNicht')).toBe('gibtEsNicht');
  });

  it('eine unbekannte Sprache bekommt die deutschen Texte', () => {
    expect(erstelleT(BEISPIEL, 'es')('titel')).toBe('Rezepte');
    expect(erstelleT(BEISPIEL, undefined)('titel')).toBe('Rezepte');
  });

  it('wählt die Mehrzahlform nach der Sprache', () => {
    const de = erstelleT(BEISPIEL, 'de');
    const en = erstelleT(BEISPIEL, 'en');
    const fr = erstelleT(BEISPIEL, 'fr');
    expect(de('portionen', { anzahl: 1 })).toBe('1 Portion');
    expect(de('portionen', { anzahl: 0 })).toBe('0 Portionen');
    expect(en('portionen', { anzahl: 1 })).toBe('1 serving');
    expect(en('portionen', { anzahl: 4 })).toBe('4 servings');
    // Französisch: 0 und 1 sind Einzahl
    expect(fr('portionen', { anzahl: 0 })).toBe('0 portion');
    expect(fr('portionen', { anzahl: 1 })).toBe('1 portion');
    expect(fr('portionen', { anzahl: 2 })).toBe('2 portions');
  });

  it('formatiert die Menge nach der Sprache', () => {
    expect(erstelleT(BEISPIEL, 'de')('portionen', { anzahl: 1.5 })).toBe('1,5 Portionen');
    expect(erstelleT(BEISPIEL, 'en')('portionen', { anzahl: 1.5 })).toBe('1.5 servings');
    expect(normal(erstelleT(BEISPIEL, 'fr')('portionen', { anzahl: 1200 }))).toBe('1 200 portions');
  });

  it('nimmt `other`, wenn eine Form fehlt oder keine Menge kommt', () => {
    // Französisch kennt für 1 000 000 die Form `many`
    expect(normal(erstelleT(BEISPIEL, 'fr')('portionen', { anzahl: 1000000 }))).toBe('1 000 000 portions');
    expect(erstelleT(BEISPIEL, 'de')('portionen')).toBe('{anzahl} Portionen');
  });
});

describe('fuelleText', () => {
  it('setzt Text-Werte ein und gibt einen String zurück', () => {
    expect(fuelleText('Hallo {name}!', { name: 'Anna' })).toBe('Hallo Anna!');
    expect(fuelleText('{name} hat {anzahl}', { name: 'Ben', anzahl: 3 })).toBe('Ben hat 3');
  });

  it('lässt unbekannte Platzhalter stehen und macht aus fehlenden Werten nichts', () => {
    expect(fuelleText('Für {name}', {})).toBe('Für {name}');
    expect(fuelleText('Für {name}', { name: undefined })).toBe('Für ');
  });

  it('gibt mit einem React-Element eine Liste zurück', () => {
    const fett = createElement('strong', { key: 'n' }, 'Ben');
    expect(fuelleText('Für {name}.', { name: fett })).toEqual(['Für ', fett, '.']);
  });
});

describe('Wörterbücher in src/i18n/texte/', () => {
  const ordner = path.join(__dirname, 'texte');
  const dateien = fs.readdirSync(ordner).filter((datei) => /\.js$/.test(datei) && !/\.test\.js$/.test(datei));

  it('gibt es', () => {
    expect(dateien).toContain('allgemein.js');
  });

  describe.each(dateien)('%s', (datei) => {
    const woerterbuch = require(path.join(ordner, datei)).default;
    const deutsch = woerterbuch[STANDARD_SPRACHE];

    it('hat genau die Sprachen der App', () => {
      expect(Object.keys(woerterbuch).sort()).toEqual([...SPRACH_IDS].sort());
    });

    it.each(SPRACH_IDS)('%s: dieselben Schlüssel wie Deutsch, keine leeren Texte, keine erfundenen Platzhalter', (sprache) => {
      const texte = woerterbuch[sprache];
      expect(Object.keys(texte).sort()).toEqual(Object.keys(deutsch).sort());
      Object.entries(texte).forEach(([schluessel, eintrag]) => {
        const original = deutsch[schluessel];
        if (typeof original === 'string') {
          expect({ schluessel, art: typeof eintrag }).toEqual({ schluessel, art: 'string' });
        } else {
          expect({ schluessel, formen: Object.keys(eintrag).filter((f) => f === 'one' || f === 'other').sort() })
            .toEqual({ schluessel, formen: ['one', 'other'] });
        }
        const erlaubt = new Set(formen(original).flatMap((text) => [...platzhalter(text)]));
        formen(eintrag).forEach((text) => {
          expect(text.trim()).not.toBe('');
          const erfunden = [...platzhalter(text)].filter((name) => !erlaubt.has(name));
          expect({ schluessel, erfunden }).toEqual({ schluessel, erfunden: [] });
        });
      });
    });

    it('Deutsch duzt: keine Höflichkeitsform (Sie, Ihr, Ihnen …)', () => {
      // Entscheidung 22.11.2026: Die App duzt immer. „sie“ (Mehrzahl) am Satzanfang bitte umformulieren.
      Object.entries(deutsch).forEach(([schluessel, eintrag]) => {
        formen(eintrag).forEach((text) => {
          const treffer = text.match(/\b(Sie|Ihnen|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)\b/);
          expect({ schluessel, sie: treffer ? treffer[0] : null }).toEqual({ schluessel, sie: null });
        });
      });
    });

    it('setzt im Französischen geschützte Leerzeichen vor : ? ! ; und innerhalb von « »', () => {
      Object.values(woerterbuch.fr).flatMap(formen).forEach((text) => {
        expect(text).not.toMatch(/ [:?!;»]/);
        expect(text).not.toMatch(/« /);
      });
    });
  });
});

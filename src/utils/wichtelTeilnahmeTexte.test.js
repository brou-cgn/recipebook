import { createElement } from 'react';
import {
  STANDARD_SPRACHE,
  WICHTEL_SPRACHEN,
  browserSprache,
  fuelleText,
  waehleWichtelSprache,
  wichtelFehlerSchluessel,
  wichtelTexte,
} from './wichtelTeilnahmeTexte';
import { DEFAULT_GUEST_LANGUAGE, GUEST_LANGUAGES } from './guestPreferences';

const platzhalter = (text) => new Set([...text.matchAll(/\{(\w+)\}/g)].map((treffer) => treffer[1]));
const fehler = (code) => Object.assign(new Error('Meldung des Servers'), { code });

describe('wichtelTeilnahmeTexte – Wörterbuch', () => {
  const deutsch = wichtelTexte('de');

  it('bietet Deutsch, Englisch und Französisch an, Deutsch ist Standard', () => {
    expect(WICHTEL_SPRACHEN).toEqual(['de', 'en', 'fr']);
    expect(STANDARD_SPRACHE).toBe('de');
  });

  it('deckt jede Sprache ab, die im Gästeprofil wählbar ist', () => {
    expect([...WICHTEL_SPRACHEN].sort()).toEqual(GUEST_LANGUAGES.map((sprache) => sprache.id).sort());
    expect(STANDARD_SPRACHE).toBe(DEFAULT_GUEST_LANGUAGE);
  });

  it.each(['en', 'fr'])('%s hat genau die Schlüssel des Deutschen, keiner ist leer', (sprache) => {
    const texte = wichtelTexte(sprache);
    expect(Object.keys(texte).sort()).toEqual(Object.keys(deutsch).sort());
    Object.entries(texte).forEach(([schluessel, text]) => {
      expect(typeof text).toBe('string');
      expect(text.trim()).not.toBe('');
      // Eine Übersetzung darf einen Wert weglassen, aber keinen erfinden, den die Seite nicht liefert.
      const erfunden = [...platzhalter(text)].filter((name) => !platzhalter(deutsch[schluessel]).has(name));
      expect({ schluessel, erfunden }).toEqual({ schluessel, erfunden: [] });
    });
  });

  it('setzt im Französischen geschützte Leerzeichen vor : ? ! und innerhalb von « »', () => {
    Object.values(wichtelTexte('fr')).forEach((text) => {
      expect(text).not.toMatch(/ [:?!;»]/);
      expect(text).not.toMatch(/« /);
    });
  });

  it('unbekannte Sprachen bekommen die deutschen Texte', () => {
    expect(wichtelTexte('es')).toBe(deutsch);
    expect(wichtelTexte(undefined)).toBe(deutsch);
  });
});

describe('waehleWichtelSprache', () => {
  const browser = (...languages) => ({ languages, language: languages[0] });

  it('nimmt die Sprachpräferenz aus dem Gästeprofil, auch gegen den Browser', () => {
    expect(waehleWichtelSprache('en', browser('de-DE'))).toBe('en');
    expect(waehleWichtelSprache('fr', browser('en-US'))).toBe('fr');
    expect(waehleWichtelSprache('de', browser('fr-FR'))).toBe('de');
  });

  it('eine Präferenz ohne Texte hier gilt als Deutsch, nicht als Browsersprache', () => {
    expect(waehleWichtelSprache('it', browser('fr-FR'))).toBe('de');
  });

  it('ohne Präferenz (Laden, ungültiger Link, kein verknüpftes Profil) die Browsersprache', () => {
    expect(waehleWichtelSprache(null, browser('fr-CH', 'de'))).toBe('fr');
    expect(waehleWichtelSprache(undefined, browser('es-ES', 'en-GB'))).toBe('en');
    expect(waehleWichtelSprache(null, browser('es-ES', 'it'))).toBe('de');
    expect(waehleWichtelSprache(null, {})).toBe('de');
  });

  it('browserSprache liest auch nur navigator.language', () => {
    expect(browserSprache({ language: 'EN-us' })).toBe('en');
    expect(browserSprache({ languages: [], language: 'pt-BR' })).toBeNull();
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
    const fett = createElement('strong', null, 'Ben');
    expect(fuelleText('Du beschenkst {name}. Psst.', { name: fett })).toEqual(['Du beschenkst ', fett, '. Psst.']);
    expect(fuelleText('{name}', { name: fett })).toEqual([fett]);
  });
});

describe('wichtelFehlerSchluessel', () => {
  it('übersetzt nach Code und Aktion, nicht nach der deutschen Meldung des Servers', () => {
    expect(wichtelFehlerSchluessel(fehler('functions/not-found'), 'eintragHinzufuegen')).toBe('fehlerGeaendert');
    expect(wichtelFehlerSchluessel(fehler('functions/failed-precondition'), 'ziehen')).toBe('fehlerKeinLos');
    expect(wichtelFehlerSchluessel(fehler('functions/resource-exhausted'), 'eintragHinzufuegen')).toBe('fehlerZuViele');
    expect(wichtelFehlerSchluessel(fehler('functions/invalid-argument'), 'eintragHinzufuegen')).toBe('fehlerLinkUngueltig');
  });

  it('alles andere ist der allgemeine Fehler', () => {
    expect(wichtelFehlerSchluessel(fehler('functions/unavailable'), 'laden')).toBe('fehlerAllgemein');
    expect(wichtelFehlerSchluessel(fehler('functions/failed-precondition'), 'eintragHinzufuegen')).toBe('fehlerAllgemein');
    expect(wichtelFehlerSchluessel(fehler('functions/resource-exhausted'), 'ziehen')).toBe('fehlerAllgemein');
    expect(wichtelFehlerSchluessel(fehler('functions/invalid-argument'), 'laden')).toBe('fehlerAllgemein');
    expect(wichtelFehlerSchluessel(new Error('offline'), 'ziehen')).toBe('fehlerAllgemein');
    expect(wichtelFehlerSchluessel(undefined, 'laden')).toBe('fehlerAllgemein');
  });

  it('jeder Schlüssel hat in jeder Sprache einen Text', () => {
    ['fehlerGeaendert', 'fehlerKeinLos', 'fehlerZuViele', 'fehlerAllgemein'].forEach((schluessel) => {
      WICHTEL_SPRACHEN.forEach((sprache) => expect(wichtelTexte(sprache)[schluessel]).toBeTruthy());
    });
  });
});

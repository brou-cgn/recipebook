// Mehrsprachigkeit PR 6c: Wissensbasis der Weinbegleitung auf Englisch und Französisch.
import stile from '../../data/weinbegleitung/stile.json';
import regeln from '../../data/weinbegleitung/regeln.json';
import regionen from '../../data/weinbegleitung/kulinarik.json';
import uebersetzungen from '../../data/weinbegleitung/uebersetzungen';
import { erstelleT } from '../../i18n/texte';
import weinTexte from '../../i18n/texte/wein';
import { LABEL_BASIS, LABEL_BEDINGT, LABEL_GUT, LABEL_TOP } from './konstanten';
import { beispielText, labelText, regelText, regionName, stilName } from './sprache';

const ZIELSPRACHEN = ['en', 'fr'];
// Beispiele mit deutschen Wörtern brauchen eine Übersetzung; Eigennamen bleiben
const DEUTSCH = / aus | mit | oder | von |trocken|feinherb|Champagner|Portwein|Provence-Rosé|Weißer|Österreichischer|Oloroso-Sherry/;
const alleBeispiele = () => {
  const alle = new Set();
  stile.forEach((stil) => stil.beispiele.forEach((beispiel) => alle.add(beispiel)));
  regionen.forEach((region) => Object.values(region.beispiele).forEach((liste) => liste.forEach((beispiel) => alle.add(beispiel))));
  return [...alle];
};

describe('Übersetzungen der Wissensbasis', () => {
  it.each(ZIELSPRACHEN)('%s: jeder Stil, jede Regel und jede Region, nichts darüber hinaus', (sprache) => {
    const daten = uebersetzungen[sprache];
    expect(Object.keys(daten.stile).sort()).toEqual(stile.map((stil) => stil.id).sort());
    expect(Object.keys(daten.regeln).sort()).toEqual(regeln.map((regel) => regel.id).sort());
    expect(Object.keys(daten.regionen).sort()).toEqual(regionen.map((region) => region.id).sort());
    const texte = [...Object.values(daten.stile), ...Object.values(daten.regeln), ...Object.values(daten.regionen), ...Object.values(daten.beispiele)];
    texte.forEach((text) => expect(text.trim()).not.toBe(''));
  });

  it.each(ZIELSPRACHEN)('%s: Beispiele mit deutschen Wörtern sind übersetzt, übersetzt wird nur, was es gibt', (sprache) => {
    const beispiele = alleBeispiele();
    const fehlend = beispiele.filter((beispiel) => DEUTSCH.test(beispiel) && !uebersetzungen[sprache].beispiele[beispiel]);
    expect(fehlend).toEqual([]);
    const unbekannt = Object.keys(uebersetzungen[sprache].beispiele).filter((beispiel) => !beispiele.includes(beispiel));
    expect(unbekannt).toEqual([]);
  });

  it('Französisch setzt geschützte Leerzeichen vor : ? ! ;', () => {
    const { stile: s, regeln: r, regionen: g, beispiele: b } = uebersetzungen.fr;
    [...Object.values(s), ...Object.values(r), ...Object.values(g), ...Object.values(b)].forEach((text) => {
      expect(text).not.toMatch(/ [:?!;»]/);
    });
  });
});

describe('Anzeige in der geltenden Sprache', () => {
  const stil = stile.find((eintrag) => eintrag.id === 'rot_leicht');
  const regel = regeln.find((eintrag) => eintrag.id === 'R11');
  const region = regionen.find((eintrag) => eintrag.id === 'italien');

  it('Deutsch aus der Wissensbasis, sonst die Übersetzung', () => {
    expect(stilName(stil, 'de')).toBe('Rotwein, leicht');
    expect(stilName(stil, 'en')).toBe('Red wine, light');
    expect(regelText(regel, 'fr')).toBe('Si aucun style de vin ne convient, la bière ou l’eau est un meilleur choix.');
    expect(regionName(region, 'de')).toBe('italienischen Küche');
    expect(regionName(region, 'en')).toBe('Italian cuisine');
    expect(beispielText('Chardonnay aus dem Friaul', 'fr')).toBe('Chardonnay du Frioul');
    expect(beispielText('Chianti', 'en')).toBe('Chianti');
    expect(beispielText('Chardonnay aus dem Friaul', 'de')).toBe('Chardonnay aus dem Friaul');
  });

  it('Labels der Engine', () => {
    const de = erstelleT(weinTexte, 'de');
    const en = erstelleT(weinTexte, 'en');
    expect([LABEL_TOP, LABEL_GUT, LABEL_BASIS, LABEL_BEDINGT].map((label) => labelText(label, de)))
      .toEqual([LABEL_TOP, LABEL_GUT, LABEL_BASIS, LABEL_BEDINGT]);
    expect(labelText(LABEL_BEDINGT, en)).toBe('limited match');
    expect(labelText('unbekannt', en)).toBe('unbekannt');
  });
});

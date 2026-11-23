import fs from 'fs';
import path from 'path';
import { erstelleT } from '../i18n/texte';
import eventsTexte, { BERECHNUNG_WARNUNGEN } from '../i18n/texte/events';
import getraenkeTexte from '../i18n/texte/getraenke';
import { EVENT_TYPES } from './eventsFirestore';
import { DRINK_CATEGORIES, getraenkKategorieAnzeige, getDrinkCategoryLabel } from './drinkCategories';
import { berechnungWarnungAnzeige, eventTypAnzeige } from './eventAnzeige';

const alleKategorien = DRINK_CATEGORIES.flatMap((kategorie) => [kategorie.id, ...(kategorie.subcategories || []).map((sub) => sub.id)]);

describe('Anlässe und Getränkekategorien in der geltenden Sprache (Mehrsprachigkeit PR 6j)', () => {
  it('jeder Anlass hat einen Text, Deutsch wie bisher', () => {
    const tDe = erstelleT(eventsTexte, 'de');
    const tEn = erstelleT(eventsTexte, 'en');
    expect(EVENT_TYPES.map((typ) => eventTypAnzeige(typ, tDe))).toEqual(['Familienfeier', 'Party', 'Kaffee & Kuchen', 'Grillfest', 'Sportübertragung']);
    expect(eventTypAnzeige('grillfest', tEn)).toBe('Barbecue');
    expect(eventTypAnzeige('unbekannt', tEn)).toBe('unbekannt');
  });

  it('jede Getränkekategorie hat einen Text, auf Deutsch gleich dem Label', () => {
    const tDe = erstelleT(getraenkeTexte, 'de');
    alleKategorien.forEach((id) => {
      expect(getraenkKategorieAnzeige(id, tDe)).toBe(getDrinkCategoryLabel(id));
    });
    expect(getraenkKategorieAnzeige('bier_alkoholfrei', erstelleT(getraenkeTexte, 'fr'))).toBe('Bière sans alcool');
    expect(getraenkKategorieAnzeige('eigene', erstelleT(getraenkeTexte, 'en'))).toBe('eigene');
  });
});

describe('Warnungen der Getränkeberechnung (Mehrsprachigkeit PR 6o)', () => {
  const kategorieUnbekannt = "Kategorie 'cocktails' ist unbekannt -- keine Faustwerte hinterlegt. Bitte manuell schaetzen oder in erfahrungswerte ergaenzen.";
  const getraenkFehlt = "Benutzerdefiniertes Getraenk 'abc123' nicht gefunden -- wird uebersprungen.";

  it('übersetzt die gespeicherten Warnungen mit ihren Werten, Deutsch bleibt, wie gespeichert', () => {
    const tEn = erstelleT(eventsTexte, 'en');
    const tFr = erstelleT(eventsTexte, 'fr');
    expect(berechnungWarnungAnzeige(kategorieUnbekannt, tEn))
      .toBe('Category “cocktails” is unknown – no rules of thumb are stored for it. Please estimate it yourself or add it to erfahrungswerte.');
    expect(berechnungWarnungAnzeige(getraenkFehlt, tFr))
      .toBe('Boisson personnalisée «\u00a0abc123\u00a0» introuvable – elle est ignorée.');
    expect(berechnungWarnungAnzeige(getraenkFehlt, erstelleT(eventsTexte, 'de'))).toBe(getraenkFehlt);
  });

  it('unbekannte Warnungen bleiben, wie sie sind', () => {
    expect(berechnungWarnungAnzeige('Etwas Neues', erstelleT(eventsTexte, 'en'))).toBe('Etwas Neues');
  });

  it('kennt jede Warnung so, wie die Cloud Function sie schreibt', () => {
    // Zusammengesetzte Zeichenketten ('…' + '…') im Code der Function zu einer zusammenziehen
    const quelle = fs.readFileSync(path.join(__dirname, '..', '..', 'functions', 'calculateEventDrinks.js'), 'utf8')
      .replace(/[`'"]\s*\+\s*[`'"]/g, '');
    BERECHNUNG_WARNUNGEN.forEach((schluessel) => {
      eventsTexte.de[schluessel].split(/\{\w+\}/).filter((teil) => teil.trim()).forEach((teil) => {
        expect({ schluessel, gefunden: quelle.includes(teil) }).toEqual({ schluessel, gefunden: true });
      });
    });
  });
});

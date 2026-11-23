import { erstelleT } from '../i18n/texte';
import eventsTexte from '../i18n/texte/events';
import getraenkeTexte from '../i18n/texte/getraenke';
import { EVENT_TYPES } from './eventsFirestore';
import { DRINK_CATEGORIES, getraenkKategorieAnzeige, getDrinkCategoryLabel } from './drinkCategories';
import { eventTypAnzeige } from './eventAnzeige';

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

import { TUTORIAL_CATEGORIES } from './tutorialsFirestore';
import { TUTORIAL_KATEGORIE_SCHLUESSEL, tutorialKategorieAnzeige } from './tutorialKategorien';
import { erstelleT } from '../i18n/texte';
import kochbuchTexte from '../i18n/texte/kochbuch';

jest.mock('./tutorialsFirestore', () => ({
  TUTORIAL_CATEGORIES: jest.requireActual('./tutorialsFirestore').TUTORIAL_CATEGORIES,
}));

describe('tutorialKategorieAnzeige (Mehrsprachigkeit PR 6n)', () => {
  it('hat für jede Technik-Kategorie einen Namen, auf Deutsch genau den gespeicherten', () => {
    const tDe = erstelleT(kochbuchTexte, 'de');
    TUTORIAL_CATEGORIES.forEach(({ id, label }) => {
      expect(TUTORIAL_KATEGORIE_SCHLUESSEL).toHaveProperty(id);
      expect(tutorialKategorieAnzeige(id, tDe)).toBe(label);
    });
  });

  it('übersetzt nach der id und kennt unbekannte ids nicht', () => {
    const tEn = erstelleT(kochbuchTexte, 'en');
    expect(tutorialKategorieAnzeige('schneiden', tEn)).toBe('Knife skills');
    expect(tutorialKategorieAnzeige('unbekannt', tEn)).toBeNull();
  });
});

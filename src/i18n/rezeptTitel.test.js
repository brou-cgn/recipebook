import { rezeptTitel, titelFassungen } from './rezeptTitel';

const uebersetzt = (title, extra = {}) => ({
  title,
  titelUebersetzung: {
    quelle: title, originalSprache: 'de', de: title, en: 'Grandma’s apple cake', fr: 'Gâteau aux pommes de mamie', ...extra,
  },
});

describe('rezeptTitel', () => {
  it('zeigt die Übersetzung in einer anderen Sprache als der des Originals', () => {
    expect(rezeptTitel(uebersetzt('Omas Apfelkuchen'), 'en')).toBe('Grandma’s apple cake');
    expect(rezeptTitel(uebersetzt('Omas Apfelkuchen'), 'fr')).toBe('Gâteau aux pommes de mamie');
  });

  it('in der Sprache des Originals bleibt das Original', () => {
    expect(rezeptTitel(uebersetzt('Omas Apfelkuchen'), 'de')).toBe('Omas Apfelkuchen');
    const englisch = uebersetzt('Pancakes', { originalSprache: 'en', de: 'Pfannkuchen', en: 'Pancakes' });
    expect(rezeptTitel(englisch, 'en')).toBe('Pancakes');
    expect(rezeptTitel(englisch, 'de')).toBe('Pfannkuchen');
  });

  it('eine veraltete Übersetzung (Titel inzwischen geändert) zeigt das Original', () => {
    const geaendert = { ...uebersetzt('Omas Apfelkuchen'), title: 'Omas Apfeltarte' };
    expect(rezeptTitel(geaendert, 'en')).toBe('Omas Apfeltarte');
  });

  it('ausgeschaltet, ohne Übersetzung oder mit leerer Fassung bleibt das Original', () => {
    expect(rezeptTitel(uebersetzt('Omas Apfelkuchen'), 'en', false)).toBe('Omas Apfelkuchen');
    expect(rezeptTitel({ title: 'Suppe' }, 'en')).toBe('Suppe');
    expect(rezeptTitel(uebersetzt('Suppe', { en: ' ' }), 'en')).toBe('Suppe');
    expect(rezeptTitel(null, 'en')).toBe('');
  });
});

describe('titelFassungen', () => {
  it('liefert Original und Übersetzungen ohne Doppelte', () => {
    expect(titelFassungen(uebersetzt('Omas Apfelkuchen'))).toEqual([
      'Omas Apfelkuchen', 'Grandma’s apple cake', 'Gâteau aux pommes de mamie',
    ]);
  });

  it('ausgeschaltet oder veraltet nur das Original', () => {
    expect(titelFassungen(uebersetzt('Omas Apfelkuchen'), false)).toEqual(['Omas Apfelkuchen']);
    expect(titelFassungen({ ...uebersetzt('Omas Apfelkuchen'), title: 'Neu' })).toEqual(['Neu']);
    expect(titelFassungen({})).toEqual(['']);
  });
});

import {
  UEBERSETZBARE_LISTEN,
  ZIELSPRACHEN,
  baueListenIndex,
  bereinigeUebersetzungen,
  einheitText,
  fehlendeUebersetzungen,
  kulinarikText,
  listenwertText,
  mitUebersetzung,
  quellwerte,
} from './listenwerte';

const LISTS = {
  cuisineTypes: ['Italienische Küche', 'Deutsche Küche', ''],
  cuisineGroups: [{ name: 'Europäisch', children: ['Italienische Küche'] }],
  mealCategories: ['Hauptspeisen'],
  units: ['EL', 'Pck.'],
  portionUnits: [{ id: 'portion', singular: 'Portion', plural: 'Portionen' }],
  packageUnits: [{ id: 'flasche', singular: 'Flasche', plural: 'Flaschen' }],
  drinkUnits: [],
};

const UEBERSETZUNGEN = {
  cuisineTypes: [{ wert: 'Italienische Küche', en: 'Italian cuisine', fr: 'Cuisine italienne' }],
  cuisineGroups: [{ wert: 'Europäisch', en: 'European', fr: 'Européenne' }],
  units: [{ wert: 'Pck.', en: 'pkt', fr: 'paq.' }],
  portionUnits: [{ wert: 'portion', en: { einzahl: 'serving', mehrzahl: 'servings' }, fr: { einzahl: 'portion', mehrzahl: 'portions' } }],
};

describe('listenwerte', () => {
  const index = baueListenIndex(UEBERSETZUNGEN);

  it('kennt die übersetzbaren Listen und übersetzt nach Englisch und Französisch', () => {
    expect(UEBERSETZBARE_LISTEN.map((liste) => liste.id)).toEqual(
      ['cuisineTypes', 'cuisineGroups', 'mealCategories', 'units', 'portionUnits', 'packageUnits', 'drinkUnits'],
    );
    expect(ZIELSPRACHEN).toEqual(['en', 'fr']);
  });

  it('liest die Quellwerte aus den Listen, Gruppen über ihren Namen, Einheiten über ihre id', () => {
    expect(quellwerte(LISTS, 'cuisineTypes')).toEqual([
      { wert: 'Italienische Küche', text: 'Italienische Küche' },
      { wert: 'Deutsche Küche', text: 'Deutsche Küche' },
    ]);
    expect(quellwerte(LISTS, 'cuisineGroups')).toEqual([{ wert: 'Europäisch', text: 'Europäisch' }]);
    expect(quellwerte(LISTS, 'portionUnits')).toEqual([{ wert: 'portion', einzahl: 'Portion', mehrzahl: 'Portionen' }]);
    expect(quellwerte(LISTS, 'unbekannt')).toEqual([]);
  });

  it('zeigt Übersetzungen, sonst das Original; auf Deutsch immer das Original', () => {
    expect(listenwertText(index, 'cuisineTypes', 'Italienische Küche', 'fr')).toBe('Cuisine italienne');
    expect(listenwertText(index, 'cuisineTypes', 'Deutsche Küche', 'en')).toBe('Deutsche Küche');
    expect(listenwertText(index, 'units', 'Pck.', 'en')).toBe('pkt');
    expect(listenwertText(index, 'cuisineTypes', 'Italienische Küche', 'de')).toBe('Italienische Küche');
  });

  it('Kulinarik: Gruppe vor Typ', () => {
    expect(kulinarikText(index, 'Europäisch', 'en')).toBe('European');
    expect(kulinarikText(index, 'Italienische Küche', 'en')).toBe('Italian cuisine');
  });

  it('Einheiten: Einzahl und Mehrzahl nach der Sprache, Deutsch wie bisher', () => {
    const portion = LISTS.portionUnits[0];
    expect(einheitText(index, 'portionUnits', portion, 'en', 1)).toBe('serving');
    expect(einheitText(index, 'portionUnits', portion, 'en', 4)).toBe('servings');
    // Französisch: 0 und 1 sind Einzahl
    expect(einheitText(index, 'portionUnits', portion, 'fr', 0)).toBe('portion');
    expect(einheitText(index, 'portionUnits', portion, 'fr', 2)).toBe('portions');
    expect(einheitText(index, 'portionUnits', portion, 'de', 1)).toBe('Portion');
    expect(einheitText(index, 'portionUnits', portion, 'de', 0)).toBe('Portionen');
    expect(einheitText(index, 'packageUnits', LISTS.packageUnits[0], 'en', 2)).toBe('Flaschen');
  });

  it('findet fehlende Übersetzungen über alle Listen', () => {
    const fehlend = fehlendeUebersetzungen(LISTS, UEBERSETZUNGEN).map(({ liste, wert }) => `${liste}:${wert}`);
    expect(fehlend).toEqual(['cuisineTypes:Deutsche Küche', 'mealCategories:Hauptspeisen', 'units:EL', 'packageUnits:flasche']);
  });

  it('setzt und entfernt einzelne Übersetzungen', () => {
    const mitEnglisch = mitUebersetzung(UEBERSETZUNGEN, 'cuisineTypes', 'Deutsche Küche', 'en', 'German cuisine');
    expect(listenwertText(baueListenIndex(mitEnglisch), 'cuisineTypes', 'Deutsche Küche', 'en')).toBe('German cuisine');
    const ohne = mitUebersetzung(mitEnglisch, 'cuisineTypes', 'Deutsche Küche', 'en', '  ');
    expect(ohne.cuisineTypes.find((eintrag) => eintrag.wert === 'Deutsche Küche')).toBeUndefined();
    expect(ohne.cuisineTypes).toHaveLength(1);
  });

  it('bereinigt Übersetzungen von Werten, die es nicht mehr gibt', () => {
    const alt = { ...UEBERSETZUNGEN, mealCategories: [{ wert: 'Gelöscht', en: 'Deleted', fr: 'Supprimé' }] };
    const bereinigt = bereinigeUebersetzungen(LISTS, alt);
    expect(bereinigt.mealCategories).toBeUndefined();
    expect(bereinigt.cuisineTypes).toEqual(UEBERSETZUNGEN.cuisineTypes);
  });
});

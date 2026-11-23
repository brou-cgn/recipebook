/**
 * Client und Cloud Function müssen dieselben Listenwerte für übersetzbar halten (Muster:
 * src/utils/weinbegleitung/profilHash.test.js). Die Function uebersetzeListenwerteAutomatisch
 * sucht fehlende Übersetzungen mit fehlendeListenwerte (functions/shared/listenUebersetzung.js)
 * und trägt sie mit ergaenzeListenUebersetzungen ein; die App zeigt sie über src/i18n/listenwerte.js
 * an. Wiche die Auswahl ab, fände die Function Werte nicht, die in der App fehlen, oder legte
 * Übersetzungen unter einem Wert ab, den die App nicht nachschlägt (Mehrsprachigkeit PR 6t).
 */
import {
  KI_UNGEPRUEFT,
  UEBERSETZBARE_LISTEN,
  ZIELSPRACHEN,
  baueListenIndex,
  einheitText,
  fehlendeUebersetzungen,
  listenwertText,
  quellwerte,
  ungepruefteWerte,
} from './listenwerte';

const server = require('../../functions/shared/listenUebersetzung');

const LISTS = {
  cuisineTypes: ['Italienische Küche', 'Peruanische Küche', 'Italienische Küche', '', null, '  '],
  cuisineGroups: [{ name: 'Europa', children: ['Italienische Küche'] }, { name: '' }, {}],
  mealCategories: ['Hauptspeisen', 'Desserts'],
  units: ['EL', 'Pck.'],
  portionUnits: [
    { id: 'portion', singular: 'Portion', plural: 'Portionen' },
    { id: 'tasse', singular: 'Tasse', plural: '' },
    { id: '', singular: 'ohne id' },
    { id: 'leer', singular: '' },
  ],
  packageUnits: [{ id: 'flasche', singular: 'Flasche', plural: 'Flaschen' }],
  drinkUnits: [],
  listenUebersetzungen: {
    cuisineTypes: [{ wert: 'Italienische Küche', en: 'Italian cuisine', fr: 'Cuisine italienne' }],
    mealCategories: [{ wert: 'Hauptspeisen', en: 'Main courses' }],
    portionUnits: [{ wert: 'portion', en: { einzahl: 'serving', mehrzahl: '' }, fr: { einzahl: 'portion', mehrzahl: 'portions' } }],
  },
};

describe('Listenübersetzung: Client und Function', () => {
  it('kennen dieselben Listen, Zielsprachen und dieselbe Markierung', () => {
    expect(server.TEXT_LISTEN).toEqual(UEBERSETZBARE_LISTEN.filter((liste) => liste.art === 'text').map((liste) => liste.id));
    expect(server.EINHEIT_LISTEN).toEqual(UEBERSETZBARE_LISTEN.filter((liste) => liste.art === 'einheit').map((liste) => liste.id));
    expect(server.ZIELSPRACHEN).toEqual([...ZIELSPRACHEN]);
    expect(server.KI_UNGEPRUEFT).toBe(KI_UNGEPRUEFT);
  });

  it('lesen dieselben Quellwerte aus den Listen', () => {
    UEBERSETZBARE_LISTEN.forEach(({ id }) => {
      expect(server.quellwerte(LISTS, id)).toEqual(quellwerte(LISTS, id));
    });
  });

  it('finden dieselben fehlenden Übersetzungen', () => {
    expect(server.fehlendeListenwerte(LISTS)).toEqual(fehlendeUebersetzungen(LISTS, LISTS.listenUebersetzungen));
  });

  it('was die Function einträgt, zeigt die App an und meldet es als ungeprüft', () => {
    const anfrage = server.fehlendeListenwerte(LISTS);
    const vorschlaege = anfrage.map(({ liste, wert, einzahl }) => (einzahl
      ? { liste, wert, en: { einzahl: `en ${einzahl}`, mehrzahl: `en ${einzahl}s` }, fr: { einzahl: `fr ${einzahl}`, mehrzahl: `fr ${einzahl}s` } }
      : { liste, wert, en: `en ${wert}`, fr: `fr ${wert}` }));
    const { listenUebersetzungen } = server.ergaenzeListenUebersetzungen(LISTS, anfrage, vorschlaege);

    expect(fehlendeUebersetzungen(LISTS, listenUebersetzungen)).toEqual([]);
    const index = baueListenIndex(listenUebersetzungen);
    expect(listenwertText(index, 'cuisineTypes', 'Peruanische Küche', 'fr')).toBe('fr Peruanische Küche');
    expect(listenwertText(index, 'mealCategories', 'Hauptspeisen', 'en')).toBe('Main courses');
    expect(einheitText(index, 'portionUnits', LISTS.portionUnits[0], 'en', 2)).toBe('en Portions');
    expect(einheitText(index, 'portionUnits', LISTS.portionUnits[0], 'en', 1)).toBe('serving');
    expect(einheitText(index, 'portionUnits', LISTS.portionUnits[1], 'fr', 1)).toBe('fr Tasse');
    expect(ungepruefteWerte(LISTS, listenUebersetzungen).map(({ liste, wert }) => `${liste}:${wert}`)).toEqual([
      'cuisineTypes:Peruanische Küche',
      'cuisineGroups:Europa',
      'mealCategories:Hauptspeisen',
      'mealCategories:Desserts',
      'units:EL',
      'units:Pck.',
      'portionUnits:portion',
      'portionUnits:tasse',
      'packageUnits:flasche',
    ]);
  });
});

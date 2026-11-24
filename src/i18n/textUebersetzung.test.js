/**
 * Namen und Beschreibungen von Listen, Menüs und Events in der geltenden Sprache (Mehrsprachigkeit PR 6u).
 * Die Übersetzung schreiben die Cloud Functions (functions/shared/namenUebersetzung.js); geprüft wird auch,
 * dass die App genau das Feld liest, das die Functions bauen, und dieselben Texte für aktuell hält.
 */
import { namenFassungen, uebersetzterText } from './textUebersetzung';

const server = require('../../functions/shared/namenUebersetzung');

const ERGEBNIS = {
  en: { name: 'Sunday dinner', description: 'For the family' },
  fr: { name: 'Repas du dimanche', description: 'Pour la famille' },
};

/** Ein Dokument der Art mit der Übersetzung, wie die Function sie schreibt. */
const mitUebersetzung = (art, daten, ergebnis = ERGEBNIS) => {
  const quelle = server.quelleAus(art, daten);
  const passend = quelle.description ? ergebnis : {
    en: { ...ergebnis.en, description: '' },
    fr: { ...ergebnis.fr, description: '' },
  };
  return { ...daten, textUebersetzung: server.baueNamenUebersetzung(quelle, passend, 'm', 1) };
};
const liste = (name, description) => mitUebersetzung('liste', { type: 'private', name, description });

describe('uebersetzterText', () => {
  it('zeigt Name und Beschreibung in der geltenden Sprache', () => {
    const l = liste('Sonntagsessen', 'Für die Familie');
    expect(uebersetzterText(l, 'name', 'en')).toBe('Sunday dinner');
    expect(uebersetzterText(l, 'description', 'fr')).toBe('Pour la famille');
  });

  it('bleibt beim Original auf Deutsch, ohne Berechtigung und ohne Übersetzung', () => {
    const l = liste('Sonntagsessen', 'Für die Familie');
    expect(uebersetzterText(l, 'name', 'de')).toBe('Sonntagsessen');
    expect(uebersetzterText(l, 'name', 'en', false)).toBe('Sonntagsessen');
    expect(uebersetzterText({ name: 'Neu', description: ' Text ' }, 'description', 'en')).toBe('Text');
    expect(uebersetzterText(null, 'name', 'en')).toBe('');
  });

  it('prüft jedes Feld für sich: ein geänderter Name zeigt das Original, die Beschreibung bleibt übersetzt', () => {
    const l = { ...liste('Sonntagsessen', 'Für die Familie'), name: 'Sonntagsbraten' };
    expect(uebersetzterText(l, 'name', 'en')).toBe('Sonntagsbraten');
    expect(uebersetzterText(l, 'description', 'en')).toBe('For the family');
    const ohneBeschreibung = { ...liste('Sonntagsessen', 'Für die Familie'), description: '' };
    expect(uebersetzterText(ohneBeschreibung, 'description', 'en')).toBe('');
  });

  it('Leerzeichen am Rand zählen nicht als Änderung, wie in der Function', () => {
    const l = liste(' Sonntagsessen ', 'Für die Familie\n');
    expect(server.brauchtNamenUebersetzung('liste', l)).toBe(false);
    expect(uebersetzterText(l, 'name', 'en')).toBe('Sunday dinner');
    expect(uebersetzterText(l, 'description', 'en')).toBe('For the family');
  });

  it('App und Function halten dieselben Stände für veraltet', () => {
    const l = liste('Sonntagsessen', 'Für die Familie');
    for (const geaendert of [{ ...l, name: 'Anders' }, { ...l, description: 'Anders' }]) {
      expect(server.brauchtNamenUebersetzung('liste', geaendert)).toBe(true);
      expect(uebersetzterText(geaendert, 'name', 'en') === 'Sunday dinner'
        && uebersetzterText(geaendert, 'description', 'en') === 'For the family').toBe(false);
    }
  });

  it('Menüs: Name und Beschreibung wie bei Listen', () => {
    const menue = mitUebersetzung('menue', { name: 'Sonntagsessen', description: 'Für die Familie', recipeIds: [] });
    expect(uebersetzterText(menue, 'name', 'fr')).toBe('Repas du dimanche');
    expect(uebersetzterText(menue, 'description', 'en')).toBe('For the family');
  });

  it('Events: der Name steht in eventName, eine Beschreibung gibt es nicht', () => {
    const event = mitUebersetzung('event', { eventName: 'Gartenparty' }, {
      en: { name: 'Garden party', description: '' },
      fr: { name: 'Garden-party', description: '' },
    });
    expect(event.textUebersetzung.quelle).toEqual({ name: 'Gartenparty', description: '' });
    expect(uebersetzterText(event, 'name', 'en', true, 'eventName')).toBe('Garden party');
    expect(uebersetzterText({ ...event, eventName: 'Sommerfest' }, 'name', 'en', true, 'eventName')).toBe('Sommerfest');
    expect(server.brauchtNamenUebersetzung('event', event)).toBe(false);
  });
});

describe('namenFassungen', () => {
  it('findet Original und Übersetzungen, ohne Doppelte', () => {
    expect(namenFassungen(liste('Sonntagsessen', ''))).toEqual(['Sonntagsessen', 'Sunday dinner', 'Repas du dimanche']);
    expect(namenFassungen(liste('Sonntagsessen', ''), false)).toEqual(['Sonntagsessen']);
    expect(namenFassungen({ name: 'Ohne' })).toEqual(['Ohne']);
  });
});

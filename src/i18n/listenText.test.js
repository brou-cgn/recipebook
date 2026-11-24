/**
 * Name und Beschreibung privater Listen in der geltenden Sprache (Mehrsprachigkeit PR 6u). Die Übersetzung
 * schreibt die Cloud Function (functions/shared/listenTextUebersetzung.js); geprüft wird auch, dass die App
 * genau das Feld liest, das die Function baut, und dieselben Texte für aktuell hält.
 */
import { listenNamenFassungen, listenText } from './listenText';

const server = require('../../functions/shared/listenTextUebersetzung');

const ERGEBNIS = {
  en: { name: 'Sunday dinner', description: 'For the family' },
  fr: { name: 'Repas du dimanche', description: 'Pour la famille' },
};

const liste = (name, description, weiteres = {}) => {
  const daten = { type: 'private', name, description, ...weiteres };
  const quelle = server.quelleAusListe(daten);
  return { ...daten, textUebersetzung: server.baueListenTextUebersetzung(quelle, ERGEBNIS, 'm', 1) };
};

describe('listenText', () => {
  it('zeigt Name und Beschreibung in der geltenden Sprache', () => {
    const l = liste('Sonntagsessen', 'Für die Familie');
    expect(listenText(l, 'name', 'en')).toBe('Sunday dinner');
    expect(listenText(l, 'description', 'fr')).toBe('Pour la famille');
  });

  it('bleibt beim Original auf Deutsch, ohne Berechtigung und ohne Übersetzung', () => {
    const l = liste('Sonntagsessen', 'Für die Familie');
    expect(listenText(l, 'name', 'de')).toBe('Sonntagsessen');
    expect(listenText(l, 'name', 'en', false)).toBe('Sonntagsessen');
    expect(listenText({ name: 'Neu', description: ' Text ' }, 'description', 'en')).toBe('Text');
    expect(listenText(null, 'name', 'en')).toBe('');
  });

  it('prüft jedes Feld für sich: ein geänderter Name zeigt das Original, die Beschreibung bleibt übersetzt', () => {
    const l = { ...liste('Sonntagsessen', 'Für die Familie'), name: 'Sonntagsbraten' };
    expect(listenText(l, 'name', 'en')).toBe('Sonntagsbraten');
    expect(listenText(l, 'description', 'en')).toBe('For the family');
    const ohneBeschreibung = { ...liste('Sonntagsessen', 'Für die Familie'), description: '' };
    expect(listenText(ohneBeschreibung, 'description', 'en')).toBe('');
  });

  it('Leerzeichen am Rand zählen nicht als Änderung, wie in der Function', () => {
    const l = liste(' Sonntagsessen ', 'Für die Familie\n');
    expect(server.brauchtListenTextUebersetzung(l)).toBe(false);
    expect(listenText(l, 'name', 'en')).toBe('Sunday dinner');
    expect(listenText(l, 'description', 'en')).toBe('For the family');
  });

  it('App und Function halten dieselben Stände für veraltet', () => {
    const l = liste('Sonntagsessen', 'Für die Familie');
    for (const geaendert of [{ ...l, name: 'Anders' }, { ...l, description: 'Anders' }]) {
      expect(server.brauchtListenTextUebersetzung(geaendert)).toBe(true);
      expect(listenText(geaendert, 'name', 'en') === 'Sunday dinner'
        && listenText(geaendert, 'description', 'en') === 'For the family').toBe(false);
    }
  });
});

describe('listenNamenFassungen', () => {
  it('findet Original und Übersetzungen, ohne Doppelte', () => {
    expect(listenNamenFassungen(liste('Sonntagsessen', ''))).toEqual(['Sonntagsessen', 'Sunday dinner', 'Repas du dimanche']);
    expect(listenNamenFassungen(liste('Sonntagsessen', ''), false)).toEqual(['Sonntagsessen']);
    expect(listenNamenFassungen({ name: 'Ohne' })).toEqual(['Ohne']);
  });
});

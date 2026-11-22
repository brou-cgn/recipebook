import { sloganInSprache, sloganUebersetzungenZumSpeichern, uebersetzungenPassen } from './slogan';

const standard = { slogan: 'Unsere besten Momente', uebersetzung: 'Our best moments' };

describe('sloganInSprache', () => {
  test('auf Deutsch immer das Original', () => {
    expect(sloganInSprache({ slogan: 'Kochen mit Freunden', uebersetzungen: { quelle: 'Kochen mit Freunden', en: 'Cooking with friends' }, sprache: 'de' }))
      .toBe('Kochen mit Freunden');
  });

  test('passende Übersetzung in der geltenden Sprache', () => {
    const uebersetzungen = { quelle: 'Kochen mit Freunden', en: 'Cooking with friends', fr: 'Cuisiner entre amis' };
    expect(sloganInSprache({ slogan: 'Kochen mit Freunden', uebersetzungen, sprache: 'en' })).toBe('Cooking with friends');
    expect(sloganInSprache({ slogan: 'Kochen mit Freunden', uebersetzungen, sprache: 'fr' })).toBe('Cuisiner entre amis');
  });

  test('veraltete Übersetzung (Slogan geändert) zeigt das Original', () => {
    const uebersetzungen = { quelle: 'Kochen mit Freunden', en: 'Cooking with friends' };
    expect(sloganInSprache({ slogan: 'Kochen mit der Familie', uebersetzungen, sprache: 'en' })).toBe('Kochen mit der Familie');
  });

  test('fehlt eine Sprache, gilt das Original', () => {
    const uebersetzungen = { quelle: 'Kochen mit Freunden', en: 'Cooking with friends' };
    expect(sloganInSprache({ slogan: 'Kochen mit Freunden', uebersetzungen, sprache: 'fr' })).toBe('Kochen mit Freunden');
  });

  test('der Standard-Slogan ist ohne Pflege übersetzt, eine gepflegte Übersetzung geht vor', () => {
    expect(sloganInSprache({ slogan: 'Unsere besten Momente', sprache: 'en', standard })).toBe('Our best moments');
    expect(sloganInSprache({
      slogan: 'Unsere besten Momente',
      uebersetzungen: { quelle: 'Unsere besten Momente', en: 'Our finest moments' },
      sprache: 'en',
      standard,
    })).toBe('Our finest moments');
    expect(sloganInSprache({ slogan: 'Eigener Slogan', sprache: 'en', standard })).toBe('Eigener Slogan');
  });

  test('Leerraum zählt nicht, leerer Slogan bleibt leer', () => {
    expect(sloganInSprache({ slogan: ' Kochen mit Freunden ', uebersetzungen: { quelle: 'Kochen mit Freunden', en: ' Cooking with friends ' }, sprache: 'en' }))
      .toBe('Cooking with friends');
    expect(sloganInSprache({ slogan: '', sprache: 'en', standard })).toBe('');
  });

  test('unbekannte Sprache und kaputte Daten fallen auf das Original zurück', () => {
    expect(sloganInSprache({ slogan: 'Kochen', uebersetzungen: { quelle: 'Kochen', es: 'Cocinar' }, sprache: 'es' })).toBe('Kochen');
    expect(sloganInSprache({ slogan: 'Kochen', uebersetzungen: 'kaputt', sprache: 'en' })).toBe('Kochen');
    expect(sloganInSprache({ slogan: 'Kochen', uebersetzungen: { en: 'Cooking' }, sprache: 'en' })).toBe('Kochen');
  });
});

describe('uebersetzungenPassen', () => {
  test('vergleicht die Quelle mit dem Slogan', () => {
    expect(uebersetzungenPassen({ quelle: 'A', en: 'a' }, 'A')).toBe(true);
    expect(uebersetzungenPassen({ quelle: 'A', en: 'a' }, 'B')).toBe(false);
    expect(uebersetzungenPassen(null, 'A')).toBe(false);
  });
});

describe('sloganUebersetzungenZumSpeichern', () => {
  test('trimmt und lässt leere Sprachen weg', () => {
    expect(sloganUebersetzungenZumSpeichern({ quelle: ' A ', en: ' a ', fr: '  ' })).toEqual({ quelle: 'A', en: 'a' });
  });

  test('ohne Übersetzung oder ohne Quelle null', () => {
    expect(sloganUebersetzungenZumSpeichern({ quelle: 'A', en: '', fr: '' })).toBeNull();
    expect(sloganUebersetzungenZumSpeichern({ quelle: '', en: 'a' })).toBeNull();
  });
});

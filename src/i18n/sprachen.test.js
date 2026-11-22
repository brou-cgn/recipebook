import {
  SITZUNGS_SPRACHE_KEY,
  SPRACHEN,
  SPRACH_IDS,
  STANDARD_SPRACHE,
  aktiveSprache,
  browserSprache,
  istSprache,
  leseSitzungsSprache,
  localeFuer,
  speichereSitzungsSprache,
} from './sprachen';
import { DEFAULT_GUEST_LANGUAGE, GUEST_LANGUAGES } from '../utils/guestPreferences';

function speicher(start = {}) {
  const daten = { ...start };
  return {
    daten,
    getItem: (key) => (key in daten ? daten[key] : null),
    setItem: (key, wert) => { daten[key] = String(wert); },
    removeItem: (key) => { delete daten[key]; },
  };
}

const gesperrt = {
  getItem: () => { throw new Error('SecurityError'); },
  setItem: () => { throw new Error('QuotaExceededError'); },
  removeItem: () => { throw new Error('SecurityError'); },
};

describe('Sprachen der App', () => {
  it('bietet Deutsch, Englisch und Französisch an, Deutsch ist Standard', () => {
    expect(SPRACH_IDS).toEqual(['de', 'en', 'fr']);
    expect(STANDARD_SPRACHE).toBe('de');
  });

  it('deckt sich mit den Sprachen der Gästeprofile', () => {
    expect([...SPRACH_IDS].sort()).toEqual(GUEST_LANGUAGES.map((sprache) => sprache.id).sort());
    expect(STANDARD_SPRACHE).toBe(DEFAULT_GUEST_LANGUAGE);
  });

  it('nennt jede Sprache in der eigenen Sprache', () => {
    expect(SPRACHEN.map((sprache) => sprache.name)).toEqual(['Deutsch', 'English', 'Français']);
  });

  it('liefert die Locale je Sprache, für Unbekanntes die deutsche', () => {
    expect(localeFuer('de')).toBe('de-DE');
    expect(localeFuer('en')).toBe('en-GB');
    expect(localeFuer('fr')).toBe('fr-FR');
    expect(localeFuer('es')).toBe('de-DE');
    expect(localeFuer(undefined)).toBe('de-DE');
  });

  it('erkennt nur die eigenen Sprachcodes', () => {
    expect(istSprache('en')).toBe(true);
    expect(istSprache('EN')).toBe(false);
    expect(istSprache('en-GB')).toBe(false);
    expect(istSprache('')).toBe(false);
    expect(istSprache(null)).toBe(false);
  });
});

describe('aktiveSprache', () => {
  it('Sitzung vor persönlicher Einstellung vor Deutsch', () => {
    expect(aktiveSprache({ sitzungsSprache: 'fr', profilSprache: 'en' })).toBe('fr');
    expect(aktiveSprache({ sitzungsSprache: null, profilSprache: 'en' })).toBe('en');
    expect(aktiveSprache({ sitzungsSprache: null, profilSprache: null })).toBe('de');
    expect(aktiveSprache()).toBe('de');
  });

  it('unbekannte Werte zählen wie keine Wahl', () => {
    expect(aktiveSprache({ sitzungsSprache: 'es', profilSprache: 'en' })).toBe('en');
    expect(aktiveSprache({ sitzungsSprache: undefined, profilSprache: 'it' })).toBe('de');
  });
});

describe('browserSprache', () => {
  const browser = (...languages) => ({ languages, language: languages[0] });

  it('nimmt die erste Browsersprache, die die App kennt', () => {
    expect(browserSprache(browser('fr-CH', 'de'))).toBe('fr');
    expect(browserSprache(browser('es-ES', 'en-GB'))).toBe('en');
    expect(browserSprache({ language: 'EN-us' })).toBe('en');
  });

  it('ohne passende Sprache null', () => {
    expect(browserSprache(browser('es-ES', 'it'))).toBeNull();
    expect(browserSprache({})).toBeNull();
  });
});

describe('Sitzungs-Sprache', () => {
  it('speichert, liest und hebt die Wahl wieder auf', () => {
    const s = speicher();
    speichereSitzungsSprache('en', s);
    expect(s.daten[SITZUNGS_SPRACHE_KEY]).toBe('en');
    expect(leseSitzungsSprache(s)).toBe('en');
    speichereSitzungsSprache(null, s);
    expect(SITZUNGS_SPRACHE_KEY in s.daten).toBe(false);
    expect(leseSitzungsSprache(s)).toBeNull();
  });

  it('ein ungültiger Wert hebt die Wahl auf und wird nicht gelesen', () => {
    const s = speicher({ [SITZUNGS_SPRACHE_KEY]: 'fr' });
    speichereSitzungsSprache('es', s);
    expect(SITZUNGS_SPRACHE_KEY in s.daten).toBe(false);
    expect(leseSitzungsSprache(speicher({ [SITZUNGS_SPRACHE_KEY]: 'xx' }))).toBeNull();
  });

  it('ohne oder mit gesperrtem Speicher kein Fehler', () => {
    expect(leseSitzungsSprache(null)).toBeNull();
    expect(leseSitzungsSprache(gesperrt)).toBeNull();
    expect(() => speichereSitzungsSprache('en', null)).not.toThrow();
    expect(() => speichereSitzungsSprache('en', gesperrt)).not.toThrow();
    expect(() => speichereSitzungsSprache(null, gesperrt)).not.toThrow();
  });

  it('nutzt ohne Angabe den sessionStorage', () => {
    window.sessionStorage.removeItem(SITZUNGS_SPRACHE_KEY);
    speichereSitzungsSprache('fr');
    expect(window.sessionStorage.getItem(SITZUNGS_SPRACHE_KEY)).toBe('fr');
    expect(leseSitzungsSprache()).toBe('fr');
    speichereSitzungsSprache(null);
    expect(window.sessionStorage.getItem(SITZUNGS_SPRACHE_KEY)).toBeNull();
  });
});

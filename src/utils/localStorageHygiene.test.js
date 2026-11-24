import {
  nutzungZeichen,
  raeumeFirestoreZustand,
  raeumeWegwerfSpeicher,
  darfNeuLaden,
  merkeNeuLaden,
  GROSSER_EINTRAG_ZEICHEN,
  ZIEL_NUTZUNG_ZEICHEN,
  NEULADEN_PAUSE_MS,
} from './localStorageHygiene';

const gross = (n) => 'x'.repeat(n);

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('raeumeFirestoreZustand', () => {
  test('löscht nur Schlüssel mit dem Präfix firestore_', () => {
    localStorage.setItem('firestore_targets_x', 'a');
    localStorage.setItem('darkMode', 'true');
    raeumeFirestoreZustand();
    expect(localStorage.getItem('firestore_targets_x')).toBeNull();
    expect(localStorage.getItem('darkMode')).toBe('true');
  });
});

describe('raeumeWegwerfSpeicher', () => {
  test('löscht bekannte Zwischenspeicher, lässt Einstellungen stehen', () => {
    localStorage.setItem('nutrition_calc_result_abc', 'r');
    localStorage.setItem('nutrition_reference_cache', 'r');
    localStorage.setItem('buttonIconsCache', 'r');
    localStorage.setItem('appSettingsCache', 'r');
    localStorage.setItem('tileSizePreference', 'large');
    raeumeWegwerfSpeicher();
    expect(localStorage.length).toBe(1);
    expect(localStorage.getItem('tileSizePreference')).toBe('large');
  });

  test('entfernt unbekannte große Einträge, bis die Nutzung unter dem Ziel liegt', () => {
    localStorage.setItem('unbekannt_a', gross(ZIEL_NUTZUNG_ZEICHEN));
    localStorage.setItem('unbekannt_b', gross(GROSSER_EINTRAG_ZEICHEN + 10));
    localStorage.setItem('klein', 'ok');
    raeumeWegwerfSpeicher();
    expect(localStorage.getItem('unbekannt_a')).toBeNull();
    expect(nutzungZeichen()).toBeLessThanOrEqual(ZIEL_NUTZUNG_ZEICHEN);
    expect(localStorage.getItem('klein')).toBe('ok');
  });

  test('lässt Kochsitzungen auch dann stehen, wenn sie groß sind', () => {
    localStorage.setItem('cookingSession_u1', gross(GROSSER_EINTRAG_ZEICHEN + 10));
    localStorage.setItem('unbekannt_a', gross(ZIEL_NUTZUNG_ZEICHEN + 10));
    raeumeWegwerfSpeicher();
    expect(localStorage.getItem('cookingSession_u1')).not.toBeNull();
    expect(localStorage.getItem('unbekannt_a')).toBeNull();
  });
});

describe('Neuladen-Schutz', () => {
  test('erlaubt das Neuladen zuerst, sperrt es danach für 60 s und gibt es dann wieder frei', () => {
    expect(darfNeuLaden(sessionStorage, 1000)).toBe(true);
    merkeNeuLaden(sessionStorage, 1000);
    expect(darfNeuLaden(sessionStorage, 1000 + NEULADEN_PAUSE_MS - 1)).toBe(false);
    expect(darfNeuLaden(sessionStorage, 1000 + NEULADEN_PAUSE_MS + 1)).toBe(true);
  });
});

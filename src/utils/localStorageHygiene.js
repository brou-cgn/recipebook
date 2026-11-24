// Aufräumen des localStorage, bevor Firestore daran scheitert.
//
// Firestore (Multi-Tab-Persistenz) legt Abfragezustand unter „firestore_…“ im localStorage ab. Ist
// der Speicher (rund 5 MB je Herkunft) voll, wirft das SDK einen QuotaExceededError und bricht mit
// „INTERNAL ASSERTION FAILED“ ab: Danach kommen keine Daten mehr an (Einstellungen öffnen nicht).
// Ein früherer Schutz löschte nur „firestore_…“ und lud höchstens einmal je Tab neu; füllten andere
// Einträge den Speicher, blieb die App dauerhaft defekt.

export const FIRESTORE_PRAEFIX = 'firestore_';

// Reine Zwischenspeicher: alles hier lässt sich aus Firestore neu laden.
export const WEGWERF_PRAEFIXE = [
  FIRESTORE_PRAEFIX,
  'nutrition_calc_result_',
  'nutrition_reference_cache',
  'buttonIconsCache',
  'appSettingsCache',
  'discoverTopicInfo',
];

// Ein einzelner Eintrag über dieser Größe ist ein Verdachtsfall; kleine Einträge (Einstellungen,
// Sitzungsstand) sind nie die Ursache und bleiben unangetastet.
export const GROSSER_EINTRAG_ZEICHEN = 100000;
// Laufende Kochsitzungen nie löschen, auch wenn sie groß sind.
const GESCHUETZT = /cooking/i;
export const ZIEL_NUTZUNG_ZEICHEN = 2000000;

function schluessel(storage) {
  const keys = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key) keys.push(key);
  }
  return keys;
}

export function nutzungZeichen(storage = localStorage) {
  try {
    return schluessel(storage).reduce(
      (summe, key) => summe + key.length + (storage.getItem(key)?.length || 0),
      0,
    );
  } catch {
    return 0;
  }
}

/** Stufe 1: nur Firestores eigener Zustand (nach Neustart wird er neu aufgebaut). */
export function raeumeFirestoreZustand(storage = localStorage) {
  try {
    schluessel(storage)
      .filter((key) => key.startsWith(FIRESTORE_PRAEFIX))
      .forEach((key) => storage.removeItem(key));
  } catch {
    // localStorage nicht verfügbar (privater Modus): nichts zu tun
  }
}

/**
 * Stufe 2: zusätzlich alle bekannten Zwischenspeicher. Reicht das nicht (unbekannter Verursacher),
 * fliegen die größten ungeschützten Einträge, bis die Nutzung unter dem Ziel liegt.
 */
export function raeumeWegwerfSpeicher(storage = localStorage) {
  try {
    schluessel(storage)
      .filter((key) => WEGWERF_PRAEFIXE.some((praefix) => key.startsWith(praefix)))
      .forEach((key) => storage.removeItem(key));

    if (nutzungZeichen(storage) <= ZIEL_NUTZUNG_ZEICHEN) return;

    const gross = schluessel(storage)
      .filter((key) => !GESCHUETZT.test(key))
      .map((key) => ({ key, laenge: key.length + (storage.getItem(key)?.length || 0) }))
      .filter((eintrag) => eintrag.laenge > GROSSER_EINTRAG_ZEICHEN)
      .sort((a, b) => b.laenge - a.laenge);

    for (const { key } of gross) {
      if (nutzungZeichen(storage) <= ZIEL_NUTZUNG_ZEICHEN) break;
      storage.removeItem(key);
    }
  } catch {
    // localStorage nicht verfügbar: nichts zu tun
  }
}

// Wiederherstellung nach dem Absturz: höchstens alle 60 s einmal neu laden (Schutz vor
// Neuladeschleifen), aber nicht nur einmal je Tab-Sitzung wie zuvor.
export const NEULADEN_PAUSE_MS = 60000;

export function darfNeuLaden(sessionStore = sessionStorage, jetzt = Date.now()) {
  try {
    const roh = sessionStore.getItem('firestoreQuotaRecoveryAt');
    if (roh === null) return true;
    const zuletzt = Number(roh);
    return !Number.isFinite(zuletzt) || jetzt - zuletzt > NEULADEN_PAUSE_MS;
  } catch {
    return true;
  }
}

export function merkeNeuLaden(sessionStore = sessionStorage, jetzt = Date.now()) {
  try {
    sessionStore.setItem('firestoreQuotaRecoveryAt', String(jetzt));
  } catch {
    // ignorieren
  }
}

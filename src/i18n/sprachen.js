/**
 * Sprachen der App und welche gerade gilt (Vorhaben Mehrsprachigkeit,
 * docs/vorhaben/mehrsprachigkeit.md).
 *
 * Welche Sprache gilt:
 *  1. die Sprache dieser Sitzung, wenn sie im Header gewählt wurde (sessionStorage,
 *     endet mit der Sitzung),
 *  2. sonst die Sprache aus den persönlichen Einstellungen (`users/{uid}.sprache`),
 *  3. sonst Deutsch.
 *
 * Die Browsersprache zählt in der angemeldeten App bewusst nicht: Wer bisher Deutsch sah,
 * soll nicht ungefragt eine andere Sprache bekommen. `browserSprache` steht für Seiten ohne
 * Anmeldung bereit.
 *
 * Deutsch ist die Sprache der Originale: Rezepte, Listenwerte und Texte entstehen deutsch,
 * Englisch und Französisch sind Übersetzungen.
 */

export const STANDARD_SPRACHE = 'de';

/**
 * Wählbare Sprachen. `name` steht in der eigenen Sprache, damit jede:r die eigene findet.
 * `locale` gilt für Datums- und Zahlenformate; Englisch ist britisch (Tag vor Monat).
 */
export const SPRACHEN = Object.freeze([
  Object.freeze({ id: 'de', name: 'Deutsch', locale: 'de-DE' }),
  Object.freeze({ id: 'en', name: 'English', locale: 'en-GB' }),
  Object.freeze({ id: 'fr', name: 'Français', locale: 'fr-FR' }),
]);

export const SPRACH_IDS = Object.freeze(SPRACHEN.map((sprache) => sprache.id));

/** @returns {boolean} ob `wert` eine Sprache der App ist */
export function istSprache(wert) {
  return typeof wert === 'string' && SPRACH_IDS.includes(wert);
}

/** @returns {string} Locale für Intl; eine unbekannte Sprache bekommt die deutsche */
export function localeFuer(sprache) {
  const eintrag = SPRACHEN.find((s) => s.id === sprache) || SPRACHEN.find((s) => s.id === STANDARD_SPRACHE);
  return eintrag.locale;
}

/**
 * Erste Browsersprache, die die App kennt, sonst null. Nur für Seiten ohne Anmeldung
 * gedacht (siehe oben).
 * @param {object} [nav] - navigator (Tests)
 * @returns {string|null}
 */
export function browserSprache(nav = typeof navigator === 'undefined' ? undefined : navigator) {
  const tags = [...(nav?.languages || []), nav?.language];
  for (const tag of tags) {
    const code = typeof tag === 'string' ? tag.toLowerCase().split('-')[0] : '';
    if (istSprache(code)) return code;
  }
  return null;
}

/**
 * Die geltende Sprache: Sitzung vor persönlicher Einstellung vor Deutsch.
 * Unbekannte Werte zählen wie keine Wahl.
 * @param {{sitzungsSprache?: string|null, profilSprache?: string|null}} [quellen]
 * @returns {string}
 */
export function aktiveSprache({ sitzungsSprache, profilSprache } = {}) {
  if (istSprache(sitzungsSprache)) return sitzungsSprache;
  if (istSprache(profilSprache)) return profilSprache;
  return STANDARD_SPRACHE;
}

export const SITZUNGS_SPRACHE_KEY = 'sitzungsSprache';

function standardSpeicher() {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    // Zugriff verweigert (z. B. gesperrte Website-Daten)
    return null;
  }
}

/**
 * Liest die im Header gewählte Sprache dieser Sitzung.
 * @param {Storage|null} [speicher] - ohne Angabe sessionStorage
 * @returns {string|null} null ohne Speicher, ohne Wahl oder bei ungültigem Wert
 */
export function leseSitzungsSprache(speicher = standardSpeicher()) {
  try {
    const wert = speicher?.getItem(SITZUNGS_SPRACHE_KEY);
    return istSprache(wert) ? wert : null;
  } catch {
    return null;
  }
}

/**
 * Merkt sich die Sprache dieser Sitzung; null oder ein ungültiger Wert hebt sie auf.
 * @param {string|null} sprache
 * @param {Storage|null} [speicher] - ohne Angabe sessionStorage
 */
export function speichereSitzungsSprache(sprache, speicher = standardSpeicher()) {
  try {
    if (istSprache(sprache)) speicher?.setItem(SITZUNGS_SPRACHE_KEY, sprache);
    else speicher?.removeItem(SITZUNGS_SPRACHE_KEY);
  } catch {
    // Speicher nicht verfügbar: Die Wahl gilt dann nur, solange die Seite offen ist.
  }
}

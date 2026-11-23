// Arten der Listen („Interaktive Liste“, „Klassische Sammlung“) in der geltenden Sprache (Mehrsprachigkeit
// PR 6s). Gespeichert bleibt der Wert (`listKind`, LIST_KIND_OPTIONS in src/utils/groupFirestore.js); die Texte
// stehen in src/i18n/texte/gruppen.js.
const LIST_KIND_SCHLUESSEL = { interactive: 'artInteraktiv', classic: 'artKlassisch' };

/**
 * @param {string} value - gespeicherte Art (`listKind`)
 * @param {Function} t - Übersetzungsfunktion für gruppen.js (useTexte)
 * @returns {string} Name der Art; unbekannte Werte, wie sie gespeichert sind
 */
export const listenArtText = (value, t) => (LIST_KIND_SCHLUESSEL[value] ? t(LIST_KIND_SCHLUESSEL[value]) : value);

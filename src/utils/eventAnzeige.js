// Anlass eines Events in der geltenden Sprache (Mehrsprachigkeit PR 6j). Gespeichert bleibt die id
// (EVENT_TYPES in eventsFirestore.js), die Texte stehen in src/i18n/texte/events.js.
const ANLASS_SCHLUESSEL = {
  familienfeier: 'anlassFamilienfeier',
  party: 'anlassParty',
  kaffeeundkuchen: 'anlassKaffeeundkuchen',
  grillfest: 'anlassGrillfest',
  sportuebertragung: 'anlassSportuebertragung',
};

/**
 * @param {string} typ - id des Anlasses
 * @param {Function} t - Übersetzungsfunktion für events.js (useTexte)
 * @returns {string} Name des Anlasses; unbekannte ids, wie sie gespeichert sind
 */
export const eventTypAnzeige = (typ, t) => (
  Object.prototype.hasOwnProperty.call(ANLASS_SCHLUESSEL, typ) ? t(ANLASS_SCHLUESSEL[typ]) : typ
);

import { findeText } from '../i18n/texte';
import eventsTexte, { BERECHNUNG_WARNUNGEN } from '../i18n/texte/events';

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

/**
 * Warnung der Getränkeberechnung in der geltenden Sprache (Mehrsprachigkeit PR 6o). Die Cloud Function
 * calculateEventDrinks speichert sie deutsch in berechnung.warnungen; bekannte Warnungen erscheinen über
 * ihren Schlüssel aus events.js, unbekannte, wie sie gespeichert sind.
 * @param {string} warnung - gespeicherter Text
 * @param {Function} t - Übersetzungsfunktion für events.js (useTexte)
 * @returns {string}
 */
export function berechnungWarnungAnzeige(warnung, t) {
  const treffer = findeText(eventsTexte, warnung, BERECHNUNG_WARNUNGEN);
  return treffer ? t(treffer.schluessel, treffer.werte) : warnung;
}

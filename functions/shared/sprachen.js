/**
 * Sprachen für Einladungen an Gäste: Feld `sprache` im Gästeprofil
 * (manageGuestProfile.js), Wichtel-Mails (wichtelMail.js).
 *
 * Dieselbe Liste steht als GUEST_LANGUAGES in src/utils/guestPreferences.js;
 * src/utils/guestPreferences.test.js prüft, dass beide übereinstimmen.
 * Profile ohne Feld – alle, die vor der Sprachwahl angelegt wurden – gelten als Deutsch.
 */

const SPRACHEN = ['de', 'en', 'fr'];
const STANDARD_SPRACHE = 'de';

/**
 * Rezepte sind immer deutsch, Englisch und Französisch nur Übersetzungen davon (Entscheidung
 * „Primärsprache“ in docs/vorhaben/mehrsprachigkeit.md). Die Übersetzung von Titel und Inhalt
 * geht deshalb immer vom Deutschen in die ZIEL_SPRACHEN.
 */
const ORIGINAL_SPRACHE = 'de';
const ZIEL_SPRACHEN = SPRACHEN.filter((sprache) => sprache !== ORIGINAL_SPRACHE);

/**
 * @param {*} wert - gespeicherter oder übergebener Wert
 * @return {string} eine der SPRACHEN, sonst Deutsch
 */
function normalisiereSprache(wert) {
  return SPRACHEN.includes(wert) ? wert : STANDARD_SPRACHE;
}

module.exports = {SPRACHEN, STANDARD_SPRACHE, ORIGINAL_SPRACHE, ZIEL_SPRACHEN, normalisiereSprache};

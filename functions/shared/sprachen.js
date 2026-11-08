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
 * @param {*} wert - gespeicherter oder übergebener Wert
 * @return {string} eine der SPRACHEN, sonst Deutsch
 */
function normalisiereSprache(wert) {
  return SPRACHEN.includes(wert) ? wert : STANDARD_SPRACHE;
}

module.exports = {SPRACHEN, STANDARD_SPRACHE, normalisiereSprache};

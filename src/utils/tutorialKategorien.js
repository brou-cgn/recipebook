/**
 * Namen der Technik-Kategorien der Tutorials (TUTORIAL_CATEGORIES in tutorialsFirestore.js) in der geltenden Sprache.
 * Gespeichert bleibt die id; die Namen stehen in src/i18n/texte/kochbuch.js (Mehrsprachigkeit PR 6d, gemeinsam
 * genutzt seit PR 6n von TutorialCard.js und TutorialForm.js).
 */
export const TUTORIAL_KATEGORIE_SCHLUESSEL = Object.freeze({
  schneiden: 'tutorialSchneiden',
  sauce: 'tutorialSauce',
  teig: 'tutorialTeig',
  garen: 'tutorialGaren',
  anrichten: 'tutorialAnrichten',
});

/**
 * @param {string} kategorieId - id aus TUTORIAL_CATEGORIES
 * @param {Function} t - Übersetzungsfunktion für kochbuch.js
 * @returns {string|null} Name in der geltenden Sprache, null für eine unbekannte id
 */
export function tutorialKategorieAnzeige(kategorieId, t) {
  const schluessel = TUTORIAL_KATEGORIE_SCHLUESSEL[kategorieId];
  return schluessel ? t(schluessel) : null;
}

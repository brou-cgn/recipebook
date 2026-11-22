/**
 * Texte des Kochtagebuchs (src/components/CookDateModal.js, aus der Rezeptansicht).
 * Vorhaben Mehrsprachigkeit, PR 6a. Aufbau und Regeln: src/i18n/texte.js.
 */
// Geschütztes Leerzeichen: im Französischen vor : ? ! ; und innerhalb von « ».
const NBSP = '\u00a0';

export default {
  de: {
    kochtagebuch: 'Kochtagebuch',
    wannGekocht: 'Wann hast du dieses Rezept gekocht?',
    rezept: 'Rezept',
    gekochtAm: 'Gekocht am',
    eintragLoeschenAria: 'Gekocht am-Eintrag löschen',
    // Name eines Eintrags für „… entfernen“ (DeleteRowButton) und „„…“ entfernt“ (Rückgängig)
    eintragVom: 'Eintrag vom {datum}',
    erstelltAm: 'Erstellt am',
    unbekannt: 'Unbekannter Benutzer',
  },
  en: {
    kochtagebuch: 'Cooking diary',
    wannGekocht: 'When did you cook this recipe?',
    rezept: 'Recipe',
    gekochtAm: 'Cooked on',
    eintragLoeschenAria: 'Delete “cooked on” entry',
    eintragVom: 'Entry from {datum}',
    erstelltAm: 'Created on',
    unbekannt: 'Unknown user',
  },
  fr: {
    kochtagebuch: 'Journal de cuisine',
    wannGekocht: `Quand as-tu cuisiné cette recette${NBSP}?`,
    rezept: 'Recette',
    gekochtAm: 'Cuisinée le',
    eintragLoeschenAria: `Supprimer l’entrée «${NBSP}cuisinée le${NBSP}»`,
    eintragVom: 'Entrée du {datum}',
    erstelltAm: 'Créée le',
    unbekannt: 'Utilisateur inconnu',
  },
};

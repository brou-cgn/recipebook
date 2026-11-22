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
    eintragLoeschen: 'Eintrag löschen',
    eintragLoeschenAria: 'Gekocht am-Eintrag löschen',
    erstelltAm: 'Erstellt am',
    unbekannt: 'Unbekannter Benutzer',
  },
  en: {
    kochtagebuch: 'Cooking diary',
    wannGekocht: 'When did you cook this recipe?',
    rezept: 'Recipe',
    gekochtAm: 'Cooked on',
    eintragLoeschen: 'Delete entry',
    eintragLoeschenAria: 'Delete “cooked on” entry',
    erstelltAm: 'Created on',
    unbekannt: 'Unknown user',
  },
  fr: {
    kochtagebuch: 'Journal de cuisine',
    wannGekocht: `Quand as-tu cuisiné cette recette${NBSP}?`,
    rezept: 'Recette',
    gekochtAm: 'Cuisinée le',
    eintragLoeschen: 'Supprimer l’entrée',
    eintragLoeschenAria: `Supprimer l’entrée «${NBSP}cuisinée le${NBSP}»`,
    erstelltAm: 'Créée le',
    unbekannt: 'Utilisateur inconnu',
  },
};

/**
 * Texte rund um Getränke. Bisher die Namen der Getränkekategorien (Mehrsprachigkeit PR 6j, angezeigt über
 * getraenkKategorieAnzeige in src/utils/drinkCategories.js; gespeichert wird die id). Getränkeverwaltung,
 * Verbrauch und Getränkewahl eines Events folgen mit PR 6k. Aufbau und Regeln: src/i18n/texte.js.
 *
 * Namen vordefinierter Getränke (PREDEFINED_DRINKS) und eigene Getränke sind gespeicherte Daten bzw. Inhalt.
 */

export default {
  de: {
    // Getränkekategorien nach id (DRINK_CATEGORIES in src/utils/drinkCategories.js): kategorie_<id>
    kategorie_wasser: 'Wasser',
    kategorie_softdrinks: 'Softdrinks',
    kategorie_saft: 'Saft',
    kategorie_bier: 'Bier',
    kategorie_bier_koelsch: 'Kölsch',
    kategorie_bier_pils: 'Pils',
    kategorie_bier_weizen: 'Weizen',
    kategorie_bier_alkoholfrei: 'Alkoholfreies Bier',
    kategorie_wein: 'Wein',
    kategorie_wein_weisswein: 'Weißwein',
    kategorie_wein_rose: 'Rosé',
    kategorie_wein_rotwein: 'Rotwein',
    kategorie_sekt: 'Sekt',
    kategorie_spirituosen: 'Spirituosen',
    kategorie_longdrinks: 'Longdrinks',
    kategorie_kaffee: 'Kaffee',
    kategorie_tee: 'Tee',
  },
  en: {
    // Getränkekategorien nach id (DRINK_CATEGORIES in src/utils/drinkCategories.js): kategorie_<id>
    kategorie_wasser: 'Water',
    kategorie_softdrinks: 'Soft drinks',
    kategorie_saft: 'Juice',
    kategorie_bier: 'Beer',
    kategorie_bier_koelsch: 'Kölsch',
    kategorie_bier_pils: 'Pilsner',
    kategorie_bier_weizen: 'Wheat beer',
    kategorie_bier_alkoholfrei: 'Alcohol-free beer',
    kategorie_wein: 'Wine',
    kategorie_wein_weisswein: 'White wine',
    kategorie_wein_rose: 'Rosé',
    kategorie_wein_rotwein: 'Red wine',
    kategorie_sekt: 'Sparkling wine',
    kategorie_spirituosen: 'Spirits',
    kategorie_longdrinks: 'Long drinks',
    kategorie_kaffee: 'Coffee',
    kategorie_tee: 'Tea',
  },
  fr: {
    // Getränkekategorien nach id (DRINK_CATEGORIES in src/utils/drinkCategories.js): kategorie_<id>
    kategorie_wasser: 'Eau',
    kategorie_softdrinks: 'Sodas',
    kategorie_saft: 'Jus',
    kategorie_bier: 'Bière',
    kategorie_bier_koelsch: 'Kölsch',
    kategorie_bier_pils: 'Pils',
    kategorie_bier_weizen: 'Bière blanche',
    kategorie_bier_alkoholfrei: 'Bière sans alcool',
    kategorie_wein: 'Vin',
    kategorie_wein_weisswein: 'Vin blanc',
    kategorie_wein_rose: 'Rosé',
    kategorie_wein_rotwein: 'Vin rouge',
    kategorie_sekt: 'Vin mousseux',
    kategorie_spirituosen: 'Spiritueux',
    kategorie_longdrinks: 'Long drinks',
    kategorie_kaffee: 'Café',
    kategorie_tee: 'Thé',
  },
};

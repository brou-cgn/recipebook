/**
 * Texte auf dem gedruckten Rezeptblatt und in seiner Vorschau (Vorhaben Drucklayout, Stufe 2).
 *
 * Gedruckt wird bis Phase B des Vorhabens Mehrsprachigkeit immer deutsch: Das Blatt entsteht
 * außerhalb des React-Baums der App (printRunner) und holt seine Texte deshalb nicht über
 * useTexte, sondern über druckTexte(sprache) aus utils/print/printRecipe.js; ohne Angabe gilt
 * Deutsch. Phase B gibt die Sprache der App an printRecipe und PrintPage weiter.
 *
 * Wortlaut wie in der Rezeptansicht (rezeptansicht.js: von, erstelltAm, minuten, zutatenFuer).
 * `minuten`, `menge` und `stufe` kommen als fertiger Text, sie werden nicht nach der Sprache
 * formatiert.
 */
export default {
  de: {
    titelFehlt: '(kein Titel)',
    von: 'Von {name}',
    vonErstelltAm: 'Von {name} erstellt am {datum}',
    erstelltAm: 'Erstellt am {datum}',
    minuten: '{minuten} Min.',
    portionen: 'Portionen',
    schwierigkeit: 'Schwierigkeit {stufe}/5',
    zutaten: 'Zutaten',
    zutatenFuer: 'Zutaten für {menge} {einheit}',
    zubereitung: 'Zubereitung',
    // nur in der Vorschau
    keinFoto: 'Kein Foto',
    infosPlatzhalter: 'Metadaten',
    seitenumbruch: 'Seitenumbruch (ungefähr) · Seite {seite}',
    seitenzahl: { one: '{anzahl} Seite', other: '{anzahl} Seiten' },
  },
  en: {
    titelFehlt: '(no title)',
    von: 'By {name}',
    vonErstelltAm: 'By {name}, created on {datum}',
    erstelltAm: 'Created on {datum}',
    minuten: '{minuten} min',
    portionen: 'servings',
    schwierigkeit: 'Difficulty {stufe}/5',
    zutaten: 'Ingredients',
    zutatenFuer: 'Ingredients for {menge} {einheit}',
    zubereitung: 'Method',
    keinFoto: 'No photo',
    infosPlatzhalter: 'Details',
    seitenumbruch: 'Page break (approximate) · page {seite}',
    seitenzahl: { one: '{anzahl} page', other: '{anzahl} pages' },
  },
  fr: {
    titelFehlt: '(sans titre)',
    von: 'Par {name}',
    vonErstelltAm: 'Par {name}, créée le {datum}',
    erstelltAm: 'Créée le {datum}',
    minuten: '{minuten} min',
    portionen: 'portions',
    schwierigkeit: 'Difficulté {stufe}/5',
    zutaten: 'Ingrédients',
    zutatenFuer: 'Ingrédients pour {menge} {einheit}',
    zubereitung: 'Préparation',
    keinFoto: 'Pas de photo',
    infosPlatzhalter: 'Infos',
    seitenumbruch: 'Saut de page (approximatif) · page {seite}',
    seitenzahl: { one: '{anzahl} page', other: '{anzahl} pages' },
  },
};

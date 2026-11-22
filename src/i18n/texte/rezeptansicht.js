/**
 * Texte der Rezeptansicht (src/components/RecipeDetail.js), soweit sie schon umgestellt ist
 * (Vorhaben Mehrsprachigkeit; die übrige Ansicht folgt mit PR 6). Aufbau und Regeln:
 * src/i18n/texte.js.
 */
// Geschütztes Leerzeichen: im Französischen vor : ? ! ; und innerhalb von « ».
const NBSP = ' ';

export default {
  de: {
    originalTitel: 'Original: {titel}',
  },
  en: {
    originalTitel: 'Original: {titel}',
  },
  fr: {
    originalTitel: `Original${NBSP}: {titel}`,
  },
};

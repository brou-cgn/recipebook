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
    automatischUebersetzt: 'Automatisch übersetzt',
    originalAngezeigt: 'Original',
    originalAnzeigen: 'Original anzeigen',
    uebersetzungAnzeigen: 'Übersetzung anzeigen',
  },
  en: {
    originalTitel: 'Original: {titel}',
    automatischUebersetzt: 'Automatically translated',
    originalAngezeigt: 'Original',
    originalAnzeigen: 'Show original',
    uebersetzungAnzeigen: 'Show translation',
  },
  fr: {
    originalTitel: `Original${NBSP}: {titel}`,
    automatischUebersetzt: 'Traduit automatiquement',
    originalAngezeigt: 'Original',
    originalAnzeigen: 'Afficher l’original',
    uebersetzungAnzeigen: 'Afficher la traduction',
  },
};

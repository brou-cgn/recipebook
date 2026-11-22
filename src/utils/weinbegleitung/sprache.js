/**
 * Wissensbasis der Weinbegleitung in der geltenden Sprache (Vorhaben Mehrsprachigkeit, PR 6c).
 * Deutsch kommt aus der Wissensbasis (stile.json, regeln.json, kulinarik.json), Englisch und
 * Französisch aus src/data/weinbegleitung/uebersetzungen.js; fehlt dort etwas, bleibt es deutsch.
 * Reine Funktionen, ohne React.
 */
import uebersetzungen from '../../data/weinbegleitung/uebersetzungen';
import { STANDARD_SPRACHE } from '../../i18n/sprachen';
import { LABEL_BASIS, LABEL_BEDINGT, LABEL_GUT, LABEL_TOP } from './konstanten';

const fuer = (sprache) => (sprache && sprache !== STANDARD_SPRACHE ? uebersetzungen[sprache] || null : null);

/** Name eines Weinstils, z. B. „Rotwein, leicht“ / „Red wine, light“. */
export const stilName = (stil, sprache) => fuer(sprache)?.stile?.[stil?.id] || stil?.name || '';

/** Kurztext einer Regel („Warum passt das?“). */
export const regelText = (regel, sprache) => fuer(sprache)?.regeln?.[regel?.id] || regel?.kurztext || '';

/** Küche einer Region für „Beispiele passend zur …“ (Deutsch im Dativ wie in kulinarik.json). */
export const regionName = (region, sprache) => fuer(sprache)?.regionen?.[region?.id] || region?.anzeige || '';

/** Ein Rebsorten-Beispiel; Eigennamen bleiben, wie sie sind. */
export const beispielText = (beispiel, sprache) => fuer(sprache)?.beispiele?.[beispiel] || beispiel;

const LABEL_SCHLUESSEL = {
  [LABEL_TOP]: 'labelHervorragend',
  [LABEL_GUT]: 'labelGut',
  [LABEL_BASIS]: 'labelBasis',
  [LABEL_BEDINGT]: 'labelBedingt',
};

/**
 * Bewertung einer Option in der geltenden Sprache. Die Engine liefert die deutschen Labels aus
 * konstanten.js (im Menü auch gespeichert); übersetzt wird erst die Anzeige.
 * @param {string} label
 * @param {Function} t - aus src/i18n/texte/wein.js
 * @returns {string}
 */
export const labelText = (label, t) => (LABEL_SCHLUESSEL[label] ? t(LABEL_SCHLUESSEL[label]) : label || '');

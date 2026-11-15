/**
 * Rezepte, für die es nie eine Weinempfehlung gibt – unabhängig von der KI-Einschätzung.
 * Maßgeblich ist die Speisekategorie des Rezepts; die Server-Variante steht in
 * functions/shared/weinprofil.js (istOhneWein), beide müssen gleich bleiben.
 */
export const KATEGORIEN_OHNE_WEIN = ['Gebäcke & Teige'];

/**
 * @param {Object} rezept
 * @returns {boolean} true, wenn die Speisekategorie (String oder Liste) eine Kategorie ohne Wein enthält
 */
export function istOhneWein(rezept) {
  const werte = Array.isArray(rezept?.speisekategorie) ? rezept.speisekategorie : [rezept?.speisekategorie];
  return werte.some((wert) => typeof wert === 'string' && KATEGORIEN_OHNE_WEIN.includes(wert.trim()));
}

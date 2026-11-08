/**
 * Formatiert ein (Freitext-)Budget für die Anzeige als „20,00 €“.
 * Reine Zahlen (optional mit €/EUR, Komma oder Punkt als Dezimaltrenner)
 * werden auf 2 Nachkommastellen gebracht; alles andere (z. B. „ca. 20 bis 25 €“)
 * bleibt unverändert.
 */
export function formatBudget(wert) {
  const text = String(wert ?? '').trim();
  if (!text) return '';
  const match = text.match(/^(\d{1,3}(?:\.\d{3})+|\d+)(?:[,.](\d{1,2}))?\s*(?:€|eur|euro)?$/i);
  if (!match) return text;
  const ganzzahl = match[1].replace(/\./g, '');
  const zahl = Number(`${ganzzahl}.${match[2] || '0'}`);
  return `${zahl.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

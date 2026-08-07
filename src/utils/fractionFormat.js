/**
 * Formatierung und Parsing von Mengenangaben als Bruch (z.B. "1/2", "1 3/4")
 * fuer die Anzeige der "Eingekauft"-Felder.
 */

const EPSILON = 1e-6;
const DENOMINATORS = [2, 3, 4];

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * Formatiert eine Dezimalzahl als Bruch-String fuer die Anzeige.
 * Beispiele: 1.75 -> "1 3/4" | 0.5 -> "1/2" | 1.333... -> "1 1/3" | 2 -> "2"
 * Werte ohne passenden Bruch (Halbe/Drittel/Viertel) werden als deutsche
 * Dezimalzahl mit Komma dargestellt.
 * @param {number|string} value Zu formatierender Wert.
 * @return {string} Formatierter Anzeigewert.
 */
export function formatQuantityFraction(value) {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  if (num < 0) return String(value);

  const whole = Math.floor(num + EPSILON);
  const frac = num - whole;

  if (frac < EPSILON) return String(whole);

  for (const den of DENOMINATORS) {
    const numerator = Math.round(frac * den);
    if (numerator > 0 && Math.abs(frac - numerator / den) < EPSILON) {
      const divisor = gcd(numerator, den);
      const fracStr = `${numerator / divisor}/${den / divisor}`;
      return whole > 0 ? `${whole} ${fracStr}` : fracStr;
    }
  }

  return num.toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

/**
 * Parst eine per Hand eingegebene Mengenangabe (Bruch, gemischte Zahl,
 * Dezimalzahl mit Punkt oder Komma) in eine Dezimalzahl.
 * Beispiele: "1 3/4" -> 1.75 | "1/2" -> 0.5 | "2" -> 2 | "1,5" -> 1.5
 * @param {string} input Roher Eingabetext.
 * @return {number} Geparster Wert, NaN falls nicht interpretierbar.
 */
export function parseFractionQuantity(input) {
  if (input === null || input === undefined) return NaN;
  const str = String(input).trim().replace(',', '.');
  if (str === '') return NaN;

  const mixedMatch = str.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixedMatch) {
    const whole = Number(mixedMatch[1]);
    const numerator = Number(mixedMatch[2]);
    const denominator = Number(mixedMatch[3]);
    if (denominator === 0) return NaN;
    return whole + numerator / denominator;
  }

  const fracMatch = str.match(/^(\d+)\/(\d+)$/);
  if (fracMatch) {
    const numerator = Number(fracMatch[1]);
    const denominator = Number(fracMatch[2]);
    if (denominator === 0) return NaN;
    return numerator / denominator;
  }

  const num = Number(str);
  return Number.isFinite(num) ? num : NaN;
}

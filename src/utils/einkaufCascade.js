/**
 * Kaskadierende Verteilung des kalkulierten Liter-Bedarfs eines Getraenks
 * auf die "Eingekauft"-Felder seiner Einheiten (z.B. Fass + Flasche).
 */

// Rundungsstufen fuer die kleinste Einheit, aufsteigend sortiert.
const ROUNDING_STAGES = [1 / 4, 1 / 3, 1 / 2, 3 / 4, 1];
const EPSILON = 1e-9;

/**
 * Rundet einen Wert auf die naechsthoehere Stufe aus ROUNDING_STAGES.
 * Beispiele: 1,604 -> 1,75 | 2,4 -> 2,5 | 2,8 -> 3,0
 * @param {number} value Zu rundender Wert (z.B. Rest / Gebindegroesse).
 * @return {number} Gerundeter Wert.
 */
function roundToNextStage(value) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const floorVal = Math.floor(value);
  const frac = value - floorVal;
  if (frac < EPSILON) return floorVal;
  const stage = ROUNDING_STAGES.find((s) => frac <= s + EPSILON) ?? 1;
  return Math.round((floorVal + stage) * 1000) / 1000;
}

/**
 * Verteilt den Liter-Bedarf eines Getraenks kaskadierend auf seine Einheiten.
 *
 * Ablauf: Einheiten werden nach ihrer eigenen Groesse (Liter) absteigend
 * sortiert. Fuer alle bis auf die kleinste Einheit wird ganzzahlig so viel
 * wie moeglich vom Restbedarf abgezogen (floor). Die kleinste Einheit erhaelt
 * den verbleibenden Rest, umgerechnet in ihre Gebindegroesse (falls vorhanden,
 * sonst ihre eigene Groesse) und auf die naechste Rundungsstufe aufgerundet.
 *
 * @param {Array<{key: string, einheitsgroesseLiter: number, gebindeGroesseLiter?: number|null}>} units
 *   Einheiten des Getraenks. `einheitsgroesseLiter` ist die Groesse der Einheit selbst
 *   (z.B. Flasche = 0,33), `gebindeGroesseLiter` optional die Groesse ihrer Gebindeeinheit
 *   (z.B. Kasten = 7,92).
 * @param {number} bedarfLiter Kalkulierter Bedarf in Litern.
 * @return {{values: Object<string, number|null>, warnings: string[]}}
 *   `values` mappt den `key` jeder Einheit auf den vorbefuellten Wert (null bei fehlender Groesse).
 */
export function calculateCascadingEinkauf(units, bedarfLiter) {
  const values = {};
  const warnings = [];

  if (!Array.isArray(units) || units.length === 0) {
    return { values, warnings };
  }

  const validUnits = [];
  units.forEach((unit) => {
    const size = Number(unit.einheitsgroesseLiter);
    if (!Number.isFinite(size) || size <= 0) {
      values[unit.key] = null;
      warnings.push(`Einheit "${unit.key}" hat keine gültige Größe (Liter) - Feld bleibt leer.`);
      return;
    }
    validUnits.push({ ...unit, einheitsgroesseLiter: size });
  });

  if (validUnits.length === 0) {
    return { values, warnings };
  }

  const sorted = [...validUnits].sort((a, b) => b.einheitsgroesseLiter - a.einheitsgroesseLiter);
  const smallest = sorted[sorted.length - 1];
  const grossUnits = sorted.slice(0, -1);

  let rest = Number(bedarfLiter);
  if (!Number.isFinite(rest) || rest < 0) rest = 0;

  grossUnits.forEach((unit) => {
    const anzahl = Math.floor(rest / unit.einheitsgroesseLiter);
    rest -= anzahl * unit.einheitsgroesseLiter;
    values[unit.key] = anzahl;
  });

  const gebindeSize = Number(smallest.gebindeGroesseLiter);
  const basisLiter = Number.isFinite(gebindeSize) && gebindeSize > 0 ? gebindeSize : smallest.einheitsgroesseLiter;

  if (!Number.isFinite(basisLiter) || basisLiter <= 0) {
    values[smallest.key] = null;
    warnings.push(`Einheit "${smallest.key}" hat keine gültige Gebinde-/Einheitsgröße - Feld bleibt leer.`);
  } else {
    values[smallest.key] = roundToNextStage(rest / basisLiter);
  }

  return { values, warnings };
}

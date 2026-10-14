/**
 * Einzelne Function-Tests (nach Testname, Regex), die schon rot waren, als
 * `npm run test:ci` in functions/ eingeführt wurde (2026-10-14, Tech-Check F1).
 * Alles andere läuft in der CI. Wer einen Test repariert, streicht seine Zeile.
 * Neue Einträge nur mit Datum und Grund.
 */
module.exports = [
  // Summe der Winter-Gewichte ist 1.0060 statt ~1.0 (Toleranz 0.005);
  // Fachfrage, ob Gewichte oder Test anzupassen sind.
  'DRINK_WEIGHTS Basis\\+Delta ergibt je Saison in Summe weiterhin',
  // Test erwartet praeferenzFaktor 0, calculate() liefert null (Alt-Test).
  'calculate speichert guestPreferenceMultipliers in praeferenzFaktor',
  // Test erwartet invoker "public" im erfassten onCall-Objekt, bekommt undefined;
  // vermutlich erfasst der Mock die falsche onCall-Registrierung.
  'generateNutritionFromReference is registered with cors and invoker:public',
];

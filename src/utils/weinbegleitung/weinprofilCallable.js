/**
 * Aufrufe der Cloud Functions generateWeinprofile und backfillWeinprofile
 * (functions/handlers/weinbegleitung.js). Nur auf ausdrücklichen Wunsch einer Person ab
 * Rolle edit („Passenden Wein finden“, „Neu einschätzen“, „Weinbegleitung erstellen“) bzw.
 * eines Admins („Profile nachtragen“); das Anzeigen löst nie einen KI-Aufruf aus.
 */
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';

/** Höchstens so viele Rezepte je Aufruf; größere Mengen teilt der Aufrufer auf. */
export const MAX_REZEPTE_JE_AUFRUF = 20;
// 20 Rezepte brauchen bis zu fünf Gemini-Runden; die Function darf 120 s laufen. Der Standard des
// Callable-SDK (70 s) bräche sonst ab, während die Function noch erfolgreich schreibt.
const GENERIEREN_TIMEOUT_MS = 125000;

/**
 * @param {string[]} recipeIds - 1 bis MAX_REZEPTE_JE_AUFRUF Rezept-IDs
 * @returns {Promise<{profile: Object, uebersprungen: string[], fehlgeschlagen: string[], fehlerGruende: Object}>}
 */
export async function generiereWeinprofile(recipeIds) {
  const callable = httpsCallable(functions, 'generateWeinprofile', { timeout: GENERIEREN_TIMEOUT_MS });
  const ergebnis = await callable({ recipeIds });
  return ergebnis?.data || { profile: {}, uebersprungen: [], fehlgeschlagen: [], fehlerGruende: {} };
}

/** Backfill: Rezepte je Aufruf (die Function erlaubt 1 bis 40). */
export const BACKFILL_ANZAHL = 20;
// Ein Aufruf schätzt bis zu 20 Rezepte (je höchstens 30 s, vier gleichzeitig); die Function
// darf 300 s laufen. Der Standard des Callable-SDK (70 s) wäre dafür zu knapp.
const BACKFILL_TIMEOUT_MS = 310000;

/**
 * Aufruf der Cloud Function backfillWeinprofile (nur admin): die nächste Seite des
 * Rezeptbestands ab `cursor` (null = von vorn).
 * @param {{cursor?: string|null}} eingabe
 * @returns {Promise<{geprueft: number, neu: number, uebersprungen: number, fehlgeschlagen: string[],
 *   fehlerGruende: Object, naechsterCursor: string|null, fertig: boolean, tageslimitErreicht: boolean,
 *   gesamt: number|null}|null>}
 */
export async function trageWeinprofileNach({ cursor = null } = {}) {
  const callable = httpsCallable(functions, 'backfillWeinprofile', { timeout: BACKFILL_TIMEOUT_MS });
  const ergebnis = await callable({ cursor, anzahl: BACKFILL_ANZAHL });
  return ergebnis?.data || null;
}

/**
 * Aufruf der Cloud Function generateWeinprofile (functions/handlers/weinbegleitung.js).
 * Nur auf ausdrücklichen Wunsch einer Person ab Rolle edit („Passenden Wein finden“,
 * „Neu einschätzen“); das Anzeigen eines Rezepts löst nie einen KI-Aufruf aus.
 */
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';

/** Höchstens so viele Rezepte je Aufruf; größere Mengen teilt der Aufrufer auf. */
export const MAX_REZEPTE_JE_AUFRUF = 20;

/**
 * @param {string[]} recipeIds - 1 bis MAX_REZEPTE_JE_AUFRUF Rezept-IDs
 * @returns {Promise<{profile: Object, uebersprungen: string[], fehlgeschlagen: string[], fehlerGruende: Object}>}
 */
export async function generiereWeinprofile(recipeIds) {
  const callable = httpsCallable(functions, 'generateWeinprofile');
  const ergebnis = await callable({ recipeIds });
  return ergebnis?.data || { profile: {}, uebersprungen: [], fehlgeschlagen: [], fehlerGruende: {} };
}

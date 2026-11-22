/**
 * Aufruf der Cloud Function backfillTitelUebersetzungen (Vorhaben Mehrsprachigkeit, PR 3):
 * trägt Übersetzungen der Rezepttitel für den Bestand nach, eine Seite je Aufruf.
 * Nur für Admins; Antwortaufbau in functions/handlers/uebersetzung.js.
 */
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

/** Rezepte je Aufruf (die Function erlaubt 1 bis 50). */
export const TITEL_BACKFILL_ANZAHL = 25;
/** Etwas länger als das Zeitlimit der Function (300 s). */
const BACKFILL_TIMEOUT_MS = 310000;

/**
 * @param {{cursor?: string|null}} [optionen]
 * @returns {Promise<object|null>} Antwort der Function
 */
export async function trageTitelUebersetzungenNach({ cursor = null } = {}) {
  const callable = httpsCallable(functions, 'backfillTitelUebersetzungen', { timeout: BACKFILL_TIMEOUT_MS });
  const ergebnis = await callable({ cursor, anzahl: TITEL_BACKFILL_ANZAHL });
  return ergebnis?.data || null;
}

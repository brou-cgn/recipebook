/**
 * Aufrufe der Backfill-Functions der Mehrsprachigkeit (nur für Admins, eine Seite je Aufruf;
 * Antwortaufbau in functions/handlers/uebersetzung.js):
 *  - backfillTitelUebersetzungen (PR 3): Rezepttitel,
 *  - backfillInhaltUebersetzungen (PR 4): Zutaten und Schritte,
 *  - backfillListenUebersetzungen (PR 6u): Namen und Beschreibungen privater Listen,
 *  - uebersetzeListenwerte (PR 5): Vorschläge für die Auswahllisten (schreibt nichts).
 */
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

/** Rezepte bzw. Listen je Aufruf; die Functions erlauben 1 bis 50 (Titel, Listen) bzw. 1 bis 20 (Inhalt). */
export const TITEL_BACKFILL_ANZAHL = 25;
export const LISTEN_BACKFILL_ANZAHL = 25;
export const INHALT_BACKFILL_ANZAHL = 10;
/** Etwas länger als das Zeitlimit der Functions (300 s bzw. 540 s). */
const TITEL_TIMEOUT_MS = 310000;
const INHALT_TIMEOUT_MS = 550000;

/**
 * @param {{cursor?: string|null}} [optionen]
 * @returns {Promise<object|null>} Antwort der Function
 */
export async function trageTitelUebersetzungenNach({ cursor = null } = {}) {
  const callable = httpsCallable(functions, 'backfillTitelUebersetzungen', { timeout: TITEL_TIMEOUT_MS });
  const ergebnis = await callable({ cursor, anzahl: TITEL_BACKFILL_ANZAHL });
  return ergebnis?.data || null;
}

/**
 * @param {{cursor?: string|null}} [optionen]
 * @returns {Promise<object|null>} Antwort der Function
 */
export async function trageInhaltUebersetzungenNach({ cursor = null } = {}) {
  const callable = httpsCallable(functions, 'backfillInhaltUebersetzungen', { timeout: INHALT_TIMEOUT_MS });
  const ergebnis = await callable({ cursor, anzahl: INHALT_BACKFILL_ANZAHL });
  return ergebnis?.data || null;
}

/**
 * @param {{cursor?: string|null}} [optionen]
 * @returns {Promise<object|null>} Antwort der Function
 */
export async function trageListenUebersetzungenNach({ cursor = null } = {}) {
  const callable = httpsCallable(functions, 'backfillListenUebersetzungen', { timeout: TITEL_TIMEOUT_MS });
  const ergebnis = await callable({ cursor, anzahl: LISTEN_BACKFILL_ANZAHL });
  return ergebnis?.data || null;
}

/**
 * Übersetzungsvorschläge für Listenwerte (nur Admins).
 * @param {Array<object>} eintraege - [{liste, wert, text}] bzw. [{liste, wert, einzahl, mehrzahl}], höchstens 100
 * @returns {Promise<{vorschlaege: Array<object>}|null>}
 */
export async function schlageListenUebersetzungenVor(eintraege) {
  const callable = httpsCallable(functions, 'uebersetzeListenwerte', { timeout: 100000 });
  const ergebnis = await callable({ eintraege });
  return ergebnis?.data || null;
}

/**
 * Druckformate in Firestore: das Feld `printFormats` in settings/app, dazu die beiden
 * einmaligen Sicherungen `printFormatsBackup` und `printFormatsBackupFreiesLayout`.
 *
 * Das Datenmodell und die Umstellung alter Formate stehen in utils/print/printFormats.js
 * (migrateFormat läuft bei jedem Lesen, zurückgeschrieben wird nur beim Speichern). Der
 * Settings-Cache gehört customLists.js; dieses Modul trägt dort nur ein, was es selbst
 * gelesen oder geschrieben hat (updateSettingsCache).
 */
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { getSettings, updateSettingsCache } from './customLists';
import { DEFAULT_PRINT_FORMATS, migrateFormat, validatePrintFormats, PrintFormatValidationError } from './print/printFormats';
import { isFlowFormat } from './print/printTemplates';

/**
 * Get print format configurations from Firestore or return defaults.
 * @returns {Promise<Array>} Promise resolving to array of print format objects
 */
export async function getPrintFormats() {
  const settings = await getSettings();
  const stored = settings?.printFormats;
  const formats = Array.isArray(stored) && stored.length > 0 ? stored : DEFAULT_PRINT_FORMATS;
  return formats.map(migrateFormat);
}

/**
 * Loads the print formats for the settings editor straight from Firestore.
 * Unlike getPrintFormats() this bypasses the settings cache and does NOT swallow
 * errors: a failed read throws, so the editor never mistakes the built-in defaults
 * for the stored formats and overwrites them on save.
 *
 * @returns {Promise<{formats: Array, usingDefaults: boolean}>}
 */
export async function loadPrintFormatsForEditing() {
  const snap = await getDoc(doc(db, 'settings', 'app'));
  const stored = snap.exists() ? snap.data().printFormats : null;
  const usingDefaults = !Array.isArray(stored) || stored.length === 0;
  const formats = (usingDefaults ? DEFAULT_PRINT_FORMATS : stored).map(migrateFormat);
  if (!usingDefaults) updateSettingsCache({ printFormats: stored });
  return { formats, usingDefaults };
}

/**
 * Save print format configurations to Firestore.
 *
 * Validates first (throws PrintFormatValidationError). The note that marks a format as
 * converted from the free layout (`migrationNotes`) is not stored.
 *
 * Two one-time backups keep the previous stored formats, so a migration can be rolled back
 * by copying the field back to `printFormats`; an existing backup is never overwritten:
 *  - `printFormatsBackup`: before the first save of a pre-v3 configuration,
 *  - `printFormatsBackupFreiesLayout`: before the first save that replaces formats of the
 *    removed free layout (stored formats without `layoutType: 'flow'`).
 *
 * @param {Array} printFormats - Array of print format objects
 * @returns {Promise<void>}
 */
export async function savePrintFormats(printFormats) {
  const errors = validatePrintFormats(printFormats);
  if (errors.length > 0) {
    throw new PrintFormatValidationError(errors);
  }
  try {
    const settingsRef = doc(db, 'settings', 'app');
    const formats = printFormats.map(({ migrationNotes, ...format }) => format);
    const update = { printFormats: formats };

    const current = await getSettings();
    const stored = current?.printFormats;
    const hasStored = Array.isArray(stored) && stored.length > 0;
    const needsBackup = hasStored
      && stored.some((f) => (f?.layoutVersion || 1) < 3)
      && !current.printFormatsBackup;
    if (needsBackup) {
      update.printFormatsBackup = stored;
    }
    const needsFreeLayoutBackup = hasStored
      && stored.some((f) => !isFlowFormat(f))
      && !current.printFormatsBackupFreiesLayout;
    if (needsFreeLayoutBackup) {
      update.printFormatsBackupFreiesLayout = stored;
    }
    await updateDoc(settingsRef, update);

    // Auch im localStorage-Cache: Sonst druckte die App nach einem Neuladen bis zu einer
    // Stunde weiter mit dem alten Stand (der Cache der Settings lebt so lange).
    updateSettingsCache(update);
  } catch (error) {
    console.error('Error saving print formats:', error);
    throw error;
  }
}

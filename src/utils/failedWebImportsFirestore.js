/**
 * Failed Web Imports Firestore Utilities
 *
 * When a user dismisses a web import that ended up in `importStatus: 'error'`,
 * the URL and error message are logged here so app development can look into
 * what went wrong (broken parser for a given site, rate limiting, etc.).
 * This is a write-only debugging log, not user-facing data.
 *
 * Data model: failedWebImports/{id}
 *   - url:       string          – the recipe URL that failed to import
 *   - error:     string          – the error message shown to the user
 *   - title:     string          – the (fallback) recipe title/label at time of dismissal
 *   - userId:    string | null   – authorId of the user who queued/dismissed the import
 *   - createdAt: serverTimestamp
 */

import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Log a dismissed, failed web import for later developer review.
 * Never throws – logging failures must not block the dismiss action itself.
 *
 * @param {Object} params
 * @param {string} params.url - The recipe URL that failed to import
 * @param {string} [params.error] - Error message shown to the user
 * @param {string} [params.title] - Recipe title/label at time of dismissal
 * @param {string} [params.userId] - authorId of the user who queued the import
 * @returns {Promise<void>}
 */
export async function logFailedWebImport({ url, error, title, userId }) {
  if (!url) return;
  try {
    await addDoc(collection(db, 'failedWebImports'), {
      url,
      error: error || '',
      title: title || '',
      userId: userId || null,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error('Fehler beim Protokollieren des fehlgeschlagenen Webimports:', err);
  }
}

/**
 * Übergabe eines Push-Tipps („Rezept bereit zur Prüfung") vom
 * Service-Worker an die App über Cache Storage, plus Diagnose-Protokoll.
 *
 * Gegenstück zu public/firebase-messaging-sw.js (gleiche Namen). Der Worker
 * legt beim Tipp die Rezept-ID ab; die App liest sie, sobald sie sichtbar
 * wird. Das greift auch dann, wenn iOS die postMessage-Nachricht an die
 * pausierte PWA verliert oder die URL beim Öffnen nicht übergibt.
 */

const PUSH_HANDOFF_CACHE = 'recipebook-push-handoff';
const PUSH_HANDOFF_PENDING_KEY = '/__push-handoff/pending-review-import';
const PUSH_HANDOFF_LOG_KEY = '/__push-handoff/log';
const PUSH_HANDOFF_LOG_MAX = 40;

/** Ein abgelegter Tipp, der älter ist, gilt als erledigt. */
export const PUSH_HANDOFF_MAX_AGE_MS = 5 * 60 * 1000;

const cacheStorage = () => (typeof caches === 'undefined' ? null : caches);

async function readJson(cache, key, fallback) {
  try {
    const response = await cache.match(key);
    return response ? await response.json() : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Liest die abgelegte Rezept-ID und entfernt sie, damit sie nur einmal wirkt.
 * @returns {Promise<string|null>} Rezept-ID, '1' (ohne ID) oder null
 */
export async function takePendingReviewImport() {
  const storage = cacheStorage();
  if (!storage) return null;
  try {
    const cache = await storage.open(PUSH_HANDOFF_CACHE);
    const entry = await readJson(cache, PUSH_HANDOFF_PENDING_KEY, null);
    if (!entry) return null;
    await cache.delete(PUSH_HANDOFF_PENDING_KEY);
    if (!entry.recipeId || Date.now() - (entry.at || 0) > PUSH_HANDOFF_MAX_AGE_MS) return null;
    return String(entry.recipeId);
  } catch {
    return null;
  }
}

/**
 * Hängt einen Schritt an das Diagnose-Protokoll an. Nie ein Fehler nach außen.
 * @param {string} step
 * @param {string} [detail]
 */
export async function appendPushLog(step, detail = '') {
  const storage = cacheStorage();
  if (!storage) return;
  try {
    const cache = await storage.open(PUSH_HANDOFF_CACHE);
    const log = await readJson(cache, PUSH_HANDOFF_LOG_KEY, []);
    log.push({ at: Date.now(), by: 'app', step, detail: String(detail) });
    await cache.put(PUSH_HANDOFF_LOG_KEY, new Response(JSON.stringify(log.slice(-PUSH_HANDOFF_LOG_MAX))));
  } catch {
    // Protokoll ist Diagnose, nie ein Grund für einen Fehler
  }
}

/** @returns {Promise<Array<{at: number, by: string, step: string, detail: string}>>} */
export async function readPushLog() {
  const storage = cacheStorage();
  if (!storage) return [];
  try {
    const cache = await storage.open(PUSH_HANDOFF_CACHE);
    const log = await readJson(cache, PUSH_HANDOFF_LOG_KEY, []);
    return Array.isArray(log) ? log : [];
  } catch {
    return [];
  }
}

export async function clearPushLog() {
  const storage = cacheStorage();
  if (!storage) return;
  try {
    const cache = await storage.open(PUSH_HANDOFF_CACHE);
    await cache.delete(PUSH_HANDOFF_LOG_KEY);
  } catch {
    // ignorieren
  }
}

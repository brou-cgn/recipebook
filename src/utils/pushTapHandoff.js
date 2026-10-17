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
// One cache entry per log step (see public/firebase-messaging-sw.js): worker
// and app often log within the same second, and a shared read-append-write
// entry lost steps. readPushLog trims to the newest PUSH_HANDOFF_LOG_MAX.
const PUSH_HANDOFF_LOG_PREFIX = '/__push-handoff/log/';
// Single-entry log of the first version, removed on clear.
const PUSH_HANDOFF_LEGACY_LOG_KEY = '/__push-handoff/log';
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
    const at = Date.now();
    const key = `${PUSH_HANDOFF_LOG_PREFIX}${at}-app-${Math.random().toString(36).slice(2, 8)}`;
    await cache.put(key, new Response(JSON.stringify({ at, by: 'app', step, detail: String(detail) })));
  } catch {
    // Protokoll ist Diagnose, nie ein Grund für einen Fehler
  }
}

async function logRequests(cache) {
  const requests = await cache.keys();
  return requests.filter((request) => new URL(request.url).pathname.startsWith(PUSH_HANDOFF_LOG_PREFIX));
}

/**
 * Die letzten Einträge, älteste zuerst; ältere werden dabei gelöscht.
 * @returns {Promise<Array<{at: number, by: string, step: string, detail: string}>>}
 */
export async function readPushLog() {
  const storage = cacheStorage();
  if (!storage) return [];
  try {
    const cache = await storage.open(PUSH_HANDOFF_CACHE);
    const requests = await logRequests(cache);
    const entries = (await Promise.all(requests.map(async (request) => {
      const entry = await readJson(cache, request, null);
      return entry ? { entry, request } : null;
    }))).filter(Boolean);
    entries.sort((a, b) => a.entry.at - b.entry.at);
    const excess = entries.slice(0, Math.max(0, entries.length - PUSH_HANDOFF_LOG_MAX));
    await Promise.all(excess.map(({ request }) => cache.delete(request)));
    return entries.slice(excess.length).map(({ entry }) => entry);
  } catch {
    return [];
  }
}

export async function clearPushLog() {
  const storage = cacheStorage();
  if (!storage) return;
  try {
    const cache = await storage.open(PUSH_HANDOFF_CACHE);
    const requests = await logRequests(cache);
    await Promise.all([
      ...requests.map((request) => cache.delete(request)),
      cache.delete(PUSH_HANDOFF_LEGACY_LOG_KEY),
    ]);
  } catch {
    // ignorieren
  }
}

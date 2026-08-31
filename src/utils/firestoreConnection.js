/**
 * Firestore connection recovery.
 *
 * Firestore's snapshot listeners have two very different failure modes, and
 * only one of them reaches an onSnapshot error callback:
 *
 *  1. A terminal error (permission-denied while the ID token is mid-refresh,
 *     a missing index, ...). The error callback fires, the listener is dead,
 *     and the caller has to re-create it — that's what subscribeWithRetry in
 *     eventsFirestore.js does.
 *
 *  2. The backing gRPC/WebChannel stream is gone but the SDK still considers
 *     the client "healthy". No error callback ever fires. Instead every
 *     listener is served straight from the local IndexedDB cache, with
 *     `snapshot.metadata.fromCache === true`. A listener created in that
 *     state resolves *immediately* with whatever the cache happens to hold —
 *     which for a query the device has never run before (or one whose cache
 *     Safari's storage eviction has thrown away) is an EMPTY result.
 *
 * Case 2 is the one that makes the Events module (events, guests, drinks)
 * come up blank: the caller gets a perfectly ordinary "here are your 0
 * guests" callback, clears its loading flag, and renders an empty list. No
 * retry is triggered because, as far as every layer above is concerned,
 * nothing failed.
 *
 * iOS is where this bites hardest: when an installed PWA is backgrounded,
 * iOS suspends the JS context and tears down the WebChannel stream without
 * ever firing an `offline` event, and on resume the SDK can take a long time
 * to notice — or, after a long suspension, never re-establishes the stream at
 * all until the page is reloaded. That is exactly the "I open the app, go to
 * the menu overview and the cards show no guests" report: the listener that
 * page mounts is brand new, so it has nothing but the cache to answer from.
 *
 * The documented remedy is to force the client to tear its streams down and
 * build them back up: disableNetwork() followed by enableNetwork(). This
 * module does that, but only when it is actually warranted — some listener is
 * currently stuck on cache-only data — and at most once per cooldown window,
 * so a burst of resuming listeners can't thrash the connection.
 */

import { disableNetwork, enableNetwork } from 'firebase/firestore';
import { db } from '../firebase';

// How long to wait before a second recovery attempt is allowed. Long enough
// that the many listeners resuming together on one visibilitychange share a
// single attempt, short enough that a user who taps back into the app twice
// isn't left staring at empty lists.
const RECOVERY_COOLDOWN_MS = 10000;

// Listener ids that reported their most recent snapshot as cache-only. A
// non-empty set means at least one live listener is answering from cache and
// has not heard from the server since.
const cacheOnlyListeners = new Set();

// -Infinity, not 0: the very first attempt must never be swallowed by the
// cooldown window (it would be, for any clock reading below the cooldown).
let lastRecoveryAt = -Infinity;
let recoveryInFlight = null;
let listenersBound = false;

/**
 * Record that a listener's latest snapshot came out of the local cache.
 * @param {string|number|object} listenerId - Stable identity of the listener
 */
export const reportCacheOnlySnapshot = (listenerId) => {
  cacheOnlyListeners.add(listenerId);
};

/**
 * Record that a listener heard from the server, so it no longer counts as
 * stuck. Also called on unsubscribe so a torn-down listener can't keep the
 * client looking stuck forever.
 * @param {string|number|object} listenerId - Stable identity of the listener
 */
export const reportServerSnapshot = (listenerId) => {
  cacheOnlyListeners.delete(listenerId);
};

/**
 * Whether any live listener is currently answering from cache only.
 * @returns {boolean} True while at least one listener is stuck on cache
 */
export const hasCacheOnlyListeners = () => cacheOnlyListeners.size > 0;

/**
 * Force Firestore to drop and re-establish its backend streams.
 * Concurrent calls share the same in-flight attempt.
 * @returns {Promise<void>} Resolves once the network has been re-enabled
 */
export const recoverFirestoreNetwork = async () => {
  if (recoveryInFlight) return recoveryInFlight;

  recoveryInFlight = (async () => {
    try {
      await disableNetwork(db);
      await enableNetwork(db);
    } catch (error) {
      // A client that is already terminated (or a test double without these
      // methods) can't be recovered this way — there is nothing better to do
      // than let the per-listener retry ladder keep trying.
      console.error('Error recovering Firestore network:', error);
    } finally {
      recoveryInFlight = null;
    }
  })();

  return recoveryInFlight;
};

/**
 * Recover the connection, at most once per cooldown window. Use this when the
 * caller already knows it is looking at cache-only data (e.g. a one-time
 * getDoc that resolved from cache).
 * @param {number} [now] - Current timestamp, injectable for tests
 * @returns {Promise<boolean>} True if a recovery attempt was started
 */
export const recoverFirestoreNetworkThrottled = async (now = Date.now()) => {
  if (now - lastRecoveryAt < RECOVERY_COOLDOWN_MS) return false;
  lastRecoveryAt = now;
  await recoverFirestoreNetwork();
  return true;
};

/**
 * Recover the connection if, and only if, some listener is currently stuck on
 * cache-only data and the cooldown has elapsed.
 * @param {number} [now] - Current timestamp, injectable for tests
 * @returns {Promise<boolean>} True if a recovery attempt was started
 */
export const recoverFirestoreNetworkIfStuck = async (now = Date.now()) => {
  if (!hasCacheOnlyListeners()) return false;
  return recoverFirestoreNetworkThrottled(now);
};

/**
 * Bind the app-wide resume triggers. Idempotent: repeated calls (one per
 * subscription) only ever install one pair of listeners.
 * @returns {void}
 */
export const bindFirestoreRecoveryTriggers = () => {
  if (listenersBound || typeof window === 'undefined') return;
  listenersBound = true;

  const onResume = () => { recoverFirestoreNetworkIfStuck(); };
  const onVisible = () => {
    if (document.visibilityState === 'visible') onResume();
  };

  window.addEventListener('online', onResume);
  document.addEventListener('visibilitychange', onVisible);
  // iOS fires pageshow (persisted=true) when the PWA comes back out of the
  // page cache, a case where visibilitychange alone is not reliable.
  window.addEventListener('pageshow', onResume);
};

/**
 * Test seam: forget all recorded state.
 * @returns {void}
 */
export const __resetFirestoreConnectionState = () => {
  cacheOnlyListeners.clear();
  lastRecoveryAt = -Infinity;
  recoveryInFlight = null;
};

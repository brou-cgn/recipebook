/**
 * Events Firestore Utilities
 * Handles Getränke-Event data storage and calls to the calculation Cloud Functions.
 */

import { db, functions } from '../firebase';
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  deleteDoc,
  deleteField,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { mergeDrinkUnitAdditions } from './drinkCategories';
import {
  bindFirestoreRecoveryTriggers,
  recoverFirestoreNetworkIfStuck,
  recoverFirestoreNetworkThrottled,
  reportCacheOnlySnapshot,
  reportServerSnapshot,
} from './firestoreConnection';

// Additional-units contribution docs (see mergeDrinkUnitAdditions) never carry
// a `name` field. Firestore excludes any document missing an orderBy field
// from the query results entirely, so collection-group queries over
// customDrinks must not sort by `name` in Firestore or those contributions
// would never come back. Sort client-side instead.
const sortDrinksByName = (drinks) =>
  [...drinks].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'de', { sensitivity: 'base' }));

// Firestore's onSnapshot only invokes its error callback for terminal errors
// (e.g. permission-denied while the ID token is mid-refresh) — transient
// network blips are retried internally by the SDK and never reach here. A
// failed listener never restarts itself, though, so previously every
// subscribeTo* below reacted to that terminal error by wiping the caller's
// data via callback([]) / callback(null), which made the whole Events module
// (events, drinks, guests) go and stay blank for the rest of the session
// until a full app reload re-created the listener from scratch. Instead, on
// error we keep showing the last known data and quietly re-establish the
// listener with backoff, so the module recovers on its own.
const RETRY_DELAYS_MS = [1000, 3000, 8000, 20000, 30000];

// The error path above is only half the story, and it was the half that kept
// the Events module blank even after it was fixed. Firestore's *other* failure
// mode never reaches an error callback at all: when the backend stream is gone
// but the SDK still believes the client is healthy (the normal state of an iOS
// PWA that was just resumed from suspension), every listener is answered
// straight out of the local IndexedDB cache, flagged `metadata.fromCache`.
//
// A listener created in that state resolves immediately — with whatever the
// cache holds for that exact query. For a query the device has not run before,
// or one whose cached results Safari's storage eviction has since thrown away,
// that is an EMPTY result. The caller can't tell it apart from a genuine
// "you have no guests": it clears its loading flag and renders an empty list,
// and no retry is triggered because nothing failed.
//
// That is the whole "I open the app, go to the menu overview and the cards
// show no guests" report — MenuList mounts a brand-new guest listener at that
// moment, so the cache is all it has to answer from. Events, drinks and guests
// all go blank together because they all subscribe on page mount, while
// recipes and menus survive: those are subscribed once at App level and their
// data has been sitting in React state since login.
//
// So: never report an empty cache-only snapshot as data. Hold it back (callers
// keep showing "Laden…", which is the truthful state) and let the connection
// recovery in firestoreConnection.js rebuild the stream. `includeMetadataChanges`
// is required for this to terminate — without it the SDK does not raise a
// second event when a cached empty result is confirmed empty by the server, so
// a user who genuinely has no guests would wait forever.
const isEmptySnapshot = (snapshot) => {
  // DocumentSnapshot (subscribeToEvent)
  if (typeof snapshot?.exists === 'function') return !snapshot.exists();
  // QuerySnapshot
  if (typeof snapshot?.empty === 'boolean') return snapshot.empty;
  if (typeof snapshot?.size === 'number') return snapshot.size === 0;
  // Unknown shape (test doubles): treat as data and deliver it.
  return false;
};

let nextListenerId = 0;

const subscribeWithRetry = (label, ref, onData) => {
  const listenerId = `${label}#${(nextListenerId += 1)}`;
  let attempt = 0;
  let retryTimer = null;
  let stopped = false;
  let currentUnsubscribe = null;
  let hasDeliveredServerData = false;

  bindFirestoreRecoveryTriggers();

  const handleSnapshot = (snapshot) => {
    attempt = 0;
    const fromCache = snapshot?.metadata?.fromCache === true;

    if (fromCache) {
      reportCacheOnlySnapshot(listenerId);
      // An empty cache-only answer is indistinguishable from "no data
      // exists" to every caller, so don't hand it over as if it were the
      // truth — unless we've already shown server data for this listener, in
      // which case the caller is deliberately being kept on its last known
      // good state anyway.
      if (isEmptySnapshot(snapshot) && !hasDeliveredServerData) {
        recoverFirestoreNetworkIfStuck();
        return;
      }
    } else {
      reportServerSnapshot(listenerId);
      hasDeliveredServerData = true;
    }

    onData(snapshot);
  };

  const start = () => {
    if (stopped) return;
    // The scheduled retry (if any) has now been consumed. Leaving a fired
    // timer id in place used to make retryNow() below believe a retry was
    // still pending, so the next visibilitychange started a *second* listener
    // over the top of a healthy one — the old handle was overwritten without
    // ever being called, leaking a live listener per resume. On an iPhone,
    // where visibilitychange fires on every lock, app switch and notification
    // banner, those leaks pile up against Firestore's per-client listener
    // limit until new listeners stop being served at all.
    retryTimer = null;
    if (currentUnsubscribe) {
      currentUnsubscribe();
      currentUnsubscribe = null;
    }
    currentUnsubscribe = onSnapshot(ref, { includeMetadataChanges: true }, handleSnapshot, (error) => {
      console.error(`Error subscribing to ${label}:`, error);
      if (stopped) return;
      const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
      attempt += 1;
      retryTimer = setTimeout(start, delay);
    });
  };

  // The most common trigger for a terminal error here is the ID token being
  // mid-refresh right when the tab was backgrounded (phone locked, app
  // switched) or the network dropped — exactly the moments a phone/tab is
  // resumed or comes back online. Rather than let an already-scheduled retry
  // sit out its full backoff, jump straight back in as soon as either
  // happens, so the module recovers the instant the user is looking again
  // instead of up to ~30s later.
  const retryNow = () => {
    if (stopped || !retryTimer) return;
    clearTimeout(retryTimer);
    retryTimer = null;
    start();
  };
  const handleVisible = () => {
    if (document.visibilityState === 'visible') retryNow();
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('online', retryNow);
    document.addEventListener('visibilitychange', handleVisible);
  }

  start();

  return () => {
    stopped = true;
    // A torn-down listener must not keep the client counted as "stuck on
    // cache" — otherwise navigating away from a page that never loaded would
    // leave a permanent recovery trigger behind.
    reportServerSnapshot(listenerId);
    if (retryTimer) clearTimeout(retryTimer);
    if (currentUnsubscribe) currentUnsubscribe();
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', retryNow);
      document.removeEventListener('visibilitychange', handleVisible);
    }
  };
};

export const EVENT_CATEGORIES = [
  'wasser', 'softdrinks', 'saft', 'bier', 'wein', 'sekt', 'spirituosen', 'kaffee', 'tee',
];

export const EVENT_TYPES = [
  'familienfeier', 'party', 'kaffeeundkuchen', 'grillfest', 'sportuebertragung',
];

/**
 * Leitet die Saison automatisch aus einem Datum (YYYY-MM-DD) ab.
 * Mai-Sep = sommer, Mär/Apr/Okt = uebergang, Rest = winter.
 * @param {string} dateStr - Datum im Format YYYY-MM-DD
 * @returns {'sommer'|'uebergang'|'winter'} Abgeleitete Saison
 */
export const deriveSeason = (dateStr) => {
  if (!dateStr) return 'uebergang';
  const month = new Date(dateStr).getMonth() + 1; // 1-12
  if (month >= 5 && month <= 9) return 'sommer';
  if (month === 3 || month === 4 || month === 10) return 'uebergang';
  return 'winter';
};

/**
 * Set up a real-time listener for a user's events, newest/next first.
 * @param {string} uid - Current user ID
 * @param {Function} callback - Receives the array of events
 * @returns {Function} Unsubscribe function
 */
export const subscribeToEvents = (uid, callback) => {
  const eventsRef = collection(db, 'users', uid, 'events');
  const eventsQuery = query(eventsRef, orderBy('date', 'desc'));

  return subscribeWithRetry('events', eventsQuery, (snapshot) => {
    const events = [];
    snapshot.forEach((docSnap) => {
      events.push({ id: docSnap.id, ...docSnap.data() });
    });
    callback(events);
  });
};

/**
 * Set up a real-time listener for a single event, so callers (e.g. a linked
 * menu) always see the event's current drinks and Getränkeverteilung.
 * @param {string} uid - Owner of the event
 * @param {string} eventId - ID of the event
 * @param {Function} callback - Receives the event ({ id, ...data }) or null if it doesn't exist
 * @returns {Function} Unsubscribe function
 */
export const subscribeToEvent = (uid, eventId, callback) => {
  const eventRef = doc(db, 'users', uid, 'events', eventId);
  return subscribeWithRetry('event', eventRef, (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
};

/**
 * Set up a real-time listener across ALL users' events, newest/next first.
 * Intended for admins, who may read (but not write) any user's events – see
 * firestore.rules. Each event is annotated with `ownerId` (derived from its
 * document path) so callers can tell whose event it is.
 * @param {Function} callback - Receives the array of events
 * @returns {Function} Unsubscribe function
 */
export const subscribeToAllEvents = (callback) => {
  const eventsRef = collectionGroup(db, 'events');
  const eventsQuery = query(eventsRef, orderBy('date', 'desc'));

  return subscribeWithRetry('all events', eventsQuery, (snapshot) => {
    const events = [];
    snapshot.forEach((docSnap) => {
      events.push({ id: docSnap.id, ...docSnap.data(), ownerId: docSnap.ref.parent.parent.id });
    });
    callback(events);
  });
};

// EventsPage's deep-link handling (opened from a push notification reminder,
// or from a menu's "open linked event" button) treats a null result from
// getEvent() as "this event doesn't exist" and falls back to the plain
// events list. That's correct when the document genuinely doesn't exist,
// but wrong for a transient read failure (the same token/rule-evaluation
// hiccups the realtime listeners in this file retry around) — a single
// getDoc() with no retry would silently swallow that as "not found" and the
// deep link would land on an empty list instead of the requested event, most
// noticeably right after a related write (e.g. saving the event, or a linked
// menu sync) briefly increases Firestore traffic. Retry a few times before
// giving up so a transient failure doesn't get misreported as a missing event.
const GET_EVENT_RETRY_DELAYS_MS = [300, 1000, 3000];

/**
 * Get a single event by ID (one-time fetch).
 * @param {string} uid - Current user ID
 * @param {string} eventId - ID of the event
 * @returns {Promise<Object|null>} The event, or null if not found
 */
export const getEvent = async (uid, eventId) => {
  const eventRef = doc(db, 'users', uid, 'events', eventId);
  for (let attempt = 0; ; attempt += 1) {
    const lastAttempt = attempt >= GET_EVENT_RETRY_DELAYS_MS.length;
    try {
      const snap = await getDoc(eventRef);
      if (snap.exists()) return { id: snap.id, ...snap.data() };
      // A getDoc() served out of the local cache resolves without error even
      // when the client has no live connection, and a document the cache has
      // never seen simply reports itself as non-existent. That is not proof
      // the event is gone — it's the same cache-only state the listeners
      // above guard against — so kick the connection and ask again rather
      // than sending the deep link to an empty events list.
      if (snap.metadata?.fromCache && !lastAttempt) {
        await recoverFirestoreNetworkThrottled();
        await new Promise((resolve) => setTimeout(resolve, GET_EVENT_RETRY_DELAYS_MS[attempt]));
        continue;
      }
      return null;
    } catch (error) {
      if (lastAttempt) {
        console.error('Error getting event:', error);
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, GET_EVENT_RETRY_DELAYS_MS[attempt]));
    }
  }
};

/**
 * Delete an event.
 * @param {string} uid - Current user ID
 * @param {string} eventId - ID of the event to delete
 * @returns {Promise<void>}
 */
export const deleteEvent = async (uid, eventId) => {
  try {
    const eventRef = doc(db, 'users', uid, 'events', eventId);
    await deleteDoc(eventRef);
  } catch (error) {
    console.error('Error deleting event:', error);
    throw error;
  }
};

/**
 * Call the calculateEventDrinks Cloud Function: creates a new event document
 * (or updates an existing one when eventId is passed) and returns the
 * shopping-list calculation.
 * @param {Object} event - Event parameters (eventName, date, durationHours, guests,
 *   season, eventType, categories, pufferProzent)
 * @param {string} [eventId] - ID of an existing event to recalculate
 * @param {string} [ownerId] - Owner of the event, if different from the caller (admin editing another user's event)
 * @returns {Promise<Object>} { eventId, ...Berechnungsergebnis }
 */
export const calculateEventDrinks = async (event, eventId, ownerId) => {
  const fn = httpsCallable(functions, 'calculateEventDrinks');
  const result = await fn({ event, eventId, ownerId });
  return result.data;
};

/**
 * Sperrt die "Eingekauft"-Mengen aller Kategorien eines Getraenks auf einem Event,
 * damit sie beim naechsten Oeffnen der Einkauf & Verbrauch-Seite nicht mehr aus dem
 * kalkulierten Bedarf neu vorbefuellt werden.
 * @param {string} uid - Current user ID
 * @param {string} eventId - ID of the event
 * @param {Object} werteByKategorie - { kategorie: eingekauft } der einzufrierenden Mengen
 * @returns {Promise<void>}
 */
export const lockEinkaufMengen = async (uid, eventId, werteByKategorie) => {
  const eventRef = doc(db, 'users', uid, 'events', eventId);
  await setDoc(eventRef, { einkaufGesperrt: werteByKategorie }, { merge: true });
};

/**
 * Entsperrt die "Eingekauft"-Mengen aller Kategorien eines Getraenks auf einem Event,
 * damit sie beim naechsten Oeffnen der Einkauf & Verbrauch-Seite wieder aus dem
 * kalkulierten Bedarf neu vorbefuellt werden.
 * @param {string} uid - Current user ID
 * @param {string} eventId - ID of the event
 * @param {string[]} kategorien - Kategorie-Schluessel der zu entsperrenden Getraenke-Zeilen
 * @returns {Promise<void>}
 */
export const unlockEinkaufMengen = async (uid, eventId, kategorien) => {
  const eventRef = doc(db, 'users', uid, 'events', eventId);
  const updates = {};
  kategorien.forEach((kategorie) => {
    updates[kategorie] = deleteField();
  });
  await setDoc(eventRef, { einkaufGesperrt: updates }, { merge: true });
};

/**
 * Sperrt die "Verbraucht/Uebrig"-Mengen aller Kategorien eines Getraenks auf einem
 * Event, damit sie bei einer erneuten Kalibrierung nie ueberschrieben werden.
 * Analog zu {@link lockEinkaufMengen}, nur fuer das zweite Sperren-Feld.
 * @param {string} uid - Current user ID
 * @param {string} eventId - ID of the event
 * @param {Object} werteByKategorie - { kategorie: uebrig } der einzufrierenden Mengen
 * @returns {Promise<void>}
 */
export const lockVerbrauchMengen = async (uid, eventId, werteByKategorie) => {
  const eventRef = doc(db, 'users', uid, 'events', eventId);
  await setDoc(eventRef, { verbrauchGesperrt: werteByKategorie }, { merge: true });
};

/**
 * Entsperrt die "Verbraucht/Uebrig"-Mengen aller Kategorien eines Getraenks auf
 * einem Event. Analog zu {@link unlockEinkaufMengen}.
 * @param {string} uid - Current user ID
 * @param {string} eventId - ID of the event
 * @param {string[]} kategorien - Kategorie-Schluessel der zu entsperrenden Getraenke-Zeilen
 * @returns {Promise<void>}
 */
export const unlockVerbrauchMengen = async (uid, eventId, kategorien) => {
  const eventRef = doc(db, 'users', uid, 'events', eventId);
  const updates = {};
  kategorien.forEach((kategorie) => {
    updates[kategorie] = deleteField();
  });
  await setDoc(eventRef, { verbrauchGesperrt: updates }, { merge: true });
};

/**
 * Setzt den Event-Status direkt (ohne Neuberechnung), z.B. fuer den Uebergang
 * "berechnet" -> "eingekauft" -> "berechnet", wenn alle bzw. nicht mehr alle
 * Getraenke ueber die Eingekauft-Sperre fixiert sind.
 * @param {string} uid - Current user ID
 * @param {string} eventId - ID of the event
 * @param {string} status - Neuer Status ("geplant" | "berechnet" | "eingekauft" | "verbrauchErfasst")
 * @returns {Promise<void>}
 */
export const setEventStatus = async (uid, eventId, status) => {
  const eventRef = doc(db, 'users', uid, 'events', eventId);
  await setDoc(eventRef, { status }, { merge: true });
};

/**
 * Call the submitConsumption Cloud Function: records the actual consumption
 * of a finished event. Der Event-Status wird serverseitig nur dann auf
 * "verbrauchErfasst" gesetzt, wenn alle Getraenke des Events gesperrt sind
 * (siehe verbrauchGesperrtKategorien).
 * @param {string} eventId - ID of the event
 * @param {Object} gebinde - { kategorie: { eingekauft, uebrig } } in Gebinde-Einheiten
 * @param {string[]} [verbrauchGesperrtKategorien] - Kategorien, die aktuell (auch
 *   client-seitig noch nicht durchgeschrieben) als "Verbrauch gesperrt" gelten
 * @param {string} [ownerId] - Owner of the event, if different from the caller (admin editing another user's event)
 * @returns {Promise<Object>} { eventId }
 */
export const submitConsumption = async (eventId, gebinde, verbrauchGesperrtKategorien, ownerId) => {
  const fn = httpsCallable(functions, 'submitConsumption');
  const result = await fn({ eventId, gebinde, verbrauchGesperrtKategorien, ownerId });
  return result.data;
};

// ---------------------------------------------------------------------------
// Custom Drinks Library
// ---------------------------------------------------------------------------

/**
 * Set up a real-time listener for a user's custom drinks, ordered by name.
 * @param {string} uid - Current user ID
 * @param {Function} callback - Receives the array of custom drinks
 * @returns {Function} Unsubscribe function
 */
export const subscribeToCustomDrinks = (uid, callback) => {
  const ref = collection(db, 'users', uid, 'customDrinks');
  const q = query(ref, orderBy('name', 'asc'));
  return subscribeWithRetry('customDrinks', q, (snapshot) => {
    const drinks = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      // Docs carrying extendsOwnerId are this user's additional-units
      // contributions to someone else's drink, not drinks of their own.
      if (data.extendsOwnerId) return;
      drinks.push({ id: docSnap.id, ...data });
    });
    callback(drinks);
  });
};

/**
 * Set up a real-time listener across ALL users' custom drinks, ordered by
 * name. Drinks are a shared library visible to everyone; each drink is
 * annotated with `ownerId` (derived from its document path) so callers can
 * tell who added it and gate editing/deletion to that owner.
 * @param {Function} callback - Receives the array of custom drinks
 * @returns {Function} Unsubscribe function
 */
export const subscribeToAllCustomDrinks = (callback) => {
  const ref = collectionGroup(db, 'customDrinks');
  return subscribeWithRetry('all customDrinks', ref, (snapshot) => {
    const drinks = [];
    snapshot.forEach((docSnap) => {
      drinks.push({ id: docSnap.id, ...docSnap.data(), ownerId: docSnap.ref.parent.parent.id });
    });
    callback(sortDrinksByName(mergeDrinkUnitAdditions(drinks)));
  });
};

/**
 * Get ALL users' custom drinks (one-time fetch, ordered by name). Drinks are
 * a shared library visible to everyone; each drink is annotated with
 * `ownerId` (derived from its document path).
 * @returns {Promise<Array>} The custom drinks
 */
export const getAllCustomDrinks = async () => {
  try {
    const ref = collectionGroup(db, 'customDrinks');
    const snapshot = await getDocs(ref);
    const drinks = [];
    snapshot.forEach((docSnap) => {
      drinks.push({ id: docSnap.id, ...docSnap.data(), ownerId: docSnap.ref.parent.parent.id });
    });
    return sortDrinksByName(mergeDrinkUnitAdditions(drinks));
  } catch (error) {
    console.error('Error getting all customDrinks:', error);
    return [];
  }
};

/**
 * Get a user's custom drinks (one-time fetch, ordered by name).
 * @param {string} uid - Current user ID
 * @returns {Promise<Array>} The custom drinks
 */
export const getCustomDrinks = async (uid) => {
  try {
    const ref = collection(db, 'users', uid, 'customDrinks');
    const q = query(ref, orderBy('name', 'asc'));
    const snapshot = await getDocs(q);
    const drinks = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      // Docs carrying extendsOwnerId are this user's additional-units
      // contributions to someone else's drink, not drinks of their own.
      if (data.extendsOwnerId) return;
      drinks.push({ id: docSnap.id, ...data });
    });
    return drinks;
  } catch (error) {
    console.error('Error getting customDrinks:', error);
    return [];
  }
};

/**
 * Save a custom drink (create or update). Also used to save another user's
 * "additional units" contribution to someone else's drink: pass `uid` as the
 * contributor, `drinkId` as the target drink's id, and `drink` as
 * `{ einheiten, extendsOwnerId }` (no name/kategorie) – see
 * mergeDrinkUnitAdditions in drinkCategories.js for how these are folded
 * back into the target drink.
 * @param {string} uid - Current user ID
 * @param {Object} drink - { name, kategorie, einheiten: [{ einheitsgroesse, gebindeinheit, einheitenProGebinde }] }
 * @param {string} [drinkId] - If provided, update existing drink
 * @returns {Promise<string>} The drink ID
 */
export const saveCustomDrink = async (uid, drink, drinkId) => {
  const payload = { ...drink, updatedAt: serverTimestamp() };
  if (drinkId) {
    const ref = doc(db, 'users', uid, 'customDrinks', drinkId);
    await setDoc(ref, payload, { merge: true });
    return drinkId;
  }
  payload.createdAt = serverTimestamp();
  const ref = collection(db, 'users', uid, 'customDrinks');
  const docRef = await addDoc(ref, payload);
  return docRef.id;
};

/**
 * Delete a custom drink.
 * @param {string} uid - Current user ID
 * @param {string} drinkId - ID of the drink to delete
 * @returns {Promise<void>}
 */
export const deleteCustomDrink = async (uid, drinkId) => {
  try {
    await deleteDoc(doc(db, 'users', uid, 'customDrinks', drinkId));
  } catch (error) {
    console.error('Error deleting customDrink:', error);
    throw error;
  }
};

// ---------------------------------------------------------------------------
// Guest Profiles
// ---------------------------------------------------------------------------

/**
 * Set up a real-time listener for a user's guest profiles, ordered by name.
 * @param {string} uid - Current user ID
 * @param {Function} callback - Receives the array of guest profiles
 * @returns {Function} Unsubscribe function
 */
export const subscribeToGuestProfiles = (uid, callback) => {
  const ref = collection(db, 'guests', uid, 'profiles');
  const q = query(ref, orderBy('nachname', 'asc'));
  return subscribeWithRetry('guestProfiles', q, (snapshot) => {
    const profiles = [];
    snapshot.forEach((docSnap) => {
      profiles.push({ id: docSnap.id, ...docSnap.data() });
    });
    callback(profiles);
  });
};

/**
 * Set up a real-time listener across ALL users' guest profiles, ordered by
 * last name. Intended for admins, who may read (but not write) any user's
 * guest profiles – see firestore.rules. Each profile is annotated with
 * `ownerId` (derived from its document path) so callers can tell whose
 * guest it is.
 * @param {Function} callback - Receives the array of guest profiles
 * @returns {Function} Unsubscribe function
 */
export const subscribeToAllGuestProfiles = (callback) => {
  const ref = collectionGroup(db, 'profiles');
  const q = query(ref, orderBy('nachname', 'asc'));
  return subscribeWithRetry('all guestProfiles', q, (snapshot) => {
    const profiles = [];
    snapshot.forEach((docSnap) => {
      profiles.push({ id: docSnap.id, ...docSnap.data(), ownerId: docSnap.ref.parent.parent.id });
    });
    callback(profiles);
  });
};

/**
 * Save a guest profile (create or update).
 * @param {string} uid - Current user ID
 * @param {Object} profile - { name, adults, children }
 * @param {string} [profileId] - If provided, update existing profile
 * @param {string} [ownerId] - Owner of the profile, if different from the caller (admin editing another user's guest)
 * @returns {Promise<string>} The profile ID
 */
export const saveGuestProfile = async (_uid, profile, profileId, ownerId) => {
  const fn = httpsCallable(functions, 'manageGuestProfile');
  const result = await fn({
    action: profileId ? 'update' : 'create',
    profileId: profileId || null,
    profile,
    ownerId,
  });
  return result?.data?.id || profileId;
};

/**
 * Delete a guest profile.
 * @param {string} uid - Current user ID
 * @param {string} profileId - ID of the profile to delete
 * @param {string} [ownerId] - Owner of the profile, if different from the caller (admin deleting another user's guest)
 * @returns {Promise<void>}
 */
export const deleteGuestProfile = async (_uid, profileId, ownerId) => {
  try {
    const fn = httpsCallable(functions, 'manageGuestProfile');
    await fn({
      action: 'delete',
      profileId,
      ownerId,
    });
  } catch (error) {
    console.error('Error deleting guestProfile:', error);
    throw error;
  }
};

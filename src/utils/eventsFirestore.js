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

  return onSnapshot(eventsQuery, (snapshot) => {
    const events = [];
    snapshot.forEach((docSnap) => {
      events.push({ id: docSnap.id, ...docSnap.data() });
    });
    callback(events);
  }, (error) => {
    console.error('Error subscribing to events:', error);
    callback([]);
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
  return onSnapshot(eventRef, (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  }, (error) => {
    console.error('Error subscribing to event:', error);
    callback(null);
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

  return onSnapshot(eventsQuery, (snapshot) => {
    const events = [];
    snapshot.forEach((docSnap) => {
      events.push({ id: docSnap.id, ...docSnap.data(), ownerId: docSnap.ref.parent.parent.id });
    });
    callback(events);
  }, (error) => {
    console.error('Error subscribing to all events:', error);
    callback([]);
  });
};

/**
 * Get a single event by ID (one-time fetch).
 * @param {string} uid - Current user ID
 * @param {string} eventId - ID of the event
 * @returns {Promise<Object|null>} The event, or null if not found
 */
export const getEvent = async (uid, eventId) => {
  try {
    const eventRef = doc(db, 'users', uid, 'events', eventId);
    const snap = await getDoc(eventRef);
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
  } catch (error) {
    console.error('Error getting event:', error);
    return null;
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
  return onSnapshot(q, (snapshot) => {
    const drinks = [];
    snapshot.forEach((docSnap) => {
      drinks.push({ id: docSnap.id, ...docSnap.data() });
    });
    callback(drinks);
  }, (error) => {
    console.error('Error subscribing to customDrinks:', error);
    callback([]);
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
  const q = query(ref, orderBy('name', 'asc'));
  return onSnapshot(q, (snapshot) => {
    const drinks = [];
    snapshot.forEach((docSnap) => {
      drinks.push({ id: docSnap.id, ...docSnap.data(), ownerId: docSnap.ref.parent.parent.id });
    });
    callback(drinks);
  }, (error) => {
    console.error('Error subscribing to all customDrinks:', error);
    callback([]);
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
    const q = query(ref, orderBy('name', 'asc'));
    const snapshot = await getDocs(q);
    const drinks = [];
    snapshot.forEach((docSnap) => {
      drinks.push({ id: docSnap.id, ...docSnap.data(), ownerId: docSnap.ref.parent.parent.id });
    });
    return drinks;
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
      drinks.push({ id: docSnap.id, ...docSnap.data() });
    });
    return drinks;
  } catch (error) {
    console.error('Error getting customDrinks:', error);
    return [];
  }
};

/**
 * Save a custom drink (create or update).
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
  return onSnapshot(q, (snapshot) => {
    const profiles = [];
    snapshot.forEach((docSnap) => {
      profiles.push({ id: docSnap.id, ...docSnap.data() });
    });
    callback(profiles);
  }, (error) => {
    console.error('Error subscribing to guestProfiles:', error);
    callback([]);
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
  return onSnapshot(q, (snapshot) => {
    const profiles = [];
    snapshot.forEach((docSnap) => {
      profiles.push({ id: docSnap.id, ...docSnap.data(), ownerId: docSnap.ref.parent.parent.id });
    });
    callback(profiles);
  }, (error) => {
    console.error('Error subscribing to all guestProfiles:', error);
    callback([]);
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

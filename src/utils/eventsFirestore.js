/**
 * Events Firestore Utilities
 * Handles Getränke-Event data storage and calls to the calculation Cloud Functions.
 */

import { db, functions } from '../firebase';
import {
  collection,
  doc,
  getDoc,
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
 * @returns {Promise<Object>} { eventId, ...Berechnungsergebnis }
 */
export const calculateEventDrinks = async (event, eventId) => {
  const fn = httpsCallable(functions, 'calculateEventDrinks');
  const result = await fn({ event, eventId });
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
 * Call the submitConsumption Cloud Function: records the actual consumption
 * of a finished event and updates the user's calibrated rates.
 * @param {string} eventId - ID of the event
 * @param {Object} gebinde - { kategorie: { eingekauft, uebrig } } in Gebinde-Einheiten
 * @returns {Promise<Object>} { eventId, changes }
 */
export const submitConsumption = async (eventId, gebinde) => {
  const fn = httpsCallable(functions, 'submitConsumption');
  const result = await fn({ eventId, gebinde });
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
 * Save a guest profile (create or update).
 * @param {string} uid - Current user ID
 * @param {Object} profile - { name, adults, children }
 * @param {string} [profileId] - If provided, update existing profile
 * @returns {Promise<string>} The profile ID
 */
export const saveGuestProfile = async (_uid, profile, profileId) => {
  const fn = httpsCallable(functions, 'manageGuestProfile');
  const result = await fn({
    action: profileId ? 'update' : 'create',
    profileId: profileId || null,
    profile,
  });
  return result?.data?.id || profileId;
};

/**
 * Delete a guest profile.
 * @param {string} uid - Current user ID
 * @param {string} profileId - ID of the profile to delete
 * @returns {Promise<void>}
 */
export const deleteGuestProfile = async (_uid, profileId) => {
  try {
    const fn = httpsCallable(functions, 'manageGuestProfile');
    await fn({
      action: 'delete',
      profileId,
    });
  } catch (error) {
    console.error('Error deleting guestProfile:', error);
    throw error;
  }
};

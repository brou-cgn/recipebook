/**
 * Events Firestore Utilities
 * Handles Getränke-Event data storage and calls to the calculation Cloud Functions.
 */

import { db, functions } from '../firebase';
import {
  collection,
  doc,
  getDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
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

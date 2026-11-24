/**
 * Firebase Configuration and Initialization
 * Initializes Firebase App, Firestore, and Authentication
 */

import { initializeApp } from 'firebase/app';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator
} from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getMessaging, isSupported as isMessagingSupported } from 'firebase/messaging';
import {
  nutzungZeichen,
  raeumeFirestoreZustand,
  raeumeWegwerfSpeicher,
  darfNeuLaden,
  merkeNeuLaden,
} from './utils/localStorageHygiene';

// Firestore legt seinen Abfragezustand im localStorage ab; ist der voll, stürzt das SDK mit
// „INTERNAL ASSERTION FAILED“ ab und es kommen keine Daten mehr an. Aufräumen und Wiederherstellung
// stehen in utils/localStorageHygiene.js.
const LOCALSTORAGE_CLEANUP_THRESHOLD_CHARS = 3500000;

if (nutzungZeichen() > LOCALSTORAGE_CLEANUP_THRESHOLD_CHARS) {
  console.warn('localStorage usage is high, clearing disposable caches to avoid quota errors.');
  raeumeWegwerfSpeicher();
}

// Sicherheitsnetz: Trifft Firestore trotzdem auf den QuotaExceededError, räumen wir alles Wegwerfbare
// weg und laden neu (höchstens einmal je 60 s, gegen Schleifen).
function isFirestoreQuotaCrash(message) {
  return typeof message === 'string' &&
    message.includes('FIRESTORE') &&
    message.includes('INTERNAL ASSERTION FAILED') &&
    message.includes('QuotaExceededError');
}

function handleFirestoreQuotaCrash(event) {
  const message = event?.reason?.message || event?.reason?.toString?.() || event?.message || '';
  if (!isFirestoreQuotaCrash(message)) return;
  if (!darfNeuLaden()) return;

  console.warn('Recovering from Firestore localStorage quota crash: clearing disposable caches and reloading.');
  raeumeFirestoreZustand();
  raeumeWegwerfSpeicher();
  merkeNeuLaden();
  window.location.reload();
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', handleFirestoreQuotaCrash);
  window.addEventListener('unhandledrejection', handleFirestoreQuotaCrash);
}

// Firebase configuration from environment variables
// These values are loaded from .env.local file (not committed to git)
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID
};

// Validate that all required environment variables are present
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  const errorMessage = 
    'Firebase configuration is missing! Please create a .env.local file with your Firebase credentials. ' +
    'Copy .env.example to .env.local and fill in your Firebase project details from https://console.firebase.google.com/';
  console.error(errorMessage);
  throw new Error(errorMessage);
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore with offline persistence shared safely across multiple
// open tabs. `enableIndexedDbPersistence` (single-tab only) was replaced
// because it throws an internal assertion error ("Failed to obtain exclusive
// access to the persistence layer") whenever the app is open in more than
// one tab at the same time.
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  });
} catch (err) {
  // Falls back to in-memory cache if persistence isn't supported
  // (e.g. private browsing) or Firestore was already initialized.
  console.warn('Firestore persistent cache unavailable, falling back:', err.message);
  db = getFirestore(app);
}

// Initialize Firebase Authentication
const auth = getAuth(app);

// Initialize Firebase Functions
const functions = getFunctions(app);

// Initialize Firebase Storage
const storage = getStorage(app);

// Lokale Firebase-Emulatoren (Screenshots und Sichtprüfung, docs/setup/screenshots.md):
// nur wenn der Build REACT_APP_USE_EMULATORS=true mitbekommt. Der Produktions-Build setzt den
// Schalter nicht, dort läuft der Block nie; im Code bleibt er (rund 80 Byte gezippt).
// Ports wie in firebase.json.
if (process.env.REACT_APP_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
}

// Initialize Firebase Cloud Messaging (only in supported environments)
// Exported as a Promise so consumers can await the resolved Messaging instance
// instead of relying on a synchronous null value that may not be set yet.
const messagingPromise = isMessagingSupported()
  .then((supported) => {
    if (supported) return getMessaging(app);
    return null;
  })
  .catch(() => null); // Silently ignore environments where FCM is not available (e.g. SSR, test)

export { app, db, auth, functions, storage, messagingPromise, firebaseConfig, isMessagingSupported };

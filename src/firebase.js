/**
 * Firebase Configuration and Initialization
 * Initializes Firebase App, Firestore, and Authentication
 */

import { initializeApp } from 'firebase/app';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';
import { getMessaging, isSupported as isMessagingSupported } from 'firebase/messaging';

// Firestore's multi-tab persistence (`persistentMultipleTabManager`) mirrors
// small amounts of cross-tab coordination state (active query targets,
// pending mutations, tab heartbeats) into localStorage under keys prefixed
// with "firestore_". That state is disposable - the actual cached data lives
// in IndexedDB - but stale entries left behind by tabs that were killed
// rather than closed cleanly (common on mobile/PWA, where `beforeunload`
// doesn't reliably fire) aren't always garbage-collected. Left unchecked they
// can fill the localStorage quota and crash the SDK with an uncaught
// QuotaExceededError ("FIRESTORE ... INTERNAL ASSERTION FAILED").
const FIRESTORE_LOCALSTORAGE_PREFIX = 'firestore_';
// Most browsers cap localStorage around 5MB, i.e. ~5,000,000 UTF-16 code
// units for ASCII content. Clean up once usage nears that ceiling so there is
// headroom left for Firestore's own writes.
const LOCALSTORAGE_CLEANUP_THRESHOLD_CHARS = 3500000;
const FIRESTORE_QUOTA_RELOAD_GUARD_KEY = 'firestoreQuotaRecoveryAttempted';

function clearFirestoreLocalStorageState() {
  try {
    const staleKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(FIRESTORE_LOCALSTORAGE_PREFIX)) {
        staleKeys.push(key);
      }
    }
    staleKeys.forEach((key) => localStorage.removeItem(key));
  } catch {
    // localStorage unavailable (private browsing, etc.) - nothing to do
  }
}

function getLocalStorageUsageChars() {
  try {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      total += (key?.length || 0) + (localStorage.getItem(key)?.length || 0);
    }
    return total;
  } catch {
    return 0;
  }
}

if (getLocalStorageUsageChars() > LOCALSTORAGE_CLEANUP_THRESHOLD_CHARS) {
  console.warn('localStorage usage is high, clearing disposable Firestore state to avoid quota errors.');
  clearFirestoreLocalStorageState();
}

// Safety net: if the proactive cleanup above wasn't enough and Firestore
// still hits QuotaExceededError while persisting shared-tab state at
// runtime, it throws an uncaught internal assertion error that otherwise
// leaves the app permanently broken until a manual reload. Detect that
// specific signature, clear the disposable state, and reload once (guarded
// against reload loops if the underlying storage pressure isn't Firestore's).
function isFirestoreQuotaCrash(message) {
  return typeof message === 'string' &&
    message.includes('FIRESTORE') &&
    message.includes('INTERNAL ASSERTION FAILED') &&
    message.includes('QuotaExceededError');
}

function handleFirestoreQuotaCrash(event) {
  const message = event?.reason?.message || event?.reason?.toString?.() || event?.message || '';
  if (!isFirestoreQuotaCrash(message)) return;
  if (sessionStorage.getItem(FIRESTORE_QUOTA_RELOAD_GUARD_KEY)) return;

  console.warn('Recovering from Firestore localStorage quota crash: clearing disposable state and reloading.');
  clearFirestoreLocalStorageState();
  try {
    sessionStorage.setItem(FIRESTORE_QUOTA_RELOAD_GUARD_KEY, 'true');
  } catch {
    // ignore - worst case we retry the recovery once more
  }
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

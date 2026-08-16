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

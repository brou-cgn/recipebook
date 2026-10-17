// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Polyfill for setImmediate – required for @grpc/grpc-js compatibility on Node.js 24
if (typeof globalThis.setImmediate === 'undefined') {
  globalThis.setImmediate = (fn, ...args) => setTimeout(fn, 0, ...args);
  globalThis.clearImmediate = (id) => clearTimeout(id);
}

// Mock Firebase environment variables for tests
process.env.REACT_APP_FIREBASE_API_KEY = 'test-api-key';
process.env.REACT_APP_FIREBASE_AUTH_DOMAIN = 'test.firebaseapp.com';
process.env.REACT_APP_FIREBASE_PROJECT_ID = 'test-project';
process.env.REACT_APP_FIREBASE_STORAGE_BUCKET = 'test.firebasestorage.app';
process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID = '123456789';
process.env.REACT_APP_FIREBASE_APP_ID = 'test-app-id';
process.env.REACT_APP_FIREBASE_MEASUREMENT_ID = 'test-measurement-id';

// Unter jsdom 16 (Jest 27) gab es kein globales `crypto`; config/jest/polyfills.js
// stellt diesen Ausgangszustand her. Code, der crypto.randomUUID() ruft, braucht
// aber eine Implementierung: Wir liefern sie hier zentral, solange ein Test kein
// eigenes crypto setzt (faqFirestore.test.js überschreibt es weiterhin selbst).
if (!globalThis.crypto) {
  globalThis.crypto = { randomUUID: () => require('crypto').randomUUID() };
}

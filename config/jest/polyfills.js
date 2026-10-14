// Browser-APIs, die unter react-scripts in jeder Test-Umgebung vorhanden waren
// und auf die sich Code und Tests verlassen.

// react-scripts lud react-app-polyfill/jsdom, das `fetch` per whatwg-fetch
// bereitstellt. Tests spionieren `global.fetch` an (jest.spyOn(global, 'fetch')).
require('whatwg-fetch');

// Jest 27 (jsdom 16) hatte kein globales `crypto`. Tests verlassen sich darauf
// und setzen es selbst (`global.crypto = { randomUUID: jest.fn() }` in
// faqFirestore.test.js, `if (!global.crypto)` in recipeFirestore.test.js).
// jsdom 20 bringt ein nicht überschreibbares `crypto` mit, an dem diese
// Zuweisungen still scheitern – deshalb hier derselbe Ausgangszustand wie vorher.
Object.defineProperty(globalThis, 'crypto', {
  value: undefined,
  writable: true,
  configurable: true,
});

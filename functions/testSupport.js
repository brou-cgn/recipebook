/**
 * Helpers for the function tests, which load index.js with stubbed modules
 * (Module._load) and therefore need a fresh module graph per load.
 */
const path = require('node:path');
const Module = require('node:module');

// Wird beim ersten Laden erfasst, bevor ein Test Stubs installiert.
const TRUE_LOAD = Module._load;

/**
 * Drops every cached module of this package (index.js and the domain modules
 * it requires) so the next require() runs them against the current stubs.
 * node_modules and the test files themselves stay cached.
 */
function purgeFunctionsCache() {
  // Stubs der Tests bleiben nach dem require('./index') aktiv, weil Handler sharp,
  // nodemailer u. a. erst beim Aufruf laden; hier wird auf das echte Laden zurückgesetzt.
  Module._load = TRUE_LOAD;
  for (const file of Object.keys(require.cache)) {
    if (file.startsWith(__dirname + path.sep) &&
        !file.includes(path.sep + 'node_modules' + path.sep) &&
        !file.endsWith('.test.js') &&
        file !== __filename) {
      delete require.cache[file];
    }
  }
}

module.exports = {purgeFunctionsCache};

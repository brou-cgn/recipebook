/**
 * Helpers for the function tests, which load index.js with stubbed modules
 * (Module._load) and therefore need a fresh module graph per load.
 */
const path = require('node:path');

/**
 * Drops every cached module of this package (index.js and the domain modules
 * it requires) so the next require() runs them against the current stubs.
 * node_modules and the test files themselves stay cached.
 */
function purgeFunctionsCache() {
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

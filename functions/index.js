/**
 * Firebase Cloud Functions for RecipeBook
 * Provides secure server-side API access for AI OCR functionality
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin
admin.initializeApp();

// Getränke-Kalkulation für Events (Menüpunkt "Events" im Hamburger-Menü).
exports.calculateEventDrinks = require('./calculateEventDrinks').calculateEventDrinks;
exports.submitConsumption = require('./submitConsumption').submitConsumption;
exports.reminderConsumption = require('./reminderConsumption').reminderConsumption;
exports.manageGuestProfile = require('./manageGuestProfile').manageGuestProfile;

// Webimport-PIN: pro Nutzer optionaler PIN-Schutz für den Apple-Kurzbefehl-Import
// (importRecipeShortcut in handlers/importShortcut.js ruft requireShortcutPin() mit jedem Request auf,
// da der Kurzbefehl per API-Key ohne Session arbeitet). In-App-Importe über
// die eingeloggte Web-App verlangen den PIN nicht.
exports.setWebImportPin = require('./webImportPin').setWebImportPin;

// Server-seitige Aggregation von ratingAvg/ratingCount auf recipes/{recipeId}
// aus der ratings-Subcollection (ersetzt den bisherigen offenen Client-Write).
exports.aggregateRecipeRating = require('./recipeRatingAggregation').aggregateRecipeRating;

// Alle Functions liegen in handlers/ (Tech-Check F2); gemeinsame Helfer in shared/.
Object.assign(exports, require('./handlers/discover'), require('./handlers/follow'),
    require('./handlers/sharing'),
    require('./handlers/admin'),
    require('./handlers/nutrition'),
    require('./handlers/importApp'),
    require('./handlers/importShortcut'),
    require('./handlers/importPages'),
    require('./handlers/importVideo'),
    require('./handlers/importScheduled'),
    require('./handlers/nutritionRecalc'),
    require('./handlers/versionChanges'),
    require('./handlers/cookingTimers'));

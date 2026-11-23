/**
 * Firebase Cloud Functions for RecipeBook
 * Provides secure server-side API access for AI OCR functionality
 */

const {initializeApp} = require('firebase-admin/app');

// Initialize Firebase Admin
initializeApp();

// Getränke-Kalkulation für Events (Menüpunkt "Events" im Hamburger-Menü).
exports.calculateEventDrinks = require('./calculateEventDrinks').calculateEventDrinks;
exports.submitConsumption = require('./submitConsumption').submitConsumption;
exports.reminderConsumption = require('./reminderConsumption').reminderConsumption;
exports.manageGuestProfile = require('./manageGuestProfile').manageGuestProfile;

// Persönlicher Kurzbefehl-Schlüssel (Tech-Check S7): einziger Zugang der Kurzbefehl-Endpunkte, geprüft
// in shared/shortcutAuth.js. Gemeinsamer SHORTCUT_API_KEY und Webimport-PIN sind seit dem 23.11.2026 entfernt.
exports.createShortcutToken = require('./shortcutToken').createShortcutToken;
exports.revokeShortcutToken = require('./shortcutToken').revokeShortcutToken;

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
    require('./handlers/cookingTimers'),
    require('./handlers/wichteln'),
    require('./handlers/weinbegleitung'),
    require('./handlers/uebersetzung'));

/**
 * Sichert die Oberfläche von index.js beim Aufteilen nach Domänen (Tech-Check F2):
 * Firebase leitet die deployten Functions aus den Exports ab. Geht ein Export
 * beim Verschieben verloren, wird die Function beim nächsten Deploy gelöscht;
 * ein zusätzlicher Export (z. B. eine Konstante aus einer gleichnamigen
 * Bibliotheksdatei) würde als Function missverstanden.
 *
 * Neue Function: hier eintragen.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

const EXPECTED_EXPORTS = [
  'addRecipeViaAPI',
  'applyRecipeVersionChanges',
  'aggregateRecipeRating',
  'backfillRecipeThumbnails',
  'bringRecipeExport',
  'calculateEventDrinks',
  'calculateNutritionFromOpenFoodFacts',
  'captureWebsiteScreenshot',
  'createRecipeImportFromText',
  'createUserProfile',
  'dailyAiImporterTest',
  'fetchRecipeHtml',
  'fillNewFuerDichEntdecktList',
  'generateNutritionFromReference',
  'getGuestRecipes',
  'getRecipeOptionsShortcut',
  'getSharedMenuByShareId',
  'getSharedRecipeByShareId',
  'getSharedRecipesByIds',
  'getVideoUploadUrl',
  'importRecipeCallable',
  'importRecipeShortcut',
  'manageGuestProfile',
  'nightlyImportProtocolCleanup',
  'nightlyNutritionRecalc',
  'nightlySwipeFlagsCleanup',
  'notifyAdminsOnUserRegistration',
  'notifyPrivateListMembers',
  'onNutritionReferenceChanged',
  'parseIngredientAmountG',
  'processGroupInvitationsOnUserRegistration',
  'processHtmlWithAI',
  'processNutritionRecalcRequest',
  'processShortcutImportJob',
  'processVideoImportUpload',
  'recipeImportPage',
  'recoverStuckImportJobs',
  'refreshDiscoverTopicRuleMatches',
  'reminderConsumption',
  'rephraseRecipeSteps',
  'requestFollow',
  'respondFollow',
  'rotateFuerDichEntdecktLists',
  'runLowCarbFullTagging',
  'runNutritionRecalcForFlaggedRecipes',
  'scanRecipePhotoShortcut',
  'scanRecipeWithAI',
  'scanRecipesWithAI',
  'scrapeInstagramReel',
  'scrapeInstagramReelShortcut',
  'sendGroupInvitationEmail',
  'setUserPassword',
  'setWebImportPin',
  'shareRecipe',
  'stripCallLogEmails',
  'submitConsumption',
  'syncPublicProfile',
  'updateSeasonMatrixStatus',
];

function loadIndex() {
  require('./testSupport').purgeFunctionsCache();
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain, ...args) {
    if (request === 'firebase-functions/v2/https') {
      return {onCall: (o, h) => h || o, onRequest: (o, h) => h || o, HttpsError: class extends Error {}};
    }
    if (request === 'firebase-functions/v2/firestore') {
      return {onDocumentCreated: (o, h) => h, onDocumentWritten: (o, h) => h};
    }
    if (request === 'firebase-functions/v2/storage') return {onObjectFinalized: (o, h) => h};
    if (request === 'firebase-functions/v2/scheduler') return {onSchedule: (o, h) => h};
    if (request === 'firebase-functions/params') return {defineSecret: () => ({value: () => ''})};
    if (request === 'firebase-admin') {
      const firestore = () => ({});
      firestore.FieldValue = {};
      return {initializeApp: () => {}, firestore, auth: () => ({}), storage: () => ({}), messaging: () => ({})};
    }
    if (request === '@google/genai') return {GoogleGenAI: class {}};
    if (request === 'nodemailer') return {createTransport: () => ({})};
    if (request === 'sharp') return () => ({});
    return originalLoad.call(this, request, parent, isMain, ...args);
  };
  try {
    return require('./index');
  } finally {
    Module._load = originalLoad;
  }
}

test('index.js exportiert genau die erwarteten Functions', () => {
  const mod = loadIndex();
  assert.deepEqual(Object.keys(mod).sort(), [...EXPECTED_EXPORTS].sort());
});

test('jeder Export ist eine Function', () => {
  const mod = loadIndex();
  for (const [name, value] of Object.entries(mod)) {
    assert.equal(typeof value, 'function', `${name} ist keine Function`);
  }
});

#!/usr/bin/env node
/**
 * One-time migration script: set missing recalcDate timestamps for all
 * nutritionReferences documents to today at 12:00 UTC.
 *
 * Usage:
 *   node scripts/migrateNutritionReferenceRecalcDate.js [--dry-run]
 *
 * Prerequisites:
 *   - Set GOOGLE_APPLICATION_CREDENTIALS env var to your Firebase service account JSON
 *   - Or run via: firebase functions:shell / firebase emulators
 *
 * The script:
 *   1. Loads all documents from nutritionReferences
 *   2. Identifies documents with missing recalcDate
 *   3. Batch-updates them in chunks of 500 with recalcDate set to today at 12:00 UTC
 *   4. Prints a summary
 */

const path = require('path');

function loadAdmin() {
  try {
    return require('firebase-admin');
  } catch (rootError) {
    try {
      return require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
    } catch (functionsError) {
      console.error('❌ Could not load firebase-admin. Install dependencies in the repository root or /functions.');
      throw functionsError;
    }
  }
}

const admin = loadAdmin();
const BATCH_SIZE = 500;
const DRY_RUN_FLAG = '--dry-run';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

function hasMissingRecalcDate(data = {}) {
  return !Object.prototype.hasOwnProperty.call(data, 'recalcDate')
    || data.recalcDate === null
    || data.recalcDate === undefined;
}

function getTodayNoon() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0, 0));
}

async function migrateNutritionReferenceRecalcDate({ dryRun = false } = {}) {
  console.log(`🚀 Starting nutrition reference recalcDate migration${dryRun ? ' (dry run)' : ''}...\n`);

  const snapshot = await db.collection('nutritionReferences').get();

  if (snapshot.empty) {
    console.log('ℹ️ No nutritionReferences documents found.');
    return;
  }

  const docsToUpdate = [];
  let alreadyCorrectCount = 0;

  snapshot.docs.forEach((doc) => {
    const data = doc.data() || {};
    if (hasMissingRecalcDate(data)) {
      docsToUpdate.push(doc);
      return;
    }
    alreadyCorrectCount++;
  });

  const todayNoon = getTodayNoon();

  console.log(`📄 Loaded ${snapshot.docs.length} nutrition reference document(s).`);
  console.log(`🔎 Found ${docsToUpdate.length} document(s) without recalcDate.`);
  console.log(`✅ ${alreadyCorrectCount} document(s) already have recalcDate.`);
  console.log(`📅 Will set recalcDate to: ${todayNoon.toISOString()}`);
  console.log('');

  let updatedCount = 0;

  for (let i = 0; i < docsToUpdate.length; i += BATCH_SIZE) {
    const chunk = docsToUpdate.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

    if (dryRun) {
      updatedCount += chunk.length;
      console.log(`  🧪 Dry run batch ${batchNumber}: would update ${chunk.length} document(s) (total: ${updatedCount})`);
      continue;
    }

    const batch = db.batch();
    chunk.forEach((doc) => {
      batch.update(doc.ref, {
        recalcDate: admin.firestore.Timestamp.fromDate(todayNoon),
      });
    });

    await batch.commit();
    updatedCount += chunk.length;
    console.log(`  ✅ Batch ${batchNumber}: updated ${chunk.length} document(s) (total: ${updatedCount})`);
  }

  console.log('\n📊 Summary:');
  console.log(`  Found for migration: ${docsToUpdate.length}`);
  console.log(`  ${dryRun ? 'Would update' : 'Updated'}: ${updatedCount}`);
  console.log(`  Already correct: ${alreadyCorrectCount}`);
}

if (require.main === module) {
  migrateNutritionReferenceRecalcDate({
    dryRun: process.argv.includes(DRY_RUN_FLAG),
  }).catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });
}

module.exports = {
  hasMissingRecalcDate,
  getTodayNoon,
  migrateNutritionReferenceRecalcDate,
};

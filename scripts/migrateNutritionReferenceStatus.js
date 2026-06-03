#!/usr/bin/env node
/**
 * One-time migration script: set missing nutrition reference statuses to
 * "Datenerfassung ausstehend" and add migratedAt for traceability.
 *
 * Usage:
 *   node scripts/migrateNutritionReferenceStatus.js [--dry-run]
 *
 * Prerequisites:
 *   - Set GOOGLE_APPLICATION_CREDENTIALS env var to your Firebase service account JSON
 *   - Or run via: firebase functions:shell / firebase emulators
 *
 * The script:
 *   1. Loads all documents from nutritionReferences
 *   2. Identifies documents with missing / null / undefined / empty status
 *   3. Batch-updates them in chunks of 500
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
const TARGET_STATUS = 'Datenerfassung ausstehend';
const BATCH_SIZE = 500;
const DRY_RUN_FLAG = '--dry-run';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

function hasMissingNutritionReferenceStatus(data = {}) {
  if (!Object.prototype.hasOwnProperty.call(data, 'status')) {
    return true;
  }

  if (data.status === null || data.status === undefined) {
    return true;
  }

  return typeof data.status === 'string' && data.status.trim() === '';
}

async function migrateNutritionReferenceStatus({ dryRun = false } = {}) {
  console.log(`🚀 Starting nutrition reference status migration${dryRun ? ' (dry run)' : ''}...\n`);

  const snapshot = await db.collection('nutritionReferences').get();

  if (snapshot.empty) {
    console.log('ℹ️ No nutritionReferences documents found.');
    return;
  }

  const docsToUpdate = [];
  let alreadyCorrectCount = 0;
  let skippedCount = 0;

  snapshot.docs.forEach((doc) => {
    const data = doc.data();

    if (hasMissingNutritionReferenceStatus(data)) {
      docsToUpdate.push(doc);
      return;
    }

    if (data.status === TARGET_STATUS) {
      alreadyCorrectCount++;
      return;
    }

    skippedCount++;
  });

  console.log(`📄 Loaded ${snapshot.docs.length} nutrition reference document(s).`);
  console.log(`🔎 Found ${docsToUpdate.length} document(s) to migrate.`);
  console.log(`✅ ${alreadyCorrectCount} document(s) already have status "${TARGET_STATUS}".`);
  if (skippedCount > 0) {
    console.log(`⏭️ Skipping ${skippedCount} document(s) with a different non-empty status.`);
  }
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
        status: TARGET_STATUS,
        migratedAt: admin.firestore.FieldValue.serverTimestamp(),
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
  if (skippedCount > 0) {
    console.log(`  Skipped (other status): ${skippedCount}`);
  }
}

if (require.main === module) {
  migrateNutritionReferenceStatus({
    dryRun: process.argv.includes(DRY_RUN_FLAG),
  }).catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });
}

module.exports = {
  hasMissingNutritionReferenceStatus,
  migrateNutritionReferenceStatus,
};

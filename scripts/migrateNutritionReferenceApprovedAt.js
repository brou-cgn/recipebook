#!/usr/bin/env node
/**
 * One-time migration script: set missing approvedAt timestamps for
 * nutrition reference documents with status "Freigegeben".
 *
 * Usage:
 *   node scripts/migrateNutritionReferenceApprovedAt.js [--dry-run]
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
const APPROVED_STATUS = 'Freigegeben';
const BATCH_SIZE = 500;
const DRY_RUN_FLAG = '--dry-run';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

function hasMissingApprovedAt(data = {}) {
  return !Object.prototype.hasOwnProperty.call(data, 'approvedAt')
    || data.approvedAt === null
    || data.approvedAt === undefined;
}

async function migrateNutritionReferenceApprovedAt({ dryRun = false } = {}) {
  console.log(`🚀 Starting nutrition reference approvedAt migration${dryRun ? ' (dry run)' : ''}...\n`);

  const snapshot = await db.collection('nutritionReferences').get();

  if (snapshot.empty) {
    console.log('ℹ️ No nutritionReferences documents found.');
    return;
  }

  const docsToUpdate = [];
  let alreadyCorrectCount = 0;
  let skippedCount = 0;

  snapshot.docs.forEach((doc) => {
    const data = doc.data() || {};
    const status = String(data.status || '').trim();
    if (status !== APPROVED_STATUS) {
      skippedCount++;
      return;
    }
    if (hasMissingApprovedAt(data)) {
      docsToUpdate.push(doc);
      return;
    }
    alreadyCorrectCount++;
  });

  console.log(`📄 Loaded ${snapshot.docs.length} nutrition reference document(s).`);
  console.log(`🔎 Found ${docsToUpdate.length} approved document(s) without approvedAt.`);
  console.log(`✅ ${alreadyCorrectCount} approved document(s) already have approvedAt.`);
  if (skippedCount > 0) {
    console.log(`⏭️ Skipping ${skippedCount} document(s) without status "${APPROVED_STATUS}".`);
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
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
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
  console.log(`  Skipped (other status): ${skippedCount}`);
}

if (require.main === module) {
  migrateNutritionReferenceApprovedAt({
    dryRun: process.argv.includes(DRY_RUN_FLAG),
  }).catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });
}

module.exports = {
  hasMissingApprovedAt,
  migrateNutritionReferenceApprovedAt,
};

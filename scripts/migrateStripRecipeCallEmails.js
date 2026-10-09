#!/usr/bin/env node
/**
 * One-time migration script: remove the userEmail field from recipeCalls.
 *
 * recipeCalls is readable by every registered member (it feeds "Im Trend"),
 * so it must not hold e-mail addresses. logRecipeCall stopped writing the
 * field; this script strips it from entries logged before that change.
 * AppCallsPage still shows the address to admins, resolved from appCalls.
 *
 * Usage:
 *   node scripts/migrateStripRecipeCallEmails.js [--dry-run]
 *
 * Prerequisites:
 *   - Set GOOGLE_APPLICATION_CREDENTIALS env var to your Firebase service account JSON
 *   - Or point FIRESTORE_EMULATOR_HOST at a running emulator
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

function hasUserEmail(data = {}) {
  return Object.prototype.hasOwnProperty.call(data, 'userEmail');
}

async function migrateStripRecipeCallEmails({ dryRun = false } = {}) {
  console.log(`🚀 Starting recipeCalls userEmail cleanup${dryRun ? ' (dry run)' : ''}...\n`);

  const snapshot = await db.collection('recipeCalls').get();

  if (snapshot.empty) {
    console.log('ℹ️ No recipeCalls documents found.');
    return { found: 0, updated: 0 };
  }

  const docsToUpdate = snapshot.docs.filter((doc) => hasUserEmail(doc.data()));

  console.log(`📄 Loaded ${snapshot.docs.length} recipeCalls document(s).`);
  console.log(`🔎 Found ${docsToUpdate.length} document(s) with a userEmail field.\n`);

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
      batch.update(doc.ref, { userEmail: admin.firestore.FieldValue.delete() });
    });

    await batch.commit();
    updatedCount += chunk.length;
    console.log(`  ✅ Batch ${batchNumber}: updated ${chunk.length} document(s) (total: ${updatedCount})`);
  }

  console.log('\n📊 Summary:');
  console.log(`  Found with userEmail: ${docsToUpdate.length}`);
  console.log(`  ${dryRun ? 'Would update' : 'Updated'}: ${updatedCount}`);

  return { found: docsToUpdate.length, updated: updatedCount };
}

if (require.main === module) {
  migrateStripRecipeCallEmails({
    dryRun: process.argv.includes(DRY_RUN_FLAG),
  }).catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });
}

module.exports = {
  hasUserEmail,
  migrateStripRecipeCallEmails,
};

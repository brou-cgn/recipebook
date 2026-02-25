/**
 * One-time migration script: assign the public group ID to all recipes missing a groupId.
 *
 * Usage:
 *   node scripts/migrateRecipeGroupIds.js
 *
 * Prerequisites:
 *   - Set GOOGLE_APPLICATION_CREDENTIALS env var to your Firebase service account JSON
 *   - Or run via: firebase functions:shell / firebase emulators
 *
 * The script:
 *   1. Queries groups collection for the public group (type == 'public')
 *   2. Queries all recipes where groupId does not exist (using Admin SDK)
 *   3. Batch-updates them (500 per batch) setting groupId = <publicGroupId>
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
// Uses GOOGLE_APPLICATION_CREDENTIALS env variable or Application Default Credentials
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function migrateRecipeGroupIds() {
  console.log('🚀 Starting migration: assigning groupId to recipes without one...\n');

  // Step 1: Find the public group
  const groupsSnapshot = await db
    .collection('groups')
    .where('type', '==', 'public')
    .limit(1)
    .get();

  if (groupsSnapshot.empty) {
    console.error('❌ No public group found! Please ensure a public group exists first.');
    process.exit(1);
  }

  const publicGroupId = groupsSnapshot.docs[0].id;
  console.log(`✅ Found public group: ${publicGroupId}\n`);

  // Step 2: Find all recipes without a groupId field
  // Admin SDK supports querying for missing fields
  const recipesSnapshot = await db
    .collection('recipes')
    .where('groupId', '==', null)
    .get();

  // Also get recipes where groupId field simply doesn't exist
  // Firestore Admin SDK: use whereField notExist workaround
  const allRecipesSnapshot = await db.collection('recipes').get();
  
  const recipesWithoutGroup = allRecipesSnapshot.docs.filter(
    (doc) => !('groupId' in doc.data())
  );

  console.log(`📋 Found ${recipesWithoutGroup.length} recipe(s) without a groupId.\n`);

  if (recipesWithoutGroup.length === 0) {
    console.log('✅ Nothing to migrate. All recipes already have a groupId!');
    return;
  }

  // Step 3: Batch update in chunks of 500
  const BATCH_SIZE = 500;
  let totalUpdated = 0;

  for (let i = 0; i < recipesWithoutGroup.length; i += BATCH_SIZE) {
    const chunk = recipesWithoutGroup.slice(i, i + BATCH_SIZE);
    const batch = db.batch();

    chunk.forEach((doc) => {
      batch.update(doc.ref, { groupId: publicGroupId });
    });

    await batch.commit();
    totalUpdated += chunk.length;
    console.log(`  ✅ Batch ${Math.ceil((i + 1) / BATCH_SIZE)}: updated ${chunk.length} recipe(s) (total: ${totalUpdated})`);
  }

  console.log(`\n🎉 Migration complete! Updated ${totalUpdated} recipe(s) with groupId: ${publicGroupId}`);
}

migrateRecipeGroupIds().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});

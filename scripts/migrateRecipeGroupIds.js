/**
 * One-time migration script: assign the public group ID to all recipes missing a groupId,
 * and set groupType on all recipes based on their groupId.
 *
 * Usage:
 *   node scripts/migrateRecipeGroupIds.js
 *
 * Prerequisites:
 *   - Set GOOGLE_APPLICATION_CREDENTIALS env var to your Firebase service account JSON
 *   - Or run via: firebase functions:shell / firebase emulators
 *
 * The script:
 *   1. Loads all groups and builds a map of groupId → type
 *   2. Queries all recipes where groupId does not exist (using Admin SDK)
 *   3. Batch-updates them (500 per batch) setting groupId = <publicGroupId>
 *   4. Sets groupType on all recipes based on their groupId
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
// Uses GOOGLE_APPLICATION_CREDENTIALS env variable or Application Default Credentials
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function migrateRecipeGroupIds() {
  console.log('🚀 Starting migration: assigning groupId and groupType to recipes...\n');

  // Step 1: Load all groups and build a groupId → type map
  const groupsSnapshot = await db.collection('groups').get();

  if (groupsSnapshot.empty) {
    console.error('❌ No groups found! Please ensure groups exist first.');
    process.exit(1);
  }

  const groupTypeMap = {};
  let publicGroupId = null;
  groupsSnapshot.docs.forEach((doc) => {
    groupTypeMap[doc.id] = doc.data().type;
    if (doc.data().type === 'public' && !publicGroupId) {
      publicGroupId = doc.id;
    }
  });

  if (!publicGroupId) {
    console.error('❌ No public group found! Please ensure a public group exists first.');
    process.exit(1);
  }
  console.log(`✅ Found public group: ${publicGroupId}\n`);
  console.log(`✅ Loaded ${groupsSnapshot.docs.length} group(s).\n`);

  // Step 2: Find all recipes (also used for groupType update in step 4)
  const allRecipesSnapshot = await db.collection('recipes').get();
  
  const recipesWithoutGroup = allRecipesSnapshot.docs.filter(
    (doc) => !('groupId' in doc.data())
  );

  console.log(`📋 Found ${recipesWithoutGroup.length} recipe(s) without a groupId.\n`);

  const BATCH_SIZE = 500;

  if (recipesWithoutGroup.length === 0) {
    console.log('✅ All recipes already have a groupId. Skipping groupId assignment.');
  } else {
    // Step 3: Batch update groupId in chunks of 500
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

    console.log(`\n🎉 groupId migration complete! Updated ${totalUpdated} recipe(s) with groupId: ${publicGroupId}`);
  }

  // Step 4: Set groupType on all recipes based on their groupId
  console.log('\n🔄 Setting groupType on all recipes...\n');

  let totalGroupTypeUpdated = 0;
  const allDocs = allRecipesSnapshot.docs;

  for (let i = 0; i < allDocs.length; i += BATCH_SIZE) {
    const chunk = allDocs.slice(i, i + BATCH_SIZE);
    const batch = db.batch();

    chunk.forEach((doc) => {
      const data = doc.data();
      const resolvedGroupId = data.groupId || publicGroupId;
      const groupType = groupTypeMap[resolvedGroupId] || 'public';
      batch.update(doc.ref, { groupType });
    });

    await batch.commit();
    totalGroupTypeUpdated += chunk.length;
    console.log(`  ✅ Batch ${Math.ceil((i + 1) / BATCH_SIZE)}: set groupType on ${chunk.length} recipe(s) (total: ${totalGroupTypeUpdated})`);
  }

  console.log(`\n🎉 Migration complete! Set groupType on ${totalGroupTypeUpdated} recipe(s).`);
}

migrateRecipeGroupIds().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});

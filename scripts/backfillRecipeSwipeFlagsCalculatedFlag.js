#!/usr/bin/env node
/**
 * One-time migration: backfill recipeSwipeFlags.calculatedFlag for existing documents.
 *
 * Usage:
 *   node scripts/backfillRecipeSwipeFlagsCalculatedFlag.js
 *
 * Prerequisites:
 *   - GOOGLE_APPLICATION_CREDENTIALS env var set to a Firebase service account JSON
 *   - Or run in an environment with Application Default Credentials
 */

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
// Keep a safety margin below Firestore's hard 500-op batch limit.
const BATCH_LIMIT = 450;

const DEFAULT_THRESHOLDS = {
  groupThresholdKandidatMinKandidat: 50,
  groupThresholdKandidatMaxArchiv: 50,
  groupThresholdArchivMinArchiv: 50,
  groupThresholdArchivMaxKandidat: 50,
};

function computeCalculatedFlag(memberIds, flagsByUser, recipeId, thresholds = DEFAULT_THRESHOLDS) {
  if (!Array.isArray(memberIds) || memberIds.length === 0) return null;

  let archivCount = 0;
  for (const uid of memberIds) {
    const flag = flagsByUser[uid]?.[recipeId];
    if (flag === 'archiv') archivCount++;
  }

  // Optimistic projection for open votes: all non-archiv states are treated as kandidat.
  const kandidatCount = memberIds.length - archivCount;
  const total = memberIds.length;
  const kandidatPct = (kandidatCount / total) * 100;
  const archivPct = (archivCount / total) * 100;

  if (
    kandidatPct >= thresholds.groupThresholdKandidatMinKandidat &&
    archivPct <= thresholds.groupThresholdKandidatMaxArchiv
  ) {
    return 'kandidat';
  }

  if (
    archivPct >= thresholds.groupThresholdArchivMinArchiv &&
    kandidatPct <= thresholds.groupThresholdArchivMaxKandidat
  ) {
    return 'archiv';
  }

  return 'geparkt';
}

async function loadGroupMembersByListId() {
  const snapshot = await db.collection('groups').get();
  const map = new Map();

  snapshot.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const members = Array.isArray(data.memberIds) ? data.memberIds : [];
    const memberIds = data.ownerId
      ? [...new Set([data.ownerId, ...members])]
      : [...new Set(members)];
    map.set(docSnap.id, memberIds);
  });

  return map;
}

async function backfillCalculatedFlags() {
  console.log('🚀 Starting migration: recipeSwipeFlags.calculatedFlag');

  const groupMembersByListId = await loadGroupMembersByListId();
  const snapshot = await db.collection('recipeSwipeFlags').get();

  if (snapshot.empty) {
    console.log('✅ No recipeSwipeFlags documents found.');
    return;
  }

  const docsByRecipeInList = new Map();

  snapshot.forEach((docSnap) => {
    const data = docSnap.data() || {};
    if (!data.listId || !data.recipeId || !data.userId || !data.flag) return;

    const key = `${data.listId}__${data.recipeId}`;
    if (!docsByRecipeInList.has(key)) docsByRecipeInList.set(key, []);
    docsByRecipeInList.get(key).push(docSnap);
  });

  let updatedDocs = 0;
  let processedGroups = 0;
  let batch = db.batch();
  let batchOps = 0;

  for (const [key, docs] of docsByRecipeInList.entries()) {
    const [listId, recipeId] = key.split('__');
    processedGroups++;

    let memberIds = groupMembersByListId.get(listId) || [];
    if (memberIds.length === 0) {
      memberIds = [...new Set(docs.map((docSnap) => docSnap.data().userId))];
    }
    if (memberIds.length === 0) continue;

    const flagsByUser = Object.fromEntries(memberIds.map((uid) => [uid, {}]));
    docs.forEach((docSnap) => {
      const data = docSnap.data();
      if (!flagsByUser[data.userId]) flagsByUser[data.userId] = {};
      flagsByUser[data.userId][recipeId] = data.flag;
    });

    const calculatedFlag = computeCalculatedFlag(memberIds, flagsByUser, recipeId);
    if (!calculatedFlag) continue;

    for (const docSnap of docs) {
      const data = docSnap.data();
      if (data.calculatedFlag === calculatedFlag) continue;

      batch.update(docSnap.ref, { calculatedFlag });
      batchOps++;
      updatedDocs++;

      if (batchOps >= BATCH_LIMIT) {
        await batch.commit();
        batch = db.batch();
        batchOps = 0;
      }
    }
  }

  if (batchOps > 0) {
    await batch.commit();
  }

  console.log(`✅ Processed recipe/list groups: ${processedGroups}`);
  console.log(`✅ Updated documents: ${updatedDocs}`);
  console.log('🎉 Migration complete.');
}

backfillCalculatedFlags().catch((error) => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});

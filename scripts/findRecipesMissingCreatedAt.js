#!/usr/bin/env node
/**
 * Read-only audit script: lists all documents in the "recipes" collection
 * that have no createdAt field (missing, null, or undefined).
 *
 * Usage:
 *   node scripts/findRecipesMissingCreatedAt.js
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

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

function isMissingCreatedAt(data = {}) {
  return !Object.prototype.hasOwnProperty.call(data, 'createdAt')
    || data.createdAt === null
    || data.createdAt === undefined;
}

async function findRecipesMissingCreatedAt() {
  console.log('🔎 Scanning "recipes" collection for missing createdAt...\n');

  const snapshot = await db.collection('recipes').get();

  if (snapshot.empty) {
    console.log('ℹ️ No recipes documents found.');
    return [];
  }

  const missing = snapshot.docs
    .filter((doc) => isMissingCreatedAt(doc.data()))
    .map((doc) => ({ id: doc.id, title: doc.data()?.title || '(ohne Titel)' }));

  console.log(`📄 Geprüft: ${snapshot.docs.length} Rezept(e).`);
  console.log(`🚫 Ohne createdAt: ${missing.length}\n`);

  missing.forEach(({ id, title }) => {
    console.log(`  - ${id}  "${title}"`);
  });

  return missing;
}

if (require.main === module) {
  findRecipesMissingCreatedAt().catch((error) => {
    console.error('❌ Scan failed:', error);
    process.exit(1);
  });
}

module.exports = { isMissingCreatedAt, findRecipesMissingCreatedAt };

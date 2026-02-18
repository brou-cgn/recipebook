#!/usr/bin/env node
/**
 * Update Recipe Creation Dates Script
 * 
 * This script reads the ImportDatum.csv file and updates the creation dates
 * of recipes in Firestore based on the provided data.
 * 
 * Usage:
 *   node scripts/updateRecipeCreationDates.js
 * 
 * Prerequisites:
 *   - Firebase Admin SDK must be initialized
 *   - ImportDatum.csv file must exist in the root directory
 *   - Format: Name;Erstellt am (semicolon-separated)
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { parseCSV } = require('./csvParser');

// Initialize Firebase Admin SDK
// This will use the FIREBASE_CONFIG environment variable or default credentials
function initializeFirebase() {
  try {
    // Check if already initialized
    if (admin.apps.length === 0) {
      // Try to use service account key if available
      const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');
      
      if (fs.existsSync(serviceAccountPath)) {
        const serviceAccount = require(serviceAccountPath);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
        console.log('✓ Firebase Admin initialized with service account');
      } else {
        // Use default credentials (for Cloud Functions or gcloud authenticated environment)
        admin.initializeApp();
        console.log('✓ Firebase Admin initialized with default credentials');
      }
    }
    
    return admin.firestore();
  } catch (error) {
    console.error('✗ Error initializing Firebase:', error.message);
    console.log('\nPlease ensure you have either:');
    console.log('1. A serviceAccountKey.json file in the root directory, OR');
    console.log('2. GOOGLE_APPLICATION_CREDENTIALS environment variable set, OR');
    console.log('3. Running in a Firebase/Google Cloud environment with default credentials');
    process.exit(1);
  }
}

/**
 * Create backup of current recipe data
 * @param {Object} db - Firestore database instance
 * @returns {Promise<void>}
 */
async function createBackup(db) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(__dirname, '..', 'backups');
    
    // Create backups directory if it doesn't exist
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    const backupFile = path.join(backupDir, `recipes-backup-${timestamp}.json`);
    
    // Fetch all recipes
    const snapshot = await db.collection('recipes').get();
    const recipes = [];
    
    snapshot.forEach(doc => {
      recipes.push({
        id: doc.id,
        ...doc.data(),
        // Convert Firestore Timestamps to ISO strings for JSON serialization
        createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || doc.data().createdAt,
        updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString() || doc.data().updatedAt
      });
    });
    
    fs.writeFileSync(backupFile, JSON.stringify(recipes, null, 2), 'utf-8');
    console.log(`✓ Backup created: ${backupFile}`);
    console.log(`  Total recipes backed up: ${recipes.length}`);
    
    return backupFile;
  } catch (error) {
    console.error('✗ Error creating backup:', error.message);
    throw error;
  }
}

/**
 * Find recipe by name in Firestore
 * @param {Object} db - Firestore database instance
 * @param {string} recipeName - Name of the recipe to find
 * @returns {Promise<Object|null>} Recipe document or null if not found
 */
async function findRecipeByName(db, recipeName) {
  try {
    const snapshot = await db.collection('recipes')
      .where('title', '==', recipeName)
      .limit(1)
      .get();
    
    if (snapshot.empty) {
      return null;
    }
    
    const doc = snapshot.docs[0];
    return {
      id: doc.id,
      ...doc.data()
    };
  } catch (error) {
    console.error(`✗ Error finding recipe "${recipeName}":`, error.message);
    return null;
  }
}

/**
 * Update recipe creation date
 * @param {Object} db - Firestore database instance
 * @param {string} recipeId - Recipe document ID
 * @param {Date} newDate - New creation date
 * @returns {Promise<void>}
 */
async function updateRecipeCreationDate(db, recipeId, newDate) {
  try {
    await db.collection('recipes').doc(recipeId).update({
      createdAt: admin.firestore.Timestamp.fromDate(newDate),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error(`✗ Error updating recipe ${recipeId}:`, error.message);
    throw error;
  }
}

/**
 * Main execution function
 */
async function main() {
  console.log('='.repeat(60));
  console.log('Recipe Creation Date Update Script');
  console.log('='.repeat(60));
  console.log('');
  
  // Initialize Firebase
  const db = initializeFirebase();
  
  // Check if ImportDatum.csv exists
  const csvPath = path.join(__dirname, '..', 'ImportDatum.csv');
  if (!fs.existsSync(csvPath)) {
    console.error(`✗ ImportDatum.csv not found at: ${csvPath}`);
    console.log('Please create the file with the following format:');
    console.log('Name;Erstellt am');
    console.log('Recipe Name 1;22.02.2024');
    console.log('Recipe Name 2;27.11.2024');
    process.exit(1);
  }
  
  console.log(`✓ Found ImportDatum.csv at: ${csvPath}`);
  console.log('');
  
  // Parse CSV file
  console.log('Parsing CSV file...');
  const recipesToUpdate = parseCSV(csvPath);
  console.log(`✓ Parsed ${recipesToUpdate.length} recipe(s) from CSV`);
  console.log('');
  
  if (recipesToUpdate.length === 0) {
    console.log('⚠ No valid recipes found in CSV file. Exiting.');
    process.exit(0);
  }
  
  // Create backup
  console.log('Creating backup...');
  await createBackup(db);
  console.log('');
  
  // Process each recipe
  console.log('Updating recipes...');
  console.log('-'.repeat(60));
  
  let successCount = 0;
  let notFoundCount = 0;
  let errorCount = 0;
  
  for (const { name, date, dateStr } of recipesToUpdate) {
    try {
      const recipe = await findRecipeByName(db, name);
      
      if (!recipe) {
        console.log(`⚠ Recipe not found: "${name}"`);
        notFoundCount++;
        continue;
      }
      
      // Get current creation date for logging
      let currentDate = 'N/A';
      if (recipe.createdAt) {
        if (recipe.createdAt.toDate) {
          currentDate = recipe.createdAt.toDate().toLocaleDateString('de-DE');
        } else if (recipe.createdAt instanceof Date) {
          currentDate = recipe.createdAt.toLocaleDateString('de-DE');
        }
      }
      
      await updateRecipeCreationDate(db, recipe.id, date);
      console.log(`✓ Updated "${name}"`);
      console.log(`  Old date: ${currentDate} → New date: ${dateStr}`);
      successCount++;
      
    } catch (error) {
      console.log(`✗ Failed to update "${name}": ${error.message}`);
      errorCount++;
    }
  }
  
  console.log('-'.repeat(60));
  console.log('');
  console.log('Summary:');
  console.log(`  ✓ Successfully updated: ${successCount}`);
  console.log(`  ⚠ Not found: ${notFoundCount}`);
  console.log(`  ✗ Errors: ${errorCount}`);
  console.log('');
  console.log('='.repeat(60));
  
  if (notFoundCount > 0) {
    console.log('');
    console.log('Note: Some recipes were not found in the database.');
    console.log('Please verify the recipe names in ImportDatum.csv match exactly');
    console.log('with the recipe titles in Firestore.');
  }
  
  process.exit(errorCount > 0 ? 1 : 0);
}

// Run the script
if (require.main === module) {
  main().catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}

module.exports = { createBackup, findRecipeByName, updateRecipeCreationDate };

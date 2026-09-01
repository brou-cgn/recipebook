/**
 * Utility functions for managing category images
 * Each image can be linked to multiple meal categories
 * Each category can only be linked to one image
 */

import { db } from '../firebase';
import { doc, getDoc, updateDoc, collection, getDocs, setDoc, deleteDoc, deleteField, writeBatch } from 'firebase/firestore';

const CATEGORY_IMAGES_KEY = 'categoryImages';
const CATEGORY_IMAGES_COLLECTION = 'categoryImages';
let idCounter = 0;
let migrationDone = false;

/**
 * Reset migration flag (for testing purposes)
 * @private
 */
export function _resetMigrationFlag() {
  migrationDone = false;
}

/**
 * Generate a unique ID for an image
 * @returns {string} Unique ID
 */
function generateId() {
  return `${Date.now()}-${idCounter++}`;
}

/**
 * Migrate category images from settings/app document to separate collection
 * This is a one-time operation for existing users
 * @returns {Promise<Array>} Migrated images or empty array
 */
async function migrateFromSettingsDoc() {
  try {
    const settingsDoc = await getDoc(doc(db, 'settings', 'app'));
    
    if (settingsDoc.exists()) {
      const settings = settingsDoc.data();
      if (settings.categoryImages && Array.isArray(settings.categoryImages) && settings.categoryImages.length > 0) {
        console.log('Migrating category images from settings/app to categoryImages collection...');
        const images = settings.categoryImages;
        
        // Save each image to the collection
        for (const image of images) {
          await setDoc(doc(db, CATEGORY_IMAGES_COLLECTION, image.id), {
            image: image.image,
            categories: image.categories
          });
        }
        
        // Remove categoryImages from settings/app to free up space
        await updateDoc(doc(db, 'settings', 'app'), { categoryImages: deleteField() });
        
        console.log('Migration completed successfully');
        return images;
      }
    }
  } catch (e) {
    console.error('Error during settings migration:', e);
  }
  return [];
}

/**
 * Migrate category images from localStorage to Firestore collection
 * This is a one-time operation to preserve existing data
 * @returns {Promise<Array>} Migrated images or empty array
 */
async function migrateFromLocalStorage() {
  if (migrationDone) return [];
  
  const stored = localStorage.getItem(CATEGORY_IMAGES_KEY);
  if (stored) {
    try {
      const images = JSON.parse(stored);
      if (images && images.length > 0) {
        console.log('Migrating category images from localStorage to Firestore collection...');
        
        // Save each image to the collection
        for (const image of images) {
          await setDoc(doc(db, CATEGORY_IMAGES_COLLECTION, image.id), {
            image: image.image,
            categories: image.categories
          });
        }
        
        // Clear from localStorage after successful migration
        localStorage.removeItem(CATEGORY_IMAGES_KEY);
        console.log('Migration completed successfully');
        migrationDone = true;
        return images;
      }
    } catch (e) {
      console.error('Error during localStorage migration:', e);
    }
  }
  migrationDone = true;
  return [];
}

/**
 * Get all category images from Firestore collection
 * Automatically migrates from settings/app document or localStorage if needed
 * @returns {Promise<Array>} Array of image objects with structure: { id, image, categories }
 */
export async function getCategoryImages() {
  try {
    // Try to get from categoryImages collection first
    const imagesSnapshot = await getDocs(collection(db, CATEGORY_IMAGES_COLLECTION));
    
    if (!imagesSnapshot.empty) {
      const images = [];
      imagesSnapshot.forEach((doc) => {
        const data = doc.data();
        images.push({
          id: doc.id,
          image: data.image,
          categories: data.categories || [],
          ...(data.order !== undefined ? { order: data.order } : {})
        });
      });
      images.sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));
      return images;
    }
    
    // Try migration from settings/app document
    const migratedFromSettings = await migrateFromSettingsDoc();
    if (migratedFromSettings.length > 0) {
      return migratedFromSettings;
    }
    
    // Try migration from localStorage if no collection data exists
    const migratedFromLocalStorage = await migrateFromLocalStorage();
    return migratedFromLocalStorage;
  } catch (error) {
    if (error?.code === 'permission-denied') {
      console.warn('Category images skipped: permission denied');
    } else {
      console.error('Error getting category images from Firestore:', error);
    }
    
    // Fallback to localStorage on error
    const stored = localStorage.getItem(CATEGORY_IMAGES_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error('Error parsing category images from localStorage:', e);
      }
    }
    return [];
  }
}

/**
 * Save category images to Firestore collection
 * @param {Array} images - Array of image objects
 * @throws {Error} If Firestore quota is exceeded or other storage error occurs
 * @deprecated This function is kept for backward compatibility but not recommended for direct use
 */
export async function saveCategoryImages(images) {
  try {
    // Save each image to the collection
    for (const image of images) {
      await setDoc(doc(db, CATEGORY_IMAGES_COLLECTION, image.id), {
        image: image.image,
        categories: image.categories || []
      });
    }
  } catch (error) {
    if (error.code === 'resource-exhausted') {
      throw new Error('Speicherplatz voll. Bitte entfernen Sie einige Kategoriebilder oder verwenden Sie kleinere Bilder.');
    }
    throw error;
  }
}

/**
 * Add a new category image
 * @param {string} imageBase64 - Base64 encoded image
 * @param {Array} categories - Array of category names
 * @param {number} [order] - Position among existing category images (e.g. current list length to append)
 * @returns {Promise<Object>} The newly created image object
 */
export async function addCategoryImage(imageBase64, categories = [], order) {
  const orderField = order !== undefined ? { order } : {};
  const newImage = {
    id: generateId(),
    image: imageBase64,
    categories: categories,
    ...orderField
  };

  try {
    await setDoc(doc(db, CATEGORY_IMAGES_COLLECTION, newImage.id), {
      image: newImage.image,
      categories: newImage.categories,
      ...orderField
    });
    return newImage;
  } catch (error) {
    if (error.code === 'resource-exhausted') {
      throw new Error('Speicherplatz voll. Bitte entfernen Sie einige Kategoriebilder oder verwenden Sie kleinere Bilder.');
    }
    throw error;
  }
}

/**
 * Persist a new display order for category images (drag & drop reordering)
 * @param {Array<string>} orderedIds - Image IDs in their new display order
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
export async function reorderCategoryImages(orderedIds) {
  try {
    const batch = writeBatch(db);
    orderedIds.forEach((id, index) => {
      batch.update(doc(db, CATEGORY_IMAGES_COLLECTION, id), { order: index });
    });
    await batch.commit();
    return true;
  } catch (error) {
    console.error('Error reordering category images:', error);
    return false;
  }
}

/**
 * Update an existing category image
 * @param {string} id - Image ID
 * @param {Object} updates - Object with fields to update (image, categories)
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
export async function updateCategoryImage(id, updates) {
  try {
    const imageDoc = await getDoc(doc(db, CATEGORY_IMAGES_COLLECTION, id));
    if (!imageDoc.exists()) return false;
    
    const currentData = imageDoc.data();
    const updatedData = {
      image: updates.image !== undefined ? updates.image : currentData.image,
      categories: updates.categories !== undefined ? updates.categories : currentData.categories
    };
    
    await setDoc(doc(db, CATEGORY_IMAGES_COLLECTION, id), updatedData);
    return true;
  } catch (error) {
    console.error('Error updating category image:', error);
    return false;
  }
}

/**
 * Remove a category image
 * @param {string} id - Image ID to remove
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
export async function removeCategoryImage(id) {
  try {
    await deleteDoc(doc(db, CATEGORY_IMAGES_COLLECTION, id));
    return true;
  } catch (error) {
    console.error('Error removing category image:', error);
    return false;
  }
}

/**
 * Get the image for a specific category
 * @param {string} categoryName - Name of the meal category
 * @returns {Promise<string|null>} Base64 image string or null if not found
 */
export async function getImageForCategory(categoryName) {
  const images = await getCategoryImages();
  const image = images.find(img => img.categories.includes(categoryName));
  return image ? image.image : null;
}

/**
 * Get the first matching image for any of the given categories
 * @param {Array} categories - Array of category names
 * @returns {Promise<string|null>} Base64 image string or null if not found
 */
export async function getImageForCategories(categories) {
  if (!categories || categories.length === 0) return null;
  
  const images = await getCategoryImages();
  for (const category of categories) {
    const image = images.find(img => img.categories.includes(category));
    if (image) return image.image;
  }
  return null;
}

/**
 * Check if a category is already assigned to an image
 * @param {string} categoryName - Name of the category
 * @param {string} excludeImageId - Optional image ID to exclude from check (for editing)
 * @returns {Promise<boolean>} True if category is already assigned
 */
export async function isCategoryAssigned(categoryName, excludeImageId = null) {
  const images = await getCategoryImages();
  return images.some(img => 
    img.id !== excludeImageId && img.categories.includes(categoryName)
  );
}

/**
 * Validate that categories can be assigned to an image
 * Returns array of categories that are already assigned to other images
 * @param {Array} categories - Array of category names to validate
 * @param {string} excludeImageId - Optional image ID to exclude from check
 * @returns {Promise<Array>} Array of category names that are already assigned
 */
export async function getAlreadyAssignedCategories(categories, excludeImageId = null) {
  const assigned = [];
  for (const category of categories) {
    if (await isCategoryAssigned(category, excludeImageId)) {
      assigned.push(category);
    }
  }
  return assigned;
}

/**
 * Carries a meal category's assigned image over to its new name, so renaming a
 * meal category in "Listen & Kategorien" doesn't orphan the image configured
 * for it in "Bilder & Icons" (mirrors renameCuisineTypeIcon for cuisine types).
 * @param {string} oldName
 * @param {string} newName
 * @returns {Promise<void>}
 */
export async function renameMealCategoryInImages(oldName, newName) {
  if (!oldName || !newName || oldName === newName) return;
  try {
    const images = await getCategoryImages();
    const affected = images.filter(img => img.categories.includes(oldName));
    await Promise.all(affected.map((img) => {
      const categories = img.categories.includes(newName)
        ? img.categories.filter(c => c !== oldName)
        : img.categories.map(c => (c === oldName ? newName : c));
      return updateCategoryImage(img.id, { categories });
    }));
  } catch (error) {
    console.error('Error renaming meal category in category images:', error);
  }
}

/**
 * Removes a meal category from any image it is assigned to, called when the
 * meal category itself is removed in "Listen & Kategorien" (mirrors
 * deleteCuisineTypeIcon for cuisine types).
 * @param {string} categoryName
 * @returns {Promise<void>}
 */
export async function removeMealCategoryFromImages(categoryName) {
  if (!categoryName) return;
  try {
    const images = await getCategoryImages();
    const affected = images.filter(img => img.categories.includes(categoryName));
    await Promise.all(affected.map((img) =>
      updateCategoryImage(img.id, { categories: img.categories.filter(c => c !== categoryName) })
    ));
  } catch (error) {
    console.error('Error removing meal category from category images:', error);
  }
}

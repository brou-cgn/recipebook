/**
 * Utility functions for managing category images
 * Each image can be linked to multiple meal categories
 * Each category can only be linked to one image
 */

const CATEGORY_IMAGES_KEY = 'categoryImages';
let idCounter = 0;

/**
 * Generate a unique ID for an image
 * @returns {string} Unique ID
 */
function generateId() {
  return `${Date.now()}-${idCounter++}`;
}

/**
 * Get all category images from localStorage
 * @returns {Array} Array of image objects with structure: { id, image, categories }
 */
export function getCategoryImages() {
  const stored = localStorage.getItem(CATEGORY_IMAGES_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error('Error parsing category images:', e);
    }
  }
  return [];
}

/**
 * Save category images to localStorage
 * @param {Array} images - Array of image objects
 */
export function saveCategoryImages(images) {
  localStorage.setItem(CATEGORY_IMAGES_KEY, JSON.stringify(images));
}

/**
 * Add a new category image
 * @param {string} imageBase64 - Base64 encoded image
 * @param {Array} categories - Array of category names
 * @returns {Object} The newly created image object
 */
export function addCategoryImage(imageBase64, categories = []) {
  const images = getCategoryImages();
  const newImage = {
    id: generateId(),
    image: imageBase64,
    categories: categories
  };
  images.push(newImage);
  saveCategoryImages(images);
  return newImage;
}

/**
 * Update an existing category image
 * @param {string} id - Image ID
 * @param {Object} updates - Object with fields to update (image, categories)
 * @returns {boolean} True if successful, false otherwise
 */
export function updateCategoryImage(id, updates) {
  const images = getCategoryImages();
  const index = images.findIndex(img => img.id === id);
  if (index === -1) return false;
  
  images[index] = { ...images[index], ...updates };
  saveCategoryImages(images);
  return true;
}

/**
 * Remove a category image
 * @param {string} id - Image ID to remove
 * @returns {boolean} True if successful, false otherwise
 */
export function removeCategoryImage(id) {
  const images = getCategoryImages();
  const filtered = images.filter(img => img.id !== id);
  if (filtered.length === images.length) return false;
  
  saveCategoryImages(filtered);
  return true;
}

/**
 * Get the image for a specific category
 * @param {string} categoryName - Name of the meal category
 * @returns {string|null} Base64 image string or null if not found
 */
export function getImageForCategory(categoryName) {
  const images = getCategoryImages();
  const image = images.find(img => img.categories.includes(categoryName));
  return image ? image.image : null;
}

/**
 * Get the first matching image for any of the given categories
 * @param {Array} categories - Array of category names
 * @returns {string|null} Base64 image string or null if not found
 */
export function getImageForCategories(categories) {
  if (!categories || categories.length === 0) return null;
  
  const images = getCategoryImages();
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
 * @returns {boolean} True if category is already assigned
 */
export function isCategoryAssigned(categoryName, excludeImageId = null) {
  const images = getCategoryImages();
  return images.some(img => 
    img.id !== excludeImageId && img.categories.includes(categoryName)
  );
}

/**
 * Validate that categories can be assigned to an image
 * Returns array of categories that are already assigned to other images
 * @param {Array} categories - Array of category names to validate
 * @param {string} excludeImageId - Optional image ID to exclude from check
 * @returns {Array} Array of category names that are already assigned
 */
export function getAlreadyAssignedCategories(categories, excludeImageId = null) {
  const assigned = [];
  for (const category of categories) {
    if (isCategoryAssigned(category, excludeImageId)) {
      assigned.push(category);
    }
  }
  return assigned;
}

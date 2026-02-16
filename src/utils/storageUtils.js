/**
 * Firebase Storage Utilities
 * Handles image upload and deletion in Firebase Cloud Storage
 */

import { storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

/**
 * Generate a unique filename for recipe images
 * @returns {string} Unique filename with UUID
 */
function generateUniqueFilename(file) {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 15);
  const extension = file.name.split('.').pop() || 'jpg';
  return `${timestamp}-${randomStr}.${extension}`;
}

/**
 * Upload a recipe image to Firebase Storage
 * @param {File} file - The image file to upload
 * @returns {Promise<string>} - Download URL of the uploaded image
 */
export async function uploadRecipeImage(file) {
  if (!file) {
    throw new Error('No file provided');
  }

  // Validate file size (limit to 5MB)
  const maxSize = 5 * 1024 * 1024; // 5MB
  if (file.size > maxSize) {
    throw new Error('Image file size must be less than 5MB');
  }

  // Validate file type
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    throw new Error('Invalid file type. Please upload a JPEG, PNG, GIF, or WebP image');
  }

  try {
    // Generate unique filename
    const filename = generateUniqueFilename(file);
    
    // Create a reference to the storage location
    const storageRef = ref(storage, `recipes/${filename}`);
    
    // Upload the file
    const snapshot = await uploadBytes(storageRef, file);
    
    // Get the download URL
    const downloadURL = await getDownloadURL(snapshot.ref);
    
    return downloadURL;
  } catch (error) {
    console.error('Error uploading image to Firebase Storage:', error);
    throw new Error('Failed to upload image. Please try again.');
  }
}

/**
 * Delete a recipe image from Firebase Storage
 * @param {string} imageUrl - The download URL or path of the image to delete
 * @returns {Promise<void>}
 */
export async function deleteRecipeImage(imageUrl) {
  if (!imageUrl || !isStorageUrl(imageUrl)) {
    // Not a Firebase Storage URL, nothing to delete
    return;
  }

  try {
    // Extract the path from the download URL
    // Firebase Storage URLs format: https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{path}?alt=media...
    const url = new URL(imageUrl);
    const pathMatch = url.pathname.match(/\/o\/(.+)/);
    
    if (!pathMatch || !pathMatch[1]) {
      console.warn('Could not extract path from Storage URL:', imageUrl);
      return;
    }
    
    // Decode the path (it's URL encoded in the download URL)
    const encodedPath = pathMatch[1];
    const path = decodeURIComponent(encodedPath);
    
    // Create a reference and delete
    const storageRef = ref(storage, path);
    await deleteObject(storageRef);
  } catch (error) {
    // Log the error but don't throw - deletion failures shouldn't block the app
    console.error('Error deleting image from Firebase Storage:', error);
  }
}

/**
 * Check if a URL is a Firebase Storage URL
 * @param {string} imageUrl - The URL to check
 * @returns {boolean} - True if it's a Firebase Storage URL
 */
export function isStorageUrl(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') {
    return false;
  }
  
  // Check if it's a Firebase Storage URL
  return imageUrl.includes('firebasestorage.googleapis.com');
}

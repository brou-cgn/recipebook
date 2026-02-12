/**
 * Convert a file to base64 string
 * @param {File} file - The image file to convert
 * @returns {Promise<string>} - Base64 encoded string
 */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No file provided'));
      return;
    }

    // Check file size (limit to 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      reject(new Error('Image file size must be less than 5MB'));
      return;
    }

    // Check file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      reject(new Error('Invalid file type. Please upload a JPEG, PNG, GIF, or WebP image'));
      return;
    }

    const reader = new FileReader();
    
    reader.onload = (e) => {
      resolve(e.target.result);
    };
    
    reader.onerror = (error) => {
      reject(error);
    };
    
    reader.readAsDataURL(file);
  });
}

/**
 * Check if a string is a base64 data URL
 * @param {string} imageStr - The image string to check
 * @returns {boolean} - True if it's a base64 data URL
 */
export function isBase64Image(imageStr) {
  return imageStr && imageStr.startsWith('data:image/');
}

/**
 * Validate if a string is a valid image URL or base64 data
 * @param {string} imageStr - The image URL or base64 string
 * @returns {boolean} - True if valid
 */
export function isValidImageSource(imageStr) {
  if (!imageStr) return false;
  
  // Check if it's a base64 data URL
  if (isBase64Image(imageStr)) {
    return true;
  }
  
  // Check if it's a valid URL
  try {
    new URL(imageStr);
    return true;
  } catch {
    return false;
  }
}

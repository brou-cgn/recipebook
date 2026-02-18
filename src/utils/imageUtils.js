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

/**
 * Compress an image using canvas
 * @param {string} base64 - Base64 encoded image string
 * @param {number} maxWidth - Maximum width (default: 800)
 * @param {number} maxHeight - Maximum height (default: 600)
 * @param {number} quality - JPEG quality 0-1 (default: 0.7)
 * @param {boolean} preserveTransparency - If true, outputs PNG to preserve transparency (default: false)
 * @returns {Promise<string>} - Compressed base64 image
 */
export function compressImage(base64, maxWidth = 800, maxHeight = 600, quality = 0.7, preserveTransparency = false) {
  return new Promise((resolve, reject) => {
    if (!base64 || !isBase64Image(base64)) {
      reject(new Error('Invalid base64 image'));
      return;
    }

    const img = new Image();
    
    img.onload = () => {
      try {
        // Calculate new dimensions while maintaining aspect ratio
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth || height > maxHeight) {
          const aspectRatio = width / height;
          
          // Determine which dimension is the constraint
          if (width / maxWidth > height / maxHeight) {
            // Width is the limiting factor
            width = maxWidth;
            height = Math.round(width / aspectRatio);
          } else {
            // Height is the limiting factor
            height = maxHeight;
            width = Math.round(height * aspectRatio);
          }
        }
        
        // Create canvas and draw resized image
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Determine output format based on transparency preservation
        let compressedBase64;
        // Note: PNG inputs automatically preserve transparency regardless of preserveTransparency parameter
        // to avoid accidental quality loss. Set preserveTransparency=true to force PNG output for any input.
        if (preserveTransparency || base64.startsWith('data:image/png')) {
          // Use PNG to preserve transparency
          compressedBase64 = canvas.toDataURL('image/png');
        } else {
          // Convert to JPEG with specified quality
          compressedBase64 = canvas.toDataURL('image/jpeg', quality);
        }
        
        resolve(compressedBase64);
      } catch (error) {
        reject(error);
      }
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };
    
    img.src = base64;
  });
}

/**
 * Resize an image to a specific size (for PWA icons)
 * @param {string} base64 - Base64 encoded image string
 * @param {number} size - Target size in pixels (width and height)
 * @returns {Promise<string>} - Resized base64 PNG image
 */
export function resizeImageToSize(base64, size) {
  return new Promise((resolve, reject) => {
    if (!base64 || !isBase64Image(base64)) {
      reject(new Error('Invalid base64 image'));
      return;
    }

    const img = new Image();
    
    img.onload = () => {
      try {
        // Create canvas with exact size
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        
        const ctx = canvas.getContext('2d');
        
        // Draw image centered and scaled to fit
        const scale = Math.min(size / img.width, size / img.height);
        const scaledWidth = img.width * scale;
        const scaledHeight = img.height * scale;
        const x = (size - scaledWidth) / 2;
        const y = (size - scaledHeight) / 2;
        
        ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
        
        // Output as PNG to preserve transparency
        const resizedBase64 = canvas.toDataURL('image/png');
        resolve(resizedBase64);
      } catch (error) {
        reject(error);
      }
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };
    
    img.src = base64;
  });
}

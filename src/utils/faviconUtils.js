import { DEFAULT_FAVICON_TEXT, DEFAULT_SLOGAN, getSettings } from './customLists';

/**
 * Update the browser's favicon
 * @param {string|null} imageBase64 - Base64 encoded image or null to use default
 */
export function updateFavicon(imageBase64) {
  // Find or create the favicon link element
  let link = document.querySelector("link[rel*='icon']");
  
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  
  if (imageBase64) {
    link.href = imageBase64;
  } else {
    // Reset to default favicon
    link.href = `${process.env.PUBLIC_URL}/favicon.ico`;
  }
}

/**
 * Update the page title with the favicon text
 * @param {string} text - Text to display in the title
 * @param {string} slogan - Slogan to display after the text
 */
export function updatePageTitle(text, slogan) {
  const sloganText = slogan || DEFAULT_SLOGAN;
  if (text) {
    document.title = `${text} - ${sloganText}`;
  } else {
    document.title = `${DEFAULT_FAVICON_TEXT} - ${sloganText}`;
  }
}

/**
 * Apply favicon settings from Firestore
 * @returns {Promise<void>}
 */
export async function applyFaviconSettings() {
  try {
    const settings = await getSettings();
    
    if (settings.faviconImage) {
      updateFavicon(settings.faviconImage);
    }
    
    updatePageTitle(settings.faviconText, settings.headerSlogan);
  } catch (error) {
    console.error('Error applying favicon settings:', error);
    // Apply defaults on error
    updatePageTitle(DEFAULT_FAVICON_TEXT, DEFAULT_SLOGAN);
  }
}

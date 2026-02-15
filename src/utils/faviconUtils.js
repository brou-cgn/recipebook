import { DEFAULT_FAVICON_TEXT, DEFAULT_SLOGAN, getSettings } from './customLists';

/**
 * Update the browser's favicon and apple-touch-icon
 * @param {string|null} imageBase64 - Base64 encoded image or null to use default
 */
export function updateFavicon(imageBase64) {
  // Find or create the favicon link element
  let link = document.querySelector("link[rel='icon']");
  
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  
  // Find or create the apple-touch-icon link element
  let appleLink = document.querySelector("link[rel='apple-touch-icon']");
  
  if (!appleLink) {
    appleLink = document.createElement('link');
    appleLink.rel = 'apple-touch-icon';
    document.head.appendChild(appleLink);
  }
  
  if (imageBase64) {
    link.href = imageBase64;
    appleLink.href = imageBase64;
  } else {
    // Reset to default icons
    link.href = `${process.env.PUBLIC_URL}/favicon.ico`;
    appleLink.href = `${process.env.PUBLIC_URL}/logo192.png`;
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
    
    // Always call updateFavicon to ensure proper fallback to defaults
    updateFavicon(settings.faviconImage);
    
    updatePageTitle(settings.faviconText, settings.headerSlogan);
  } catch (error) {
    console.error('Error applying favicon settings:', error);
    // Apply defaults on error
    updatePageTitle(DEFAULT_FAVICON_TEXT, DEFAULT_SLOGAN);
  }
}

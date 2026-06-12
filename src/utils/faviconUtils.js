import { DEFAULT_FAVICON_TEXT, DEFAULT_SLOGAN, getSettings } from './customLists';

/**
 * Update the browser's favicon and social media meta tags
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
  
  if (imageBase64) {
    link.href = imageBase64;
  } else {
    // Reset to default icon
    link.href = `${process.env.PUBLIC_URL}/favicon.ico`;
  }
  
  // Update Open Graph and Twitter meta tags for social media sharing
  updateSocialMetaTags(imageBase64);
}

/**
 * Update the apple-touch-icon with app logo
 * @param {string|null} imageBase64 - Base64 encoded image or null to use default
 */
export function updateAppLogo(imageBase64) {
  // Find or create the apple-touch-icon link element
  let appleLink = document.querySelector("link[rel='apple-touch-icon']");
  
  if (!appleLink) {
    appleLink = document.createElement('link');
    appleLink.rel = 'apple-touch-icon';
    document.head.appendChild(appleLink);
  }
  
  if (imageBase64) {
    appleLink.href = imageBase64;
  } else {
    // Reset to default icon
    appleLink.href = `${process.env.PUBLIC_URL}/logo192.png`;
  }
}

/**
 * Update Open Graph and Twitter meta tags with the favicon image
 * @param {string|null} imageBase64 - Base64 encoded image or null to use default
 */
function updateSocialMetaTags(imageBase64) {
  const defaultImage = `${process.env.PUBLIC_URL}/logo512.png`;
  const imageUrl = imageBase64 || defaultImage;
  
  // Update Open Graph image
  let ogImage = document.querySelector("meta[property='og:image']");
  if (!ogImage) {
    ogImage = document.createElement('meta');
    ogImage.setAttribute('property', 'og:image');
    document.head.appendChild(ogImage);
  }
  ogImage.setAttribute('content', imageUrl);
  
  // Update Twitter image (Twitter uses 'name' attribute, not 'property')
  let twitterImage = document.querySelector("meta[name='twitter:image']");
  if (!twitterImage) {
    twitterImage = document.createElement('meta');
    twitterImage.setAttribute('name', 'twitter:image');
    document.head.appendChild(twitterImage);
  }
  twitterImage.setAttribute('content', imageUrl);
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
 * Send settings to service worker for dynamic manifest/icon generation
 * @param {Object} settings - App settings object
 */
function notifyServiceWorker(settings) {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'UPDATE_APP_SETTINGS',
      settings: {
        faviconText: settings.faviconText,
        headerSlogan: settings.headerSlogan,
        appLogoImage: settings.appLogoImage
      }
    });
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
    
    // Update app logo (apple-touch-icon) separately
    updateAppLogo(settings.appLogoImage);
    
    updatePageTitle(settings.faviconText, settings.headerSlogan);
    
    // Notify service worker of updated settings for PWA icon generation
    notifyServiceWorker(settings);
  } catch (error) {
    console.error('Error applying favicon settings:', error);
    // Apply defaults on error
    updatePageTitle(DEFAULT_FAVICON_TEXT, DEFAULT_SLOGAN);
  }
}

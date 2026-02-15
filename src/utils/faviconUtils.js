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
  
  // Update Open Graph and Twitter meta tags for social media sharing
  updateSocialMetaTags(imageBase64);
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
  
  // Update Twitter image
  let twitterImage = document.querySelector("meta[property='twitter:image']");
  if (!twitterImage) {
    twitterImage = document.createElement('meta');
    twitterImage.setAttribute('property', 'twitter:image');
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
 * Apply favicon settings from Firestore
 * @returns {Promise<void>}
 */
export async function applyFaviconSettings() {
  try {
    const settings = await getSettings();
    
    // Always call updateFavicon to ensure proper fallback to defaults
    updateFavicon(settings.faviconImage);
    
    updatePageTitle(settings.faviconText, settings.headerSlogan);
    
    // Update manifest with custom favicon
    updateManifest(settings.faviconImage, settings.faviconText);
  } catch (error) {
    console.error('Error applying favicon settings:', error);
    // Apply defaults on error
    updatePageTitle(DEFAULT_FAVICON_TEXT, DEFAULT_SLOGAN);
  }
}

/**
 * Update the PWA manifest with custom favicon
 * @param {string|null} imageBase64 - Base64 encoded image or null to use default
 * @param {string} faviconText - Text to use for the app name
 */
function updateManifest(imageBase64, faviconText) {
  // Skip manifest update if URL.createObjectURL is not available (e.g., in tests)
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return;
  }
  
  const appName = faviconText || DEFAULT_FAVICON_TEXT;
  
  // Create a dynamic manifest
  const manifest = {
    short_name: appName,
    name: `${appName} - Unsere Besten`,
    icons: imageBase64 ? [
      {
        src: imageBase64,
        sizes: "64x64 32x32 24x24 16x16",
        type: "image/png"
      },
      {
        src: imageBase64,
        type: "image/png",
        sizes: "192x192",
        purpose: "any maskable"
      },
      {
        src: imageBase64,
        type: "image/png",
        sizes: "512x512",
        purpose: "any maskable"
      }
    ] : [
      {
        src: "favicon.ico",
        sizes: "64x64 32x32 24x24 16x16",
        type: "image/x-icon"
      },
      {
        src: "logo192.png",
        type: "image/png",
        sizes: "192x192",
        purpose: "any maskable"
      },
      {
        src: "logo512.png",
        type: "image/png",
        sizes: "512x512",
        purpose: "any maskable"
      }
    ],
    start_url: ".",
    display: "standalone",
    theme_color: "#4CAF50",
    background_color: "#ffffff",
    description: `${appName} - A Progressive Web App for managing your favorite recipes`,
    categories: ["food", "lifestyle", "productivity"],
    orientation: "portrait-primary"
  };
  
  // Convert manifest to JSON and create a blob URL
  const manifestBlob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
  const manifestURL = URL.createObjectURL(manifestBlob);
  
  // Update or create the manifest link
  let manifestLink = document.querySelector("link[rel='manifest']");
  if (!manifestLink) {
    manifestLink = document.createElement('link');
    manifestLink.rel = 'manifest';
    document.head.appendChild(manifestLink);
  }
  
  // Clean up old blob URL if it exists
  if (manifestLink.href && manifestLink.href.startsWith('blob:')) {
    URL.revokeObjectURL(manifestLink.href);
  }
  
  manifestLink.href = manifestURL;
}

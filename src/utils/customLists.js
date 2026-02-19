/**
 * Default configuration values for customizable lists
 */
import { db } from '../firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

export const DEFAULT_CUISINE_TYPES = [
  'Italian',
  'Thai',
  'Chinese',
  'Japanese',
  'Indian',
  'Mexican',
  'French',
  'German',
  'American',
  'Mediterranean',
  'Vegetarian',
  'Vegan',
  'Other'
];

export const DEFAULT_MEAL_CATEGORIES = [
  'Appetizer',
  'Main Course',
  'Dessert',
  'Soup',
  'Salad',
  'Snack',
  'Beverage',
  'Side Dish'
];

export const DEFAULT_UNITS = [
  'g',
  'kg',
  'ml',
  'l',
  'tsp',
  'tbsp',
  'cup',
  'oz',
  'lb',
  'piece',
  'pinch'
];

export const DEFAULT_PORTION_UNITS = [
  { id: 'portion', singular: 'Portion', plural: 'Portionen' },
  { id: 'pizza', singular: 'Pizza', plural: 'Pizzen' },
  { id: 'drink', singular: 'Drink', plural: 'Drinks' },
  { id: 'serving', singular: 'Serving', plural: 'Servings' },
  { id: 'person', singular: 'Person', plural: 'Personen' }
];

export const DEFAULT_SLOGAN = 'Unsere Besten';
export const DEFAULT_FAVICON_TEXT = 'DishBook';

// Default button icons (emoji icons)
export const DEFAULT_BUTTON_ICONS = {
  cookingMode: '👨‍🍳',
  importRecipe: '📥',
  scanImage: '📷',
  webImport: '🌐',
  closeButton: '✕',
  filterButton: '⚙'
};

// Cache for settings to avoid repeated Firestore reads
let settingsCache = null;

/**
 * Get settings from Firestore or return defaults
 * @returns {Promise<Object>} Promise resolving to settings object
 */
export async function getSettings() {
  // Return cached settings if available
  if (settingsCache) {
    return settingsCache;
  }
  
  try {
    const settingsDoc = await getDoc(doc(db, 'settings', 'app'));
    
    if (settingsDoc.exists()) {
      const settings = settingsDoc.data();
      
      // Ensure all fields exist for backward compatibility
      settingsCache = {
        cuisineTypes: settings.cuisineTypes || DEFAULT_CUISINE_TYPES,
        mealCategories: settings.mealCategories || DEFAULT_MEAL_CATEGORIES,
        units: settings.units || DEFAULT_UNITS,
        portionUnits: settings.portionUnits || DEFAULT_PORTION_UNITS,
        headerSlogan: settings.headerSlogan || DEFAULT_SLOGAN,
        faviconText: settings.faviconText || DEFAULT_FAVICON_TEXT,
        faviconImage: settings.faviconImage || null,
        appLogoImage: settings.appLogoImage || null,
        buttonIcons: settings.buttonIcons || DEFAULT_BUTTON_ICONS,
        timelineBubbleIcon: settings.timelineBubbleIcon || null
      };
      
      return settingsCache;
    }
    
    // No settings document exists, return and create defaults
    const defaultSettings = {
      cuisineTypes: DEFAULT_CUISINE_TYPES,
      mealCategories: DEFAULT_MEAL_CATEGORIES,
      units: DEFAULT_UNITS,
      portionUnits: DEFAULT_PORTION_UNITS,
      headerSlogan: DEFAULT_SLOGAN,
      faviconText: DEFAULT_FAVICON_TEXT,
      faviconImage: null,
      appLogoImage: null,
      buttonIcons: DEFAULT_BUTTON_ICONS,
      timelineBubbleIcon: null
    };
    
    // Create the settings document
    await setDoc(doc(db, 'settings', 'app'), defaultSettings);
    settingsCache = defaultSettings;
    
    return defaultSettings;
  } catch (error) {
    console.error('Error getting settings:', error);
    
    // Return defaults on error
    return {
      cuisineTypes: DEFAULT_CUISINE_TYPES,
      mealCategories: DEFAULT_MEAL_CATEGORIES,
      units: DEFAULT_UNITS,
      portionUnits: DEFAULT_PORTION_UNITS,
      headerSlogan: DEFAULT_SLOGAN,
      faviconText: DEFAULT_FAVICON_TEXT,
      faviconImage: null,
      appLogoImage: null,
      buttonIcons: DEFAULT_BUTTON_ICONS,
      timelineBubbleIcon: null
    };
  }
}

/**
 * Get customizable lists from Firestore or return defaults
 * @returns {Promise<Object>} Promise resolving to custom lists object
 */
export async function getCustomLists() {
  const settings = await getSettings();
  
  return {
    cuisineTypes: settings.cuisineTypes,
    mealCategories: settings.mealCategories,
    units: settings.units,
    portionUnits: settings.portionUnits
  };
}

/**
 * Save customizable lists to Firestore
 * @param {Object} lists - Lists object containing cuisineTypes, mealCategories, units, portionUnits
 * @returns {Promise<void>}
 */
export async function saveCustomLists(lists) {
  try {
    const settingsRef = doc(db, 'settings', 'app');
    await updateDoc(settingsRef, lists);
    
    // Update cache
    if (settingsCache) {
      settingsCache = { ...settingsCache, ...lists };
    }
  } catch (error) {
    console.error('Error saving custom lists:', error);
    throw error;
  }
}

/**
 * Reset lists to defaults
 * @returns {Promise<Object>} Promise resolving to default lists
 */
export async function resetCustomLists() {
  const defaultLists = {
    cuisineTypes: DEFAULT_CUISINE_TYPES,
    mealCategories: DEFAULT_MEAL_CATEGORIES,
    units: DEFAULT_UNITS,
    portionUnits: DEFAULT_PORTION_UNITS
  };
  
  await saveCustomLists(defaultLists);
  return defaultLists;
}

/**
 * Get the header slogan from Firestore or return default
 * @returns {Promise<string>} Promise resolving to header slogan
 */
export async function getHeaderSlogan() {
  const settings = await getSettings();
  return settings.headerSlogan;
}

/**
 * Save the header slogan to Firestore
 * @param {string} slogan - Header slogan
 * @returns {Promise<void>}
 */
export async function saveHeaderSlogan(slogan) {
  try {
    const settingsRef = doc(db, 'settings', 'app');
    await updateDoc(settingsRef, { headerSlogan: slogan });
    
    // Update cache
    if (settingsCache) {
      settingsCache.headerSlogan = slogan;
    }
  } catch (error) {
    console.error('Error saving header slogan:', error);
    throw error;
  }
}

/**
 * Get the favicon image from Firestore
 * @returns {Promise<string|null>} Promise resolving to base64 encoded image or null
 */
export async function getFaviconImage() {
  const settings = await getSettings();
  return settings.faviconImage;
}

/**
 * Save the favicon image to Firestore
 * @param {string} imageBase64 - Base64 encoded image
 * @returns {Promise<void>}
 */
export async function saveFaviconImage(imageBase64) {
  try {
    const settingsRef = doc(db, 'settings', 'app');
    
    if (imageBase64) {
      await updateDoc(settingsRef, { faviconImage: imageBase64 });
      
      // Update cache
      if (settingsCache) {
        settingsCache.faviconImage = imageBase64;
      }
    } else {
      await updateDoc(settingsRef, { faviconImage: null });
      
      // Update cache
      if (settingsCache) {
        settingsCache.faviconImage = null;
      }
    }
  } catch (error) {
    console.error('Error saving favicon image:', error);
    throw error;
  }
}

/**
 * Get the app logo image from Firestore
 * @returns {Promise<string|null>} Promise resolving to base64 encoded image or null
 */
export async function getAppLogoImage() {
  const settings = await getSettings();
  return settings.appLogoImage;
}

/**
 * Save the app logo image to Firestore
 * @param {string} imageBase64 - Base64 encoded image
 * @returns {Promise<void>}
 */
export async function saveAppLogoImage(imageBase64) {
  try {
    const settingsRef = doc(db, 'settings', 'app');
    
    if (imageBase64) {
      await updateDoc(settingsRef, { appLogoImage: imageBase64 });
      
      // Update cache
      if (settingsCache) {
        settingsCache.appLogoImage = imageBase64;
      }
    } else {
      await updateDoc(settingsRef, { appLogoImage: null });
      
      // Update cache
      if (settingsCache) {
        settingsCache.appLogoImage = null;
      }
    }
  } catch (error) {
    console.error('Error saving app logo image:', error);
    throw error;
  }
}

/**
 * Get the favicon text from Firestore or return default
 * @returns {Promise<string>} Promise resolving to favicon text
 */
export async function getFaviconText() {
  const settings = await getSettings();
  return settings.faviconText;
}

/**
 * Save the favicon text to Firestore
 * @param {string} text - Favicon text
 * @returns {Promise<void>}
 */
export async function saveFaviconText(text) {
  try {
    const settingsRef = doc(db, 'settings', 'app');
    await updateDoc(settingsRef, { faviconText: text || DEFAULT_FAVICON_TEXT });
    
    // Update cache
    if (settingsCache) {
      settingsCache.faviconText = text || DEFAULT_FAVICON_TEXT;
    }
  } catch (error) {
    console.error('Error saving favicon text:', error);
    throw error;
  }
}

/**
 * Clear the settings cache (useful when settings are updated)
 */
export function clearSettingsCache() {
  settingsCache = null;
}

/**
 * Get the button icons from Firestore or return defaults
 * @returns {Promise<Object>} Promise resolving to button icons object
 */
export async function getButtonIcons() {
  const settings = await getSettings();
  return settings.buttonIcons || DEFAULT_BUTTON_ICONS;
}

/**
 * Save the button icons to Firestore
 * @param {Object} buttonIcons - Button icons object
 * @returns {Promise<void>}
 */
export async function saveButtonIcons(buttonIcons) {
  try {
    const settingsRef = doc(db, 'settings', 'app');
    await updateDoc(settingsRef, { buttonIcons });
    
    // Update cache
    if (settingsCache) {
      settingsCache.buttonIcons = buttonIcons;
    }
  } catch (error) {
    console.error('Error saving button icons:', error);
    throw error;
  }
}

/**
 * Reset button icons to defaults
 * @returns {Promise<Object>} Promise resolving to default button icons
 */
export async function resetButtonIcons() {
  await saveButtonIcons(DEFAULT_BUTTON_ICONS);
  return DEFAULT_BUTTON_ICONS;
}

/**
 * Get the timeline bubble icon from Firestore
 * @returns {Promise<string|null>} Promise resolving to base64 encoded image or null
 */
export async function getTimelineBubbleIcon() {
  const settings = await getSettings();
  return settings.timelineBubbleIcon || null;
}

/**
 * Save the timeline bubble icon to Firestore
 * @param {string|null} imageBase64 - Base64 encoded image or null to remove
 * @returns {Promise<void>}
 */
export async function saveTimelineBubbleIcon(imageBase64) {
  try {
    const settingsRef = doc(db, 'settings', 'app');
    await updateDoc(settingsRef, { timelineBubbleIcon: imageBase64 || null });

    // Update cache
    if (settingsCache) {
      settingsCache.timelineBubbleIcon = imageBase64 || null;
    }
  } catch (error) {
    console.error('Error saving timeline bubble icon:', error);
    throw error;
  }
}

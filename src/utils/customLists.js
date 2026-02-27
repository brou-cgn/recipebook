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
  'g', 'kg', 'ml', 'l',
  'EL', 'TL', 'Esslöffel', 'Teelöffel',
  'Prise', 'Prisen',
  'Tasse', 'Tassen',
  'Becher',
  'Stück', 'Stk',
  'Bund',
  'Pck', 'Pkg',
  'Dose', 'Dosen',
  'cl', 'dl',
  'tsp', 'tbsp',
  'cup', 'oz', 'lb',
  'piece', 'pinch'
];

export const DEFAULT_PORTION_UNITS = [
  { id: 'portion', singular: 'Portion', plural: 'Portionen' },
  { id: 'pizza', singular: 'Pizza', plural: 'Pizzen' },
  { id: 'drink', singular: 'Drink', plural: 'Drinks' },
  { id: 'serving', singular: 'Serving', plural: 'Servings' },
  { id: 'person', singular: 'Person', plural: 'Personen' }
];

export const DEFAULT_CONVERSION_TABLE = [
  { id: 'butter-el', ingredient: 'Butter', unit: 'EL', grams: '15', milliliters: '' },
  { id: 'mehl-el', ingredient: 'Mehl', unit: 'EL', grams: '10', milliliters: '' },
  { id: 'milch-el', ingredient: 'Milch', unit: 'EL', grams: '', milliliters: '15' },
  { id: 'oel-el', ingredient: 'Öl', unit: 'EL', grams: '', milliliters: '13' },
  { id: 'salz-tl', ingredient: 'Salz', unit: 'TL', grams: '6', milliliters: '' },
  { id: 'zucker-el', ingredient: 'Zucker', unit: 'EL', grams: '12', milliliters: '' },
];

export const DEFAULT_SLOGAN = 'Unsere Besten';
export const DEFAULT_FAVICON_TEXT = 'DishBook';

// Tile size options for grid views
export const TILE_SIZE_SMALL = '180px';
export const TILE_SIZE_MEDIUM = '250px';
export const TILE_SIZE_LARGE = '320px';
export const DEFAULT_TILE_SIZE = TILE_SIZE_MEDIUM;

/**
 * Get the tile size preference from localStorage
 * @returns {string} The tile size value (e.g. '180px', '250px', '320px')
 */
export function getTileSizePreference() {
  return localStorage.getItem('tileSizePreference') || DEFAULT_TILE_SIZE;
}

/**
 * Save the tile size preference to localStorage
 * @param {string} size - Tile size value
 */
export function saveTileSizePreference(size) {
  localStorage.setItem('tileSizePreference', size);
}

/**
 * Apply the tile size preference as a CSS variable on the document root
 * @param {string} [size] - Tile size value; reads from localStorage if omitted
 */
export function applyTileSizePreference(size) {
  const tileSize = size || getTileSizePreference();
  document.documentElement.style.setProperty('--tile-size-min', tileSize);
}

// Standard-Prompt für KI-Rezepterkennung (optimiert)
export const DEFAULT_AI_RECIPE_PROMPT = `Analysiere dieses Rezeptbild und extrahiere alle Informationen als strukturiertes JSON.

Bitte gib das Ergebnis im folgenden JSON-Format zurück:
{
  "titel": "Name des Rezepts",
  "portionen": Anzahl der Portionen als Zahl (nur die Zahl, z.B. 4),
  "zubereitungszeit": Zeit in Minuten als Zahl (nur die Zahl, z.B. 30),
  "kochzeit": Kochzeit in Minuten als Zahl (optional),
  "schwierigkeit": Schwierigkeitsgrad 1-5 (1=sehr einfach, 5=sehr schwer),
  "kulinarik": "Kulinarische Herkunft (z.B. Italienisch, Asiatisch, Deutsch)",
  "kategorie": "Kategorie (z.B. Hauptgericht, Dessert, Vorspeise, Beilage, Snack)",
  "tags": ["vegetarisch", "vegan", "glutenfrei"], // nur falls explizit erwähnt
  "zutaten": [
    "500 g Spaghetti",
    "200 g Speck",
    "4 Eier"
  ],
  "zubereitung": [
    "Wasser in einem großen Topf zum Kochen bringen und salzen",
    "Spaghetti nach Packungsanweisung kochen",
    "Speck in Würfel schneiden und in einer Pfanne knusprig braten"
  ],
  "notizen": "Zusätzliche Hinweise oder Tipps (optional)"
}

WICHTIGE REGELN:
1. Mengenangaben: Verwende immer das Format "Zahl Einheit Zutat" (z.B. "500 g Mehl", "2 Esslöffel Olivenöl", "1 Prise Salz")
2. Zahlen: portionen, zubereitungszeit, kochzeit und schwierigkeit müssen reine Zahlen sein (kein Text!)
3. Zubereitungsschritte: Jeder Schritt sollte eine vollständige, klare Anweisung sein
4. Fehlende Informationen: Wenn eine Information nicht lesbar oder nicht vorhanden ist, verwende null oder lasse das Array leer
5. Einheiten: Standardisiere Einheiten (g statt Gramm, ml statt Milliliter, Esslöffel statt EL, Teelöffel statt TL)
6. Tags: Füge nur Tags hinzu, die explizit im Rezept erwähnt werden oder eindeutig aus den Zutaten ableitbar sind
7. Wähle für die Felder "kulinarik" und "kategorie" **NUR** Werte aus diesen Listen:
**Verfügbare Kulinarik-Typen:**
{{CUISINE_TYPES}}
Wenn kein Fleisch oder Fisch enthalten ist, setze zusätzlich **immer** "Vegetarisch".
Wenn keine tierischen Produkte enthalten sind (z.B. Butter, Fleisch, Fisch, Eier usw.), setze zusätzlich **immer** "Vegan".
**Verfügbare Speisekategorien:**
{{MEAL_CATEGORIES}}
Wenn das Rezept zu keiner dieser Kategorien passt, wähle die nächstliegende oder lasse das Feld leer. Mehrfachauswahlen sind möglich
8. Zubereitung: Das Feld "zubereitung" MUSS immer ein JSON-Array von Strings sein. Schreibe jeden einzelnen Schritt als separaten String in das Array. Fasse NIEMALS mehrere Schritte in einem einzigen String zusammen. Mindestens 1 Schritt muss vorhanden sein, wenn Zubereitungsinformationen erkennbar sind.

BEISPIEL GUTE EXTRAKTION:
{
  "titel": "Spaghetti Carbonara",
  "portionen": 4,
  "zubereitungszeit": 30,
  "schwierigkeit": 2,
  "kulinarik": "Italienisch",
  "kategorie": "Hauptgericht",
  "tags": [],
  "zutaten": [
    "400 g Spaghetti",
    "200 g Guanciale oder Pancetta",
    "4 Eigelb",
    "100 g Pecorino Romano",
    "Schwarzer Pfeffer",
    "Salz"
  ],
  "zubereitung": [
    "Reichlich Wasser in einem großen Topf zum Kochen bringen und großzügig salzen",
    "Guanciale in kleine Würfel schneiden und bei mittlerer Hitze knusprig braten",
    "Eigelb mit geriebenem Pecorino und viel schwarzem Pfeffer verrühren",
    "Spaghetti nach Packungsanweisung bissfest kochen",
    "Pasta abgießen, dabei etwas Nudelwasser auffangen",
    "Pasta zum Guanciale geben, von der Hitze nehmen",
    "Ei-Käse-Mischung unterrühren, mit Nudelwasser cremig machen",
    "Sofort servieren mit extra Pecorino und Pfeffer"
  ],
  "notizen": "Wichtig: Die Pfanne muss von der Hitze genommen werden, bevor die Eier hinzugefügt werden, sonst stocken sie."
}

Extrahiere nun alle sichtbaren Informationen aus dem Bild genau nach diesem Schema.`;

// Default button icons (emoji icons)
export const DEFAULT_BUTTON_ICONS = {
  cookingMode: '👨‍🍳',
  // Alt icon shown when the top-left image corner is too bright (high luminance)
  cookingModeAlt: '👨‍🍳',
  importRecipe: '📥',
  scanImage: '📷',
  webImport: '🌐',
  closeButton: '✕',
  // Alt icon shown when the top-right image corner is too bright (high luminance)
  closeButtonAlt: '✕',
  menuCloseButton: '✕',
  filterButton: '⚙',
  copyLink: '📋',
  nutritionEmpty: '➕',
  nutritionFilled: '🥦',
  privateListBack: '✕',
  shoppingList: '🛒',
  bringButton: '🛍️'
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

      let aiRecipePrompt = settings.aiRecipePrompt || DEFAULT_AI_RECIPE_PROMPT;

      // Migration: if the stored prompt is missing required placeholders, reset to default
      if (
        !aiRecipePrompt.includes('{{CUISINE_TYPES}}') ||
        !aiRecipePrompt.includes('{{MEAL_CATEGORIES}}')
      ) {
        console.warn(
          'AI prompt in Firestore is missing placeholders – migrating to DEFAULT_AI_RECIPE_PROMPT'
        );
        aiRecipePrompt = DEFAULT_AI_RECIPE_PROMPT;
        // Asynchronously update Firestore (fire-and-forget, does not block getSettings)
        updateDoc(doc(db, 'settings', 'app'), { aiRecipePrompt: DEFAULT_AI_RECIPE_PROMPT }).catch(
          (err) => console.error('Failed to migrate aiRecipePrompt in Firestore:', err)
        );
      }

      // Ensure all fields exist for backward compatibility
      settingsCache = {
        cuisineTypes: settings.cuisineTypes || DEFAULT_CUISINE_TYPES,
        mealCategories: settings.mealCategories || DEFAULT_MEAL_CATEGORIES,
        units: settings.units || DEFAULT_UNITS,
        portionUnits: settings.portionUnits || DEFAULT_PORTION_UNITS,
        conversionTable: settings.conversionTable || DEFAULT_CONVERSION_TABLE,
        headerSlogan: settings.headerSlogan || DEFAULT_SLOGAN,
        faviconText: settings.faviconText || DEFAULT_FAVICON_TEXT,
        faviconImage: settings.faviconImage || null,
        appLogoImage: settings.appLogoImage || null,
        buttonIcons: { ...DEFAULT_BUTTON_ICONS, ...(settings.buttonIcons || {}) },
        timelineBubbleIcon: settings.timelineBubbleIcon || null,
        timelineMenuBubbleIcon: settings.timelineMenuBubbleIcon || null,
        timelineRecipeDefaultImage: settings.timelineRecipeDefaultImage || null,
        timelineMenuDefaultImage: settings.timelineMenuDefaultImage || null,
        aiRecipePrompt,
        autoShareOnCreate: settings.autoShareOnCreate ?? false
      };
      
      return settingsCache;
    }
    
    // No settings document exists, return and create defaults
    const defaultSettings = {
      cuisineTypes: DEFAULT_CUISINE_TYPES,
      mealCategories: DEFAULT_MEAL_CATEGORIES,
      units: DEFAULT_UNITS,
      portionUnits: DEFAULT_PORTION_UNITS,
      conversionTable: DEFAULT_CONVERSION_TABLE,
      headerSlogan: DEFAULT_SLOGAN,
      faviconText: DEFAULT_FAVICON_TEXT,
      faviconImage: null,
      appLogoImage: null,
      buttonIcons: DEFAULT_BUTTON_ICONS,
      timelineBubbleIcon: null,
      timelineMenuBubbleIcon: null,
      timelineRecipeDefaultImage: null,
      timelineMenuDefaultImage: null,
      aiRecipePrompt: DEFAULT_AI_RECIPE_PROMPT,
      autoShareOnCreate: false
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
      conversionTable: DEFAULT_CONVERSION_TABLE,
      headerSlogan: DEFAULT_SLOGAN,
      faviconText: DEFAULT_FAVICON_TEXT,
      faviconImage: null,
      appLogoImage: null,
      buttonIcons: DEFAULT_BUTTON_ICONS,
      timelineBubbleIcon: null,
      timelineMenuBubbleIcon: null,
      timelineRecipeDefaultImage: null,
      timelineMenuDefaultImage: null,
      aiRecipePrompt: DEFAULT_AI_RECIPE_PROMPT,
      autoShareOnCreate: false
    };
  }
}

/**
 * Get customizable lists from Firestore or return defaults
 * @returns {Promise<Object>} Promise resolving to custom lists object
 */
export async function getCustomLists() {
  const settings = await getSettings();

  console.log('DEBUG getCustomLists - cuisineTypes:', settings.cuisineTypes);
  console.log('DEBUG getCustomLists - mealCategories:', settings.mealCategories);
  
  return {
    cuisineTypes: settings.cuisineTypes ?? DEFAULT_CUISINE_TYPES,
    mealCategories: settings.mealCategories ?? DEFAULT_MEAL_CATEGORIES,
    units: settings.units ?? DEFAULT_UNITS,
    portionUnits: settings.portionUnits ?? DEFAULT_PORTION_UNITS,
    conversionTable: settings.conversionTable ?? DEFAULT_CONVERSION_TABLE,
    customUnits: settings.customUnits ?? []
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
    portionUnits: DEFAULT_PORTION_UNITS,
    conversionTable: DEFAULT_CONVERSION_TABLE
  };
  
  await saveCustomLists(defaultLists);
  return defaultLists;
}

/**
 * Get all available units from defaults and custom units stored in Firestore
 * Combines DEFAULT_UNITS, customUnits, and units from conversionTable
 * @returns {Promise<string[]>} Promise resolving to array of unit strings
 */
export async function getAvailableUnits() {
  try {
    const lists = await getCustomLists();
    const customUnits = lists.customUnits || [];
    const conversionUnits = (lists.conversionTable || [])
      .map(entry => entry.unit)
      .filter(u => u && u.trim());

    const allUnits = [
      ...DEFAULT_UNITS,
      ...customUnits,
      ...conversionUnits
    ];

    return [...new Set(allUnits)].filter(u => u);
  } catch (error) {
    console.error('Error loading units:', error);
    return DEFAULT_UNITS;
  }
}

/**
 * Add a custom unit to Firestore
 * @param {string} unit - Unit to add
 * @returns {Promise<void>}
 */
export async function addCustomUnit(unit) {
  if (!unit || !unit.trim()) return;

  try {
    const lists = await getCustomLists();
    const customUnits = lists.customUnits || [];

    if (!customUnits.some(u => u.toLowerCase() === unit.trim().toLowerCase())) {
      customUnits.push(unit.trim());
      await saveCustomLists({ ...lists, customUnits });
    }
  } catch (error) {
    console.error('Error adding custom unit:', error);
    throw error;
  }
}

/**
 * Remove a custom unit from Firestore
 * @param {string} unit - Unit to remove
 * @returns {Promise<void>}
 */
export async function removeCustomUnit(unit) {
  try {
    const lists = await getCustomLists();
    const customUnits = (lists.customUnits || []).filter(u => u !== unit);
    await saveCustomLists({ ...lists, customUnits });
  } catch (error) {
    console.error('Error removing custom unit:', error);
    throw error;
  }
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
 * Adds missing conversion entries to the conversionTable in settings.
 * Entries that already exist (same unit + ingredient, case-insensitive) are skipped.
 *
 * @param {Array<{unit: string, ingredient: string}>} missingEntries - Missing unit+ingredient pairs
 * @param {Object[]} currentTable - The current conversion table (to skip known entries early)
 * @returns {Promise<void>}
 */
export async function addMissingConversionEntries(missingEntries, currentTable = []) {
  if (!missingEntries || missingEntries.length === 0) return;

  // Skip entries already present in the local state table
  const candidates = missingEntries.filter(
    ({ unit, ingredient }) =>
      !currentTable.some(
        e =>
          e.unit &&
          e.ingredient &&
          e.unit.toLowerCase() === unit.toLowerCase() &&
          e.ingredient.toLowerCase() === ingredient.toLowerCase()
      )
  );

  if (candidates.length === 0) return;

  try {
    const settingsRef = doc(db, 'settings', 'app');
    const settingsDoc = await getDoc(settingsRef);
    const existingTable = settingsDoc.exists()
      ? settingsDoc.data().conversionTable || []
      : [];

    // Filter out entries already persisted in Firestore
    const toAdd = candidates.filter(
      ({ unit, ingredient }) =>
        !existingTable.some(
          e =>
            e.unit &&
            e.ingredient &&
            e.unit.toLowerCase() === unit.toLowerCase() &&
            e.ingredient.toLowerCase() === ingredient.toLowerCase()
        )
    );

    if (toAdd.length === 0) return;

    const newEntries = toAdd.map(({ unit, ingredient }) => ({
      id: `${ingredient.toLowerCase().replace(/\s+/g, '-')}-${unit.toLowerCase()}`,
      ingredient,
      unit,
      grams: '',
      milliliters: '',
    }));

    const updatedTable = [...existingTable, ...newEntries];
    await updateDoc(settingsRef, { conversionTable: updatedTable });

    // Update cache
    if (settingsCache) {
      settingsCache.conversionTable = updatedTable;
    }
  } catch (error) {
    console.error('Error adding missing conversion entries:', error);
  }
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

/**
 * Get the timeline menu bubble icon from Firestore
 * @returns {Promise<string|null>} Promise resolving to base64 encoded image or null
 */
export async function getTimelineMenuBubbleIcon() {
  const settings = await getSettings();
  return settings.timelineMenuBubbleIcon || null;
}

/**
 * Save the timeline menu bubble icon to Firestore
 * @param {string|null} imageBase64 - Base64 encoded image or null to remove
 * @returns {Promise<void>}
 */
export async function saveTimelineMenuBubbleIcon(imageBase64) {
  try {
    const settingsRef = doc(db, 'settings', 'app');
    await updateDoc(settingsRef, { timelineMenuBubbleIcon: imageBase64 || null });

    // Update cache
    if (settingsCache) {
      settingsCache.timelineMenuBubbleIcon = imageBase64 || null;
    }
  } catch (error) {
    console.error('Error saving timeline menu bubble icon:', error);
    throw error;
  }
}

/**
 * Get the default recipe image for the timeline from Firestore
 * @returns {Promise<string|null>} Promise resolving to base64 encoded image or null
 */
export async function getTimelineRecipeDefaultImage() {
  const settings = await getSettings();
  return settings.timelineRecipeDefaultImage || null;
}

/**
 * Save the default recipe image for the timeline to Firestore
 * @param {string|null} imageBase64 - Base64 encoded image or null to remove
 * @returns {Promise<void>}
 */
export async function saveTimelineRecipeDefaultImage(imageBase64) {
  try {
    const settingsRef = doc(db, 'settings', 'app');
    await updateDoc(settingsRef, { timelineRecipeDefaultImage: imageBase64 || null });

    // Update cache
    if (settingsCache) {
      settingsCache.timelineRecipeDefaultImage = imageBase64 || null;
    }
  } catch (error) {
    console.error('Error saving timeline recipe default image:', error);
    throw error;
  }
}

/**
 * Get the default menu image for the timeline from Firestore
 * @returns {Promise<string|null>} Promise resolving to base64 encoded image or null
 */
export async function getTimelineMenuDefaultImage() {
  const settings = await getSettings();
  return settings.timelineMenuDefaultImage || null;
}

/**
 * Save the default menu image for the timeline to Firestore
 * @param {string|null} imageBase64 - Base64 encoded image or null to remove
 * @returns {Promise<void>}
 */
export async function saveTimelineMenuDefaultImage(imageBase64) {
  try {
    const settingsRef = doc(db, 'settings', 'app');
    await updateDoc(settingsRef, { timelineMenuDefaultImage: imageBase64 || null });

    // Update cache
    if (settingsCache) {
      settingsCache.timelineMenuDefaultImage = imageBase64 || null;
    }
  } catch (error) {
    console.error('Error saving timeline menu default image:', error);
    throw error;
  }
}

/**
 * Get the AI recipe extraction prompt from Firestore or return default
 * @returns {Promise<string>} Promise resolving to AI prompt
 */
export async function getAIRecipePrompt() {
  const settings = await getSettings();
  return settings.aiRecipePrompt || DEFAULT_AI_RECIPE_PROMPT;
}

/**
 * Save the AI recipe extraction prompt to Firestore
 * @param {string} prompt - AI recipe extraction prompt
 * @returns {Promise<void>}
 */
export async function saveAIRecipePrompt(prompt) {
  try {
    const settingsRef = doc(db, 'settings', 'app');
    await updateDoc(settingsRef, { aiRecipePrompt: prompt || DEFAULT_AI_RECIPE_PROMPT });

    // Update cache
    if (settingsCache) {
      settingsCache.aiRecipePrompt = prompt || DEFAULT_AI_RECIPE_PROMPT;
    }
  } catch (error) {
    console.error('Error saving AI recipe prompt:', error);
    throw error;
  }
}

/**
 * Reset AI recipe prompt to default
 * @returns {Promise<string>} Promise resolving to default prompt
 */
export async function resetAIRecipePrompt() {
  await saveAIRecipePrompt(DEFAULT_AI_RECIPE_PROMPT);
  return DEFAULT_AI_RECIPE_PROMPT;
}

/**
 * Get the autoShareOnCreate setting from Firestore
 * @returns {Promise<boolean>} Promise resolving to the setting value
 */
export async function getAutoShareOnCreate() {
  const settings = await getSettings();
  return settings.autoShareOnCreate ?? false;
}

/**
 * Save the autoShareOnCreate setting to Firestore
 * @param {boolean} value - Whether to auto-share new recipes
 * @returns {Promise<void>}
 */
export async function saveAutoShareOnCreate(value) {
  try {
    const settingsRef = doc(db, 'settings', 'app');
    await updateDoc(settingsRef, { autoShareOnCreate: value });

    // Update cache
    if (settingsCache) {
      settingsCache.autoShareOnCreate = value;
    }
  } catch (error) {
    console.error('Error saving autoShareOnCreate setting:', error);
    throw error;
  }
}

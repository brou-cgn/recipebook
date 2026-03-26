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

export const DEFAULT_SLOGAN = 'Unsere besten Momente';
export const DEFAULT_FAVICON_TEXT = 'brouBook';

/**
 * Default cuisine groups – each entry defines a parent type with its child types.
 * Parent types cannot be assigned directly to recipes; they group child types for filtering.
 * @type {Array<{name: string, children: string[]}>}
 */
export const DEFAULT_CUISINE_GROUPS = [];

/**
 * Expand a list of selected cuisine names by replacing any parent group names with their
 * child types. Handles nested (multi-level) group structures recursively.
 * When a group name is selected, the group name itself and all its descendant types are
 * included, so that recipes tagged directly with the group or any of its sub-types match.
 *
 * @param {string[]} selectedCuisines - Selected cuisine/group names from the filter UI
 * @param {Array<{name: string, children: string[]}>} cuisineGroups - Configured cuisine groups
 * @returns {string[]} Expanded list of cuisine names including the selected items and all their descendants
 */
export function expandCuisineSelection(selectedCuisines, cuisineGroups) {
  if (!selectedCuisines || selectedCuisines.length === 0) return [];
  if (!cuisineGroups || cuisineGroups.length === 0) return selectedCuisines;

  const groupMap = new Map(cuisineGroups.map(g => [g.name, g.children || []]));
  const expanded = new Set();
  const visited = new Set();

  function expandName(name) {
    if (visited.has(name)) return;
    visited.add(name);
    expanded.add(name);
    if (groupMap.has(name)) {
      for (const child of groupMap.get(name)) {
        expandName(child);
      }
    }
  }

  for (const selected of selectedCuisines) {
    expandName(selected);
  }
  return [...expanded];
}

/**
 * Returns the set of parent (group) cuisine type names.
 * @param {Array<{name: string, children: string[]}>} cuisineGroups
 * @returns {Set<string>}
 */
export function getParentCuisineNames(cuisineGroups) {
  const names = new Set();
  if (Array.isArray(cuisineGroups)) {
    for (const g of cuisineGroups) {
      names.add(g.name);
    }
  }
  return names;
}

// Sort settings defaults
export const DEFAULT_TRENDING_DAYS = 30;
export const DEFAULT_TRENDING_MIN_VIEWS = 5;
export const DEFAULT_NEW_RECIPE_DAYS = 30;
export const DEFAULT_RATING_MIN_VOTES = 5;

// Status validity defaults for Tagesmenü swipe flags (null = permanent)
export const DEFAULT_STATUS_VALIDITY_DAYS_KANDIDAT = null;
export const DEFAULT_STATUS_VALIDITY_DAYS_GEPARKT = null;
export const DEFAULT_STATUS_VALIDITY_DAYS_ARCHIV = null;

// Group status threshold defaults for shared status determination in interactive lists (%)
export const DEFAULT_GROUP_THRESHOLD_KANDIDAT_MIN_KANDIDAT = 50;
export const DEFAULT_GROUP_THRESHOLD_KANDIDAT_MAX_ARCHIV = 50;
export const DEFAULT_GROUP_THRESHOLD_ARCHIV_MIN_ARCHIV = 50;
export const DEFAULT_GROUP_THRESHOLD_ARCHIV_MAX_KANDIDAT = 50;

// Maximum candidate score threshold for ending the swipe stack early (null = disabled)
// S = Σ 1/(1+nᵢ) where nᵢ = number of open votings for recipe i
export const DEFAULT_MAX_KANDIDATEN_SCHWELLE = null;

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

// Dark mode preference key
const DARK_MODE_KEY = 'darkModePreference';

/**
 * Get the dark mode preference from localStorage
 * @returns {boolean} True if dark mode is enabled
 */
export function getDarkModePreference() {
  const stored = localStorage.getItem(DARK_MODE_KEY);
  if (stored !== null) return stored === 'true';
  // Fall back to system preference
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Save the dark mode preference to localStorage and dispatch a custom event
 * so other components in the same tab can react to the change.
 * @param {boolean} isDark - Whether dark mode should be enabled
 */
export function saveDarkModePreference(isDark) {
  localStorage.setItem(DARK_MODE_KEY, String(isDark));
  window.dispatchEvent(new CustomEvent('darkModeChange', { detail: { isDark } }));
}

/**
 * Apply the dark mode preference by setting data-theme attribute on the document root
 * @param {boolean} [isDark] - Whether dark mode should be enabled; reads from localStorage if omitted
 */
export function applyDarkModePreference(isDark) {
  const dark = isDark !== undefined ? isDark : getDarkModePreference();
  if (dark) {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

// Standard-Prompt für KI-Rezepterkennung (optimiert)
export const DEFAULT_AI_RECIPE_PROMPT = `Analysiere dieses Rezeptbild und extrahiere alle Informationen als strukturiertes JSON. Extrahiere nur das Rezept, ignoriere Kommentare, Likes, UI‑Text. Erfinde keine Zutaten/Mengen/Temperaturen.

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
5. Einheiten: Standardisiere Einheiten (g statt Gramm, ml statt Milliliter). Verwende IMMER "Esslöffel" statt "EL" und "Teelöffel" statt "TL" – schreibe die Einheit NIE als Abkürzung (z.B. "2 Esslöffel Olivenöl", "1 Teelöffel Salz"). Wandle Brüche in Dezimalzahlen um (z.B. "1/2" wird zu "0,5", "1 1/2" wird zu "1,5").
6. Tags: Füge nur Tags hinzu, die explizit im Rezept erwähnt werden oder eindeutig aus den Zutaten ableitbar sind
7. Wähle für die Felder "kulinarik" und "kategorie" **NUR** Werte aus diesen Listen:
**Verfügbare Kulinarik-Typen:**
{{CUISINE_TYPES}}
Wenn kein Fleisch oder Fisch enthalten ist, setze zusätzlich **immer** "Vegetarisch".
Wenn keine tierischen Produkte enthalten sind (z.B. Butter, Fleisch, Fisch, Eier usw.), setze zusätzlich **immer** "Vegetarisch" und "Vegan".
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
  filterButtonActive: '🔽',
  copyLink: '📋',
  nutritionEmpty: '➕',
  nutritionFilled: '🥦',
  ratingHeartEmpty: '🤍',
  ratingHeartEmptyModal: '♡',
  ratingHeartFilled: '♥',
  privateListBack: '✕',
  shoppingList: '🛒',
  bringButton: '🛍️',
  timerStart: '⏱',
  timerStop: '⏹',
  cookDate: '📅',
  addRecipe: '➕',
  editRecipe: '✏️',
  addMenu: '📋',
  addPrivateRecipe: '🔒',
  saveRecipe: '💾',
  swipeRight: '👍',
  swipeLeft: '👎',
  swipeUp: '⭐',
  menuFavoritesButton: '☆',
  menuFavoritesButtonActive: '★',
  tagesmenuFilterButton: '☰',
  tagesmenuZumTagesMenu: '🗓️',
  tagesmenuMeineAuswahl: '📋',
  cancelRecipe: '✕',
  newVersion: '📝',
  // Dark mode alternative icons (empty string = use normal icon in dark mode)
  cookingModeDark: '',
  cookingModeAltDark: '',
  importRecipeDark: '',
  scanImageDark: '',
  webImportDark: '',
  closeButtonDark: '',
  closeButtonAltDark: '',
  menuCloseButtonDark: '',
  filterButtonDark: '',
  filterButtonActiveDark: '',
  copyLinkDark: '',
  nutritionEmptyDark: '',
  nutritionFilledDark: '',
  ratingHeartEmptyDark: '',
  ratingHeartEmptyModalDark: '',
  ratingHeartFilledDark: '',
  privateListBackDark: '',
  shoppingListDark: '',
  bringButtonDark: '',
  timerStartDark: '',
  timerStopDark: '',
  cookDateDark: '',
  addRecipeDark: '',
  editRecipeDark: '',
  addMenuDark: '',
  addPrivateRecipeDark: '',
  saveRecipeDark: '',
  swipeRightDark: '',
  swipeLeftDark: '',
  swipeUpDark: '',
  menuFavoritesButtonDark: '',
  menuFavoritesButtonActiveDark: '',
  tagesmenuFilterButtonDark: '',
  tagesmenuZumTagesMenuDark: '',
  tagesmenuMeineAuswahlDark: '',
  cancelRecipeDark: '',
  newVersionDark: '',
};

/**
 * Returns the effective icon for a given key, respecting dark mode.
 * If dark mode is active and a dark variant is set, returns the dark variant.
 * Otherwise returns the normal icon.
 * @param {Object} icons - The button icons object
 * @param {string} key - The icon key (e.g. 'cookingMode')
 * @param {boolean} isDarkMode - Whether dark mode is currently active
 * @returns {string} The effective icon value
 */
export function getEffectiveIcon(icons, key, isDarkMode) {
  if (isDarkMode) {
    const darkKey = key + 'Dark';
    const darkIcon = icons[darkKey];
    if (darkIcon) return darkIcon;
  }
  return icons[key] ?? DEFAULT_BUTTON_ICONS[key] ?? '';
}

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

      // Migration: if the stored prompt is missing required placeholders or outdated rules, reset to default
      const needsMigration =
        !aiRecipePrompt.includes('{{CUISINE_TYPES}}') ||
        !aiRecipePrompt.includes('{{MEAL_CATEGORIES}}');

      if (needsMigration) {
        console.warn(
          'AI prompt in Firestore is outdated or missing placeholders – migrating to DEFAULT_AI_RECIPE_PROMPT'
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
        cuisineGroups: settings.cuisineGroups || DEFAULT_CUISINE_GROUPS,
        mealCategories: settings.mealCategories || DEFAULT_MEAL_CATEGORIES,
        units: settings.units || DEFAULT_UNITS,
        portionUnits: settings.portionUnits || DEFAULT_PORTION_UNITS,
        conversionTable: settings.conversionTable || DEFAULT_CONVERSION_TABLE,
        customUnits: settings.customUnits || [],
        headerSlogan: settings.headerSlogan || DEFAULT_SLOGAN,
        faviconText: settings.faviconText || DEFAULT_FAVICON_TEXT,
        faviconImage: settings.faviconImage || null,
        appLogoImage: settings.appLogoImage || null,
        buttonIcons: { ...DEFAULT_BUTTON_ICONS, ...(settings.buttonIcons || {}) },
        timelineBubbleIcon: settings.timelineBubbleIcon || null,
        timelineMenuBubbleIcon: settings.timelineMenuBubbleIcon || null,
        timelineCookEventBubbleIcon: settings.timelineCookEventBubbleIcon || null,
        timelineRecipeDefaultImage: settings.timelineRecipeDefaultImage || null,
        timelineMenuDefaultImage: settings.timelineMenuDefaultImage || null,
        timelineCookEventDefaultImage: settings.timelineCookEventDefaultImage || null,
        aiRecipePrompt,
        autoShareOnCreate: settings.autoShareOnCreate ?? false,
        trendingDays: settings.trendingDays ?? DEFAULT_TRENDING_DAYS,
        trendingMinViews: settings.trendingMinViews ?? DEFAULT_TRENDING_MIN_VIEWS,
        newRecipeDays: settings.newRecipeDays ?? DEFAULT_NEW_RECIPE_DAYS,
        ratingMinVotes: settings.ratingMinVotes ?? DEFAULT_RATING_MIN_VOTES,
        statusValidityDaysKandidat: settings.statusValidityDaysKandidat ?? DEFAULT_STATUS_VALIDITY_DAYS_KANDIDAT,
        statusValidityDaysGeparkt: settings.statusValidityDaysGeparkt ?? DEFAULT_STATUS_VALIDITY_DAYS_GEPARKT,
        statusValidityDaysArchiv: settings.statusValidityDaysArchiv ?? DEFAULT_STATUS_VALIDITY_DAYS_ARCHIV,
        groupThresholdKandidatMinKandidat: settings.groupThresholdKandidatMinKandidat ?? DEFAULT_GROUP_THRESHOLD_KANDIDAT_MIN_KANDIDAT,
        groupThresholdKandidatMaxArchiv: settings.groupThresholdKandidatMaxArchiv ?? DEFAULT_GROUP_THRESHOLD_KANDIDAT_MAX_ARCHIV,
        groupThresholdArchivMinArchiv: settings.groupThresholdArchivMinArchiv ?? DEFAULT_GROUP_THRESHOLD_ARCHIV_MIN_ARCHIV,
        groupThresholdArchivMaxKandidat: settings.groupThresholdArchivMaxKandidat ?? DEFAULT_GROUP_THRESHOLD_ARCHIV_MAX_KANDIDAT,
        maxKandidatenSchwelle: settings.maxKandidatenSchwelle ?? DEFAULT_MAX_KANDIDATEN_SCHWELLE,
      };
      
      return settingsCache;
    }
    
    // No settings document exists, return and create defaults
    const defaultSettings = {
      cuisineTypes: DEFAULT_CUISINE_TYPES,
      cuisineGroups: DEFAULT_CUISINE_GROUPS,
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
      timelineCookEventBubbleIcon: null,
      timelineRecipeDefaultImage: null,
      timelineMenuDefaultImage: null,
      timelineCookEventDefaultImage: null,
      aiRecipePrompt: DEFAULT_AI_RECIPE_PROMPT,
      autoShareOnCreate: false,
      trendingDays: DEFAULT_TRENDING_DAYS,
      trendingMinViews: DEFAULT_TRENDING_MIN_VIEWS,
      newRecipeDays: DEFAULT_NEW_RECIPE_DAYS,
      ratingMinVotes: DEFAULT_RATING_MIN_VOTES,
      statusValidityDaysKandidat: DEFAULT_STATUS_VALIDITY_DAYS_KANDIDAT,
      statusValidityDaysGeparkt: DEFAULT_STATUS_VALIDITY_DAYS_GEPARKT,
      statusValidityDaysArchiv: DEFAULT_STATUS_VALIDITY_DAYS_ARCHIV,
      groupThresholdKandidatMinKandidat: DEFAULT_GROUP_THRESHOLD_KANDIDAT_MIN_KANDIDAT,
      groupThresholdKandidatMaxArchiv: DEFAULT_GROUP_THRESHOLD_KANDIDAT_MAX_ARCHIV,
      groupThresholdArchivMinArchiv: DEFAULT_GROUP_THRESHOLD_ARCHIV_MIN_ARCHIV,
      groupThresholdArchivMaxKandidat: DEFAULT_GROUP_THRESHOLD_ARCHIV_MAX_KANDIDAT,
      maxKandidatenSchwelle: DEFAULT_MAX_KANDIDATEN_SCHWELLE,
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
      cuisineGroups: DEFAULT_CUISINE_GROUPS,
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
      timelineCookEventBubbleIcon: null,
      timelineRecipeDefaultImage: null,
      timelineMenuDefaultImage: null,
      timelineCookEventDefaultImage: null,
      aiRecipePrompt: DEFAULT_AI_RECIPE_PROMPT,
      autoShareOnCreate: false,
      trendingDays: DEFAULT_TRENDING_DAYS,
      trendingMinViews: DEFAULT_TRENDING_MIN_VIEWS,
      newRecipeDays: DEFAULT_NEW_RECIPE_DAYS,
      ratingMinVotes: DEFAULT_RATING_MIN_VOTES,
      statusValidityDaysKandidat: DEFAULT_STATUS_VALIDITY_DAYS_KANDIDAT,
      statusValidityDaysGeparkt: DEFAULT_STATUS_VALIDITY_DAYS_GEPARKT,
      statusValidityDaysArchiv: DEFAULT_STATUS_VALIDITY_DAYS_ARCHIV,
      groupThresholdKandidatMinKandidat: DEFAULT_GROUP_THRESHOLD_KANDIDAT_MIN_KANDIDAT,
      groupThresholdKandidatMaxArchiv: DEFAULT_GROUP_THRESHOLD_KANDIDAT_MAX_ARCHIV,
      groupThresholdArchivMinArchiv: DEFAULT_GROUP_THRESHOLD_ARCHIV_MIN_ARCHIV,
      groupThresholdArchivMaxKandidat: DEFAULT_GROUP_THRESHOLD_ARCHIV_MAX_KANDIDAT,
      maxKandidatenSchwelle: DEFAULT_MAX_KANDIDATEN_SCHWELLE,
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
    cuisineGroups: settings.cuisineGroups ?? DEFAULT_CUISINE_GROUPS,
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
    cuisineGroups: DEFAULT_CUISINE_GROUPS,
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
 * Get the public app logo URL (used for social-media share previews) from Firestore.
 * @returns {Promise<string|null>} Promise resolving to the public HTTPS URL or null
 */
export async function getAppLogoImageUrl() {
  const settings = await getSettings();
  return settings.appLogoImageUrl || null;
}

/**
 * Save the public app logo URL to Firestore.
 * @param {string|null} url - Public HTTPS URL (from Firebase Storage) or null to clear
 * @returns {Promise<void>}
 */
export async function saveAppLogoImageUrl(url) {
  try {
    const settingsRef = doc(db, 'settings', 'app');
    await updateDoc(settingsRef, { appLogoImageUrl: url || null });

    // Update cache
    if (settingsCache) {
      settingsCache.appLogoImageUrl = url || null;
    }
  } catch (error) {
    console.error('Error saving app logo image URL:', error);
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
  // Merge with DEFAULT_BUTTON_ICONS to ensure ALL keys (including dark mode variants)
  // are always persisted to Firestore, even if they were never explicitly set.
  const completeIcons = { ...DEFAULT_BUTTON_ICONS, ...buttonIcons };

  // Optimistic cache update so components mounting immediately after this call
  // (e.g. when Settings closes) already see the new icons without waiting for
  // the Firestore round-trip to complete.
  const previousButtonIcons = settingsCache?.buttonIcons;
  if (settingsCache) {
    settingsCache.buttonIcons = completeIcons;
  }
  try {
    const settingsRef = doc(db, 'settings', 'app');
    await updateDoc(settingsRef, { buttonIcons: completeIcons });
  } catch (error) {
    // Revert optimistic cache update on failure to avoid inconsistent state
    if (settingsCache) {
      settingsCache.buttonIcons = previousButtonIcons;
    }
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
 * Get the timeline cook event bubble icon from Firestore
 * @returns {Promise<string|null>} Promise resolving to base64 encoded image or null
 */
export async function getTimelineCookEventBubbleIcon() {
  const settings = await getSettings();
  return settings.timelineCookEventBubbleIcon || null;
}

/**
 * Save the timeline cook event bubble icon to Firestore
 * @param {string|null} imageBase64 - Base64 encoded image or null to remove
 * @returns {Promise<void>}
 */
export async function saveTimelineCookEventBubbleIcon(imageBase64) {
  try {
    const settingsRef = doc(db, 'settings', 'app');
    await updateDoc(settingsRef, { timelineCookEventBubbleIcon: imageBase64 || null });

    // Update cache
    if (settingsCache) {
      settingsCache.timelineCookEventBubbleIcon = imageBase64 || null;
    }
  } catch (error) {
    console.error('Error saving timeline cook event bubble icon:', error);
    throw error;
  }
}

/**
 * Get the default cook event image for the timeline from Firestore
 * @returns {Promise<string|null>} Promise resolving to base64 encoded image or null
 */
export async function getTimelineCookEventDefaultImage() {
  const settings = await getSettings();
  return settings.timelineCookEventDefaultImage || null;
}

/**
 * Save the default cook event image for the timeline to Firestore
 * @param {string|null} imageBase64 - Base64 encoded image or null to remove
 * @returns {Promise<void>}
 */
export async function saveTimelineCookEventDefaultImage(imageBase64) {
  try {
    const settingsRef = doc(db, 'settings', 'app');
    await updateDoc(settingsRef, { timelineCookEventDefaultImage: imageBase64 || null });

    // Update cache
    if (settingsCache) {
      settingsCache.timelineCookEventDefaultImage = imageBase64 || null;
    }
  } catch (error) {
    console.error('Error saving timeline cook event default image:', error);
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

/**
 * Get sort/filter settings (trendingDays, trendingMinViews, newRecipeDays, ratingMinVotes)
 * @returns {Promise<Object>} Promise resolving to sort settings object
 */
export async function getSortSettings() {
  const settings = await getSettings();
  return {
    trendingDays: settings.trendingDays ?? DEFAULT_TRENDING_DAYS,
    trendingMinViews: settings.trendingMinViews ?? DEFAULT_TRENDING_MIN_VIEWS,
    newRecipeDays: settings.newRecipeDays ?? DEFAULT_NEW_RECIPE_DAYS,
    ratingMinVotes: settings.ratingMinVotes ?? DEFAULT_RATING_MIN_VOTES,
  };
}

/**
 * Save sort/filter settings to Firestore
 * @param {Object} sortSettings - Object with trendingDays, trendingMinViews, newRecipeDays, ratingMinVotes
 * @returns {Promise<void>}
 */
export async function saveSortSettings(sortSettings) {
  try {
    const settingsRef = doc(db, 'settings', 'app');
    const update = {};
    if (sortSettings.trendingDays !== undefined) update.trendingDays = sortSettings.trendingDays;
    if (sortSettings.trendingMinViews !== undefined) update.trendingMinViews = sortSettings.trendingMinViews;
    if (sortSettings.newRecipeDays !== undefined) update.newRecipeDays = sortSettings.newRecipeDays;
    if (sortSettings.ratingMinVotes !== undefined) update.ratingMinVotes = sortSettings.ratingMinVotes;
    await updateDoc(settingsRef, update);

    // Update cache
    if (settingsCache) {
      Object.assign(settingsCache, update);
    }
  } catch (error) {
    console.error('Error saving sort settings:', error);
    throw error;
  }
}

/**
 * Get status validity settings for Tagesmenü swipe flags
 * @returns {Promise<Object>} Promise resolving to status validity settings
 */
export async function getStatusValiditySettings() {
  const settings = await getSettings();
  return {
    statusValidityDaysKandidat: settings.statusValidityDaysKandidat ?? DEFAULT_STATUS_VALIDITY_DAYS_KANDIDAT,
    statusValidityDaysGeparkt: settings.statusValidityDaysGeparkt ?? DEFAULT_STATUS_VALIDITY_DAYS_GEPARKT,
    statusValidityDaysArchiv: settings.statusValidityDaysArchiv ?? DEFAULT_STATUS_VALIDITY_DAYS_ARCHIV,
  };
}

/**
 * Save status validity settings for Tagesmenü swipe flags to Firestore.
 * Pass null for a field to mark that status as permanent (no expiry).
 * @param {Object} statusValiditySettings - Object with statusValidityDaysKandidat, statusValidityDaysGeparkt, statusValidityDaysArchiv (number or null)
 * @returns {Promise<void>}
 */
export async function saveStatusValiditySettings(statusValiditySettings) {
  try {
    const settingsRef = doc(db, 'settings', 'app');
    const update = {};
    if (statusValiditySettings.statusValidityDaysKandidat !== undefined) {
      update.statusValidityDaysKandidat = statusValiditySettings.statusValidityDaysKandidat;
    }
    if (statusValiditySettings.statusValidityDaysGeparkt !== undefined) {
      update.statusValidityDaysGeparkt = statusValiditySettings.statusValidityDaysGeparkt;
    }
    if (statusValiditySettings.statusValidityDaysArchiv !== undefined) {
      update.statusValidityDaysArchiv = statusValiditySettings.statusValidityDaysArchiv;
    }
    await updateDoc(settingsRef, update);

    // Update cache
    if (settingsCache) {
      Object.assign(settingsCache, update);
    }
  } catch (error) {
    console.error('Error saving status validity settings:', error);
    throw error;
  }
}

/**
 * Get group status thresholds for shared status determination in interactive lists.
 * @returns {Promise<Object>} Promise resolving to group status threshold settings
 */
export async function getGroupStatusThresholds() {
  const settings = await getSettings();
  return {
    groupThresholdKandidatMinKandidat: settings.groupThresholdKandidatMinKandidat ?? DEFAULT_GROUP_THRESHOLD_KANDIDAT_MIN_KANDIDAT,
    groupThresholdKandidatMaxArchiv: settings.groupThresholdKandidatMaxArchiv ?? DEFAULT_GROUP_THRESHOLD_KANDIDAT_MAX_ARCHIV,
    groupThresholdArchivMinArchiv: settings.groupThresholdArchivMinArchiv ?? DEFAULT_GROUP_THRESHOLD_ARCHIV_MIN_ARCHIV,
    groupThresholdArchivMaxKandidat: settings.groupThresholdArchivMaxKandidat ?? DEFAULT_GROUP_THRESHOLD_ARCHIV_MAX_KANDIDAT,
  };
}

/**
 * Save group status thresholds for shared status determination in interactive lists.
 * @param {Object} thresholds - Object with groupThreshold* fields (numbers 0–100)
 * @returns {Promise<void>}
 */
export async function saveGroupStatusThresholds(thresholds) {
  try {
    const settingsRef = doc(db, 'settings', 'app');
    const update = {};
    if (thresholds.groupThresholdKandidatMinKandidat !== undefined) {
      update.groupThresholdKandidatMinKandidat = thresholds.groupThresholdKandidatMinKandidat;
    }
    if (thresholds.groupThresholdKandidatMaxArchiv !== undefined) {
      update.groupThresholdKandidatMaxArchiv = thresholds.groupThresholdKandidatMaxArchiv;
    }
    if (thresholds.groupThresholdArchivMinArchiv !== undefined) {
      update.groupThresholdArchivMinArchiv = thresholds.groupThresholdArchivMinArchiv;
    }
    if (thresholds.groupThresholdArchivMaxKandidat !== undefined) {
      update.groupThresholdArchivMaxKandidat = thresholds.groupThresholdArchivMaxKandidat;
    }
    await updateDoc(settingsRef, update);

    // Update cache
    if (settingsCache) {
      Object.assign(settingsCache, update);
    }
  } catch (error) {
    console.error('Error saving group status thresholds:', error);
    throw error;
  }
}

/**
 * Get the maximum candidate score threshold for ending the swipe stack early.
 * Returns null if the feature is disabled (no threshold).
 * @returns {Promise<number|null>} Promise resolving to the threshold value or null
 */
export async function getMaxKandidatenSchwelle() {
  const settings = await getSettings();
  return settings.maxKandidatenSchwelle ?? DEFAULT_MAX_KANDIDATEN_SCHWELLE;
}

/**
 * Save the maximum candidate score threshold to Firestore.
 * Pass null to disable the threshold.
 * @param {number|null} value - The threshold value or null to disable
 * @returns {Promise<void>}
 */
export async function saveMaxKandidatenSchwelle(value) {
  try {
    const settingsRef = doc(db, 'settings', 'app');
    await updateDoc(settingsRef, { maxKandidatenSchwelle: value });

    // Update cache
    if (settingsCache) {
      settingsCache.maxKandidatenSchwelle = value;
    }
  } catch (error) {
    console.error('Error saving max kandidaten schwelle:', error);
    throw error;
  }
}

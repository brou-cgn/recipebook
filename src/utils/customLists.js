/**
 * Default configuration values for customizable lists
 */
import { db } from '../firebase';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteField, collection, writeBatch, serverTimestamp } from 'firebase/firestore';

export const DEFAULT_CUISINE_TYPES = [
  'Deutsche Küche',
  'Französische Küche',
  'Italienische Küche',
  'Österreichische Küche',
  'Schweizer Küche',
  'Türkische Küche',
  'Chinesische Küche',
  'Indische Küche',
  'Japanische Küche',
  'Orientalische Küche',
  'Thailändische Küche',
  'Mexikanische Küche',
  'US-Amerikanische Küche',
  'Vegetarisch',
  'Vegan',
  'Weihnachtliche Küche'
];

export const DEFAULT_MEAL_CATEGORIES = [
  'Appetizer',
  'Dips & Saucen',
  'Vorspeisen',
  'Salate',
  'Suppen & Eintöpfe',
  'Hauptspeisen',
  'Desserts',
  'Drinks',
  'Beilagen & Grundrezepte',
  'Gebäcke & Teige',
  'Kuchen & Torten',
  'Grillrezepte'
];

export const DEFAULT_UNITS = [
  'g', 'kg', 'ml', 'l',
  'Esslöffel', 'Teelöffel',
  'Prise', 'Prisen',
  'Tasse', 'Tassen',
  'Becher',
  'Stück', 'Bund',
  'Dose', 'Dosen',
  'cl'
];

export const DEFAULT_PORTION_UNITS = [
  { id: 'portion', singular: 'Portion', plural: 'Portionen' },
  { id: 'pizza', singular: 'Pizza', plural: 'Pizzen' },
  { id: 'drink', singular: 'Drink', plural: 'Drinks' },
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
 * Default print format configuration constants
 */
export const DEFAULT_PRINT_FONT_FAMILY = "Georgia, 'Times New Roman', serif";
export const DEFAULT_PRINT_ORIENTATION = 'portrait';
export const DEFAULT_PRINT_ELEMENT_ORDER = ['images', 'ingredients', 'steps'];

/** Available font options for print formats */
export const PRINT_FONT_OPTIONS = [
  { label: 'Georgia (Serif)', value: "Georgia, 'Times New Roman', serif" },
  { label: 'Times New Roman (Serif)', value: "'Times New Roman', Times, serif" },
  { label: 'Arial (Sans-Serif)', value: "Arial, Helvetica, sans-serif" },
  { label: 'Helvetica (Sans-Serif)', value: "Helvetica, Arial, sans-serif" },
  { label: 'Verdana (Sans-Serif)', value: "Verdana, Geneva, sans-serif" },
  { label: 'Courier New (Monospace)', value: "'Courier New', Courier, monospace" },
];

/** Available image alignment options for print formats */
export const PRINT_IMAGE_ALIGN_OPTIONS = [
  { label: 'Zentriert', value: 'center' },
  { label: 'Linksbündig', value: 'left' },
  { label: 'Rechtsbündig', value: 'right' },
];

/** Available image column layout options for print formats */
export const PRINT_IMAGE_COLUMNS_OPTIONS = [
  { label: 'Automatisch (nach Anzahl)', value: 'auto' },
  { label: '1 Spalte', value: '1' },
  { label: '2 Spalten', value: '2' },
];

/**
 * All elements that can be placed on a print format page.
 * Each entry has:
 *   id {string}     - Unique element identifier (matches CSS selector keys)
 *   label {string}  - Human-readable label shown in the editor
 *   color {string}  - Background color used in the WYSIWYG preview
 */
export const PRINT_FORMAT_ELEMENTS = [
  { id: 'title',              label: 'Titel',                   color: '#d4e8f7', isImage: false },
  { id: 'authorDate',         label: 'Autor & Datum',            color: '#d4f0e8', isImage: false },
  { id: 'metadata',           label: 'Kulinarik / Zeit / Infos', color: '#f0e8d4', isImage: false },
  { id: 'ingredients',        label: 'Zutaten',                  color: '#e8d4f0', isImage: false },
  { id: 'steps',              label: 'Zubereitungsschritte',     color: '#f7d4d4', isImage: false },
  { id: 'ingredientsHeading', label: 'Überschrift Zutaten',      color: '#c8b0e0', isImage: false },
  { id: 'stepsHeading',       label: 'Überschrift Zubereitung',  color: '#e8b0b0', isImage: false },
  { id: 'photo1',             label: 'Foto 1',                   color: '#fdd8a0', isImage: true  },
  { id: 'photo2',             label: 'Foto 2',                   color: '#fdc880', isImage: true  },
  { id: 'photo3',             label: 'Foto 3',                   color: '#fdb860', isImage: true  },
  { id: 'photo4',             label: 'Foto 4',                   color: '#fd9840', isImage: true  },
];

/** Available rotation options for print format elements */
export const PRINT_ROTATION_OPTIONS = [
  { label: '0°',   value: 0   },
  { label: '90°',  value: 90  },
  { label: '180°', value: 180 },
  { label: '270°', value: 270 },
];

/** Available aspect ratio options for image elements in print formats */
export const PRINT_ASPECT_RATIO_OPTIONS = [
  { label: 'Original',          value: 'none' },
  { label: 'Quadrat (1:1)',     value: '1/1'  },
  { label: '3:2',               value: '3/2'  },
  { label: '4:3',               value: '4/3'  },
  { label: '16:9',              value: '16/9' },
  { label: '2:3 (Hochformat)',  value: '2/3'  },
  { label: '3:4 (Hochformat)',  value: '3/4'  },
];

/** Available horizontal text alignment options for print format text elements */
export const PRINT_TEXT_ALIGN_H_OPTIONS = [
  { label: 'Links',     value: 'left'    },
  { label: 'Mitte',     value: 'center'  },
  { label: 'Rechts',    value: 'right'   },
  { label: 'Blocksatz', value: 'justify' },
];

/** Available vertical text alignment options for print format text elements */
export const PRINT_TEXT_ALIGN_V_OPTIONS = [
  { label: 'Oben',  value: 'top'    },
  { label: 'Mitte', value: 'middle' },
  { label: 'Unten', value: 'bottom' },
];

/** Default page width in cm for portrait orientation (DIN A4) */
export const DEFAULT_PRINT_PAGE_WIDTH_CM = 21.0;
/** Default page height in cm for portrait orientation (DIN A4) */
export const DEFAULT_PRINT_PAGE_HEIGHT_CM = 29.7;

/**
 * Layout version for print format elements.
 * v1 (no layoutVersion field): x, w as % of page width; y, h as % of page height.
 * v2 (layoutVersion: 2):       x, y, w, h ALL as % of page width.
 *   This is required because the CSS padding-bottom trick renders all percentage
 *   values (including top/height) relative to the container WIDTH, not its height.
 */
export const PRINT_FORMAT_LAYOUT_VERSION = 2;

/**
 * Default element positions for a portrait A4 page.
 * ALL coordinates (x, y, w, h) are expressed as % of page WIDTH.
 * For A4 portrait (21 × 29.7 cm): max reachable y+h ≈ 141.4% of page width.
 */
export const DEFAULT_PRINT_ELEMENTS_PORTRAIT = [
  { id: 'title',              x: 2,  y: 1.4,  w: 96, h: 9.9,  visible: true  },
  { id: 'photo1',             x: 2,  y: 12.7, w: 96, h: 39.6, visible: true  },
  { id: 'authorDate',         x: 2,  y: 53.7, w: 96, h: 7.1,  visible: true  },
  { id: 'metadata',           x: 2,  y: 62.2, w: 96, h: 11.3, visible: true  },
  { id: 'ingredients',        x: 2,  y: 75.0, w: 45, h: 56.6, visible: true  },
  { id: 'steps',              x: 51, y: 75.0, w: 47, h: 56.6, visible: true  },
  { id: 'ingredientsHeading', x: 2,  y: 75.0, w: 45, h: 7.1,  visible: false },
  { id: 'stepsHeading',       x: 51, y: 75.0, w: 47, h: 7.1,  visible: false },
  { id: 'photo2',             x: 2,  y: 12.7, w: 45, h: 39.6, visible: false },
  { id: 'photo3',             x: 51, y: 12.7, w: 45, h: 39.6, visible: false },
  { id: 'photo4',             x: 51, y: 53.7, w: 45, h: 19.8, visible: false },
];

/**
 * Default element positions for a landscape A4 page.
 * ALL coordinates (x, y, w, h) are expressed as % of page WIDTH.
 * For A4 landscape (29.7 × 21 cm): max reachable y+h ≈ 70.7% of page width.
 */
export const DEFAULT_PRINT_ELEMENTS_LANDSCAPE = [
  { id: 'title',              x: 2,  y: 0.7,  w: 96, h: 7.1,  visible: true  },
  { id: 'photo1',             x: 2,  y: 8.5,  w: 45, h: 56.6, visible: true  },
  { id: 'authorDate',         x: 51, y: 8.5,  w: 47, h: 4.9,  visible: true  },
  { id: 'metadata',           x: 51, y: 14.1, w: 47, h: 7.1,  visible: true  },
  { id: 'ingredients',        x: 51, y: 21.9, w: 47, h: 21.2, visible: true  },
  { id: 'steps',              x: 51, y: 43.8, w: 47, h: 21.2, visible: true  },
  { id: 'ingredientsHeading', x: 51, y: 21.9, w: 47, h: 4.9,  visible: false },
  { id: 'stepsHeading',       x: 51, y: 43.8, w: 47, h: 4.9,  visible: false },
  { id: 'photo2',             x: 2,  y: 8.5,  w: 20, h: 28.3, visible: false },
  { id: 'photo3',             x: 24, y: 8.5,  w: 20, h: 28.3, visible: false },
  { id: 'photo4',             x: 2,  y: 37.5, w: 20, h: 28.3, visible: false },
];

/**
 * Merges stored print-format elements with the defaults, ensuring all known element IDs
 * are present. Used by both the editor preview and the live print handler.
 */
export function mergePrintElementsWithDefaults(elements, orientation) {
  const defaults = orientation === 'landscape'
    ? DEFAULT_PRINT_ELEMENTS_LANDSCAPE
    : DEFAULT_PRINT_ELEMENTS_PORTRAIT;
  return PRINT_FORMAT_ELEMENTS.map((def) => {
    const existing = elements && elements.find((e) => e.id === def.id);
    if (existing) return existing;
    const fallback = defaults.find((d) => d.id === def.id);
    return fallback
      ? { ...fallback }
      : { id: def.id, x: 2, y: 2, w: 50, h: 10, visible: false };
  });
}

/**
 * Default print formats.  Each format can have:
 *   id {string}            - Unique identifier
 *   name {string}          - Display name in settings
 *   maxPhotos {number|null}- Max photo count this format applies to (null = catch-all)
 *   orientation {string}   - 'portrait' | 'landscape'
 *   fontFamily {string}    - CSS font-family string
 *   layoutVersion {number} - Element coordinate version (see PRINT_FORMAT_LAYOUT_VERSION)
 *   elements {Array}       - WYSIWYG element positions: [{id, x, y, w, h, visible}]
 *                            Since layoutVersion 2: x, y, w, h are ALL % of page width.
 *   elementOrder {string[]}- (legacy) Ordered array of 'images', 'ingredients', 'steps'
 *   imageWidth {number}    - (legacy) Image section width as a percentage of the page
 *   imageAlign {string}    - (legacy) Alignment: 'left' | 'center' | 'right'
 *   imageColumns {string}  - Number of image columns: 'auto' | '1' | '2'
 */
export const DEFAULT_PRINT_FORMATS = [
  {
    id: 'default',
    name: 'Standard',
    maxPhotos: null,
    orientation: 'portrait',
    fontFamily: "Georgia, 'Times New Roman', serif",
    imageColumns: 'auto',
    layoutVersion: PRINT_FORMAT_LAYOUT_VERSION,
    elements: DEFAULT_PRINT_ELEMENTS_PORTRAIT,
  },
];

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

// Alarm sound preference key
const ALARM_SOUND_KEY = 'alarmSoundPreference';

/** Default alarm sound identifier */
export const DEFAULT_ALARM_SOUND = 'radar';

/**
 * Available alarm sounds for the cooking-mode timer.
 * Each entry has a `key` (stored in localStorage) and a display `label`.
 */
export const ALARM_SOUNDS = [
  { key: 'radar',   label: 'Radar' },
  { key: 'chime',   label: 'Glockenspiel' },
  { key: 'beep',    label: 'Piepton' },
  { key: 'crystal', label: 'Kristall' },
  { key: 'alert',   label: 'Alarm' },
];

/**
 * Get the alarm sound preference from localStorage.
 * @returns {string} The stored alarm sound key; defaults to DEFAULT_ALARM_SOUND.
 */
export function getAlarmSoundPreference() {
  return localStorage.getItem(ALARM_SOUND_KEY) || DEFAULT_ALARM_SOUND;
}

/**
 * Save the alarm sound preference to localStorage.
 * @param {string} key - Alarm sound key (one of the keys in ALARM_SOUNDS)
 */
export function saveAlarmSoundPreference(key) {
  localStorage.setItem(ALARM_SOUND_KEY, key);
}

// Dark mode preference key
const DARK_MODE_KEY = 'darkModePreference';

// Module-level reference to the active matchMedia listener for 'auto' mode
let _darkModeMediaListener = null;

/**
 * Get the current dark mode setting from localStorage.
 * @returns {'light'|'dark'|'auto'} The stored mode; defaults to 'auto' when nothing is stored.
 */
export function getDarkModeMode() {
  const stored = localStorage.getItem(DARK_MODE_KEY);
  if (stored === 'auto') return 'auto';
  if (stored === 'true') return 'dark';
  if (stored === 'false') return 'light';
  return 'auto'; // default: follow system
}

/**
 * Get the dark mode preference from localStorage
 * @returns {boolean} True if dark mode is enabled
 */
export function getDarkModePreference() {
  const stored = localStorage.getItem(DARK_MODE_KEY);
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  // 'auto' or not set: fall back to system preference
  return window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : false;
}

/**
 * Save the dark mode setting to localStorage and dispatch a custom event
 * so other components in the same tab can react to the change.
 * @param {'light'|'dark'|'auto'} mode - The mode to save
 */
export function saveDarkModePreference(mode) {
  let stored;
  if (mode === 'auto') stored = 'auto';
  else if (mode === 'dark' || mode === true) stored = 'true';
  else stored = 'false';
  localStorage.setItem(DARK_MODE_KEY, stored);
  const isDark = getDarkModePreference();
  window.dispatchEvent(new CustomEvent('darkModeChange', { detail: { isDark } }));
}

/**
 * Apply the dark mode preference by setting data-theme attribute on the document root.
 * When the resolved mode is 'auto', a matchMedia listener is registered so the theme
 * updates automatically whenever the OS preference changes.
 * @param {'light'|'dark'|'auto'} [mode] - The mode to apply; reads from localStorage if omitted
 */
export function applyDarkModePreference(mode) {
  const resolvedMode = mode !== undefined ? mode : getDarkModeMode();

  let isDark;
  if (resolvedMode === 'auto') {
    isDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : false;
  } else {
    isDark = resolvedMode === 'dark' || resolvedMode === true || resolvedMode === 'true';
  }

  if (isDark) {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }

  // Manage the system-preference listener for 'auto' mode
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  if (_darkModeMediaListener && mq) {
    mq.removeEventListener('change', _darkModeMediaListener);
    _darkModeMediaListener = null;
  }
  if (resolvedMode === 'auto' && mq) {
    _darkModeMediaListener = (e) => {
      const dark = e.matches;
      if (dark) {
        document.documentElement.setAttribute('data-theme', 'dark');
      } else {
        document.documentElement.removeAttribute('data-theme');
      }
      window.dispatchEvent(new CustomEvent('darkModeChange', { detail: { isDark: dark } }));
    };
    mq.addEventListener('change', _darkModeMediaListener);
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
  cookingMode: '♨',
  // Alt icon shown when the top-left image corner is too bright (high luminance)
  cookingModeAlt: '♨',
  // Icon shown when the recipe uses the default category image (light mode)
  cookingModeDefaultImg: '♨',
  importRecipe: 'Import',
  scanImage: 'Scan',
  webImport: 'Web',
  closeButton: '×',
  // Alt icon shown when the top-right image corner is too bright (high luminance)
  closeButtonAlt: '×',
  // Icon shown when the recipe uses the default category image (light mode)
  closeButtonDefaultImg: '×',
  menuCloseButton: '×',
  filterButton: '⚙',
  filterButtonActive: '▼',
  copyLink: 'Link',
  nutritionEmpty: '+',
  nutritionFilled: 'Nähr.',
  ratingHeartEmpty: '♡',
  ratingHeartEmptyModal: '♡',
  ratingHeartFilled: '♥',
  privateListBack: '×',
  shoppingList: 'Einkauf',
  bringButton: 'Bring',
  timerStart: '▶',
  timerStop: '■',
  cookDate: 'Datum',
  addRecipe: '+',
  editRecipe: 'Edit',
  addMenu: 'Menü+',
  addPrivateRecipe: 'Privat',
  saveRecipe: 'Speich.',
  swipeRight: '✓',
  swipeLeft: '×',
  swipeUp: '★',
  menuFavoritesButton: '☆',
  menuFavoritesButtonActive: '★',
  tagesmenuFilterButton: '☰',
  tagesmenuZumTagesMenu: 'Menü',
  tagesmenuMeineAuswahl: 'Liste',
  tagesmenuKachelMenu: '⋯',
  // Alt icon shown when the tile image is dark (low luminance)
  tagesmenuKachelMenuAlt: '⋯',
  cancelRecipe: '×',
  newVersion: 'Version',
  publishRecipe: '↑',
  deleteRecipe: '🗑',
  printRecipe: '⎙',
  addSection: '+',
  resetThumbnail: '📷',
  recipeCardSwipeRight: '📋',
  // Dark mode alternative icons (empty string = use normal icon in dark mode)
  cookingModeDark: '',
  cookingModeAltDark: '',
  // Dark mode variant for the default category image icon
  cookingModeDefaultImgDark: '',
  importRecipeDark: '',
  scanImageDark: '',
  webImportDark: '',
  closeButtonDark: '',
  closeButtonAltDark: '',
  // Dark mode variant for the default category image icon
  closeButtonDefaultImgDark: '',
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
  tagesmenuKachelMenuDark: '',
  tagesmenuKachelMenuAltDark: '',
  cancelRecipeDark: '',
  newVersionDark: '',
  publishRecipeDark: '',
  deleteRecipeDark: '',
  printRecipeDark: '',
  addSectionDark: '',
  resetThumbnailDark: '',
  recipeCardSwipeRightDark: '',
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

const BUTTON_ICONS_COLLECTION = 'buttonIcons';

// Image field names that live in settings/images (not settings/app)
const IMAGE_FIELD_NAMES = [
  'faviconImage',
  'appLogoImage',
  'appLogoImageUrl',
  'timelineBubbleIcon',
  'timelineMenuBubbleIcon',
  'timelineCookEventBubbleIcon',
  'timelineRecipeDefaultImage',
  'timelineMenuDefaultImage',
  'timelineCookEventDefaultImage',
];

/**
 * Migrate button icons from a plain object to the buttonIcons collection.
 * Each icon key becomes a separate document: buttonIcons/{key} = { value, updatedAt }.
 * @param {Object} icons - Plain object mapping icon keys to values
 * @returns {Promise<void>}
 */
async function migrateButtonIconsToCollection(icons) {
  try {
    const batch = writeBatch(db);
    for (const [key, value] of Object.entries(icons)) {
      const iconRef = doc(db, BUTTON_ICONS_COLLECTION, key);
      batch.set(iconRef, { value, updatedAt: serverTimestamp() });
    }
    await batch.commit();
    console.log('Migrated buttonIcons to buttonIcons collection');
  } catch (error) {
    console.error('Failed to migrate buttonIcons to collection:', error);
  }
}

/**
 * Get settings from Firestore or return defaults.
 * Text configuration is read from settings/app; image data from settings/images.
 * Automatically migrates any image fields still stored in settings/app to settings/images.
 * @returns {Promise<Object>} Promise resolving to settings object
 */
export async function getSettings() {
  // Return cached settings if available
  if (settingsCache) {
    return settingsCache;
  }
  
  try {
    const [settingsDoc, imagesDoc] = await Promise.all([
      getDoc(doc(db, 'settings', 'app')),
      getDoc(doc(db, 'settings', 'images')),
    ]);
    
    if (settingsDoc.exists()) {
      const settings = settingsDoc.data();
      const imagesData = imagesDoc.exists() ? imagesDoc.data() : {};

      // One-time migration: move any image fields still in settings/app → settings/images
      const fieldsFoundInApp = IMAGE_FIELD_NAMES.filter(f => f in settings);
      if (fieldsFoundInApp.length > 0) {
        try {
          const migratedImageData = {};
          const deleteUpdate = {};
          for (const field of fieldsFoundInApp) {
            migratedImageData[field] = settings[field];
            deleteUpdate[field] = deleteField();
          }
          const imagesRef = doc(db, 'settings', 'images');
          if (imagesDoc.exists()) {
            await updateDoc(imagesRef, migratedImageData);
          } else {
            await setDoc(imagesRef, migratedImageData);
          }
          await updateDoc(doc(db, 'settings', 'app'), deleteUpdate);
          // Merge migrated data into imagesData so this load sees it
          Object.assign(imagesData, migratedImageData);
          console.log('Migrated image fields from settings/app to settings/images:', fieldsFoundInApp);
        } catch (migrationError) {
          console.error('Failed to migrate image fields to settings/images:', migrationError);
        }
      }

      // One-time migration: move buttonIcons from settings/app or settings/images → buttonIcons collection
      const buttonIconsFromApp = settings.buttonIcons;
      const buttonIconsFromImages = imagesData.buttonIcons;
      if (buttonIconsFromApp || buttonIconsFromImages) {
        try {
          // Prefer images data (was the last migration target) over app data
          const iconsToMigrate = buttonIconsFromImages || buttonIconsFromApp;
          await migrateButtonIconsToCollection(iconsToMigrate);

          const deletePromises = [];
          if (buttonIconsFromApp) {
            deletePromises.push(
              updateDoc(doc(db, 'settings', 'app'), { buttonIcons: deleteField() })
            );
          }
          if (buttonIconsFromImages) {
            deletePromises.push(
              updateDoc(doc(db, 'settings', 'images'), { buttonIcons: deleteField() })
            );
          }
          await Promise.all(deletePromises);
        } catch (migrationError) {
          console.error('Failed to migrate buttonIcons to collection:', migrationError);
        }
      }

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

      // Load button icons from the buttonIcons collection.
      // settingsCache has not been set yet at this point, so getButtonIcons() fetches from Firestore.
      const buttonIcons = await getButtonIcons();

      // Ensure all fields exist for backward compatibility
      settingsCache = {
        // Text configuration from settings/app
        cuisineTypes: settings.cuisineTypes || DEFAULT_CUISINE_TYPES,
        cuisineGroups: settings.cuisineGroups || DEFAULT_CUISINE_GROUPS,
        mealCategories: settings.mealCategories || DEFAULT_MEAL_CATEGORIES,
        units: settings.units || DEFAULT_UNITS,
        portionUnits: settings.portionUnits || DEFAULT_PORTION_UNITS,
        conversionTable: settings.conversionTable || DEFAULT_CONVERSION_TABLE,
        customUnits: settings.customUnits || [],
        headerSlogan: settings.headerSlogan || DEFAULT_SLOGAN,
        faviconText: settings.faviconText || DEFAULT_FAVICON_TEXT,
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
        printFormats: settings.printFormats || DEFAULT_PRINT_FORMATS,
        // Image data from settings/images
        faviconImage: imagesData.faviconImage || null,
        appLogoImage: imagesData.appLogoImage || null,
        appLogoImageUrl: imagesData.appLogoImageUrl || null,
        buttonIcons,
        timelineBubbleIcon: imagesData.timelineBubbleIcon || null,
        timelineMenuBubbleIcon: imagesData.timelineMenuBubbleIcon || null,
        timelineCookEventBubbleIcon: imagesData.timelineCookEventBubbleIcon || null,
        timelineRecipeDefaultImage: imagesData.timelineRecipeDefaultImage || null,
        timelineMenuDefaultImage: imagesData.timelineMenuDefaultImage || null,
        timelineCookEventDefaultImage: imagesData.timelineCookEventDefaultImage || null,
      };
      
      return settingsCache;
    }
    
    // No settings document exists, return and create defaults (text config only)
    const defaultSettings = {
      cuisineTypes: DEFAULT_CUISINE_TYPES,
      cuisineGroups: DEFAULT_CUISINE_GROUPS,
      mealCategories: DEFAULT_MEAL_CATEGORIES,
      units: DEFAULT_UNITS,
      portionUnits: DEFAULT_PORTION_UNITS,
      conversionTable: DEFAULT_CONVERSION_TABLE,
      headerSlogan: DEFAULT_SLOGAN,
      faviconText: DEFAULT_FAVICON_TEXT,
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
      printFormats: DEFAULT_PRINT_FORMATS,
    };
    
    // Create the settings/app document with text config only
    await setDoc(doc(db, 'settings', 'app'), defaultSettings);
    settingsCache = {
      ...defaultSettings,
      // Image defaults (settings/images is created lazily on first image save)
      faviconImage: null,
      appLogoImage: null,
      appLogoImageUrl: null,
      buttonIcons: DEFAULT_BUTTON_ICONS,
      timelineBubbleIcon: null,
      timelineMenuBubbleIcon: null,
      timelineCookEventBubbleIcon: null,
      timelineRecipeDefaultImage: null,
      timelineMenuDefaultImage: null,
      timelineCookEventDefaultImage: null,
    };
    
    return settingsCache;
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
      appLogoImageUrl: null,
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
      printFormats: DEFAULT_PRINT_FORMATS,
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
 * Save the favicon image to Firestore (settings/images)
 * @param {string} imageBase64 - Base64 encoded image
 * @returns {Promise<void>}
 */
export async function saveFaviconImage(imageBase64) {
  try {
    const imagesRef = doc(db, 'settings', 'images');
    await setDoc(imagesRef, { faviconImage: imageBase64 || null }, { merge: true });
    
    // Update cache
    if (settingsCache) {
      settingsCache.faviconImage = imageBase64 || null;
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
 * Save the app logo image to Firestore (settings/images)
 * @param {string} imageBase64 - Base64 encoded image
 * @returns {Promise<void>}
 */
export async function saveAppLogoImage(imageBase64) {
  try {
    const imagesRef = doc(db, 'settings', 'images');
    await setDoc(imagesRef, { appLogoImage: imageBase64 || null }, { merge: true });
    
    // Update cache
    if (settingsCache) {
      settingsCache.appLogoImage = imageBase64 || null;
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
 * Save the public app logo URL to Firestore (settings/images).
 * @param {string|null} url - Public HTTPS URL (from Firebase Storage) or null to clear
 * @returns {Promise<void>}
 */
export async function saveAppLogoImageUrl(url) {
  try {
    const imagesRef = doc(db, 'settings', 'images');
    await setDoc(imagesRef, { appLogoImageUrl: url || null }, { merge: true });

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
 * Get the button icons from the buttonIcons collection (or return from cache / defaults).
 * @returns {Promise<Object>} Promise resolving to button icons object
 */
export async function getButtonIcons() {
  if (settingsCache) {
    return settingsCache.buttonIcons || { ...DEFAULT_BUTTON_ICONS };
  }
  try {
    const snapshot = await getDocs(collection(db, BUTTON_ICONS_COLLECTION));
    const icons = { ...DEFAULT_BUTTON_ICONS };
    snapshot.forEach((docSnap) => {
      icons[docSnap.id] = docSnap.data().value;
    });
    return icons;
  } catch (error) {
    console.error('Error loading button icons:', error);
    return { ...DEFAULT_BUTTON_ICONS };
  }
}

/**
 * Save all button icons to the buttonIcons collection (one document per icon key).
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
    const batch = writeBatch(db);
    for (const [key, value] of Object.entries(completeIcons)) {
      const iconRef = doc(db, BUTTON_ICONS_COLLECTION, key);
      batch.set(iconRef, { value, updatedAt: serverTimestamp() });
    }
    await batch.commit();
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
 * Save a single button icon to the buttonIcons collection (incremental update).
 * @param {string} iconKey - The icon key (e.g. 'cookingMode' or 'cookingModeDark')
 * @param {string} iconValue - The icon value (emoji, text, or base64 image)
 * @returns {Promise<void>}
 */
export async function saveButtonIcon(iconKey, iconValue) {
  // Optimistic cache update
  const previousValue = settingsCache?.buttonIcons?.[iconKey];
  if (settingsCache) {
    if (!settingsCache.buttonIcons) {
      settingsCache.buttonIcons = { ...DEFAULT_BUTTON_ICONS };
    }
    settingsCache.buttonIcons[iconKey] = iconValue;
  }

  try {
    const iconRef = doc(db, BUTTON_ICONS_COLLECTION, iconKey);
    await setDoc(iconRef, { value: iconValue, updatedAt: serverTimestamp() });
  } catch (error) {
    // Revert optimistic cache update on failure
    if (settingsCache?.buttonIcons) {
      settingsCache.buttonIcons[iconKey] = previousValue;
    }
    console.error(`Error saving button icon '${iconKey}':`, error);
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
 * Save the timeline bubble icon to Firestore (settings/images)
 * @param {string|null} imageBase64 - Base64 encoded image or null to remove
 * @returns {Promise<void>}
 */
export async function saveTimelineBubbleIcon(imageBase64) {
  try {
    const imagesRef = doc(db, 'settings', 'images');
    await setDoc(imagesRef, { timelineBubbleIcon: imageBase64 || null }, { merge: true });

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
 * Save the timeline menu bubble icon to Firestore (settings/images)
 * @param {string|null} imageBase64 - Base64 encoded image or null to remove
 * @returns {Promise<void>}
 */
export async function saveTimelineMenuBubbleIcon(imageBase64) {
  try {
    const imagesRef = doc(db, 'settings', 'images');
    await setDoc(imagesRef, { timelineMenuBubbleIcon: imageBase64 || null }, { merge: true });

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
 * Save the default recipe image for the timeline to Firestore (settings/images)
 * @param {string|null} imageBase64 - Base64 encoded image or null to remove
 * @returns {Promise<void>}
 */
export async function saveTimelineRecipeDefaultImage(imageBase64) {
  try {
    const imagesRef = doc(db, 'settings', 'images');
    await setDoc(imagesRef, { timelineRecipeDefaultImage: imageBase64 || null }, { merge: true });

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
 * Save the default menu image for the timeline to Firestore (settings/images)
 * @param {string|null} imageBase64 - Base64 encoded image or null to remove
 * @returns {Promise<void>}
 */
export async function saveTimelineMenuDefaultImage(imageBase64) {
  try {
    const imagesRef = doc(db, 'settings', 'images');
    await setDoc(imagesRef, { timelineMenuDefaultImage: imageBase64 || null }, { merge: true });

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
 * Save the timeline cook event bubble icon to Firestore (settings/images)
 * @param {string|null} imageBase64 - Base64 encoded image or null to remove
 * @returns {Promise<void>}
 */
export async function saveTimelineCookEventBubbleIcon(imageBase64) {
  try {
    const imagesRef = doc(db, 'settings', 'images');
    await setDoc(imagesRef, { timelineCookEventBubbleIcon: imageBase64 || null }, { merge: true });

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
 * Save the default cook event image for the timeline to Firestore (settings/images)
 * @param {string|null} imageBase64 - Base64 encoded image or null to remove
 * @returns {Promise<void>}
 */
export async function saveTimelineCookEventDefaultImage(imageBase64) {
  try {
    const imagesRef = doc(db, 'settings', 'images');
    await setDoc(imagesRef, { timelineCookEventDefaultImage: imageBase64 || null }, { merge: true });

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

/**
 * Migrates a print format from layoutVersion 1 (y/h as % of page height) to
 * layoutVersion 2 (all coordinates as % of page width).
 *
 * In v1, element y and h values were stored as percentage of the page HEIGHT.
 * In v2, ALL coordinates (x, y, w, h) are stored as percentage of the page WIDTH.
 * CSS percentage values for top/height inside a padding-bottom aspect-ratio container
 * are relative to the container WIDTH, so all coordinates must use the same base.
 *
 * @param {Object} format - A print format object (may be v1 or v2)
 * @returns {Object} A new format object in v2 layout
 */
export function migrateFormatToV2(format) {
  if ((format.layoutVersion || 1) >= PRINT_FORMAT_LAYOUT_VERSION) {
    return format; // Already up to date
  }
  const orientation = format.orientation || 'portrait';
  const pageWidthCm = format.pageWidthCm ?? (orientation === 'landscape' ? DEFAULT_PRINT_PAGE_HEIGHT_CM : DEFAULT_PRINT_PAGE_WIDTH_CM);
  const pageHeightCm = format.pageHeightCm ?? (orientation === 'landscape' ? DEFAULT_PRINT_PAGE_WIDTH_CM : DEFAULT_PRINT_PAGE_HEIGHT_CM);
  const ratio = pageHeightCm / pageWidthCm;

  const migratedElements = (format.elements || []).map((el) => ({
    ...el,
    y: parseFloat((el.y * ratio).toFixed(2)),
    h: parseFloat((el.h * ratio).toFixed(2)),
  }));

  return { ...format, elements: migratedElements, layoutVersion: PRINT_FORMAT_LAYOUT_VERSION };
}

/**
 * Get print format configurations from Firestore or return defaults.
 * @returns {Promise<Array>} Promise resolving to array of print format objects
 */
export async function getPrintFormats() {
  const settings = await getSettings();
  const formats = settings.printFormats && settings.printFormats.length > 0
    ? settings.printFormats
    : DEFAULT_PRINT_FORMATS;
  return formats.map(migrateFormatToV2);
}

/**
 * Save print format configurations to Firestore.
 * @param {Array} printFormats - Array of print format objects
 * @returns {Promise<void>}
 */
export async function savePrintFormats(printFormats) {
  try {
    const settingsRef = doc(db, 'settings', 'app');
    await updateDoc(settingsRef, { printFormats });

    // Update cache
    if (settingsCache) {
      settingsCache.printFormats = printFormats;
    }
  } catch (error) {
    console.error('Error saving print formats:', error);
    throw error;
  }
}

/**
 * Select the best matching print format for a given image count.
 *
 * Formats with a maxPhotos value act as thresholds: they apply when
 * imageCount <= maxPhotos.  Among all matching threshold formats the one
 * with the **lowest** maxPhotos wins (most specific match).  Formats with
 * maxPhotos === null act as catch-all fallbacks and are only used when no
 * threshold format matches.
 *
 * @param {Array} printFormats - Array of print format objects (may be empty)
 * @param {number} imageCount  - Number of images in the recipe
 * @returns {Object} The selected print format object
 */
export function selectPrintFormat(printFormats, imageCount) {
  const formats = printFormats && printFormats.length > 0 ? printFormats : DEFAULT_PRINT_FORMATS;
  const count = imageCount || 0;

  // Collect threshold formats that cover the current image count
  const withThreshold = formats.filter(
    (f) => f.maxPhotos !== null && f.maxPhotos !== undefined && f.maxPhotos >= count
  );

  if (withThreshold.length > 0) {
    // Pick the most specific (lowest threshold that still covers count)
    withThreshold.sort((a, b) => a.maxPhotos - b.maxPhotos);
    return withThreshold[0];
  }

  // Fall back to catch-all format (maxPhotos === null / undefined)
  const catchAll = formats.find((f) => f.maxPhotos === null || f.maxPhotos === undefined);
  return catchAll || DEFAULT_PRINT_FORMATS[0];
}

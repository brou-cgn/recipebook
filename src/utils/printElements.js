/**
 * Element registry for print formats.
 *
 * Single source of truth for every element that can be placed on a print page:
 * id, label, preview colour, type and the default positions for portrait and
 * landscape pages.
 *
 * Coordinate system (layoutVersion >= 2): x, y, w, h are ALL percentages of the
 * page WIDTH. Rendering converts y/h to percentages of the page height (see
 * printLayout.js).
 */

/** Default page width in cm for portrait orientation (DIN A4) */
export const DEFAULT_PRINT_PAGE_WIDTH_CM = 21.0;
/** Default page height in cm for portrait orientation (DIN A4) */
export const DEFAULT_PRINT_PAGE_HEIGHT_CM = 29.7;

export const DEFAULT_PRINT_FONT_FAMILY = "Georgia, 'Times New Roman', serif";
export const DEFAULT_PRINT_ORIENTATION = 'portrait';

/** Available font options for print formats */
export const PRINT_FONT_OPTIONS = [
  { label: 'Georgia (Serif)', value: "Georgia, 'Times New Roman', serif" },
  { label: 'Times New Roman (Serif)', value: "'Times New Roman', Times, serif" },
  { label: 'Arial (Sans-Serif)', value: "Arial, Helvetica, sans-serif" },
  { label: 'Helvetica (Sans-Serif)', value: "Helvetica, Arial, sans-serif" },
  { label: 'Verdana (Sans-Serif)', value: "Verdana, Geneva, sans-serif" },
  { label: 'Courier New (Monospace)', value: "'Courier New', Courier, monospace" },
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

/**
 * All elements that can be placed on a print format page.
 *   id {string}      - Unique element identifier
 *   label {string}   - Human-readable label shown in the editor
 *   color {string}   - Background colour used in the WYSIWYG editor
 *   isImage {boolean}- Image elements get no text formatting
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

/** Returns the registry entry for an element id, or undefined. */
export function getPrintElementDef(id) {
  return PRINT_FORMAT_ELEMENTS.find((d) => d.id === id);
}

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

/** Returns default elements for the given orientation (portrait fallback). */
export function getDefaultPrintElements(orientation) {
  return orientation === 'landscape'
    ? DEFAULT_PRINT_ELEMENTS_LANDSCAPE
    : DEFAULT_PRINT_ELEMENTS_PORTRAIT;
}

/**
 * Merges stored print-format elements with the defaults, ensuring all known element IDs
 * are present. Elements with unknown IDs are dropped from the result (they are not
 * renderable); callers that persist formats should keep the original array.
 */
export function mergePrintElementsWithDefaults(elements, orientation) {
  const defaults = getDefaultPrintElements(orientation);
  return PRINT_FORMAT_ELEMENTS.map((def) => {
    const existing = Array.isArray(elements) && elements.find((e) => e && e.id === def.id);
    if (existing) return existing;
    const fallback = defaults.find((d) => d.id === def.id);
    return fallback
      ? { ...fallback }
      : { id: def.id, x: 2, y: 2, w: 50, h: 10, visible: false };
  });
}

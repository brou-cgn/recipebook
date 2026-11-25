/**
 * Shared constants of the print formats: default page size and fonts.
 *
 * Until the free layout was removed (Vorhaben Drucklayout, Stufe 1) this file also held the
 * registry of positioned elements and their default boxes. Formats are templates now
 * (printTemplates.js); the file keeps its name until the print files move (Stufe 2).
 */

/** Default page width in cm for portrait orientation (DIN A4) */
export const DEFAULT_PRINT_PAGE_WIDTH_CM = 21.0;
/** Default page height in cm for portrait orientation (DIN A4) */
export const DEFAULT_PRINT_PAGE_HEIGHT_CM = 29.7;

export const DEFAULT_PRINT_FONT_FAMILY = "Georgia, 'Times New Roman', serif";

/** Available font options for print formats */
export const PRINT_FONT_OPTIONS = [
  { label: 'Georgia (Serif)', value: "Georgia, 'Times New Roman', serif" },
  { label: 'Times New Roman (Serif)', value: "'Times New Roman', Times, serif" },
  { label: 'Arial (Sans-Serif)', value: "Arial, Helvetica, sans-serif" },
  { label: 'Helvetica (Sans-Serif)', value: "Helvetica, Arial, sans-serif" },
  { label: 'Verdana (Sans-Serif)', value: "Verdana, Geneva, sans-serif" },
  { label: 'Courier New (Monospace)', value: "'Courier New', Courier, monospace" },
];

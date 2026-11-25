/**
 * Page and type basics of the print formats: default page size, fonts, the page size of a
 * format and the text formatting of an element. Pure, no React.
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

/** Page size in cm; defaults to DIN A4 for the format's orientation. */
export function getPageSize(format) {
  const landscape = format?.orientation === 'landscape';
  return {
    widthCm: format?.pageWidthCm ?? (landscape ? DEFAULT_PRINT_PAGE_HEIGHT_CM : DEFAULT_PRINT_PAGE_WIDTH_CM),
    heightCm: format?.pageHeightCm ?? (landscape ? DEFAULT_PRINT_PAGE_WIDTH_CM : DEFAULT_PRINT_PAGE_HEIGHT_CM),
  };
}

/** Text formatting (size factor, B/I/U, colour, horizontal alignment) of an element override. */
export function elementTextStyle(el) {
  const style = {};
  if (el.fontSizeScale && el.fontSizeScale !== 1) style.fontSize = `${el.fontSizeScale}em`;
  if (el.fontBold) style.fontWeight = 'bold';
  if (el.fontItalic) style.fontStyle = 'italic';
  if (el.fontUnderline) style.textDecoration = 'underline';
  if (el.fontColor) style.color = el.fontColor;
  if (el.textAlignH) style.textAlign = el.textAlignH;
  return style;
}

/**
 * Pure helpers for print pages: page size and the text formatting of an element.
 */
import { DEFAULT_PRINT_PAGE_WIDTH_CM, DEFAULT_PRINT_PAGE_HEIGHT_CM } from './printElements';

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

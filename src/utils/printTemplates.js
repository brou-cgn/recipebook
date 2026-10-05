/**
 * Print templates ("Vorlagen") for the flow layout.
 *
 * A flow format does not position boxes: its content flows top to bottom like a
 * Word document (and continues on the next page when it is long). The format only
 * stores a small set of style options plus optional per-element text formatting:
 *
 *   {
 *     layoutType: 'flow',
 *     template: 'classic',            // which template the style started from
 *     style: { ...FLOW_STYLE },       // complete resolved options (see below)
 *     overrides: { title: { fontSizeScale, fontBold, fontItalic, fontUnderline, fontColor, textAlignH } }
 *   }
 */
import {
  DEFAULT_PRINT_FONT_FAMILY,
  DEFAULT_PRINT_PAGE_WIDTH_CM,
  DEFAULT_PRINT_PAGE_HEIGHT_CM,
} from './printElements';

/** Elements of the flow layout (the photos are one element). */
export const FLOW_ELEMENTS = [
  { id: 'title', label: 'Titel' },
  { id: 'authorDate', label: 'Autor & Datum' },
  { id: 'metadata', label: 'Kulinarik / Zeit / Infos' },
  { id: 'photos', label: 'Fotos' },
  { id: 'ingredients', label: 'Zutaten' },
  { id: 'steps', label: 'Zubereitung' },
];

export const FLOW_BASE_SIZES = [
  { value: 's', label: 'Klein', px: 13.5 },
  { value: 'm', label: 'Mittel', px: 15.2 },
  { value: 'l', label: 'Groß', px: 17 },
];
export const FLOW_SPACINGS = [
  { value: 'compact', label: 'Eng', em: 0.6 },
  { value: 'normal', label: 'Normal', em: 1 },
  { value: 'airy', label: 'Luftig', em: 1.6 },
];
export const FLOW_HEADING_STYLES = [
  { value: 'underline', label: 'Unterstrichen' },
  { value: 'bar', label: 'Farbbalken' },
  { value: 'plain', label: 'Schlicht' },
];
export const FLOW_PHOTO_POSITIONS = [
  { value: 'top', label: 'Oben' },
  { value: 'left', label: 'Links' },
  { value: 'right', label: 'Rechts' },
  { value: 'none', label: 'Ohne Foto' },
];
/** Width share of the photo area: S/M/L, relative to the page width (top) or the header (left/right). */
export const FLOW_PHOTO_SIZES = [
  { value: 's', label: 'Klein', top: 50, side: 30 },
  { value: 'm', label: 'Mittel', top: 75, side: 40 },
  { value: 'l', label: 'Groß', top: 100, side: 50 },
];
export const FLOW_PHOTO_ASPECTS = [
  { value: '16/9', label: '16:9' },
  { value: '3/2', label: '3:2' },
  { value: '4/3', label: '4:3' },
  { value: '1/1', label: 'Quadrat' },
  { value: '3/4', label: '3:4 hoch' },
  { value: 'none', label: 'Original' },
];
export const FLOW_COLUMNS = [
  { value: 'two', label: 'Zutaten und Zubereitung nebeneinander' },
  { value: 'one', label: 'Untereinander' },
];
export const FLOW_METADATA_STYLES = [
  { value: 'line', label: 'Mit Linien' },
  { value: 'plain', label: 'Schlicht' },
];
export const FLOW_ALIGNMENTS = [
  { value: 'left', label: 'Links' },
  { value: 'center', label: 'Mitte' },
  { value: 'right', label: 'Rechts' },
];

export const PAPER_PRESETS = [
  { id: 'a4', label: 'A4 (21 × 29,7 cm)', widthCm: DEFAULT_PRINT_PAGE_WIDTH_CM, heightCm: DEFAULT_PRINT_PAGE_HEIGHT_CM },
  { id: 'a5', label: 'A5 (14,8 × 21 cm)', widthCm: 14.8, heightCm: 21 },
  { id: 'a6', label: 'A6 (10,5 × 14,8 cm)', widthCm: 10.5, heightCm: 14.8 },
  { id: 'letter', label: 'Letter (21,6 × 27,9 cm)', widthCm: 21.59, heightCm: 27.94 },
];

export const MIN_MARGIN_CM = 0;
export const MAX_MARGIN_CM = 5;
export const FLOW_OVERRIDE_KEYS = ['fontSizeScale', 'fontBold', 'fontItalic', 'fontUnderline', 'fontColor', 'textAlignH'];
export const MIN_FONT_SCALE = 0.6;
export const MAX_FONT_SCALE = 2;

/** Every option with its fallback; a template overrides some of them. */
export const FLOW_STYLE_DEFAULTS = {
  fontFamily: DEFAULT_PRINT_FONT_FAMILY,
  baseSize: 'm',
  accent: '#333333',
  spacing: 'normal',
  headingStyle: 'underline',
  titleAlign: 'center',
  metadataStyle: 'line',
  photoPosition: 'top',
  photoSize: 'l',
  photoAspect: '16/9',
  photoCount: 1,
  columns: 'two',
  tintIngredients: false,
  marginCm: 1.5,
  show: { title: true, authorDate: true, metadata: true, photos: true, ingredients: true, steps: true },
};

export const PRINT_TEMPLATES = [
  {
    id: 'classic',
    label: 'Klassisch',
    description: 'Zentrierter Titel, breites Foto, Zutaten und Zubereitung nebeneinander.',
    style: {},
  },
  {
    id: 'photo',
    label: 'Foto groß',
    description: 'Großes Foto im Querformat, linksbündiger Titel, roter Farbbalken.',
    style: {
      fontFamily: "Helvetica, Arial, sans-serif",
      accent: '#a33a26',
      headingStyle: 'bar',
      titleAlign: 'left',
      metadataStyle: 'plain',
      photoAspect: '4/3',
    },
  },
  {
    id: 'card',
    label: 'Karte',
    description: 'Foto links neben dem Titel, getönte Zutatenspalte.',
    style: {
      accent: '#7a4e2d',
      titleAlign: 'left',
      photoPosition: 'left',
      photoSize: 'm',
      photoAspect: '1/1',
      tintIngredients: true,
    },
  },
  {
    id: 'compact',
    label: 'Kompakt',
    description: 'Kleine Schrift und enge Abstände, Foto rechts. Gut für A5.',
    style: {
      fontFamily: "Arial, Helvetica, sans-serif",
      baseSize: 's',
      spacing: 'compact',
      titleAlign: 'left',
      photoPosition: 'right',
      photoSize: 's',
      photoAspect: '3/2',
      marginCm: 1.2,
    },
  },
  {
    id: 'minimal',
    label: 'Schlicht',
    description: 'Nur Text, alles untereinander, ohne Foto.',
    style: {
      fontFamily: "Helvetica, Arial, sans-serif",
      accent: '#000000',
      headingStyle: 'plain',
      titleAlign: 'left',
      metadataStyle: 'plain',
      photoPosition: 'none',
      columns: 'one',
    },
  },
];

export const DEFAULT_TEMPLATE_ID = 'classic';

export function getTemplate(id) {
  return PRINT_TEMPLATES.find((t) => t.id === id) || PRINT_TEMPLATES[0];
}

/** Complete style of a template (defaults + template values). */
export function getTemplateStyle(id) {
  const t = getTemplate(id);
  return { ...FLOW_STYLE_DEFAULTS, ...t.style, show: { ...FLOW_STYLE_DEFAULTS.show, ...(t.style.show || {}) } };
}

const oneOf = (options, value, fallback) => (options.some((o) => o.value === value) ? value : fallback);
const isHex = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);

/** Brings arbitrary stored style values into valid ranges; unknown keys are dropped. Pure. */
export function normalizeFlowStyle(style) {
  const s = style && typeof style === 'object' ? style : {};
  const d = FLOW_STYLE_DEFAULTS;
  const margin = Number.isFinite(s.marginCm) ? s.marginCm : d.marginCm;
  const count = Number.isInteger(s.photoCount) ? s.photoCount : d.photoCount;
  const show = {};
  FLOW_ELEMENTS.forEach(({ id }) => { show[id] = s.show?.[id] !== false; });
  return {
    fontFamily: typeof s.fontFamily === 'string' && s.fontFamily ? s.fontFamily : d.fontFamily,
    baseSize: oneOf(FLOW_BASE_SIZES, s.baseSize, d.baseSize),
    accent: isHex(s.accent) ? s.accent : d.accent,
    spacing: oneOf(FLOW_SPACINGS, s.spacing, d.spacing),
    headingStyle: oneOf(FLOW_HEADING_STYLES, s.headingStyle, d.headingStyle),
    titleAlign: oneOf(FLOW_ALIGNMENTS, s.titleAlign, d.titleAlign),
    metadataStyle: oneOf(FLOW_METADATA_STYLES, s.metadataStyle, d.metadataStyle),
    photoPosition: oneOf(FLOW_PHOTO_POSITIONS, s.photoPosition, d.photoPosition),
    photoSize: oneOf(FLOW_PHOTO_SIZES, s.photoSize, d.photoSize),
    photoAspect: oneOf(FLOW_PHOTO_ASPECTS, s.photoAspect, d.photoAspect),
    photoCount: Math.min(4, Math.max(1, count)),
    columns: oneOf(FLOW_COLUMNS, s.columns, d.columns),
    tintIngredients: s.tintIngredients === true,
    marginCm: Math.min(MAX_MARGIN_CM, Math.max(MIN_MARGIN_CM, margin)),
    show,
  };
}

/** Keeps only known text-formatting keys of known elements; drops empty entries. Pure. */
export function normalizeFlowOverrides(overrides) {
  const out = {};
  if (!overrides || typeof overrides !== 'object') return out;
  FLOW_ELEMENTS.forEach(({ id }) => {
    const o = overrides[id];
    if (!o || typeof o !== 'object') return;
    const clean = {};
    if (Number.isFinite(o.fontSizeScale) && o.fontSizeScale !== 1) {
      clean.fontSizeScale = Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, o.fontSizeScale));
    }
    ['fontBold', 'fontItalic', 'fontUnderline'].forEach((k) => { if (o[k] === true) clean[k] = true; });
    if (isHex(o.fontColor)) clean.fontColor = o.fontColor;
    if (['left', 'center', 'right'].includes(o.textAlignH)) clean.textAlignH = o.textAlignH;
    if (Object.keys(clean).length > 0) out[id] = clean;
  });
  return out;
}

/** The effective style of a format (flow formats only; other formats get the defaults). */
export function resolveFlowStyle(format) {
  return normalizeFlowStyle(format?.style);
}

export const isFlowFormat = (format) => format?.layoutType === 'flow';

/** Page margin in cm for printing; free layouts print edge to edge. */
export function getFormatMarginCm(format) {
  return isFlowFormat(format) ? resolveFlowStyle(format).marginCm : 0;
}

/** True when the format carries user changes beyond its template (used to ask before replacing them). */
export function hasFlowCustomisations(format) {
  const base = getTemplateStyle(format?.template);
  const current = resolveFlowStyle(format);
  return JSON.stringify(current) !== JSON.stringify(normalizeFlowStyle(base))
    || Object.keys(normalizeFlowOverrides(format?.overrides)).length > 0;
}

/** A new flow format from a template. IDs are generated by the caller to keep this module pure of printFormats. */
export function buildFlowFormat({ id, name, templateId = DEFAULT_TEMPLATE_ID, orientation = 'portrait', maxPhotos = null }) {
  const landscape = orientation === 'landscape';
  return {
    id,
    name,
    maxPhotos,
    layoutType: 'flow',
    template: getTemplate(templateId).id,
    orientation: landscape ? 'landscape' : 'portrait',
    pageWidthCm: landscape ? DEFAULT_PRINT_PAGE_HEIGHT_CM : DEFAULT_PRINT_PAGE_WIDTH_CM,
    pageHeightCm: landscape ? DEFAULT_PRINT_PAGE_WIDTH_CM : DEFAULT_PRINT_PAGE_HEIGHT_CM,
    fontFamily: getTemplateStyle(templateId).fontFamily,
    layoutVersion: 3,
    style: getTemplateStyle(templateId),
    overrides: {},
  };
}

/** Same format with another template applied: style and overrides are reset, identity and page size are kept. */
export function applyTemplate(format, templateId) {
  const style = getTemplateStyle(templateId);
  return {
    ...format,
    layoutType: 'flow',
    template: getTemplate(templateId).id,
    fontFamily: style.fontFamily,
    style,
    overrides: {},
  };
}

/** Converts any format to a flow format, keeping name, photo limit and page size. */
export function convertToFlowFormat(format, templateId = DEFAULT_TEMPLATE_ID) {
  const { elements, migrationNotes, ...rest } = format;
  return applyTemplate(rest, templateId);
}

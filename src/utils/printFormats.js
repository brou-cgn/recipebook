/**
 * Print format model: defaults, selection, migration, validation.
 *
 * Every print format is a template-based (flow) format, see printTemplates.js:
 *
 *   { id, name, maxPhotos, layoutType: 'flow', template, orientation, pageWidthCm,
 *     pageHeightCm, fontFamily, layoutVersion: 3, style, overrides }
 *
 * Until 25.11.2026 there was a second, free layout with boxes positioned by hand (formats
 * without `layoutType`, carrying `elements`; before that a flex layout with `elementOrder`,
 * `imageWidth`, `imageAlign`, `imageColumns`). Such formats may still be stored. They are
 * converted to the template "Klassisch" whenever they are read (migrateFormat); nothing is
 * written back until the formats are saved in the settings.
 */
import { getPageSize } from './printLayout';
import {
  buildFlowFormat,
  normalizeFlowOverrides,
  normalizeFlowStyle,
  DEFAULT_TEMPLATE_ID,
  getTemplate,
  getTemplateStyle,
  isFlowFormat,
  MIN_MARGIN_CM,
  MAX_MARGIN_CM,
} from './printTemplates';

export const PRINT_FORMAT_LAYOUT_VERSION = 3;

/** Fields of the removed layouts (free layout and the flex layout before it). */
const LEGACY_FIELDS = ['elements', 'elementOrder', 'imageWidth', 'imageAlign', 'imageColumns'];
const MIN_PAGE_CM = 5;
const MAX_PAGE_CM = 200;
/** Maximum serialised size of one format (keeps settings/app well below 1 MiB). */
export const MAX_FORMAT_BYTES = 8 * 1024;

/**
 * Marks a format that migrateFormat converted from the free layout. Only present on formats
 * as they are read; savePrintFormats (customLists.js) drops it, so the hint in the settings
 * disappears once the converted formats are stored.
 */
export const FREE_LAYOUT_CONVERTED_NOTE = 'free-layout-converted';

/** True for a format that was converted from the free layout and is not saved yet. */
export const isConvertedFreeFormat = (format) =>
  Array.isArray(format?.migrationNotes) && format.migrationNotes.includes(FREE_LAYOUT_CONVERTED_NOTE);

/** The format the app prints with while nothing is stored: template "Klassisch" on A4 portrait. */
export const DEFAULT_PRINT_FORMATS = [
  buildFlowFormat({ id: 'default', name: 'Standard', templateId: DEFAULT_TEMPLATE_ID }),
];

// ─── Selection ──────────────────────────────────────────────────────────────

/**
 * Select the best matching print format for a given image count.
 *
 * Formats with a maxPhotos value are thresholds: they apply when
 * imageCount <= maxPhotos. Among all matching thresholds the lowest wins; on a
 * tie the format listed first wins. Formats with maxPhotos == null are
 * catch-alls, used only when no threshold matches.
 */
export function selectPrintFormat(printFormats, imageCount) {
  const formats = Array.isArray(printFormats) && printFormats.length > 0 ? printFormats : DEFAULT_PRINT_FORMATS;
  const count = imageCount || 0;

  let best = null;
  for (const f of formats) {
    if (f.maxPhotos === null || f.maxPhotos === undefined || f.maxPhotos < count) continue;
    if (best === null || f.maxPhotos < best.maxPhotos) best = f;
  }
  if (best) return best;

  const catchAll = formats.find((f) => f.maxPhotos === null || f.maxPhotos === undefined);
  return catchAll || DEFAULT_PRINT_FORMATS[0];
}

// ─── Migration ──────────────────────────────────────────────────────────────

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Blocks of the template that had a box of the same id in the free layout. */
const FREE_TEXT_ELEMENTS = ['title', 'authorDate', 'metadata', 'ingredients', 'steps'];
const FREE_PHOTO_ELEMENTS = ['photo1', 'photo2', 'photo3', 'photo4'];
/** What the free layout showed for a box that a stored format did not list: everything but photos 2 to 4. */
const FREE_HIDDEN_BY_DEFAULT = ['photo2', 'photo3', 'photo4'];

/**
 * A format of the free layout (or of the flex layout before it) as a template format.
 *
 * Based on the template "Klassisch". Kept: the font and which parts were visible (title,
 * author and date, metadata, ingredients, steps; the number of visible photo boxes becomes
 * the photo count, none visible means "no photo"). Not kept: positions, sizes, rotation,
 * borders and the text formatting of single boxes. Identity (id, name, photo limit) and page
 * size stay on the format and are normalised by the caller.
 */
function convertFreeFormat(base) {
  const elements = (Array.isArray(base.elements) ? base.elements : [])
    .filter((el) => el && typeof el === 'object' && typeof el.id === 'string');
  const wasVisible = (id) => {
    const el = elements.find((e) => e.id === id);
    return el ? el.visible !== false : !FREE_HIDDEN_BY_DEFAULT.includes(id);
  };

  const style = getTemplateStyle(DEFAULT_TEMPLATE_ID);
  if (typeof base.fontFamily === 'string' && base.fontFamily) style.fontFamily = base.fontFamily;
  FREE_TEXT_ELEMENTS.forEach((id) => { style.show[id] = wasVisible(id); });
  const photoCount = FREE_PHOTO_ELEMENTS.filter(wasVisible).length;
  if (photoCount === 0) {
    style.photoPosition = 'none';
    style.show.photos = false;
  } else {
    style.photoCount = photoCount;
  }

  return {
    ...base,
    layoutType: 'flow',
    template: DEFAULT_TEMPLATE_ID,
    style,
    overrides: {},
    migrationNotes: [FREE_LAYOUT_CONVERTED_NOTE],
  };
}

/** Brings a template format into its valid, complete shape. Pure. */
function normalizeFlowFormat(format, { orientation, page }) {
  const style = normalizeFlowStyle(format.style);
  const out = { ...format };
  LEGACY_FIELDS.forEach((f) => delete out[f]);
  delete out.migrationNotes;
  Object.assign(out, {
    id: typeof format.id === 'string' && format.id ? format.id : generateFormatId(),
    name: typeof format.name === 'string' ? format.name : 'Standard',
    maxPhotos: isFiniteNumber(format.maxPhotos) ? format.maxPhotos : null,
    layoutType: 'flow',
    template: getTemplate(format.template).id,
    orientation,
    fontFamily: style.fontFamily,
    pageWidthCm: page.widthCm,
    pageHeightCm: page.heightCm,
    layoutVersion: PRINT_FORMAT_LAYOUT_VERSION,
    style,
    overrides: normalizeFlowOverrides(format.overrides),
  });
  if (isConvertedFreeFormat(format)) out.migrationNotes = [FREE_LAYOUT_CONVERTED_NOTE];
  return out;
}

/**
 * Brings any stored format into the current shape: template formats are normalised, formats
 * of the removed layouts and defective data become the template "Klassisch" (convertFreeFormat)
 * and carry the note FREE_LAYOUT_CONVERTED_NOTE.
 * Pure and idempotent: migrateFormat(migrateFormat(x)) deep-equals migrateFormat(x).
 */
export function migrateFormat(input) {
  const base = input && typeof input === 'object' ? input : {};
  const hasSizes = isFiniteNumber(base.pageWidthCm) && isFiniteNumber(base.pageHeightCm);
  const orientation = hasSizes
    ? (base.pageWidthCm >= base.pageHeightCm ? 'landscape' : 'portrait')
    : (base.orientation === 'landscape' ? 'landscape' : 'portrait');
  const page = getPageSize({
    orientation,
    pageWidthCm: hasSizes ? clamp(base.pageWidthCm, MIN_PAGE_CM, MAX_PAGE_CM) : undefined,
    pageHeightCm: hasSizes ? clamp(base.pageHeightCm, MIN_PAGE_CM, MAX_PAGE_CM) : undefined,
  });
  return normalizeFlowFormat(isFlowFormat(base) ? base : convertFreeFormat(base), { orientation, page });
}

// ─── Creation ───────────────────────────────────────────────────────────────

let idCounter = 0;
/** Unique format id (time + counter + random; safe against double clicks). */
export function generateFormatId() {
  idCounter = (idCounter + 1) % 1e6;
  return `fmt-${Date.now().toString(36)}-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** New format from a template, with the page size matching the orientation. */
export function createFlowFormat(templateId = DEFAULT_TEMPLATE_ID, orientation = 'portrait', name = 'Neues Format') {
  return buildFlowFormat({ id: generateFormatId(), name, templateId, orientation });
}

/** Deep copy with a new id, "<name> Kopie" and no photo threshold (no conflicts). */
export function duplicatePrintFormat(format) {
  const copy = JSON.parse(JSON.stringify(format));
  delete copy.migrationNotes;
  return { ...copy, id: generateFormatId(), name: `${format.name || 'Format'} Kopie`, maxPhotos: null };
}

// ─── Validation ─────────────────────────────────────────────────────────────

export class PrintFormatValidationError extends Error {
  constructor(errors) {
    super(`Ungültige Druckformate: ${errors.map((e) => e.message).join('; ')}`);
    this.name = 'PrintFormatValidationError';
    this.errors = errors;
  }
}

/**
 * @returns {Array<{formatId:string, index:number, field:string, message:string}>}
 *   Empty when valid. `index` -1 = list level.
 */
export function validatePrintFormats(formats) {
  const errors = [];
  const list = Array.isArray(formats) ? formats : [];
  const add = (index, field, message) =>
    errors.push({ formatId: index >= 0 ? list[index]?.id : '', index, field, message });

  if (!list.some((f) => f.maxPhotos === null || f.maxPhotos === undefined)) {
    add(-1, 'maxPhotos', 'Mindestens ein Format ohne Fotolimit (gilt für alle) ist erforderlich.');
  }

  const seen = new Map();
  list.forEach((f, i) => {
    if (!f.name || !String(f.name).trim()) add(i, 'name', 'Der Formatname darf nicht leer sein.');
    if (f.maxPhotos !== null && f.maxPhotos !== undefined) {
      if (!Number.isInteger(f.maxPhotos) || f.maxPhotos < 0) {
        add(i, 'maxPhotos', 'Die maximale Fotoanzahl muss eine ganze Zahl ≥ 0 sein.');
      } else if (seen.has(f.maxPhotos)) {
        add(i, 'maxPhotos', `Die Fotoanzahl ${f.maxPhotos} ist bereits bei „${list[seen.get(f.maxPhotos)].name}" vergeben.`);
      } else {
        seen.set(f.maxPhotos, i);
      }
    }
    const { widthCm, heightCm } = getPageSize(f);
    const badSize = [widthCm, heightCm].some((v) => !isFiniteNumber(v) || v < MIN_PAGE_CM || v > MAX_PAGE_CM);
    if (badSize) add(i, 'pageSize', `Die Seitengröße muss zwischen ${MIN_PAGE_CM} und ${MAX_PAGE_CM} cm liegen.`);
    const margin = f.style?.marginCm;
    if (margin !== undefined && (!isFiniteNumber(margin) || margin < MIN_MARGIN_CM || margin > MAX_MARGIN_CM)) {
      add(i, 'margin', `Der Seitenrand muss zwischen ${MIN_MARGIN_CM} und ${MAX_MARGIN_CM} cm liegen.`);
    }
    if (JSON.stringify(f).length > MAX_FORMAT_BYTES) {
      add(i, 'size', 'Das Format ist zu groß zum Speichern.');
    }
  });
  return errors;
}

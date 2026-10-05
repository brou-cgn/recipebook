/**
 * Print format model: defaults, selection, migration, validation.
 *
 * Layout versions
 *   v1 (no layoutVersion): x, w as % of page width; y, h as % of page height.
 *   v2: x, y, w, h ALL as % of page width (CSS padding-bottom trick).
 *   v3: v2 coordinates, legacy fields (elementOrder, imageWidth, imageAlign,
 *       imageColumns) removed, page size and orientation always explicit and
 *       consistent. Additive on top of v2, so older clients still render it.
 *       Optional `layoutType: 'flow'` formats (printTemplates.js) carry `template`,
 *       `style` and `overrides` instead of positioned `elements`.
 */
import {
  DEFAULT_PRINT_FONT_FAMILY,
  DEFAULT_PRINT_PAGE_WIDTH_CM,
  DEFAULT_PRINT_PAGE_HEIGHT_CM,
  DEFAULT_PRINT_ELEMENTS_PORTRAIT,
  getDefaultPrintElements,
} from './printElements';
import { clamp, effectiveDimensions, getMaxY, getPageSize, MIN_ELEMENT_H, MIN_ELEMENT_W } from './printLayout';
import {
  buildFlowFormat,
  convertToFlowFormat,
  normalizeFlowOverrides,
  normalizeFlowStyle,
  DEFAULT_TEMPLATE_ID,
  getTemplate,
  MIN_MARGIN_CM,
  MAX_MARGIN_CM,
} from './printTemplates';

export const PRINT_FORMAT_LAYOUT_VERSION = 3;

/** Fields that only the removed flex-based print path used. */
const LEGACY_FIELDS = ['elementOrder', 'imageWidth', 'imageAlign', 'imageColumns'];
const VALID_ROTATIONS = [0, 90, 180, 270];
const MIN_PAGE_CM = 5;
const MAX_PAGE_CM = 200;
/** Maximum serialised size of one format (keeps settings/app well below 1 MiB). */
export const MAX_FORMAT_BYTES = 8 * 1024;

const cloneElements = (elements) => elements.map((el) => ({ ...el }));

export const DEFAULT_PRINT_FORMATS = [
  {
    id: 'default',
    name: 'Standard',
    maxPhotos: null,
    orientation: 'portrait',
    fontFamily: DEFAULT_PRINT_FONT_FAMILY,
    pageWidthCm: DEFAULT_PRINT_PAGE_WIDTH_CM,
    pageHeightCm: DEFAULT_PRINT_PAGE_HEIGHT_CM,
    layoutVersion: PRINT_FORMAT_LAYOUT_VERSION,
    elements: DEFAULT_PRINT_ELEMENTS_PORTRAIT,
  },
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

/**
 * v1 -> v2: y/h from % of page height to % of page width. Kept for callers that
 * import it directly; migrateFormat() is the entry point for new code.
 */
export function migrateFormatToV2(format) {
  if ((format.layoutVersion || 1) >= 2) {
    return format;
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

  return { ...format, elements: migratedElements, layoutVersion: 2 };
}

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);

/** Brings one element's geometry and rotation into valid bounds. Pure. */
export function normalizeElement(el, page, fallback) {
  const fb = fallback || { x: 2, y: 2, w: 50, h: 10 };
  const maxY = getMaxY(page);
  const out = { ...el };
  out.rotation = VALID_ROTATIONS.includes(el.rotation) ? el.rotation : undefined;
  if (out.rotation === undefined || out.rotation === 0) delete out.rotation;

  out.w = clamp(isFiniteNumber(el.w) ? el.w : fb.w, MIN_ELEMENT_W, 100);
  out.h = clamp(isFiniteNumber(el.h) ? el.h : fb.h, MIN_ELEMENT_H, maxY);
  const { effW, effH } = effectiveDimensions(out);
  out.x = clamp(isFiniteNumber(el.x) ? el.x : fb.x, 0, Math.max(0, 100 - effW));
  out.y = clamp(isFiniteNumber(el.y) ? el.y : fb.y, 0, Math.max(0, maxY - effH));
  return out;
}

/** Flow formats: no positioned elements; style and overrides are normalised. */
function migrateFlowFormat(v2, { orientation, page }) {
  const style = normalizeFlowStyle(v2.style);
  const out = { ...v2 };
  LEGACY_FIELDS.forEach((f) => delete out[f]);
  delete out.elements;
  delete out.migrationNotes;
  return Object.assign(out, {
    id: typeof v2.id === 'string' && v2.id ? v2.id : generateFormatId(),
    name: typeof v2.name === 'string' ? v2.name : 'Standard',
    maxPhotos: isFiniteNumber(v2.maxPhotos) ? v2.maxPhotos : null,
    layoutType: 'flow',
    template: getTemplate(v2.template).id,
    orientation,
    fontFamily: style.fontFamily,
    pageWidthCm: page.widthCm,
    pageHeightCm: page.heightCm,
    layoutVersion: PRINT_FORMAT_LAYOUT_VERSION,
    style,
    overrides: normalizeFlowOverrides(v2.overrides),
  });
}

/**
 * Migrates any stored format (v1, v2, legacy, defective) to v3.
 * Pure and idempotent: migrateFormat(migrateFormat(x)) deep-equals migrateFormat(x).
 */
export function migrateFormat(input) {
  const base = input && typeof input === 'object' ? input : {};
  const validEls = (Array.isArray(base.elements) ? base.elements : [])
    .filter((el) => el && typeof el === 'object' && typeof el.id === 'string');
  const v2 = migrateFormatToV2({ ...base, elements: validEls });

  const hasLegacy = LEGACY_FIELDS.some((f) => base[f] !== undefined && f !== 'imageColumns');
  const hasSizes = isFiniteNumber(v2.pageWidthCm) && isFiniteNumber(v2.pageHeightCm);
  const orientation = hasSizes
    ? (v2.pageWidthCm >= v2.pageHeightCm ? 'landscape' : 'portrait')
    : (v2.orientation === 'landscape' ? 'landscape' : 'portrait');
  const page = getPageSize({
    orientation,
    pageWidthCm: hasSizes ? clamp(v2.pageWidthCm, MIN_PAGE_CM, MAX_PAGE_CM) : undefined,
    pageHeightCm: hasSizes ? clamp(v2.pageHeightCm, MIN_PAGE_CM, MAX_PAGE_CM) : undefined,
  });

  if (base.layoutType === 'flow') {
    return migrateFlowFormat(v2, { orientation, page });
  }

  const defaults = getDefaultPrintElements(orientation);
  const notes = Array.isArray(base.migrationNotes) ? [...base.migrationNotes] : [];
  let elements = v2.elements;
  if (elements.length === 0) {
    elements = cloneElements(defaults);
    if (hasLegacy && !notes.includes('legacy-layout-replaced')) notes.push('legacy-layout-replaced');
  }
  elements = elements
    .map((el) => normalizeElement(el, page, defaults.find((d) => d.id === el.id)));

  const out = { ...v2 };
  LEGACY_FIELDS.forEach((f) => delete out[f]);
  Object.assign(out, {
    id: typeof v2.id === 'string' && v2.id ? v2.id : generateFormatId(),
    name: typeof v2.name === 'string' ? v2.name : 'Standard',
    maxPhotos: isFiniteNumber(v2.maxPhotos) ? v2.maxPhotos : null,
    orientation,
    fontFamily: v2.fontFamily || DEFAULT_PRINT_FONT_FAMILY,
    pageWidthCm: page.widthCm,
    pageHeightCm: page.heightCm,
    layoutVersion: PRINT_FORMAT_LAYOUT_VERSION,
    elements,
  });
  if (notes.length > 0) out.migrationNotes = notes;
  return out;
}

// ─── Creation ───────────────────────────────────────────────────────────────

let idCounter = 0;
/** Unique format id (time + counter + random; safe against double clicks). */
export function generateFormatId() {
  idCounter = (idCounter + 1) % 1e6;
  return `fmt-${Date.now().toString(36)}-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** New format with defaults matching the orientation (page size included). */
export function createPrintFormat(orientation = 'portrait', name = 'Neues Format') {
  const landscape = orientation === 'landscape';
  return {
    id: generateFormatId(),
    name,
    maxPhotos: null,
    orientation: landscape ? 'landscape' : 'portrait',
    fontFamily: DEFAULT_PRINT_FONT_FAMILY,
    pageWidthCm: landscape ? DEFAULT_PRINT_PAGE_HEIGHT_CM : DEFAULT_PRINT_PAGE_WIDTH_CM,
    pageHeightCm: landscape ? DEFAULT_PRINT_PAGE_WIDTH_CM : DEFAULT_PRINT_PAGE_HEIGHT_CM,
    layoutVersion: PRINT_FORMAT_LAYOUT_VERSION,
    elements: cloneElements(getDefaultPrintElements(orientation)),
  };
}

/** New template-based (flow) format; this is what the settings create by default. */
export function createFlowFormat(templateId = DEFAULT_TEMPLATE_ID, orientation = 'portrait', name = 'Neues Format') {
  return buildFlowFormat({ id: generateFormatId(), name, templateId, orientation });
}

/** Converts a free-layout format to a template-based one (name, photo limit and page size are kept). */
export { convertToFlowFormat };

/** Deep copy with a new id, "<name> Kopie" and no photo threshold (no conflicts). */
export function duplicatePrintFormat(format) {
  const copy = JSON.parse(JSON.stringify(format));
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
    if (f.layoutType === 'flow') {
      const margin = f.style?.marginCm;
      if (margin !== undefined && (!isFiniteNumber(margin) || margin < MIN_MARGIN_CM || margin > MAX_MARGIN_CM)) {
        add(i, 'margin', `Der Seitenrand muss zwischen ${MIN_MARGIN_CM} und ${MAX_MARGIN_CM} cm liegen.`);
      }
    }
    if (JSON.stringify(f).length > MAX_FORMAT_BYTES) {
      add(i, 'size', 'Das Format ist zu groß zum Speichern.');
    }
  });
  return errors;
}

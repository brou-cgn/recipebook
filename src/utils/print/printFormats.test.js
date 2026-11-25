import {
  PRINT_FORMAT_LAYOUT_VERSION, DEFAULT_PRINT_FORMATS, selectPrintFormat,
  migrateFormat, createFlowFormat, duplicatePrintFormat, generateFormatId,
  validatePrintFormats, PrintFormatValidationError,
  FREE_LAYOUT_CONVERTED_NOTE, isConvertedFreeFormat,
} from './printFormats';
import { getTemplateStyle } from './printTemplates';

const fmt = (id, maxPhotos) => ({ id, name: id, maxPhotos });

describe('selectPrintFormat', () => {
  const small = fmt('small', 1);
  const mid = fmt('mid', 3);
  const all = fmt('all', null);

  test('0 images matches the lowest threshold', () => {
    expect(selectPrintFormat([all, mid, small], 0).id).toBe('small');
  });
  test('count equal to the threshold matches it', () => {
    expect(selectPrintFormat([all, mid, small], 1).id).toBe('small');
    expect(selectPrintFormat([all, mid, small], 3).id).toBe('mid');
  });
  test('count between thresholds picks the next higher threshold', () => {
    expect(selectPrintFormat([all, mid, small], 2).id).toBe('mid');
  });
  test('count above every threshold falls back to the catch-all', () => {
    expect(selectPrintFormat([all, mid, small], 4).id).toBe('all');
  });
  test('only catch-all', () => {
    expect(selectPrintFormat([all], 9).id).toBe('all');
  });
  test.each([[[]], [undefined], [null]])('empty list %p uses the default format', (list) => {
    expect(selectPrintFormat(list, 2)).toBe(DEFAULT_PRINT_FORMATS[0]);
  });
  test('missing maxPhotos counts as catch-all', () => {
    expect(selectPrintFormat([{ id: 'x' }], 5).id).toBe('x');
  });
  test('no match and no catch-all falls back to default', () => {
    expect(selectPrintFormat([small], 5)).toBe(DEFAULT_PRINT_FORMATS[0]);
  });
  test('ties are resolved deterministically: first listed wins', () => {
    expect(selectPrintFormat([fmt('first', 2), fmt('second', 2)], 1).id).toBe('first');
  });
  test('undefined image count behaves like 0', () => {
    expect(selectPrintFormat([all, small], undefined).id).toBe('small');
  });
});

// Formats of the removed free layout as they may still be stored in settings/app: the boxes the
// built-in default format had until 25.11.2026 (x, y, w, h in % of the page width).
const FREE_BOXES = [
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
const freeV3 = (patch = {}) => ({
  id: 'free', name: 'Frei', maxPhotos: null, orientation: 'portrait',
  fontFamily: "Georgia, 'Times New Roman', serif", pageWidthCm: 21, pageHeightCm: 29.7,
  layoutVersion: 3, elements: FREE_BOXES.map((el) => ({ ...el })), ...patch,
});
const withBoxes = (changes) => freeV3({
  elements: FREE_BOXES.map((el) => ({ ...el, ...(changes[el.id] || {}) })),
});
const v1 = {
  id: 'a', name: 'Alt', maxPhotos: 2, orientation: 'portrait',
  elements: [{ id: 'title', x: 2, y: 5, w: 96, h: 7, visible: true }],
};
const legacy = { id: 'l', name: 'L', elementOrder: ['steps', 'images'], imageWidth: 50, imageAlign: 'left', imageColumns: '2' };

describe('migrateFormat: formats of the removed free layout become the template "Klassisch"', () => {
  test('keeps identity, photo limit, page size and font; drops the positioned layout', () => {
    const out = migrateFormat(freeV3({
      id: 'x', name: 'Karte quer', maxPhotos: 2, orientation: 'landscape', pageWidthCm: 14.8, pageHeightCm: 10.5,
      fontFamily: 'Arial, Helvetica, sans-serif',
    }));
    expect(out).toMatchObject({
      id: 'x', name: 'Karte quer', maxPhotos: 2, layoutType: 'flow', template: 'classic',
      orientation: 'landscape', pageWidthCm: 14.8, pageHeightCm: 10.5,
      fontFamily: 'Arial, Helvetica, sans-serif', layoutVersion: PRINT_FORMAT_LAYOUT_VERSION,
    });
    expect(out.style.fontFamily).toBe('Arial, Helvetica, sans-serif');
    expect(out).not.toHaveProperty('elements');
    expect(out.overrides).toEqual({});
    expect(validatePrintFormats([{ ...out, maxPhotos: null }])).toEqual([]);
  });

  test('the former default format equals the plain template', () => {
    const out = migrateFormat(freeV3());
    expect(out.style).toEqual(getTemplateStyle('classic'));
    expect(out.fontFamily).toBe(getTemplateStyle('classic').fontFamily);
  });

  test('converted formats carry the note until they are saved; template formats never do', () => {
    const out = migrateFormat(freeV3());
    expect(out.migrationNotes).toEqual([FREE_LAYOUT_CONVERTED_NOTE]);
    expect(isConvertedFreeFormat(out)).toBe(true);
    expect(isConvertedFreeFormat(migrateFormat(createFlowFormat('card')))).toBe(false);
    expect(migrateFormat({ ...createFlowFormat('card'), migrationNotes: ['legacy-layout-replaced'] }))
      .not.toHaveProperty('migrationNotes');
    expect(isConvertedFreeFormat(undefined)).toBe(false);
  });

  test.each(['title', 'authorDate', 'metadata', 'ingredients', 'steps'])('a hidden %s box hides that part', (id) => {
    const show = migrateFormat(withBoxes({ [id]: { visible: false } })).style.show;
    expect(show[id]).toBe(false);
    expect(Object.entries(show).filter(([, on]) => !on).map(([key]) => key)).toEqual([id]);
  });

  test.each([
    [{}, 1],
    [{ photo2: { visible: true } }, 2],
    [{ photo2: { visible: true }, photo3: { visible: true } }, 3],
    [{ photo2: { visible: true }, photo3: { visible: true }, photo4: { visible: true } }, 4],
    [{ photo1: { visible: false }, photo3: { visible: true }, photo4: { visible: true } }, 2],
  ])('the number of visible photo boxes becomes the photo count: %j -> %i', (changes, count) => {
    const { style } = migrateFormat(withBoxes(changes));
    expect(style.photoCount).toBe(count);
    expect(style.photoPosition).toBe('top');
    expect(style.show.photos).toBe(true);
  });

  test('no visible photo box means "no photo"', () => {
    const { style } = migrateFormat(withBoxes({ photo1: { visible: false } }));
    expect(style.photoPosition).toBe('none');
    expect(style.show.photos).toBe(false);
  });

  test('boxes a stored format does not list count as the free layout showed them', () => {
    // The free layout filled missing boxes from its defaults: everything visible but photos 2 to 4.
    const out = migrateFormat(freeV3({ elements: [{ id: 'steps', x: 0, y: 0, w: 50, h: 50, visible: false }] }));
    expect(out.style.show).toEqual({ title: true, authorDate: true, metadata: true, photos: true, ingredients: true, steps: false });
    expect(out.style.photoCount).toBe(1);
  });

  test('a box without a visible flag is visible', () => {
    const out = migrateFormat(freeV3({ elements: [{ id: 'photo2', x: 0, y: 0, w: 10, h: 10 }] }));
    expect(out.style.photoCount).toBe(2);
  });

  test('positions, rotation, borders and the formatting of single boxes are not kept', () => {
    const out = migrateFormat(withBoxes({
      title: { x: 30, y: 90, rotation: 90, fontBold: true, fontColor: '#ff0000', borderTop: true, textAlignH: 'right' },
    }));
    expect(out.overrides).toEqual({});
    expect(JSON.stringify(out)).not.toMatch(/rotation|borderTop|#ff0000|"x":/);
    expect(out.style.titleAlign).toBe(getTemplateStyle('classic').titleAlign);
  });

  test.each([
    ['v1 (no layoutVersion)', v1],
    ['v2', { ...freeV3(), layoutVersion: 2, imageColumns: 'auto' }],
    ['v3', freeV3()],
  ])('every version of the free layout is converted: %s', (_, input) => {
    const out = migrateFormat(input);
    expect(out).toMatchObject({ layoutType: 'flow', template: 'classic', layoutVersion: PRINT_FORMAT_LAYOUT_VERSION });
    expect(out).not.toHaveProperty('elements');
    expect(out).not.toHaveProperty('imageColumns');
  });

  test('the older flex layout without boxes gets the plain template; its fields are dropped', () => {
    const out = migrateFormat(legacy);
    expect(out).toMatchObject({ id: 'l', name: 'L', layoutType: 'flow', template: 'classic' });
    expect(out.style).toEqual(getTemplateStyle('classic'));
    expect(out.migrationNotes).toEqual([FREE_LAYOUT_CONVERTED_NOTE]);
    ['elementOrder', 'imageWidth', 'imageAlign', 'imageColumns'].forEach((k) => expect(out).not.toHaveProperty(k));
  });

  test.each([
    ['empty object', {}],
    ['null', null],
    ['a string', 'kaputt'],
    ['elements is not an array', { id: 'x', elements: 'nope' }],
    ['garbage elements', { elements: [null, 3, { id: 5 }, { id: 'title', x: 'a', y: NaN, w: -5, h: Infinity }] }],
    ['defective values', { id: 'x', name: 7, maxPhotos: 'abc', fontFamily: 42, layoutVersion: 2, elements: [{ id: 'title', visible: 'no' }] }],
  ])('defective data becomes a valid template format without throwing: %s', (_, input) => {
    const out = migrateFormat(input);
    expect(out).toMatchObject({ layoutType: 'flow', template: 'classic', maxPhotos: null });
    expect(out.style).toEqual(getTemplateStyle('classic'));
    expect(typeof out.id).toBe('string');
    expect(typeof out.name).toBe('string');
    expect(validatePrintFormats([{ ...out, name: out.name || 'x' }])).toEqual([]);
  });

  test('does not mutate its input', () => {
    const input = freeV3();
    const copy = JSON.parse(JSON.stringify(input));
    migrateFormat(input);
    expect(input).toEqual(copy);
  });

  test.each([
    ['v1 portrait', v1],
    ['v1 landscape', { ...v1, orientation: 'landscape' }],
    ['v2 custom size', { ...v1, layoutVersion: 2, pageWidthCm: 15, pageHeightCm: 21 }],
    ['v3', freeV3()],
    ['v3 without photos', withBoxes({ photo1: { visible: false } })],
    ['flex layout', legacy],
    ['empty object', {}],
    ['null', null],
    ['garbage elements', { elements: [null, 3, { id: 5 }, { id: 'title', x: 'a', y: NaN, w: -5, h: Infinity }] }],
  ])('is idempotent: %s', (_, input) => {
    const once = migrateFormat(input);
    expect(migrateFormat(once)).toEqual(once);
  });

  test('orientation is derived from explicit page size', () => {
    expect(migrateFormat({ id: 'a', orientation: 'portrait', pageWidthCm: 30, pageHeightCm: 20 }).orientation).toBe('landscape');
    expect(migrateFormat({ id: 'a', orientation: 'landscape', pageWidthCm: 15, pageHeightCm: 20 }).orientation).toBe('portrait');
  });
  test('page size is explicit', () => {
    const out = migrateFormat({ id: 'a', orientation: 'landscape' });
    expect([out.pageWidthCm, out.pageHeightCm]).toEqual([29.7, 21]);
  });
  test('page size is clamped to 5..200 cm', () => {
    const out = migrateFormat({ id: 'a', pageWidthCm: 1, pageHeightCm: 500 });
    expect([out.pageWidthCm, out.pageHeightCm]).toEqual([5, 200]);
  });
  test('missing id gets generated, missing name defaults', () => {
    const out = migrateFormat({});
    expect(out.id).toMatch(/^fmt-/);
    expect(out.name).toBe('Standard');
  });
});

describe('DEFAULT_PRINT_FORMATS', () => {
  test('one deterministic catch-all: template "Klassisch" on A4 portrait', () => {
    expect(DEFAULT_PRINT_FORMATS).toHaveLength(1);
    expect(DEFAULT_PRINT_FORMATS[0]).toMatchObject({
      id: 'default', name: 'Standard', maxPhotos: null, layoutType: 'flow', template: 'classic',
      orientation: 'portrait', pageWidthCm: 21, pageHeightCm: 29.7, layoutVersion: PRINT_FORMAT_LAYOUT_VERSION,
    });
    expect(DEFAULT_PRINT_FORMATS[0].style).toEqual(getTemplateStyle('classic'));
  });
  test('is valid, stable under migration and not marked as converted', () => {
    expect(validatePrintFormats(DEFAULT_PRINT_FORMATS)).toEqual([]);
    DEFAULT_PRINT_FORMATS.forEach((f) => {
      expect(migrateFormat(f)).toEqual(f);
      expect(isConvertedFreeFormat(f)).toBe(false);
    });
  });
});

describe('createFlowFormat / duplicatePrintFormat / generateFormatId', () => {
  test('ids are unique even when generated in the same millisecond', () => {
    const ids = new Set(Array.from({ length: 500 }, generateFormatId));
    expect(ids.size).toBe(500);
  });
  test('duplicate is deep, has a new id, a copy name and no photo limit', () => {
    const original = { ...createFlowFormat(), name: 'Mein Format', maxPhotos: 2 };
    const copy = duplicatePrintFormat(original);
    expect(copy.id).not.toBe(original.id);
    expect(copy.name).toBe('Mein Format Kopie');
    expect(copy.maxPhotos).toBeNull();
    copy.style.show.title = false;
    expect(original.style.show.title).toBe(true);
  });
  test('the copy of a converted format is an ordinary new format (no note)', () => {
    const copy = duplicatePrintFormat(migrateFormat(freeV3()));
    expect(copy).not.toHaveProperty('migrationNotes');
  });
});

describe('validatePrintFormats', () => {
  const ok = (id, maxPhotos) => ({ ...createFlowFormat(), id, name: `Name ${id}`, maxPhotos });

  test('valid list has no errors', () => {
    expect(validatePrintFormats([ok('a', 1), ok('b', null)])).toEqual([]);
  });
  test('requires a catch-all format', () => {
    const errors = validatePrintFormats([ok('a', 1)]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ index: -1, field: 'maxPhotos' });
  });
  test('empty list is invalid', () => {
    expect(validatePrintFormats([]).length).toBeGreaterThan(0);
    expect(validatePrintFormats(undefined).length).toBeGreaterThan(0);
  });
  test('blank name', () => {
    const errors = validatePrintFormats([{ ...ok('a', null), name: '   ' }]);
    expect(errors.map((e) => e.field)).toEqual(['name']);
  });
  test('duplicate photo thresholds flag the later format', () => {
    const errors = validatePrintFormats([ok('a', 2), ok('b', 2), ok('c', null)]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ formatId: 'b', index: 1, field: 'maxPhotos' });
  });
  test.each([[-1], [1.5], ['2']])('rejects maxPhotos %p', (v) => {
    expect(validatePrintFormats([ok('a', v), ok('b', null)]).some((e) => e.field === 'maxPhotos')).toBe(true);
  });
  test('accepts 0 as threshold', () => {
    expect(validatePrintFormats([ok('a', 0), ok('b', null)])).toEqual([]);
  });
  test('page size bounds are reported once per format', () => {
    const errors = validatePrintFormats([{ ...ok('a', null), pageWidthCm: 1, pageHeightCm: 500 }]);
    expect(errors.filter((e) => e.field === 'pageSize')).toHaveLength(1);
  });
  test('oversized formats are rejected', () => {
    const big = { ...ok('a', null), notes: 'x'.repeat(9000) };
    expect(validatePrintFormats([big]).some((e) => e.field === 'size')).toBe(true);
  });
  test('a default format is well below the size limit', () => {
    expect(JSON.stringify(createFlowFormat()).length).toBeLessThan(4000);
  });
  test('PrintFormatValidationError carries the error list', () => {
    const errors = validatePrintFormats([]);
    const err = new PrintFormatValidationError(errors);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('PrintFormatValidationError');
    expect(err.errors).toBe(errors);
  });
});

describe('flow (template) formats', () => {
  const { FLOW_STYLE_DEFAULTS } = require('./printTemplates');

  test('createFlowFormat builds a valid, complete flow format', () => {
    const f = createFlowFormat('card', 'landscape', 'Quer');
    expect(f).toMatchObject({ layoutType: 'flow', template: 'card', name: 'Quer', orientation: 'landscape', pageWidthCm: 29.7, layoutVersion: 3 });
    expect(f.elements).toBeUndefined();
    expect(f.style.photoPosition).toBe('left');
    expect(validatePrintFormats([f])).toEqual([]);
  });

  test('migration keeps flow formats flow, normalises style and drops elements', () => {
    const out = migrateFormat({
      id: 'x', layoutType: 'flow', template: 'nope', elements: [{ id: 'title' }],
      style: { baseSize: 'xxl', accent: 'red', marginCm: 99, photoCount: 9, show: { photos: false } },
      overrides: { title: { fontBold: true, fontSizeScale: 9, evil: 1 }, ghost: { fontBold: true } },
    });
    expect(out.layoutType).toBe('flow');
    expect(out.template).toBe('classic');
    expect(out.elements).toBeUndefined();
    expect(out.style.baseSize).toBe(FLOW_STYLE_DEFAULTS.baseSize);
    expect(out.style.accent).toBe(FLOW_STYLE_DEFAULTS.accent);
    expect(out.style.marginCm).toBe(5);
    expect(out.style.photoCount).toBe(4);
    expect(out.style.show.photos).toBe(false);
    expect(out.style.show.title).toBe(true);
    expect(out.overrides).toEqual({ title: { fontBold: true, fontSizeScale: 2 } });
  });

  test.each([
    ['fresh', () => createFlowFormat('photo')],
    ['empty flow', () => ({ layoutType: 'flow' })],
    ['garbage style', () => ({ layoutType: 'flow', style: 'x', overrides: [] })],
  ])('flow migration is idempotent: %s', (_, make) => {
    const once = migrateFormat(make());
    expect(migrateFormat(once)).toEqual(once);
  });

  test('flow formats are selected like any other format', () => {
    const flow = { ...createFlowFormat('classic'), maxPhotos: 2 };
    expect(selectPrintFormat([flow, fmt('all', null)], 1)).toBe(flow);
  });

  test('page margin must be within 0..5 cm', () => {
    const f = createFlowFormat('classic');
    expect(validatePrintFormats([{ ...f, style: { ...f.style, marginCm: 9 } }]).some((e) => e.field === 'margin')).toBe(true);
    expect(validatePrintFormats([{ ...f, style: { ...f.style, marginCm: 0 } }])).toEqual([]);
  });
});

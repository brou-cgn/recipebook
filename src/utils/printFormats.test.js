import {
  PRINT_FORMAT_LAYOUT_VERSION, DEFAULT_PRINT_FORMATS, selectPrintFormat, migrateFormatToV2,
  migrateFormat, normalizeElement, createPrintFormat, duplicatePrintFormat, generateFormatId,
  validatePrintFormats, PrintFormatValidationError,
} from './printFormats';
import { DEFAULT_PRINT_ELEMENTS_PORTRAIT, DEFAULT_PRINT_ELEMENTS_LANDSCAPE } from './printElements';

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

describe('migrateFormatToV2', () => {
  test('scales y/h by the page ratio', () => {
    const out = migrateFormatToV2({ orientation: 'portrait', elements: [{ id: 'title', x: 2, y: 10, w: 50, h: 10 }] });
    expect(out.layoutVersion).toBe(2);
    expect(out.elements[0].y).toBeCloseTo(14.14, 2);
    expect(out.elements[0].h).toBeCloseTo(14.14, 2);
    expect(out.elements[0].x).toBe(2);
  });
  test('landscape ratio', () => {
    const out = migrateFormatToV2({ orientation: 'landscape', elements: [{ id: 't', x: 0, y: 10, w: 1, h: 10 }] });
    expect(out.elements[0].y).toBeCloseTo(7.07, 2);
  });
  test('custom page size', () => {
    const out = migrateFormatToV2({ pageWidthCm: 10, pageHeightCm: 20, elements: [{ id: 't', x: 0, y: 10, w: 1, h: 1 }] });
    expect(out.elements[0].y).toBe(20);
  });
  test('v2 passes through unchanged', () => {
    const f = { layoutVersion: 2, elements: [{ id: 't', x: 0, y: 10, w: 1, h: 1 }] };
    expect(migrateFormatToV2(f)).toBe(f);
  });
});

describe('migrateFormat', () => {
  const v1 = {
    id: 'a', name: 'Alt', maxPhotos: 2, orientation: 'portrait',
    elements: [{ id: 'title', x: 2, y: 5, w: 96, h: 7, visible: true }],
  };

  test('v1 -> v3', () => {
    const out = migrateFormat(v1);
    expect(out.layoutVersion).toBe(PRINT_FORMAT_LAYOUT_VERSION);
    expect(out.elements[0].y).toBeCloseTo(5 * (29.7 / 21), 2);
    expect(out.pageWidthCm).toBe(21);
    expect(out.pageHeightCm).toBe(29.7);
  });
  test('does not mutate its input', () => {
    const copy = JSON.parse(JSON.stringify(v1));
    migrateFormat(v1);
    expect(v1).toEqual(copy);
  });
  test.each([
    ['v1 portrait', v1],
    ['v1 landscape', { ...v1, orientation: 'landscape' }],
    ['custom size', { ...v1, layoutVersion: 2, pageWidthCm: 15, pageHeightCm: 21 }],
    ['v2 defaults', { id: 'd', name: 'D', layoutVersion: 2, elements: DEFAULT_PRINT_ELEMENTS_PORTRAIT }],
    ['legacy', { id: 'l', name: 'L', elementOrder: ['steps', 'images'], imageWidth: 50, imageAlign: 'left' }],
    ['empty object', {}],
    ['null', null],
    ['garbage elements', { elements: [null, 3, { id: 5 }, { id: 'title', x: 'a', y: NaN, w: -5, h: Infinity }] }],
  ])('is idempotent: %s', (_, input) => {
    const once = migrateFormat(input);
    expect(migrateFormat(once)).toEqual(once);
  });
  test('v2 defaults keep their element coordinates', () => {
    const out = migrateFormat({ id: 'd', layoutVersion: 2, elements: DEFAULT_PRINT_ELEMENTS_PORTRAIT });
    expect(out.elements).toEqual(DEFAULT_PRINT_ELEMENTS_PORTRAIT);
  });
  test('landscape defaults keep their coordinates', () => {
    const out = migrateFormat({ id: 'd', layoutVersion: 2, orientation: 'landscape', elements: DEFAULT_PRINT_ELEMENTS_LANDSCAPE });
    expect(out.orientation).toBe('landscape');
    expect(out.elements).toEqual(DEFAULT_PRINT_ELEMENTS_LANDSCAPE);
  });
  test('legacy formats get the default layout and a note; legacy fields are dropped', () => {
    const out = migrateFormat({ id: 'l', elementOrder: ['steps'], imageWidth: 50, imageAlign: 'left', imageColumns: '2' });
    expect(out.elements).toEqual(DEFAULT_PRINT_ELEMENTS_PORTRAIT);
    expect(out.migrationNotes).toEqual(['legacy-layout-replaced']);
    ['elementOrder', 'imageWidth', 'imageAlign', 'imageColumns'].forEach((k) => expect(out).not.toHaveProperty(k));
  });
  test('imageColumns alone does not trigger a note', () => {
    expect(migrateFormat({ id: 'x', imageColumns: 'auto', elements: DEFAULT_PRINT_ELEMENTS_PORTRAIT }).migrationNotes).toBeUndefined();
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
  test('defective values are normalised without throwing', () => {
    const out = migrateFormat({
      id: 'x', maxPhotos: 'abc', layoutVersion: 2,
      elements: [
        { id: 'title', x: -10, y: 9999, w: 500, h: -2, rotation: 45 },
        { id: 'steps', x: 'a', y: null, w: NaN, h: undefined },
      ],
    });
    expect(out.maxPhotos).toBeNull();
    out.elements.forEach((el) => {
      ['x', 'y', 'w', 'h'].forEach((k) => expect(Number.isFinite(el[k])).toBe(true));
      expect(el.x).toBeGreaterThanOrEqual(0);
      expect(el.x + el.w).toBeLessThanOrEqual(100.0001);
      expect(el.rotation).toBeUndefined();
    });
  });
  test('unknown element ids are kept so they survive a save', () => {
    const out = migrateFormat({ id: 'a', layoutVersion: 2, elements: [{ id: 'future', x: 1, y: 1, w: 10, h: 10 }] });
    expect(out.elements.some((e) => e.id === 'future')).toBe(true);
  });
  test('missing id gets generated, missing name defaults', () => {
    const out = migrateFormat({});
    expect(out.id).toMatch(/^fmt-/);
    expect(out.name).toBe('Standard');
  });
  test('keeps valid rotation and rotated bounds', () => {
    const out = migrateFormat({ id: 'a', layoutVersion: 2, elements: [{ id: 'title', x: 90, y: 0, w: 40, h: 10, rotation: 90 }] });
    expect(out.elements[0].rotation).toBe(90);
    expect(out.elements[0].x + 10).toBeLessThanOrEqual(100.0001); // effective width is h
  });
  test('DEFAULT_PRINT_FORMATS are already v3 and stable under migration', () => {
    DEFAULT_PRINT_FORMATS.forEach((f) => expect(migrateFormat(f)).toEqual(f));
  });
});

describe('normalizeElement', () => {
  const page = { widthCm: 21, heightCm: 29.7 };
  test('leaves a valid element untouched', () => {
    const el = { id: 'a', x: 1, y: 1, w: 20, h: 10, visible: true };
    expect(normalizeElement(el, page)).toEqual(el);
  });
  test('enforces minimum size', () => {
    const out = normalizeElement({ id: 'a', x: 0, y: 0, w: 1, h: 0.1 }, page);
    expect(out.w).toBe(5);
    expect(out.h).toBe(3);
  });
});

describe('createPrintFormat / duplicatePrintFormat / generateFormatId', () => {
  test('createPrintFormat matches orientation defaults including page size', () => {
    const l = createPrintFormat('landscape', 'Quer');
    expect(l.name).toBe('Quer');
    expect([l.pageWidthCm, l.pageHeightCm]).toEqual([29.7, 21]);
    expect(l.elements).toEqual(DEFAULT_PRINT_ELEMENTS_LANDSCAPE);
    const p = createPrintFormat();
    expect(p.elements).toEqual(DEFAULT_PRINT_ELEMENTS_PORTRAIT);
    expect(p.layoutVersion).toBe(PRINT_FORMAT_LAYOUT_VERSION);
  });
  test('created formats do not alias the shared default element objects', () => {
    const p = createPrintFormat();
    p.elements[0].x = 77;
    expect(DEFAULT_PRINT_ELEMENTS_PORTRAIT[0].x).not.toBe(77);
  });
  test('ids are unique even when generated in the same millisecond', () => {
    const ids = new Set(Array.from({ length: 500 }, generateFormatId));
    expect(ids.size).toBe(500);
  });
  test('duplicate is deep, has a new id, a copy name and no photo limit', () => {
    const original = { ...createPrintFormat(), name: 'Mein Format', maxPhotos: 2 };
    const copy = duplicatePrintFormat(original);
    expect(copy.id).not.toBe(original.id);
    expect(copy.name).toBe('Mein Format Kopie');
    expect(copy.maxPhotos).toBeNull();
    copy.elements[0].x = 55;
    expect(original.elements[0].x).not.toBe(55);
  });
});

describe('validatePrintFormats', () => {
  const ok = (id, maxPhotos) => ({ ...createPrintFormat(), id, name: `Name ${id}`, maxPhotos });

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
    expect(JSON.stringify(createPrintFormat()).length).toBeLessThan(4000);
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
  const { createFlowFormat, convertToFlowFormat } = require('./printFormats');
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

  test('convertToFlowFormat keeps identity and page size and drops positioned layout', () => {
    const free = { ...createPrintFormat('landscape'), name: 'Alt', maxPhotos: 3, migrationNotes: ['legacy-layout-replaced'] };
    const flow = convertToFlowFormat(free);
    expect(flow).toMatchObject({ id: free.id, name: 'Alt', maxPhotos: 3, layoutType: 'flow', pageWidthCm: 29.7, pageHeightCm: 21 });
    expect(flow.elements).toBeUndefined();
    expect(flow.migrationNotes).toBeUndefined();
    expect(flow.style).toBeDefined();
  });
});

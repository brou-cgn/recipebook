import {
  PRINT_FORMAT_ELEMENTS, DEFAULT_PRINT_ELEMENTS_PORTRAIT, DEFAULT_PRINT_ELEMENTS_LANDSCAPE,
  mergePrintElementsWithDefaults, getDefaultPrintElements, getPrintElementDef,
} from './printElements';

describe('element registry', () => {
  test('ids are unique and every element has defaults for both orientations', () => {
    const ids = PRINT_FORMAT_ELEMENTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    [DEFAULT_PRINT_ELEMENTS_PORTRAIT, DEFAULT_PRINT_ELEMENTS_LANDSCAPE].forEach((defaults) => {
      expect(defaults.map((d) => d.id).sort()).toEqual([...ids].sort());
    });
  });
  test('snapshot of registry and defaults (guards against accidental layout changes)', () => {
    expect(PRINT_FORMAT_ELEMENTS.map((e) => [e.id, e.label, e.color, e.isImage])).toMatchSnapshot();
    expect(DEFAULT_PRINT_ELEMENTS_PORTRAIT).toMatchSnapshot();
    expect(DEFAULT_PRINT_ELEMENTS_LANDSCAPE).toMatchSnapshot();
  });
  test('only photos are image elements', () => {
    expect(PRINT_FORMAT_ELEMENTS.filter((e) => e.isImage).map((e) => e.id))
      .toEqual(['photo1', 'photo2', 'photo3', 'photo4']);
  });
  test('defaults stay on the page', () => {
    const maxPortrait = (29.7 / 21) * 100;
    const maxLandscape = (21 / 29.7) * 100;
    DEFAULT_PRINT_ELEMENTS_PORTRAIT.forEach((e) => {
      expect(e.x + e.w).toBeLessThanOrEqual(100);
      expect(e.y + e.h).toBeLessThanOrEqual(maxPortrait);
    });
    DEFAULT_PRINT_ELEMENTS_LANDSCAPE.forEach((e) => {
      expect(e.x + e.w).toBeLessThanOrEqual(100);
      expect(e.y + e.h).toBeLessThanOrEqual(maxLandscape);
    });
  });
  test('lookup helpers', () => {
    expect(getPrintElementDef('title').label).toBe('Titel');
    expect(getPrintElementDef('nope')).toBeUndefined();
    expect(getDefaultPrintElements('landscape')).toBe(DEFAULT_PRINT_ELEMENTS_LANDSCAPE);
    expect(getDefaultPrintElements('portrait')).toBe(DEFAULT_PRINT_ELEMENTS_PORTRAIT);
    expect(getDefaultPrintElements(undefined)).toBe(DEFAULT_PRINT_ELEMENTS_PORTRAIT);
  });
});

describe('mergePrintElementsWithDefaults', () => {
  test('fills every known id when nothing is stored', () => {
    const merged = mergePrintElementsWithDefaults(undefined, 'portrait');
    expect(merged.map((e) => e.id)).toEqual(PRINT_FORMAT_ELEMENTS.map((e) => e.id));
    expect(merged.find((e) => e.id === 'title')).toEqual(DEFAULT_PRINT_ELEMENTS_PORTRAIT.find((e) => e.id === 'title'));
  });
  test('keeps stored elements and fills the missing ones from the orientation defaults', () => {
    const stored = [{ id: 'title', x: 5, y: 5, w: 50, h: 5, visible: true }];
    const merged = mergePrintElementsWithDefaults(stored, 'landscape');
    expect(merged.find((e) => e.id === 'title')).toBe(stored[0]);
    expect(merged.find((e) => e.id === 'steps')).toEqual(DEFAULT_PRINT_ELEMENTS_LANDSCAPE.find((e) => e.id === 'steps'));
  });
  test('does not alias default objects', () => {
    const merged = mergePrintElementsWithDefaults([], 'portrait');
    merged[0].x = 99;
    expect(DEFAULT_PRINT_ELEMENTS_PORTRAIT[0].x).not.toBe(99);
  });
  test('unknown stored ids are not rendered', () => {
    const merged = mergePrintElementsWithDefaults([{ id: 'ghost', x: 0, y: 0, w: 10, h: 10 }], 'portrait');
    expect(merged.some((e) => e.id === 'ghost')).toBe(false);
  });
  test('tolerates non-array input and null entries', () => {
    expect(() => mergePrintElementsWithDefaults('x', 'portrait')).not.toThrow();
    expect(() => mergePrintElementsWithDefaults([null], 'portrait')).not.toThrow();
  });
});

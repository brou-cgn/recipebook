import {
  DEFAULT_PRINT_PAGE_WIDTH_CM, DEFAULT_PRINT_PAGE_HEIGHT_CM, DEFAULT_PRINT_FONT_FAMILY, PRINT_FONT_OPTIONS,
} from './printElements';
import * as printElements from './printElements';

describe('print constants', () => {
  test('default page is DIN A4 portrait', () => {
    expect([DEFAULT_PRINT_PAGE_WIDTH_CM, DEFAULT_PRINT_PAGE_HEIGHT_CM]).toEqual([21, 29.7]);
  });

  test('font options are unique, labelled and contain the default font', () => {
    const values = PRINT_FONT_OPTIONS.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
    PRINT_FONT_OPTIONS.forEach((o) => expect(o.label).toBeTruthy());
    expect(values).toContain(DEFAULT_PRINT_FONT_FAMILY);
  });

  test('the registry of the removed free layout is gone', () => {
    expect(Object.keys(printElements).sort()).toEqual([
      'DEFAULT_PRINT_FONT_FAMILY', 'DEFAULT_PRINT_PAGE_HEIGHT_CM', 'DEFAULT_PRINT_PAGE_WIDTH_CM', 'PRINT_FONT_OPTIONS',
    ]);
  });
});

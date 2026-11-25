import { getPageSize, elementTextStyle } from './printLayout';

const A4 = { widthCm: 21, heightCm: 29.7 };
const A4_LANDSCAPE = { widthCm: 29.7, heightCm: 21 };

describe('getPageSize', () => {
  test('defaults to A4 portrait', () => {
    expect(getPageSize({})).toEqual(A4);
    expect(getPageSize(undefined)).toEqual(A4);
  });
  test('defaults to A4 landscape', () => {
    expect(getPageSize({ orientation: 'landscape' })).toEqual(A4_LANDSCAPE);
  });
  test('explicit size wins', () => {
    expect(getPageSize({ orientation: 'portrait', pageWidthCm: 10, pageHeightCm: 15 }))
      .toEqual({ widthCm: 10, heightCm: 15 });
  });
});

describe('elementTextStyle', () => {
  test('no formatting gives an empty style', () => {
    expect(elementTextStyle({})).toEqual({});
  });
  test('size factor, bold, italic, underline, colour and alignment', () => {
    expect(elementTextStyle({
      fontSizeScale: 1.5, fontBold: true, fontItalic: true, fontUnderline: true,
      fontColor: '#123456', textAlignH: 'center',
    })).toEqual({
      fontSize: '1.5em', fontWeight: 'bold', fontStyle: 'italic', textDecoration: 'underline',
      color: '#123456', textAlign: 'center',
    });
  });
  test('fontSizeScale 1 is ignored', () => {
    expect(elementTextStyle({ fontSizeScale: 1 }).fontSize).toBeUndefined();
  });
  test('switched-off flags leave no keys behind', () => {
    expect(elementTextStyle({ fontBold: false, fontItalic: false, fontUnderline: false })).toEqual({});
  });
});

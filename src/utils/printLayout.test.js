import {
  clamp, getPageSize, getScaleY, getMaxY, pctToCm, cmToPct, effectiveDimensions,
  rotationCssOffset, elementBox, elementStyle, elementBorderStyle, computeSnap,
} from './printLayout';

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

describe('page ratios and units', () => {
  test('scaleY and maxY are inverse views of the aspect ratio', () => {
    expect(getScaleY(A4)).toBeCloseTo(21 / 29.7);
    expect(getMaxY(A4)).toBeCloseTo((29.7 / 21) * 100);
    expect(getScaleY(A4) * getMaxY(A4)).toBeCloseTo(100);
  });
  test('pct <-> cm round trip uses the page width on both axes', () => {
    expect(pctToCm(50, A4)).toBeCloseTo(10.5);
    expect(cmToPct('10.5', A4)).toBeCloseTo(50);
    expect(cmToPct(pctToCm(37.3, A4), A4)).toBeCloseTo(37.3);
  });
  test('clamp', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});

describe('rotation helpers', () => {
  test.each([0, 180, undefined])('no offset for %s°', (rotation) => {
    expect(rotationCssOffset({ w: 40, h: 10, rotation })).toEqual({ dx: 0, dy: 0 });
    expect(effectiveDimensions({ w: 40, h: 10, rotation })).toEqual({ effW: 40, effH: 10 });
  });
  test.each([90, 270])('swaps dimensions and offsets for %s°', (rotation) => {
    expect(rotationCssOffset({ w: 40, h: 10, rotation })).toEqual({ dx: -15, dy: 15 });
    expect(effectiveDimensions({ w: 40, h: 10, rotation })).toEqual({ effW: 10, effH: 40 });
  });
  test('rotated top-left corner lands on (x, y)', () => {
    const el = { x: 10, y: 20, w: 40, h: 10, rotation: 90 };
    const { dx, dy } = rotationCssOffset(el);
    // Visual bounding box after rotation: width h, height w, centred on the css box centre.
    const cx = el.x + dx + el.w / 2;
    const cy = el.y + dy + el.h / 2;
    expect(cx - el.h / 2).toBeCloseTo(el.x);
    expect(cy - el.w / 2).toBeCloseTo(el.y);
  });
});

describe('elementBox / elementStyle', () => {
  const el = { id: 'title', x: 2, y: 1.4, w: 96, h: 9.9 };
  test('converts y/h to percent of page height', () => {
    const box = elementBox(el, A4);
    expect(box.left).toBe(2);
    expect(box.width).toBe(96);
    expect(box.top).toBeCloseTo(1.4 * (21 / 29.7));
    expect(box.height).toBeCloseTo(9.9 * (21 / 29.7));
  });
  test('landscape uses its own ratio', () => {
    expect(elementBox({ x: 0, y: 10, w: 10, h: 10 }, A4_LANDSCAPE).top).toBeCloseTo(10 * (29.7 / 21));
  });
  test('plain element has no formatting keys', () => {
    const s = elementStyle(el, A4);
    expect(Object.keys(s).sort()).toEqual(['height', 'left', 'top', 'width']);
    expect(s.left).toBe('2%');
  });
  test('applies rotation, typography, alignment and border', () => {
    const s = elementStyle({
      ...el, rotation: 90, fontSizeScale: 1.5, fontBold: true, fontItalic: true,
      fontUnderline: true, fontColor: '#123456', textAlignH: 'center', textAlignV: 'bottom',
      borderTop: true, borderWidth: 2, borderColor: '#ff0000',
    }, A4);
    expect(s.transform).toBe('rotate(90deg)');
    expect(s.fontSize).toBe('1.5em');
    expect(s.fontWeight).toBe('bold');
    expect(s.fontStyle).toBe('italic');
    expect(s.textDecoration).toBe('underline');
    expect(s.color).toBe('#123456');
    expect(s.textAlign).toBe('center');
    expect(s.display).toBe('flex');
    expect(s.justifyContent).toBe('flex-end');
    expect(s.borderTop).toBe('2px solid #ff0000');
    expect(s.borderLeft).toBe('none');
  });
  test('vertical alignment top does not switch to flex; middle centres', () => {
    expect(elementStyle({ ...el, textAlignV: 'top' }, A4).display).toBeUndefined();
    expect(elementStyle({ ...el, textAlignV: 'middle' }, A4).justifyContent).toBe('center');
  });
  test('fontSizeScale 1 is ignored', () => {
    expect(elementStyle({ ...el, fontSizeScale: 1 }, A4).fontSize).toBeUndefined();
  });
  test('border defaults and no border', () => {
    expect(elementBorderStyle(el)).toEqual({});
    expect(elementBorderStyle({ borderLeft: true }).borderLeft).toBe('1px solid #000000');
  });
});

describe('computeSnap', () => {
  const others = [
    { id: 'a', x: 10, y: 10, w: 30, h: 20, visible: true },
    { id: 'hidden', x: 55, y: 55, w: 5, h: 5, visible: false },
  ];
  const me = { id: 'me', x: 0, y: 0, w: 20, h: 10 };

  test('snaps left edge to another element within threshold and reports a guide', () => {
    const r = computeSnap(me, 11, 60, others);
    expect(r.x).toBe(10);
    expect(r.guides.v).toContain(10);
  });
  test('snaps right edge', () => {
    const r = computeSnap(me, 20.5, 60, others); // right edge 40.5 -> 40
    expect(r.x).toBeCloseTo(20);
  });
  test('snaps vertical centre', () => {
    const r = computeSnap(me, 70, 15.5, others); // centre y 20.5 vs other centre 20
    expect(r.y).toBeCloseTo(15);
    expect(r.guides.h).toContain(20);
  });
  test('no snap beyond threshold', () => {
    const r = computeSnap(me, 60, 70, others);
    expect(r).toMatchObject({ x: 60, y: 70, guides: { h: [], v: [] } });
  });
  test('ignores hidden elements and itself', () => {
    expect(computeSnap(me, 55, 80, [{ ...others[1] }, me]).guides.v).toEqual([]);
  });
  test('uses rotated bounding box', () => {
    const rotated = { id: 'r', x: 0, y: 0, w: 20, h: 10, rotation: 90 }; // effective 10 x 20
    const r = computeSnap(rotated, 29.5, 70, others); // right edge 39.5 -> other's right 40
    expect(r.x).toBeCloseTo(30);
  });
});

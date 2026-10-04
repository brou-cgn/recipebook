/**
 * Pure geometry helpers for print layouts.
 *
 * All element coordinates (x, y, w, h) are percentages of the page WIDTH.
 * CSS needs top/height relative to the page HEIGHT, hence the `scaleY` factor.
 */
import { DEFAULT_PRINT_PAGE_WIDTH_CM, DEFAULT_PRINT_PAGE_HEIGHT_CM } from './printElements';

// Minimum element size in percent of page width
export const MIN_ELEMENT_W = 5;
export const MIN_ELEMENT_H = 3;
// Snap threshold in percent of page width
export const SNAP_THRESHOLD = 2;

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** Page size in cm; defaults to DIN A4 for the format's orientation. */
export function getPageSize(format) {
  const landscape = format?.orientation === 'landscape';
  return {
    widthCm: format?.pageWidthCm ?? (landscape ? DEFAULT_PRINT_PAGE_HEIGHT_CM : DEFAULT_PRINT_PAGE_WIDTH_CM),
    heightCm: format?.pageHeightCm ?? (landscape ? DEFAULT_PRINT_PAGE_WIDTH_CM : DEFAULT_PRINT_PAGE_HEIGHT_CM),
  };
}

/** Factor converting stored y/h (% of width) into CSS % of height. */
export function getScaleY(page) {
  return page.widthCm / page.heightCm;
}

/** Maximum reachable y+h in % of page width. */
export function getMaxY(page) {
  return (page.heightCm / page.widthCm) * 100;
}

/** % of page width -> cm (both axes use the page width as reference). */
export function pctToCm(pct, page) {
  return (pct / 100) * page.widthCm;
}

/** cm -> % of page width. */
export function cmToPct(cm, page) {
  return (parseFloat(cm) / page.widthCm) * 100;
}

/** Swaps w/h for 90° and 270° rotations. */
export function effectiveDimensions(el) {
  const swapped = el.rotation === 90 || el.rotation === 270;
  return { effW: swapped ? el.h : el.w, effH: swapped ? el.w : el.h };
}

/**
 * CSS left/top offset (in % of page width) compensating for CSS rotate()
 * rotating around the element centre, so the top-left corner of the rotated
 * bounding box lands on (el.x, el.y).
 */
export function rotationCssOffset(el) {
  const r = el.rotation || 0;
  if (r === 90 || r === 270) {
    return { dx: (el.h - el.w) / 2, dy: (el.w - el.h) / 2 };
  }
  return { dx: 0, dy: 0 };
}

/** CSS box (percent values) for an element on a page. */
export function elementBox(el, page) {
  const { dx, dy } = rotationCssOffset(el);
  const scaleY = getScaleY(page);
  return {
    left: el.x + dx,
    top: (el.y + dy) * scaleY,
    width: el.w,
    height: el.h * scaleY,
  };
}

/** Border declarations for an element; empty object when no side is set. */
export function elementBorderStyle(el) {
  if (!(el.borderTop || el.borderRight || el.borderBottom || el.borderLeft)) return {};
  const b = `${el.borderWidth || 1}px solid ${el.borderColor || '#000000'}`;
  return {
    borderTop: el.borderTop ? b : 'none',
    borderRight: el.borderRight ? b : 'none',
    borderBottom: el.borderBottom ? b : 'none',
    borderLeft: el.borderLeft ? b : 'none',
  };
}

/**
 * Inline style for a positioned element (position, rotation, text formatting,
 * alignment, border). Used by the print renderer and the editor so both agree.
 */
export function elementStyle(el, page) {
  const box = elementBox(el, page);
  const style = {
    left: `${box.left}%`,
    top: `${box.top}%`,
    width: `${box.width}%`,
    height: `${box.height}%`,
  };
  if (el.rotation) style.transform = `rotate(${el.rotation}deg)`;
  if (el.fontSizeScale && el.fontSizeScale !== 1) style.fontSize = `${el.fontSizeScale}em`;
  if (el.fontBold) style.fontWeight = 'bold';
  if (el.fontItalic) style.fontStyle = 'italic';
  if (el.fontUnderline) style.textDecoration = 'underline';
  if (el.fontColor) style.color = el.fontColor;
  if (el.textAlignH) style.textAlign = el.textAlignH;
  if (el.textAlignV && el.textAlignV !== 'top') {
    style.display = 'flex';
    style.flexDirection = 'column';
    style.alignItems = 'stretch';
    style.justifyContent = el.textAlignV === 'bottom' ? 'flex-end' : 'center';
  }
  return { ...style, ...elementBorderStyle(el) };
}

/**
 * Snap guides and adjusted position for a dragged element.
 * @returns {{x:number, y:number, guides:{h:number[], v:number[]}}}
 */
export function computeSnap(el, rawX, rawY, allElements, threshold = SNAP_THRESHOLD) {
  const others = allElements.filter((o) => o.id !== el.id && o.visible !== false);
  const { effW, effH } = effectiveDimensions(el);

  let snappedX = rawX;
  let snappedY = rawY;
  const hGuides = [];
  const vGuides = [];

  const xTargets = [];
  const yTargets = [];
  others.forEach((o) => {
    const { effW: oW, effH: oH } = effectiveDimensions(o);
    xTargets.push(o.x, o.x + oW / 2, o.x + oW);
    yTargets.push(o.y, o.y + oH / 2, o.y + oH);
  });

  const xEdges = [
    { pos: rawX,            offset: 0 },
    { pos: rawX + effW / 2, offset: -effW / 2 },
    { pos: rawX + effW,     offset: -effW },
  ];
  let bestX = threshold;
  xEdges.forEach(({ pos, offset }) => {
    xTargets.forEach((val) => {
      const dist = Math.abs(pos - val);
      if (dist < bestX) {
        bestX = dist;
        snappedX = val + offset;
        vGuides.length = 0;
        vGuides.push(val);
      } else if (dist === bestX) {
        vGuides.push(val);
      }
    });
  });

  const yEdges = [
    { pos: rawY,            offset: 0 },
    { pos: rawY + effH / 2, offset: -effH / 2 },
    { pos: rawY + effH,     offset: -effH },
  ];
  let bestY = threshold;
  yEdges.forEach(({ pos, offset }) => {
    yTargets.forEach((val) => {
      const dist = Math.abs(pos - val);
      if (dist < bestY) {
        bestY = dist;
        snappedY = val + offset;
        hGuides.length = 0;
        hGuides.push(val);
      } else if (dist === bestY) {
        hGuides.push(val);
      }
    });
  });

  return { x: snappedX, y: snappedY, guides: { h: hGuides, v: vGuides } };
}

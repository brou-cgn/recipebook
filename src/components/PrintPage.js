import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import './PrintPage.css';
import { mergePrintElementsWithDefaults, getPrintElementDef, DEFAULT_PRINT_FONT_FAMILY } from '../utils/printElements';
import { elementStyle, getPageSize } from '../utils/printLayout';
import { PRINT_ELEMENT_RENDERERS } from './printElementRenderers';

const CM_TO_PX = 96 / 2.54;

/**
 * PrintPage – the one renderer for a recipe on a print format page. Used by the
 * settings preview and by the real print (portal in #print-root), so both always
 * agree.
 *
 * The page is laid out at its real size in cm. In preview mode it is scaled down
 * with a CSS transform, so wrapping and overflow are identical to the print.
 *
 * Props:
 *   recipe       {object}  recipe to render
 *   format       {object}  print format (any layoutVersion; elements are merged with defaults)
 *   servings     {number}  chosen servings (default recipe.portionen)
 *   authorName   {string}  resolved author first name (not stored on the recipe)
 *   portionLabel {string}  e.g. "Portionen"
 *   mode         {'preview'|'print'} preview: scaled, placeholders, overflow badges
 *   onOverflow   {(ids: string[]) => void} preview only: ids of clipped elements
 *   embedded     {boolean} preview only: no outer margin and no summary line (used under the editor boxes)
 */
export default function PrintPage({
  recipe,
  format,
  servings,
  authorName,
  portionLabel,
  mode = 'preview',
  onOverflow,
  embedded = false,
}) {
  const wrapperRef = useRef(null);
  const elementRefs = useRef({});
  const [scale, setScale] = useState(0.4);
  const [overflowIds, setOverflowIds] = useState([]);

  const orientation = format?.orientation || 'portrait';
  const fontFamily = format?.fontFamily || DEFAULT_PRINT_FONT_FAMILY;
  const page = getPageSize(format);
  const elements = useMemo(
    () => mergePrintElementsWithDefaults(format?.elements, orientation),
    [format?.elements, orientation],
  );
  const effectiveServings = servings ?? recipe?.portionen;
  const visible = (id) => elements.find((e) => e.id === id)?.visible !== false;
  const ctx = {
    servings: effectiveServings,
    authorName,
    portionLabel,
    mode,
    showIngredientsHeading: visible('ingredientsHeading'),
    showStepsHeading: visible('stepsHeading'),
  };

  // Preview scale: fit the page width into the wrapper.
  useLayoutEffect(() => {
    if (mode !== 'preview') return undefined;
    const wrapper = wrapperRef.current;
    if (!wrapper) return undefined;
    const update = () => {
      const w = wrapper.clientWidth;
      if (w > 0) setScale(w / (page.widthCm * CM_TO_PX));
    };
    update();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(update);
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, [mode, page.widthCm]);

  // Preview: detect text elements whose content is clipped by their box.
  const measureKey = `${recipe?.id}|${effectiveServings}|${JSON.stringify(elements)}|${fontFamily}|${page.widthCm}x${page.heightCm}`;
  useEffect(() => {
    if (mode !== 'preview') return undefined;
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const ids = elements
        .filter((el) => el.visible !== false && !getPrintElementDef(el.id)?.isImage)
        .filter((el) => {
          const node = elementRefs.current[el.id];
          return node && node.scrollHeight > node.clientHeight + 1;
        })
        .map((el) => el.id);
      setOverflowIds((prev) => (prev.join() === ids.join() ? prev : ids));
      if (onOverflow) onOverflow(ids);
    };
    measure();
    if (document.fonts?.ready) document.fonts.ready.then(measure);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, measureKey]);

  if (!recipe || !format) return null;

  const pageStyle = {
    width: `${page.widthCm}cm`,
    height: `${page.heightCm}cm`,
    fontFamily,
    ...(mode === 'preview' ? { transform: `scale(${scale})` } : {}),
  };

  const pageNode = (
    <div className={`ppv-page ppv-page--${mode}`} style={pageStyle} data-testid="print-page">
      {elements.map((el) => {
        if (el.visible === false) return null;
        const Renderer = PRINT_ELEMENT_RENDERERS[el.id];
        if (!Renderer) return null;
        const clipped = overflowIds.includes(el.id);
        return (
          <div
            key={el.id}
            ref={(node) => { elementRefs.current[el.id] = node; }}
            className={`ppv-element ppv-element--${el.id}`}
            data-element={el.id}
            style={elementStyle(el, page)}
          >
            <Renderer recipe={recipe} ctx={ctx} element={el} />
            {mode === 'preview' && clipped && (
              <span className="ppv-overflow-badge" data-testid={`overflow-${el.id}`}>abgeschnitten</span>
            )}
          </div>
        );
      })}
    </div>
  );

  if (mode === 'print') return pageNode;

  const labels = overflowIds.map((id) => getPrintElementDef(id)?.label || id);
  return (
    <div className={`ppv-root${embedded ? ' ppv-root--embedded' : ''}`}>
      {!embedded && labels.length > 0 && (
        <p className="ppv-overflow-warning" role="status">
          Inhalt zu lang, wird abgeschnitten: {labels.join(', ')}
        </p>
      )}
      <div
        className="ppv-scaler"
        ref={wrapperRef}
        style={{ height: `${page.heightCm * CM_TO_PX * scale}px` }}
      >
        {pageNode}
      </div>
    </div>
  );
}

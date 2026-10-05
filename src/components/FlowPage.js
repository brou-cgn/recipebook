import React, { useLayoutEffect, useRef, useState } from 'react';
import './FlowPage.css';
import { PRINT_ELEMENT_RENDERERS } from './printElementRenderers';
import usePreviewScale, { CM_TO_PX } from './usePreviewScale';
import { getPageSize, elementTextStyle } from '../utils/printLayout';
import { getRecipeImages } from '../utils/printRecipe';
import {
  FLOW_BASE_SIZES,
  FLOW_SPACINGS,
  FLOW_PHOTO_SIZES,
  FLOW_ELEMENTS,
  normalizeFlowOverrides,
  resolveFlowStyle,
} from '../utils/printTemplates';

const lookup = (options, value) => options.find((o) => o.value === value) || options[0];

/**
 * FlowPage – a recipe on a template-based page. The content flows top to bottom
 * and continues on the next page when it is long (the browser paginates the print;
 * the preview marks the approximate page breaks).
 *
 * Props are those of PrintPage plus:
 *   selectedElement   {string|null} id of the highlighted element (preview)
 *   onSelectElement   {(id: string|null) => void} enables click-to-select in the preview
 *   thumbnail         {boolean} preview without interaction or page-break marks
 */
export default function FlowPage({
  recipe,
  format,
  servings,
  authorName,
  portionLabel,
  mode = 'preview',
  embedded = false,
  selectedElement = null,
  onSelectElement,
  thumbnail = false,
}) {
  const contentRef = useRef(null);
  const [contentPx, setContentPx] = useState(0);
  const page = getPageSize(format);
  const style = resolveFlowStyle(format);
  const overrides = normalizeFlowOverrides(format?.overrides);
  const preview = mode === 'preview';
  const { wrapperRef, scale } = usePreviewScale(page.widthCm, preview);

  useLayoutEffect(() => {
    if (!preview) return undefined;
    const node = contentRef.current;
    if (!node) return undefined;
    const measure = () => setContentPx(node.scrollHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, [preview, recipe, format]);

  if (!recipe || !format) return null;

  const interactive = preview && !thumbnail && typeof onSelectElement === 'function';
  const effectiveServings = servings ?? recipe.portionen;
  const ctx = {
    servings: effectiveServings,
    authorName,
    portionLabel,
    mode,
    showIngredientsHeading: false,
    showStepsHeading: false,
  };
  const images = getRecipeImages(recipe).slice(0, style.photoCount);
  const photoSize = lookup(FLOW_PHOTO_SIZES, style.photoSize);
  const hasPhotoArea = style.show.photos && style.photoPosition !== 'none' && (images.length > 0 || preview);
  const sideLayout = hasPhotoArea && (style.photoPosition === 'left' || style.photoPosition === 'right');

  const block = (id, className, children) => (
    <div
      key={id}
      className={`ppf-block ppf-block--${id}${className ? ` ${className}` : ''}${selectedElement === id ? ' ppf-block--selected' : ''}`}
      data-flow-el={id}
      style={elementTextStyle(overrides[id] || {})}
      {...(interactive ? {
        role: 'button',
        tabIndex: 0,
        'aria-label': `${FLOW_ELEMENTS.find((e) => e.id === id)?.label} bearbeiten`,
        onKeyDown: (e) => {
          if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onSelectElement(id);
          }
        },
      } : {})}
    >
      {children}
    </div>
  );

  const renderer = (id, props = {}) => {
    const Renderer = PRINT_ELEMENT_RENDERERS[id];
    return <Renderer recipe={recipe} ctx={ctx} {...props} />;
  };

  const photos = () => {
    if (!hasPhotoArea) return null;
    if (images.length === 0) {
      return block('photos', 'ppf-photos', <div className="ppv-el-placeholder">Kein Foto</div>);
    }
    const element = { aspectRatio: style.photoAspect };
    return block(
      'photos',
      `ppf-photos ppf-photos--${style.photoPosition}`,
      <div className="ppf-photo-grid" style={{ gridTemplateColumns: `repeat(${style.photoPosition === 'top' ? images.length : 1}, minmax(0, 1fr))` }}>
        {images.map((img, i) => (
          <div className="ppf-photo" key={i}>
            {renderer(`photo${i + 1}`, { element })}
          </div>
        ))}
      </div>,
    );
  };

  const info = [
    style.show.title && block('title', '', renderer('title')),
    style.show.authorDate && block('authorDate', '', renderer('authorDate')),
  ];
  const metadata = style.show.metadata && block('metadata', '', renderer('metadata'));

  const showIng = style.show.ingredients;
  const showSteps = style.show.steps;
  const body = (showIng || showSteps) && (
    <div className={`ppf-body ppf-body--${showIng && showSteps ? style.columns : 'one'}`}>
      {showIng && block('ingredients', style.tintIngredients ? 'ppf-block--tint' : '', renderer('ingredients'))}
      {showSteps && block('steps', '', renderer('steps'))}
    </div>
  );

  const margin = style.marginCm;
  const contentWidthCm = page.widthCm - 2 * margin;
  const pageContentPx = (page.heightCm - 2 * margin) * CM_TO_PX;
  const sheetPx = Math.max(page.heightCm * CM_TO_PX, contentPx + 2 * margin * CM_TO_PX);
  const pageCount = preview && !thumbnail && pageContentPx > 0 ? Math.max(1, Math.ceil(contentPx / pageContentPx)) : 1;

  const sheetVars = {
    fontFamily: style.fontFamily,
    fontSize: `${lookup(FLOW_BASE_SIZES, style.baseSize).px}px`,
    '--ppf-accent': style.accent,
    '--ppf-gap': `${lookup(FLOW_SPACINGS, style.spacing).em}em`,
    '--ppf-title-align': style.titleAlign,
    '--ppf-side': `${photoSize.side}%`,
    '--ppf-top': `${photoSize.top}%`,
  };

  const content = (
    <div
      ref={contentRef}
      className="ppf-content"
      data-heading={style.headingStyle}
      data-meta={style.metadataStyle}
    >
      {sideLayout ? (
        <div className={`ppf-header ppf-header--${style.photoPosition}`}>
          {photos()}
          <div className="ppf-header-info">{info}{metadata}</div>
        </div>
      ) : (
        <>
          {info[0]}
          {style.photoPosition === 'top' && photos()}
          {info[1]}
          {metadata}
        </>
      )}
      {body}
    </div>
  );

  if (!preview) {
    return (
      <div className="ppf-sheet ppf-sheet--print" style={{ ...sheetVars, width: `${contentWidthCm}cm` }} data-testid="print-page">
        {content}
      </div>
    );
  }

  const handleClick = (e) => {
    if (!interactive) return;
    const hit = e.target.closest('[data-flow-el]');
    onSelectElement(hit ? hit.dataset.flowEl : null);
  };

  return (
    <div className={`ppv-root${embedded ? ' ppv-root--embedded' : ''}`}>
      <div className="ppf-scaler" ref={wrapperRef} style={{ height: `${sheetPx * scale}px` }}>
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
        <div
          className={`ppf-sheet ppf-sheet--preview${interactive ? ' ppf-sheet--interactive' : ''}`}
          style={{
            ...sheetVars,
            width: `${page.widthCm}cm`,
            minHeight: `${page.heightCm}cm`,
            padding: `${margin}cm`,
            transform: `scale(${scale})`,
          }}
          data-testid="print-page"
          onClick={handleClick}
        >
          {content}
          {pageCount > 1 && Array.from({ length: pageCount - 1 }, (_, i) => (
            <div
              key={i}
              className="ppf-page-break"
              data-testid="page-break"
              style={{ top: `${(margin + (i + 1) * (page.heightCm - 2 * margin))}cm` }}
            >
              <span>Seitenumbruch (ungefähr) · Seite {i + 2}</span>
            </div>
          ))}
        </div>
      </div>
      {!embedded && !thumbnail && pageCount > 1 && (
        <p className="ppv-overflow-warning" role="status">{pageCount} Seiten</p>
      )}
    </div>
  );
}

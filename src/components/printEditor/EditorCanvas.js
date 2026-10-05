import React from 'react';
import PrintPage from '../PrintPage';
import { PRINT_FORMAT_ELEMENTS } from '../../utils/printElements';
import { elementBorderStyle, getScaleY, rotationCssOffset } from '../../utils/printLayout';

const HANDLES = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

/**
 * The draggable page. With a preview recipe the real print rendering (PrintPage)
 * is drawn underneath and the element boxes become a transparent overlay.
 */
export default function EditorCanvas({
  pageRef, format, page, elements, selectedId, snapGuides, previewRecipe, authorName,
  onStartDrag, onStartResize, onKeyDown, onBackgroundDown,
}) {
  const scaleY = getScaleY(page);

  return (
    <div className="pfe-page-wrapper">
      <div className="pfe-page-stack">
        {previewRecipe && (
          <div className="pfe-page-content" aria-hidden="true">
            <PrintPage recipe={previewRecipe} format={format} authorName={authorName} embedded />
          </div>
        )}
        <div
          className={`pfe-page${previewRecipe ? ' pfe-page--overlay' : ''}`}
          ref={pageRef}
          style={{ '--pfe-aspect-ratio': `${page.widthCm} / ${page.heightCm}` }}
          onPointerDown={(e) => {
            if (e.target === pageRef.current || e.target.classList.contains('pfe-page-inner')) onBackgroundDown();
          }}
        >
          <div className="pfe-page-inner">
            {snapGuides.h.map((y, i) => (
              <div key={`h-${i}`} className="pfe-snap-guide pfe-snap-guide--h" style={{ top: `${y * scaleY}%` }} />
            ))}
            {snapGuides.v.map((x, i) => (
              <div key={`v-${i}`} className="pfe-snap-guide pfe-snap-guide--v" style={{ left: `${x}%` }} />
            ))}

            {elements.map((el) => {
              const def = PRINT_FORMAT_ELEMENTS.find((d) => d.id === el.id);
              if (!def || el.visible === false) return null;
              const { dx, dy } = rotationCssOffset(el);
              const selected = el.id === selectedId;
              return (
                <div
                  key={el.id}
                  className={`pfe-element ${selected ? 'pfe-element--selected' : ''}`.trim()}
                  data-element={el.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${def.label} – Pfeiltasten verschieben, Eingabetaste bearbeiten, Entf blendet aus`}
                  aria-pressed={selected}
                  style={{
                    left: `${el.x + dx}%`,
                    top: `${(el.y + dy) * scaleY}%`,
                    width: `${el.w}%`,
                    height: `${el.h * scaleY}%`,
                    '--el-color': def.color,
                    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                    ...elementBorderStyle(el),
                  }}
                  onPointerDown={(e) => onStartDrag(e, el.id)}
                  onKeyDown={(e) => onKeyDown(e, el)}
                  title={`${def.label} – ziehen zum Verschieben, klicken zum Bearbeiten`}
                >
                  <span className="pfe-element-label">{def.label}</span>
                  {HANDLES.map((handle) => (
                    <div
                      key={handle}
                      className={`pfe-resize-handle pfe-resize-${handle}`}
                      aria-hidden="true"
                      onPointerDown={(e) => onStartResize(e, el.id, handle)}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <p className="pfe-hint">
        Elemente verschieben: Ziehen oder Pfeiltasten (Shift = 1 cm) · Größe ändern: Ziehen an den Rändern/Ecken ·
        Ein-/ausblenden: Häkchen oben oder Entf · Klicken: Eigenschaften bearbeiten
      </p>
    </div>
  );
}

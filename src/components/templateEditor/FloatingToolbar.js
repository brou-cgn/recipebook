import React, { forwardRef, useEffect } from 'react';
import Segmented from './Segmented';
import {
  FLOW_ELEMENTS, FLOW_PHOTO_SIZES, FLOW_PHOTO_ASPECTS, MIN_FONT_SCALE, MAX_FONT_SCALE,
} from '../../utils/printTemplates';

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Word-style format bar next to the clicked element of the preview.
 * Text elements: size, B/I/U, alignment, colour. Photos: size, aspect ratio, count.
 */
const FloatingToolbar = forwardRef(function FloatingToolbar(
  { elementId, style, override = {}, position, onOverride, onResetOverride, onStyle, onHide, onClose }, ref,
) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const label = FLOW_ELEMENTS.find((e) => e.id === elementId)?.label;
  const scale = override.fontSizeScale ?? 1;
  const hasOverride = Object.keys(override).length > 0;
  const toggle = (key) => onOverride({ [key]: !override[key] });
  const btn = (key, text, title, extra = '') => (
    <button
      type="button"
      className={`tfe-tb-btn${override[key] ? ' tfe-tb-btn--active' : ''}${extra ? ` ${extra}` : ''}`}
      aria-pressed={!!override[key]}
      title={title}
      aria-label={title}
      onClick={() => toggle(key)}
    >
      {text}
    </button>
  );

  return (
    <div
      ref={ref}
      className="tfe-toolbar-float"
      role="toolbar"
      aria-label={`${label} formatieren`}
      style={{ top: position.top, left: position.left }}
    >
      <span className="tfe-tb-title">{label}</span>
      {elementId === 'photos' ? (
        <>
          <Segmented label="Größe" options={FLOW_PHOTO_SIZES} value={style.photoSize} onChange={(v) => onStyle({ photoSize: v })} />
          <select className="pfe-select tfe-tb-select" aria-label="Seitenverhältnis" value={style.photoAspect}
            onChange={(e) => onStyle({ photoAspect: e.target.value })}>
            {FLOW_PHOTO_ASPECTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select className="pfe-select tfe-tb-select" aria-label="Anzahl Fotos" value={style.photoCount}
            onChange={(e) => onStyle({ photoCount: parseInt(e.target.value, 10) })}>
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} Foto{n > 1 ? 's' : ''}</option>)}
          </select>
        </>
      ) : (
        <>
          <button type="button" className="tfe-tb-btn" title="Schrift kleiner" aria-label="Schrift kleiner"
            disabled={scale <= MIN_FONT_SCALE} onClick={() => onOverride({ fontSizeScale: round1(Math.max(MIN_FONT_SCALE, scale - 0.1)) })}>A−</button>
          <span className="tfe-tb-value" aria-label="Schriftgröße">{Math.round(scale * 100)} %</span>
          <button type="button" className="tfe-tb-btn" title="Schrift größer" aria-label="Schrift größer"
            disabled={scale >= MAX_FONT_SCALE} onClick={() => onOverride({ fontSizeScale: round1(Math.min(MAX_FONT_SCALE, scale + 0.1)) })}>A+</button>
          {btn('fontBold', 'B', 'Fett', 'tfe-tb-bold')}
          {btn('fontItalic', 'I', 'Kursiv', 'tfe-tb-italic')}
          {btn('fontUnderline', 'U', 'Unterstrichen', 'tfe-tb-underline')}
          {[['left', '⇤', 'Linksbündig'], ['center', '↔', 'Zentriert'], ['right', '⇥', 'Rechtsbündig']].map(([value, text, title]) => (
            <button key={value} type="button" className={`tfe-tb-btn${override.textAlignH === value ? ' tfe-tb-btn--active' : ''}`}
              aria-pressed={override.textAlignH === value} title={title} aria-label={title}
              onClick={() => onOverride({ textAlignH: value })}>{text}</button>
          ))}
          <input type="color" className="tfe-tb-color" aria-label="Schriftfarbe" title="Schriftfarbe"
            value={override.fontColor || '#000000'} onChange={(e) => onOverride({ fontColor: e.target.value })} />
          {hasOverride && (
            <button type="button" className="tfe-tb-btn" title="Formatierung zurücksetzen" aria-label="Formatierung zurücksetzen"
              onClick={onResetOverride}>↺</button>
          )}
        </>
      )}
      <button type="button" className="tfe-tb-btn" title="Element ausblenden" aria-label={`${label} ausblenden`} onClick={onHide}>Ausblenden</button>
      <button type="button" className="tfe-tb-btn" title="Schließen (Esc)" aria-label="Schließen" onClick={onClose}>✕</button>
    </div>
  );
});

export default FloatingToolbar;

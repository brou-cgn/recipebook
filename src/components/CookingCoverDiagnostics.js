import React, { useEffect, useRef, useState } from 'react';
import { isViewportCoverActive } from '../hooks/useViewportFitCover';
import './CookingCoverDiagnostics.css';

/**
 * Vorübergehende Diagnose (Vorhaben „Parallel kochen“, PR 14): Im Kochmodus quer, solange die Seite bis
 * an den Displayrand reicht (viewport-fit=cover), zeigt eine Zeile unten den letzten Tipp und die
 * Geometrie. So lässt sich am Gerät mit einem Screenshot klären, ob ein Tipp dort ankommt, wo man tippt:
 * Beim ersten Anlauf lag die Schiene sichtbar am Rand, Tipps landeten aber rund 59 pt daneben.
 * Für Tipps durchlässig. Wird entfernt, sobald das am Gerät geklärt ist.
 */

// Wo ist der Tipp angekommen? In Worten der Oberfläche, sonst Tag und erste Klasse
function describeTarget(el) {
  if (!el || el.nodeType !== 1) return 'nichts';
  if (el.closest('.cooking-rail .cooking-mode-add-recipe')) return 'Plus (Schiene)';
  if (el.closest('.cooking-rail-item--current')) return 'Rezept vorn (Schiene)';
  if (el.closest('.cooking-rail-item')) return 'Rezept (Schiene)';
  if (el.closest('.cooking-rail')) return 'Schiene';
  if (el.closest('.cooking-mode-steps')) return 'Schritte';
  if (el.closest('.cooking-mode-ingredients')) return 'Zutaten';
  if (el.closest('.recipe-detail-content')) return 'Kochmodus';
  const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '';
  return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}`;
}

const round = (value) => (Number.isFinite(value) ? Math.round(value) : '–');

function readInset(style, prop) {
  const value = parseFloat(style?.[prop]);
  return Number.isFinite(value) ? Math.round(value) : 0;
}

function measure(probe) {
  const container = document.querySelector('.recipe-detail-content.cooking-mode-landscape');
  const rail = document.querySelector('.cooking-rail');
  const box = container ? container.getBoundingClientRect() : null;
  const railBox = rail ? rail.getBoundingClientRect() : null;
  const vv = window.visualViewport;
  const style = probe ? window.getComputedStyle(probe) : null;
  return {
    page: document.documentElement.clientWidth,
    inner: window.innerWidth,
    fixed: box ? `${round(box.left)}+${round(box.width)}` : '–',
    vv: vv ? `${round(vv.offsetLeft)}+${round(vv.width)}` : '–',
    scroll: round(window.scrollX),
    insets: `L${readInset(style, 'paddingLeft')} R${readInset(style, 'paddingRight')} U${readInset(style, 'paddingBottom')}`,
    rail: railBox ? `${round(railBox.left)}–${round(railBox.right)}` : '–',
    orientation: typeof window.orientation === 'number' ? window.orientation : '–',
  };
}

function CookingCoverDiagnostics() {
  const probeRef = useRef(null);
  const [active, setActive] = useState(isViewportCoverActive);
  const [geometry, setGeometry] = useState(null);
  const [tap, setTap] = useState(null);

  useEffect(() => {
    let timeoutId = null;
    const update = () => {
      setActive(isViewportCoverActive());
      setGeometry(measure(probeRef.current));
    };
    // Nach dem Drehen erst messen, wenn iOS fertig ist
    const updateLater = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(update, 600);
    };
    const handleTouchEnd = (e) => {
      const touch = e.changedTouches?.[0];
      if (!touch) return;
      setTap({
        x: round(touch.clientX),
        y: round(touch.clientY),
        screenX: round(touch.screenX),
        screenY: round(touch.screenY),
        target: describeTarget(e.target),
      });
      update();
    };
    update();
    updateLater();
    window.addEventListener('orientationchange', updateLater);
    window.addEventListener('resize', updateLater);
    window.addEventListener('touchend', handleTouchEnd, { capture: true, passive: true });
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      window.removeEventListener('orientationchange', updateLater);
      window.removeEventListener('resize', updateLater);
      window.removeEventListener('touchend', handleTouchEnd, { capture: true });
    };
  }, []);

  return (
    <>
      {/* Liest die Abstände von iOS (env) aus, unsichtbar */}
      <span className="cooking-cover-diagnostics-probe" ref={probeRef} aria-hidden="true" />
      {active && geometry && (
        <div className="cooking-cover-diagnostics" aria-hidden="true">
          <span>
            Diagnose Rand · Seite {geometry.page} (innen {geometry.inner}) · Kochmodus {geometry.fixed}
            {' · '}vv {geometry.vv} · scroll {geometry.scroll} · {geometry.insets} · Drehung {geometry.orientation}
          </span>
          <span>
            {tap
              ? `Tipp ${tap.x}/${tap.y} (Bildschirm ${tap.screenX}/${tap.screenY}) → ${tap.target} · Schiene ${geometry.rail}`
              : `Bitte einmal mitten auf einen Kreis der Schiene tippen · Schiene ${geometry.rail}`}
          </span>
        </div>
      )}
    </>
  );
}

export default CookingCoverDiagnostics;

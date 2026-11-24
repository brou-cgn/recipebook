import React, { useCallback, useEffect, useRef, useState } from 'react';
import './StartseitenKarussell.css';
import { useTexte } from '../contexts/SpracheContext';
import startseiteTexte from '../i18n/texte/startseite';
import ChevronRightIcon from './icons/ChevronRightIcon';
import usePrefersReducedMotion from '../hooks/usePrefersReducedMotion';

/**
 * StartseitenKarussell – wiederverwendbare Karussell-Vorlage für die Startseite.
 *
 * Die Kacheln reichen bis an den Seitenrand, die Nachbarkacheln ragen knapp ins Bild
 * (Maße in StartseitenKarussell.css). Mit Maus erscheinen ab Tablet-Breite Pfeile zum
 * Blättern; sie fehlen am Anfang bzw. Ende des Karussells.
 *
 * Props:
 *   title      {string}   Überschrift des Karussell-Abschnitts
 *   items      {Array}    Anzuzeigende Elemente (müssen eine `id`-Eigenschaft haben)
 *   loading    {boolean}  Ladezustand – zeigt "Laden…" an
 *   renderItem {Function} (item) => ReactNode – rendert eine einzelne Karte
 *   emptyText       {string}   Text, der bei leerer Liste angezeigt wird
 *   emptyContent    {ReactNode} Optionaler Inhalt statt emptyText bei leerer Liste
 *   onMehr          {Function} Optionaler Klick-Handler für den „mehr"-Button
 *   mehrText        {string}   Beschriftung des „mehr"-Buttons (Standard: „mehr" in der geltenden Sprache)
 *   titleAction     {ReactNode} Optionale Aktion (z. B. Button) neben der Überschrift
 */
function StartseitenKarussell({
  title,
  items = [],
  loading = false,
  renderItem,
  emptyText = '',
  emptyContent = null,
  onMehr,
  mehrText = null,
  titleAction = null,
}) {
  const t = useTexte(startseiteTexte);
  const reducedMotion = usePrefersReducedMotion();
  const carouselRef = useRef(null);
  // Ob das Karussell am Anfang bzw. Ende steht: Dort entfällt der jeweilige Pfeil.
  const [kanten, setKanten] = useState({ anfang: true, ende: true });
  const hatKacheln = !loading && items.length > 0;

  const kantenPruefen = useCallback(() => {
    const el = carouselRef.current;
    if (!el) return;
    const anfang = el.scrollLeft <= 1;
    const ende = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
    setKanten((alt) => (alt.anfang === anfang && alt.ende === ende ? alt : { anfang, ende }));
  }, []);

  useEffect(() => {
    if (!hatKacheln) return undefined;
    kantenPruefen();
    window.addEventListener('resize', kantenPruefen);
    return () => window.removeEventListener('resize', kantenPruefen);
  }, [hatKacheln, items.length, kantenPruefen]);

  // Blättert um so viele Kacheln, wie ganz zu sehen sind (--spalten aus dem CSS).
  const blaettern = (richtung) => {
    const el = carouselRef.current;
    if (!el) return;
    const stil = window.getComputedStyle(el);
    const abstand = parseFloat(stil.columnGap) || 0;
    const spalten = parseInt(stil.getPropertyValue('--spalten'), 10) || 1;
    const kachel = el.querySelector('.startseite-carousel-item');
    const schritt = kachel ? kachel.getBoundingClientRect().width + abstand : el.clientWidth;
    const left = richtung * schritt * spalten;
    if (typeof el.scrollBy === 'function') {
      el.scrollBy({ left, behavior: reducedMotion ? 'auto' : 'smooth' });
    } else {
      el.scrollLeft += left;
    }
  };

  const handleMehrClick = (event) => {
    window.scrollTo(0, 0);
    if (typeof onMehr === 'function') {
      onMehr(event);
    }
  };

  return (
    <div className="startseite-trending-section">
      <div className="startseite-section-header">
        <h2 className="startseite-section-title">{title}</h2>
        {titleAction && <div className="startseite-section-title-action">{titleAction}</div>}
      </div>
      <div className={`startseite-carousel-wrap${hatKacheln ? ' startseite-carousel-wrap--randlos' : ''}`}>
        {loading ? (
          <div className="startseite-loading">{t('laden')}</div>
        ) : items.length === 0 ? (
          emptyContent || <div className="startseite-empty">{emptyText}</div>
        ) : (
          <>
            <div className="startseite-carousel" ref={carouselRef} onScroll={kantenPruefen}>
              {items.map((item, index) => (
                <div key={item.id ?? index} className="startseite-carousel-item">
                  {renderItem(item)}
                </div>
              ))}
            </div>
            {!kanten.anfang && (
              <button
                type="button"
                className="startseite-carousel-pfeil startseite-carousel-pfeil--zurueck"
                onClick={() => blaettern(-1)}
                aria-label={t('vorherigeRezepte')}
                title={t('vorherigeRezepte')}
              >
                <ChevronRightIcon size={20} />
              </button>
            )}
            {!kanten.ende && (
              <button
                type="button"
                className="startseite-carousel-pfeil startseite-carousel-pfeil--weiter"
                onClick={() => blaettern(1)}
                aria-label={t('naechsteRezepte')}
                title={t('naechsteRezepte')}
              >
                <ChevronRightIcon size={20} />
              </button>
            )}
          </>
        )}
      </div>
      {onMehr && (
        <div className="startseite-mehr-container">
          <button className="startseite-mehr-btn" onClick={handleMehrClick}>
            {mehrText || t('mehr')}
          </button>
        </div>
      )}
    </div>
  );
}

export default StartseitenKarussell;

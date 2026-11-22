import React from 'react';
import './StartseitenKarussell.css';
import { useTexte } from '../contexts/SpracheContext';
import startseiteTexte from '../i18n/texte/startseite';

/**
 * StartseitenKarussell – wiederverwendbare Karussell-Vorlage für die Startseite.
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
      <div className="startseite-carousel-wrap">
        {loading ? (
          <div className="startseite-loading">{t('laden')}</div>
        ) : items.length === 0 ? (
          emptyContent || <div className="startseite-empty">{emptyText}</div>
        ) : (
          <div className="startseite-carousel">
            {items.map((item, index) => (
              <div key={item.id ?? index} className="startseite-carousel-item">
                {renderItem(item)}
              </div>
            ))}
          </div>
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

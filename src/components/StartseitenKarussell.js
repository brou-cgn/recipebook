import React from 'react';
import './StartseitenKarussell.css';

/**
 * StartseitenKarussell – wiederverwendbare Karussell-Vorlage für die Startseite.
 *
 * Props:
 *   title      {string}   Überschrift des Karussell-Abschnitts
 *   items      {Array}    Anzuzeigende Elemente (müssen eine `id`-Eigenschaft haben)
 *   loading    {boolean}  Ladezustand – zeigt "Laden…" an
 *   renderItem {Function} (item) => ReactNode – rendert eine einzelne Karte
 *   emptyText       {string}   Text, der bei leerer Liste angezeigt wird
 *   onMehr          {Function} Optionaler Klick-Handler für den „mehr"-Button
 *   mehrText        {string}   Beschriftung des „mehr"-Buttons (Standard: „mehr")
 */
function StartseitenKarussell({
  title,
  items = [],
  loading = false,
  renderItem,
  emptyText = '',
  onMehr,
  mehrText = 'mehr',
}) {
  return (
    <div className="startseite-trending-section">
      <h2 className="startseite-section-title">{title}</h2>
      <div className="startseite-carousel-wrap">
        {loading ? (
          <div className="startseite-loading">Laden…</div>
        ) : items.length === 0 ? (
          <div className="startseite-empty">{emptyText}</div>
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
          <button className="startseite-mehr-btn" onClick={onMehr}>
            {mehrText}
          </button>
        </div>
      )}
    </div>
  );
}

export default StartseitenKarussell;

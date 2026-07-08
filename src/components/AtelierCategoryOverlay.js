import React, { useMemo, useState } from 'react';
import './AtelierCategoryOverlay.css';

const CATEGORIES = [
  { id: 'beilagen', label: 'Beilagen & Grundrezepte' },
  { id: 'desserts', label: 'Desserts' },
  { id: 'dips', label: 'Dips & Saucen' },
  { id: 'drinks', label: 'Drinks' },
  { id: 'geback', label: 'Gebäcke & Teige' },
  { id: 'hauptspeisen', label: 'Hauptspeisen' },
  { id: 'pizzen', label: 'Pizzen' },
  { id: 'salate', label: 'Salate' },
  { id: 'suppen', label: 'Suppen & Eintöpfe' },
  { id: 'vorspeisen', label: 'Vorspeisen' },
];

function AtelierCategoryOverlay({ onContinue }) {
  const [checkedIds, setCheckedIds] = useState(() => new Set());

  const sortedCategories = useMemo(() => {
    return [...CATEGORIES].sort((a, b) => {
      const aChecked = checkedIds.has(a.id) ? 0 : 1;
      const bChecked = checkedIds.has(b.id) ? 0 : 1;
      if (aChecked !== bChecked) return aChecked - bChecked;
      return a.label.localeCompare(b.label, 'de');
    });
  }, [checkedIds]);

  const toggleCategory = (id) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="atelier-category-overlay" role="dialog" aria-modal="true" aria-label="Kategorie-Auswahl">
      <div className="atelier-category-content">
        <p className="atelier-category-tag">Kochatelier vorbereiten</p>
        <h2 className="atelier-category-title">Wonach suchst du heute?</h2>
        <p className="atelier-category-body">
          Wähle aus, wie du inspiriert werden möchtest. Lass dich überraschen indem du einfach
          keine Kategorie auswählst.
        </p>
        <div className="atelier-category-chips">
          {sortedCategories.map((category) => (
            <div key={category.id} className="atelier-category-chip-wrap">
              <input
                type="checkbox"
                id={`atelier-category-${category.id}`}
                className="atelier-category-checkbox"
                checked={checkedIds.has(category.id)}
                onChange={() => toggleCategory(category.id)}
              />
              <label htmlFor={`atelier-category-${category.id}`} className="atelier-category-chip">
                {category.label}
              </label>
            </div>
          ))}
        </div>
        <div className="atelier-category-btn-wrap">
          <button className="atelier-category-btn" onClick={onContinue} type="button">
            Kochatelier öffnen
          </button>
        </div>
      </div>

      <div className="atelier-category-dots-wrap">
        <div className="atelier-category-dots">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className={`atelier-category-dot${i === 1 ? ' atelier-category-dot--active' : ''}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default AtelierCategoryOverlay;

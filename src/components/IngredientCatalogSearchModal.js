import React, { useMemo, useState } from 'react';
import './IngredientCatalogSearchModal.css';
import { normalizeNutritionReferenceId } from '../utils/nutritionReferenceUtils';

function getIngredientRowDisplayName(row) {
  return String(
    row?.displayName
    || row?.Anzeigename
    || row?.name
    || (Array.isArray(row?.synonyms) ? row.synonyms[0] : '')
    || row?.ingredientID
    || row?.id
    || ''
  ).trim();
}

function IngredientCatalogSearchModal({ nutritionReferenceRows = [], onSelect, onClose }) {
  const [query, setQuery] = useState('');

  const catalogEntries = useMemo(() => {
    const seen = new Set();
    return nutritionReferenceRows
      .map((row) => {
        const ingredientID = String(row?.ingredientID || row?.id || '').trim();
        if (!ingredientID || seen.has(ingredientID)) return null;
        seen.add(ingredientID);
        const displayName = getIngredientRowDisplayName(row) || ingredientID;
        const searchTokens = [displayName, ingredientID, ...(Array.isArray(row?.synonyms) ? row.synonyms : [])]
          .map((value) => normalizeNutritionReferenceId(value))
          .filter(Boolean);
        return { ingredientID, displayName, searchTokens };
      })
      .filter(Boolean)
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'de', { sensitivity: 'base' }));
  }, [nutritionReferenceRows]);

  const normalizedQuery = normalizeNutritionReferenceId(query);
  const filteredEntries = normalizedQuery
    ? catalogEntries.filter((entry) => entry.searchTokens.some((token) => token.includes(normalizedQuery)))
    : catalogEntries;

  return (
    <div className="ingredient-search-modal-overlay" onClick={onClose}>
      <div
        className="ingredient-search-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Bestehende Zutaten durchsuchen"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ingredient-search-modal-header">
          <input
            type="search"
            className="ingredient-search-modal-input"
            placeholder="Zutat suchen…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Zutat suchen"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
            }}
          />
          <button
            type="button"
            className="ingredient-search-modal-close"
            onClick={onClose}
            aria-label="Zutatensuche schließen"
          >
            ×
          </button>
        </div>
        <ul className="ingredient-search-modal-list">
          {filteredEntries.length === 0 ? (
            <li className="ingredient-search-modal-empty">Keine Zutat gefunden.</li>
          ) : (
            filteredEntries.map((entry) => (
              <li key={entry.ingredientID}>
                <button
                  type="button"
                  className="ingredient-search-modal-item"
                  onClick={() => onSelect(entry.ingredientID)}
                >
                  <span className="ingredient-search-modal-item-name">{entry.displayName}</span>
                  <span className="ingredient-search-modal-item-id">{entry.ingredientID}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

export default IngredientCatalogSearchModal;

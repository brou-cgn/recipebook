import React, { useState } from 'react';
import {
  INGREDIENT_MATCH_CREATE_NEW_OPTION,
  INGREDIENT_MATCH_IGNORE_OPTION,
  INGREDIENT_MATCH_SEARCH_EXISTING_OPTION,
} from '../hooks/useIngredientIDMatching';
import IngredientCatalogSearchModal from './IngredientCatalogSearchModal';

function findRowDisplayName(ingredientID, nutritionReferenceRows) {
  const row = nutritionReferenceRows.find(
    (candidate) => String(candidate?.ingredientID || candidate?.id || '').trim() === ingredientID
  );
  if (!row) return ingredientID;
  return String(
    row.displayName || row.Anzeigename || row.name
    || (Array.isArray(row.synonyms) ? row.synonyms[0] : '')
    || ingredientID
  ).trim() || ingredientID;
}

function IngredientIDSelect({
  entry,
  value,
  onChange,
  nutritionReferenceRows = [],
  learnSynonymChecked,
  onLearnSynonymChange,
}) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const selectedValue = value || '';
  const isSuggestedValue = entry.suggestions.some((suggestion) => suggestion.ingredientID === selectedValue);
  const isSpecialValue = selectedValue === INGREDIENT_MATCH_CREATE_NEW_OPTION
    || selectedValue === INGREDIENT_MATCH_IGNORE_OPTION;
  const searchedSelection = selectedValue && !isSuggestedValue && !isSpecialValue
    ? { ingredientID: selectedValue, displayName: findRowDisplayName(selectedValue, nutritionReferenceRows) }
    : null;

  const handleSelectChange = (e) => {
    const nextValue = e.target.value;
    if (nextValue === INGREDIENT_MATCH_SEARCH_EXISTING_OPTION) {
      setIsSearchOpen(true);
      return;
    }
    onChange(entry.index, nextValue);
  };

  return (
    <>
      <select
        value={selectedValue}
        onChange={handleSelectChange}
        aria-label={`ingredientID für ${entry.ingredient}`}
      >
        <option value="">Bitte auswählen</option>
        {entry.suggestions.map((suggestion) => (
          <option key={suggestion.ingredientID} value={suggestion.ingredientID}>
            {suggestion.displayName || suggestion.ingredientID} ({suggestion.confidencePercent}%)
          </option>
        ))}
        {searchedSelection && (
          <option value={searchedSelection.ingredientID}>
            {searchedSelection.displayName}
          </option>
        )}
        <option value={INGREDIENT_MATCH_SEARCH_EXISTING_OPTION}>Bestehende Zutaten durchsuchen…</option>
        <option value={INGREDIENT_MATCH_CREATE_NEW_OPTION}>Neue Zutat</option>
        <option value={INGREDIENT_MATCH_IGNORE_OPTION}>Zutat ignorieren</option>
      </select>
      {entry.suggestions.length > 0 && (
        <label className="ingredient-match-learn-label">
          <input
            type="checkbox"
            checked={learnSynonymChecked !== false}
            onChange={(e) => onLearnSynonymChange(entry.index, e.target.checked)}
          />
          {' '}Synonym lernen
        </label>
      )}
      {isSearchOpen && (
        <IngredientCatalogSearchModal
          nutritionReferenceRows={nutritionReferenceRows}
          onSelect={(ingredientID) => {
            onChange(entry.index, ingredientID);
            setIsSearchOpen(false);
          }}
          onClose={() => setIsSearchOpen(false)}
        />
      )}
    </>
  );
}

export default IngredientIDSelect;

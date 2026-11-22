import React, { useState, useEffect, useRef } from 'react';
import './RecipeTypeahead.css';
import { fuzzyFilter } from '../utils/fuzzySearch';
import { useListenwerte, useRezeptTitel, useSprache, useTexte } from '../contexts/SpracheContext';
import { titelFassungen } from '../i18n/rezeptTitel';
import rezeptformularTexte from '../i18n/texte/rezeptformular';
import allgemeinTexte from '../i18n/texte/allgemein';

/**
 * RecipeTypeahead component for selecting recipes with fuzzy search
 * Appears when user types "#" in an ingredient field
 */
function RecipeTypeahead({ 
  recipes, 
  onSelect, 
  onCancel, 
  inputValue, 
  position 
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  // Titel und Speisekategorien in der geltenden Sprache; die Suche findet Original und Übersetzung
  // (Mehrsprachigkeit PR 6h). Verlinkt wird weiter mit dem Originaltitel (encodeRecipeLink).
  const t = useTexte(rezeptformularTexte);
  const tAllgemein = useTexte(allgemeinTexte);
  const { inhalteUebersetzen } = useSprache();
  const zeigeTitel = useRezeptTitel();
  const listen = useListenwerte();

  // Extract search query from input value (everything after #)
  useEffect(() => {
    const hashIndex = inputValue.lastIndexOf('#');
    if (hashIndex !== -1) {
      setSearchQuery(inputValue.substring(hashIndex + 1));
    }
  }, [inputValue]);

  // Filter recipes using fuzzy search
  const filteredRecipes = fuzzyFilter(
    recipes,
    searchQuery,
    (recipe) => titelFassungen(recipe, inhalteUebersetzen).join(' · ')
  );

  // Limit to top 10 results for performance
  const displayedRecipes = filteredRecipes.slice(0, 10);

  // Reset selected index when filtered recipes change
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);

  // Focus input on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedElement = listRef.current.children[selectedIndex];
      if (selectedElement && typeof selectedElement.scrollIntoView === 'function') {
        selectedElement.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth'
        });
      }
    }
  }, [selectedIndex]);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => 
        prev < displayedRecipes.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => prev > 0 ? prev - 1 : prev);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (displayedRecipes[selectedIndex]) {
        handleSelect(displayedRecipes[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  const handleSelect = (recipe) => {
    onSelect(recipe);
  };

  return (
    <div className="recipe-typeahead-overlay" onClick={onCancel}>
      <div 
        className="recipe-typeahead-container" 
        onClick={(e) => e.stopPropagation()}
        style={position ? {
          position: 'absolute',
          top: `${position.top}px`,
          left: `${position.left}px`,
          maxWidth: '400px'
        } : {}}
      >
        <div className="recipe-typeahead-header">
          <input
            ref={inputRef}
            type="text"
            className="recipe-typeahead-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('rezeptSuchen')}
            autoFocus
          />
          <button 
            className="recipe-typeahead-close"
            onClick={onCancel}
            type="button"
            aria-label={tAllgemein('schliessen')}
          >
            ×
          </button>
        </div>
        
        <div className="recipe-typeahead-list" ref={listRef}>
          {displayedRecipes.length > 0 ? (
            displayedRecipes.map((recipe, index) => (
              <div
                key={recipe.id}
                className={`recipe-typeahead-item ${
                  index === selectedIndex ? 'selected' : ''
                }`}
                onClick={() => handleSelect(recipe)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="recipe-typeahead-item-content">
                  {recipe.image && (
                    <img 
                      src={recipe.image} 
                      alt={zeigeTitel(recipe)}
                      className="recipe-typeahead-image"
                    />
                  )}
                  <div className="recipe-typeahead-text">
                    <div className="recipe-typeahead-title">{zeigeTitel(recipe)}</div>
                    {recipe.speisekategorie && (
                      <div className="recipe-typeahead-category">
                        {(Array.isArray(recipe.speisekategorie) ? recipe.speisekategorie : [recipe.speisekategorie])
                          .map((kategorie) => listen.text('mealCategories', kategorie))
                          .join(', ')}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="recipe-typeahead-empty">
              {t('keineRezepteGefunden')}
            </div>
          )}
        </div>
        
        <div className="recipe-typeahead-footer">
          {t('tastaturHinweis')}
        </div>
      </div>
    </div>
  );
}

export default RecipeTypeahead;

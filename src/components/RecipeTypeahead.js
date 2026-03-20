import React, { useState, useEffect, useRef } from 'react';
import './RecipeTypeahead.css';
import { fuzzyFilter } from '../utils/fuzzySearch';

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
  const inputRef = useRef(null);

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
    (recipe) => recipe.title
  );

  // Limit to top 10 results for performance
  const displayedRecipes = filteredRecipes.slice(0, 10);

  // Focus input on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

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
            type="search"
            className="recipe-typeahead-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rezept suchen..."
            autoFocus
          />
          <button 
            className="recipe-typeahead-close"
            onClick={onCancel}
            type="button"
          >
            ✕
          </button>
        </div>
        
        <div className="recipe-typeahead-list">
          {displayedRecipes.length > 0 ? (
            displayedRecipes.map((recipe) => (
              <div
                key={recipe.id}
                className="recipe-typeahead-item"
                onClick={() => handleSelect(recipe)}
              >
                <div className="recipe-typeahead-item-content">
                  {recipe.image && (
                    <img 
                      src={recipe.image} 
                      alt={recipe.title}
                      className="recipe-typeahead-image"
                    />
                  )}
                  <div className="recipe-typeahead-text">
                    <div className="recipe-typeahead-title">{recipe.title}</div>
                    {recipe.speisekategorie && (
                      <div className="recipe-typeahead-category">
                        {Array.isArray(recipe.speisekategorie) 
                          ? recipe.speisekategorie.join(', ')
                          : recipe.speisekategorie}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="recipe-typeahead-empty">
              Keine Rezepte gefunden
            </div>
          )}
        </div>
        
        <div className="recipe-typeahead-footer">
          Rezept antippen zum Auswählen
        </div>
      </div>
    </div>
  );
}

export default RecipeTypeahead;

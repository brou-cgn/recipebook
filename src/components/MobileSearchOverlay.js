import React, { useState, useEffect, useRef, useCallback } from 'react';
import './MobileSearchOverlay.css';
import { fuzzyFilter } from '../utils/fuzzySearch';

const DEBOUNCE_DELAY_MS = 200;
// Delay in ms before auto-focusing the input – allows the slide-up animation to
// start before the keyboard appears, preventing a jarring layout jump on mobile.
const FOCUS_DELAY_MS = 80;

function MobileSearchOverlay({ isOpen, onClose, recipes, onSelectRecipe }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const inputRef = useRef(null);

  // Reset search when overlay opens/closes
  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setDebouncedTerm('');
      // Delay focus to allow animation to complete and keyboard to open
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, FOCUS_DELAY_MS);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTerm(searchTerm);
    }, DEBOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Close on ESC key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const filteredRecipes = fuzzyFilter(
    recipes || [],
    debouncedTerm,
    (recipe) => recipe.title || ''
  );

  const handleSelect = useCallback((recipe) => {
    onClose();
    onSelectRecipe(recipe);
  }, [onClose, onSelectRecipe]);

  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      // Pick the first result on Enter / keyboard search button
      if (filteredRecipes.length > 0) {
        handleSelect(filteredRecipes[0]);
      }
    }
  };

  const handleClear = () => {
    setSearchTerm('');
    setDebouncedTerm('');
    inputRef.current?.focus();
  };

  if (!isOpen) return null;

  return (
    <div
      className="mobile-search-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Rezepte suchen"
    >
      <div className="mobile-search-bar-row">
        <div className="mobile-search-input-wrapper">
          <span className="mobile-search-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            ref={inputRef}
            type="search"
            className="mobile-search-input"
            placeholder="Rezepte durchsuchen..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleInputKeyDown}
            aria-label="Rezepte durchsuchen"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            enterKeyHint="search"
          />
          {searchTerm && (
            <button
              className="mobile-search-clear-btn"
              onClick={handleClear}
              aria-label="Suche löschen"
              tabIndex={0}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          )}
          <button
            className="mobile-search-mic-btn"
            aria-label="Spracheingabe (demnächst verfügbar)"
            tabIndex={0}
            disabled
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"/>
            </svg>
          </button>
        </div>
        <button
          className="mobile-search-close-btn"
          onClick={onClose}
          aria-label="Suche schließen"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      </div>

      <div className="mobile-search-results" role="listbox" aria-label="Suchergebnisse">
        {debouncedTerm && filteredRecipes.length === 0 && (
          <p className="mobile-search-no-results">Keine Rezepte gefunden</p>
        )}
        {filteredRecipes.map((recipe) => (
          <button
            key={recipe.id}
            className="mobile-search-result-item"
            role="option"
            aria-selected="false"
            onClick={() => handleSelect(recipe)}
          >
            {recipe.image && (
              <img
                src={recipe.image}
                alt=""
                className="mobile-search-result-thumb"
                aria-hidden="true"
              />
            )}
            <span className="mobile-search-result-title">{recipe.title}</span>
            {recipe.kulinarik && (
              <span className="mobile-search-result-tag">
                {Array.isArray(recipe.kulinarik) ? recipe.kulinarik[0] : recipe.kulinarik}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export default MobileSearchOverlay;

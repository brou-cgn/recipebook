import React, { useState, useEffect, useRef, useCallback } from 'react';
import './MobileSearchOverlay.css';
import { fuzzyFilter } from '../utils/fuzzySearch';
import { getUserFavorites } from '../utils/userFavorites';

const DEBOUNCE_DELAY_MS = 200;
// Delay in ms before auto-focusing the input – gives the slide-up animation
// a head-start before the keyboard appears, preventing a jarring layout jump.
const FOCUS_DELAY_MS = 120;

function MobileSearchOverlay({ isOpen, onClose, recipes, onSelectRecipe, onSearch, currentUser }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState([]);
  // panelBottom tracks how far from the bottom of the screen the panel sits
  // (= 0 normally, > 0 when the software keyboard is visible on iOS)
  const [panelBottom, setPanelBottom] = useState(0);
  const inputRef = useRef(null);

  // Load favorite IDs when currentUser changes
  useEffect(() => {
    const loadFavorites = async () => {
      if (currentUser?.id) {
        const ids = await getUserFavorites(currentUser.id);
        setFavoriteIds(ids);
      } else {
        setFavoriteIds([]);
      }
    };
    loadFavorites();
  }, [currentUser?.id]);

  // Reset search and favorites filter when overlay opens/closes
  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setDebouncedTerm('');
      setShowFavoritesOnly(false);
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

  // Track keyboard height via visualViewport so the panel floats just above it
  useEffect(() => {
    if (!isOpen) return;
    const vp = window.visualViewport;
    if (!vp) return;

    const update = () => {
      // Distance from the bottom of the visual viewport to the bottom of the
      // layout viewport = how much of the screen is covered by the keyboard.
      const keyboardHeight = Math.max(
        0,
        window.innerHeight - vp.height - vp.offsetTop
      );
      setPanelBottom(keyboardHeight);
    };

    update();
    vp.addEventListener('resize', update);
    vp.addEventListener('scroll', update);
    return () => {
      vp.removeEventListener('resize', update);
      vp.removeEventListener('scroll', update);
    };
  }, [isOpen]);

  const baseRecipes = showFavoritesOnly
    ? (recipes || []).filter((r) => favoriteIds.includes(r.id))
    : (recipes || []);

  const filteredRecipes = fuzzyFilter(
    baseRecipes,
    debouncedTerm,
    (recipe) => recipe.title || ''
  );

  const handleSelect = useCallback((recipe) => {
    onClose();
    onSelectRecipe(recipe);
  }, [onClose, onSelectRecipe]);

  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      const term = debouncedTerm || searchTerm;
      if (term && onSearch) {
        onSearch(term);
        onClose();
      } else if (filteredRecipes.length > 0) {
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
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Panel sits at the bottom of the visible viewport, above the keyboard */}
      <div
        className="mobile-search-panel"
        style={{ bottom: panelBottom }}
      >
        {/* Tiles grid – displayed in the upper portion of the panel */}
        <div className="mobile-search-results" role="listbox" aria-label="Suchergebnisse">
          {!debouncedTerm && !showFavoritesOnly && (
            <p className="mobile-search-hint">Suchbegriff eingeben …</p>
          )}
          {debouncedTerm && filteredRecipes.length === 0 && (
            <p className="mobile-search-no-results">
              {showFavoritesOnly ? 'Kein Favorit gefunden' : 'Keine Rezepte gefunden'}
            </p>
          )}
          {!debouncedTerm && filteredRecipes.length === 0 && showFavoritesOnly && (
            <p className="mobile-search-no-results">Keine favorisierten Rezepte</p>
          )}
          {filteredRecipes.length > 0 && (
            <div className="mobile-search-tiles-grid">
              {filteredRecipes.map((recipe) => (
                <button
                  key={recipe.id}
                  className="mobile-search-tile"
                  role="option"
                  aria-selected="false"
                  onClick={() => handleSelect(recipe)}
                >
                  <div className="mobile-search-tile-image">
                    {recipe.image ? (
                      <img src={recipe.image} alt="" aria-hidden="true" />
                    ) : (
                      <span className="mobile-search-tile-placeholder" aria-hidden="true">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="3" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <polyline points="21 15 16 10 5 21" />
                        </svg>
                      </span>
                    )}
                  </div>
                  <span className="mobile-search-tile-title">{recipe.title}</span>
                </button>
              ))}
            </div>
          )}
          <div className="mobile-search-filter-pills">
            <button
              className={`mobile-search-filter-pill${showFavoritesOnly ? ' active' : ''}`}
              onClick={() => setShowFavoritesOnly((prev) => !prev)}
              aria-pressed={showFavoritesOnly}
              title={showFavoritesOnly ? 'Alle Rezepte anzeigen' : 'Nur Favoriten anzeigen'}
            >
              ★ Favoriten
            </button>
          </div>
        </div>

        {/* Search bar – anchored to the bottom of the panel, just above keyboard */}
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
              placeholder="Rezepte durchsuchen …"
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
          </div>
          <button
            className="mobile-search-cancel-btn"
            onClick={onClose}
            aria-label="Suche abbrechen"
          >
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  );
}

export default MobileSearchOverlay;

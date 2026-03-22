import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import './MobileSearchOverlay.css';
import { fuzzyFilter } from '../utils/fuzzySearch';
import { getUserFavorites } from '../utils/userFavorites';
import { expandCuisineSelection } from '../utils/customLists';

const DEBOUNCE_DELAY_MS = 200;
// Delay in ms before auto-focusing the input – gives the slide-up animation
// a head-start before the keyboard appears, preventing a jarring layout jump.
const FOCUS_DELAY_MS = 120;

const MAX_CUISINE_TYPE_PILLS = 5;
const CUISINE_USAGE_STORAGE_KEY = 'mobileSearch_cuisineUsage';

function getCuisineUsageCounts() {
  try {
    const stored = localStorage.getItem(CUISINE_USAGE_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function incrementCuisineUsage(cuisineName) {
  const counts = getCuisineUsageCounts();
  counts[cuisineName] = (counts[cuisineName] || 0) + 1;
  try {
    localStorage.setItem(CUISINE_USAGE_STORAGE_KEY, JSON.stringify(counts));
  } catch (e) {
    // ignore storage errors
  }
}

/**
 * Compute all cuisine types sorted by usage frequency (localStorage) desc,
 * then recipe count desc. Only includes types that have at least one recipe.
 */
function computeAllSortedCuisineTypes(recipes, cuisineTypes) {
  if (!cuisineTypes || cuisineTypes.length === 0) return [];
  const recipeList = recipes || [];
  const recipeCounts = {};
  recipeList.forEach((recipe) => {
    const kulinarik = Array.isArray(recipe.kulinarik) ? recipe.kulinarik : [];
    kulinarik.forEach((k) => {
      recipeCounts[k] = (recipeCounts[k] || 0) + 1;
    });
  });
  const usageCounts = getCuisineUsageCounts();
  return cuisineTypes
    .filter((type) => recipeCounts[type] > 0)
    .sort((a, b) => {
      const usageDiff = (usageCounts[b] || 0) - (usageCounts[a] || 0);
      if (usageDiff !== 0) return usageDiff;
      return (recipeCounts[b] || 0) - (recipeCounts[a] || 0);
    });
}

/**
 * Compute the top cuisine type pills from the given recipes.
 * Sorts by: usage frequency (localStorage) desc, then recipe count desc.
 * Returns at most MAX_CUISINE_TYPE_PILLS entries.
 */
function computeTopCuisineTypes(recipes, cuisineTypes) {
  return computeAllSortedCuisineTypes(recipes, cuisineTypes).slice(0, MAX_CUISINE_TYPE_PILLS);
}

function MobileSearchOverlay({ isOpen, onClose, recipes, onSelectRecipe, onSearch, currentUser, showFavoritesOnly: showFavoritesOnlyProp, onFavoritesToggle, cuisineTypes, cuisineGroups, onCuisineFilterChange, selectedCuisines: selectedCuisinesProp }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [selectedCuisines, setSelectedCuisines] = useState([]);
  // panelBottom tracks how far from the bottom of the screen the panel sits
  // (= 0 normally, > 0 when the software keyboard is visible on iOS)
  const [panelBottom, setPanelBottom] = useState(0);
  const inputRef = useRef(null);
  // Keep a ref to the latest selectedCuisinesProp so the open-effect can read
  // it without re-triggering every time the parent filter changes.
  const selectedCuisinesPropRef = useRef(selectedCuisinesProp);
  selectedCuisinesPropRef.current = selectedCuisinesProp;

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
      setShowFavoritesOnly(showFavoritesOnlyProp ?? false);
      setSelectedCuisines(selectedCuisinesPropRef.current ?? []);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, FOCUS_DELAY_MS);
      return () => clearTimeout(timer);
    }
  }, [isOpen, showFavoritesOnlyProp]);

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

  const baseRecipes = useMemo(() => {
    let list = recipes || [];
    if (showFavoritesOnly) {
      list = list.filter((r) => favoriteIds.includes(r.id));
    }
    if (selectedCuisines.length > 0) {
      const expanded = expandCuisineSelection(selectedCuisines, cuisineGroups || []);
      list = list.filter((r) => {
        const kulinarik = Array.isArray(r.kulinarik) ? r.kulinarik : [];
        return expanded.some((c) => kulinarik.includes(c));
      });
    }
    return list;
  }, [recipes, showFavoritesOnly, favoriteIds, selectedCuisines, cuisineGroups]);

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

  const topCuisineTypes = useMemo(
    () => computeTopCuisineTypes(recipes, cuisineTypes),
    [recipes, cuisineTypes]
    // Note: getCuisineUsageCounts() is read inside computeTopCuisineTypes from localStorage.
    // The sort order is intentionally computed once per overlay open (when recipes/cuisineTypes change),
    // and will reflect updated usage counts the next time the overlay opens.
  );

  // Full sorted list (without the MAX_CUISINE_TYPE_PILLS cap) used to dynamically
  // expand search results when the filtered count drops below the cap.
  const allSortedCuisineTypes = useMemo(
    () => computeAllSortedCuisineTypes(recipes, cuisineTypes),
    [recipes, cuisineTypes]
  );

  const handleCuisinePillClick = (cuisineName) => {
    setSelectedCuisines((prev) => {
      const isSelected = prev.includes(cuisineName);
      const newValue = isSelected
        ? prev.filter((c) => c !== cuisineName)
        : [...prev, cuisineName];
      if (!isSelected) {
        incrementCuisineUsage(cuisineName);
      }
      onCuisineFilterChange?.(newValue);
      return newValue;
    });
  };

  const allCuisinePills = useMemo(() => [
    ...topCuisineTypes,
    ...(cuisineGroups || []).map((g) => g.name),
  ], [topCuisineTypes, cuisineGroups]);

  const visibleCuisinePills = useMemo(() => {
    if (!debouncedTerm) return allCuisinePills;
    const lower = debouncedTerm.toLowerCase();
    const result = [];
    const seen = new Set();
    const groupNames = new Set((cuisineGroups || []).map((g) => g.name));
    let cuisineTypeCount = 0;
    allCuisinePills.forEach((name) => {
      if (name.toLowerCase().includes(lower)) {
        if (!seen.has(name)) {
          result.push(name);
          seen.add(name);
          if (!groupNames.has(name)) {
            cuisineTypeCount++;
          }
        }
        // If this is a cuisine group, also show its child types
        const group = (cuisineGroups || []).find((g) => g.name === name);
        if (group) {
          (group.children || []).forEach((child) => {
            if (!seen.has(child)) {
              result.push(child);
              seen.add(child);
              cuisineTypeCount++;
            }
          });
        }
      }
    });
    // If fewer than MAX_CUISINE_TYPE_PILLS cuisine type pills matched, dynamically
    // add further matching types from the full sorted list (sorted by usage frequency
    // and recipe count) to keep the list as helpful as possible.
    if (cuisineTypeCount < MAX_CUISINE_TYPE_PILLS) {
      for (const type of allSortedCuisineTypes) {
        if (cuisineTypeCount >= MAX_CUISINE_TYPE_PILLS) break;
        if (!seen.has(type) && type.toLowerCase().includes(lower)) {
          result.push(type);
          seen.add(type);
          cuisineTypeCount++;
        }
      }
    }
    return result;
  }, [allCuisinePills, debouncedTerm, cuisineGroups, allSortedCuisineTypes]);

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
        {/* Tiles carousel – displayed at the top of the panel */}
        <div className="mobile-search-results" role="listbox" aria-label="Suchergebnisse">
          {!debouncedTerm && !showFavoritesOnly && selectedCuisines.length === 0 && (
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
          {!debouncedTerm && filteredRecipes.length === 0 && selectedCuisines.length > 0 && !showFavoritesOnly && (
            <p className="mobile-search-no-results">Keine Rezepte für diesen Kulinariktyp</p>
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
        </div>

        {/* Favorites filter – directly below the carousel */}
        <div className="mobile-search-favorites-row">
          <button
            className={`mobile-search-filter-pill${showFavoritesOnly ? ' active' : ''}`}
            onClick={() => {
              const newValue = !showFavoritesOnly;
              setShowFavoritesOnly(newValue);
              onFavoritesToggle?.(newValue);
            }}
            aria-pressed={showFavoritesOnly}
            title={showFavoritesOnly ? 'Alle Rezepte anzeigen' : 'Nur Favoriten anzeigen'}
          >
            ★ Favoriten
          </button>
        </div>

        {/* Kulinariktypen – two-row horizontal carousel below the favorites filter */}
        {visibleCuisinePills.length > 0 && (
          <div className="mobile-search-cuisine-grid">
            {visibleCuisinePills.map((name) => (
              <button
                key={name}
                className={`mobile-search-filter-pill mobile-search-cuisine-pill${selectedCuisines.includes(name) ? ' active' : ''}`}
                onClick={() => handleCuisinePillClick(name)}
                aria-pressed={selectedCuisines.includes(name)}
                title={selectedCuisines.includes(name) ? 'Filter aufheben' : `Nach ${name} filtern`}
              >
                {name}
              </button>
            ))}
          </div>
        )}

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

import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import './RecipeList.css';
import { canEditRecipes, getUsers } from '../utils/userManagement';
import { groupRecipesByParent, sortRecipeVersions } from '../utils/recipeVersioning';
import { getUserFavorites } from '../utils/userFavorites';
import { getCustomLists, getButtonIcons, DEFAULT_BUTTON_ICONS } from '../utils/customLists';
import { isBase64Image } from '../utils/imageUtils';
import RecipeRating from './RecipeRating';
import { getRecipeCalls } from '../utils/recipeCallsFirestore';

const SORT_MODES = [
  { id: 'alphabetical', label: 'Alphabetisch' },
  { id: 'trending', label: 'Im Trend' },
  { id: 'new', label: 'Neue Rezepte' },
  { id: 'score', label: 'Nach Bewertung' },
];

const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

function isNewRecipe(recipe) {
  const ts = getTimestampMs(recipe?.createdAt);
  return ts > 0 && Date.now() - ts <= ONE_MONTH_MS;
}

const SCORE_M = 5; // Minimum number of ratings for full weighting in Bayesian score

function getTimestampMs(ts) {
  if (!ts) return 0;
  if (typeof ts.toDate === 'function') return ts.toDate().getTime();
  return new Date(ts).getTime();
}

function getEmptyStateMessage(showFavoritesOnly, sortMode) {
  if (showFavoritesOnly) return 'Keine favorisierten Rezepte!';
  if (sortMode === 'new') return 'Keine neuen Rezepte!';
  if (sortMode === 'trending') return 'Keine Trend-Rezepte!';
  return 'Noch keine Rezepte!';
}

function getEmptyStateHint(showFavoritesOnly, sortMode) {
  if (showFavoritesOnly) return 'Markieren Sie Rezepte als Favoriten, um sie schnell zu finden';
  if (sortMode === 'new') return 'Im letzten Monat wurden keine neuen Rezepte hinzugefügt.';
  if (sortMode === 'trending') return 'In den letzten 30 Tagen wurden keine Rezepte aufgerufen.';
  return 'Das kannst du ändern, lege direkt ein Rezept an.';
}

function RecipeList({ recipes, onSelectRecipe, onAddRecipe, categoryFilter, currentUser, onCategoryFilterChange, searchTerm, onOpenFilterPage, activePrivateListName, activePrivateListId }) {
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [sortMode, setSortMode] = useState('trending');
  const [allUsers, setAllUsers] = useState([]);
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [customLists, setCustomLists] = useState({ mealCategories: [] });
  const [buttonIcons, setButtonIcons] = useState({
    filterButton: DEFAULT_BUTTON_ICONS.filterButton
  });
  const [recipeCalls, setRecipeCalls] = useState([]);
  const [swiperExpanded, setSwiperExpanded] = useState(false);
  const [previewMode, setPreviewMode] = useState(null);
  const swiperRef = useRef(null);
  const touchStartXRef = useRef(null);
  const didSwipeRef = useRef(false);
  const hasMovedRef = useRef(false);

  // Collapse swiper when user clicks/touches outside of it
  useEffect(() => {
    if (!swiperExpanded) return;
    const handleOutside = (e) => {
      if (swiperRef.current && !swiperRef.current.contains(e.target)) {
        setSwiperExpanded(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [swiperExpanded]);

  const handleSwiperTouchStart = useCallback((e) => {
    touchStartXRef.current = e.touches[0].clientX;
    didSwipeRef.current = false;
    hasMovedRef.current = false;
    setPreviewMode(null);
  }, []);

  const handleSwiperTouchMove = useCallback((e) => {
    if (touchStartXRef.current === null) return;
    const deltaX = e.touches[0].clientX - touchStartXRef.current;
    if (Math.abs(deltaX) > 10 && !hasMovedRef.current) {
      setSwiperExpanded(true);
      hasMovedRef.current = true;
    }

    if (swiperRef.current) {
      const touch = e.touches[0];
      const buttons = swiperRef.current.querySelectorAll('.sort-swiper-item');
      let hoveredMode = null;
      buttons.forEach(button => {
        const rect = button.getBoundingClientRect();
        if (touch.clientX >= rect.left && touch.clientX <= rect.right &&
            touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
          hoveredMode = button.getAttribute('data-mode-id');
        }
      });
      setPreviewMode(hoveredMode);
    }
  }, []);

  const handleSwiperTouchEnd = useCallback((e) => {
    if (touchStartXRef.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
    touchStartXRef.current = null;

    if (previewMode) {
      didSwipeRef.current = true;
      setSortMode(previewMode);
      setPreviewMode(null);
      setSwiperExpanded(false);
      return;
    }

    if (Math.abs(deltaX) >= 50) {
      didSwipeRef.current = true;
      setSortMode((prev) => {
        const currentIndex = SORT_MODES.findIndex(m => m.id === prev);
        if (deltaX < 0) {
          return SORT_MODES[(currentIndex + 1) % SORT_MODES.length].id;
        } else {
          return SORT_MODES[(currentIndex - 1 + SORT_MODES.length) % SORT_MODES.length].id;
        }
      });
      setSwiperExpanded(false);
    }
  }, [previewMode]);

  const handleSwiperItemClick = useCallback((e, modeId) => {
    e.stopPropagation();
    if (didSwipeRef.current) {
      didSwipeRef.current = false;
      return;
    }
    if (!swiperExpanded) {
      setSwiperExpanded(true);
    } else {
      setSortMode(modeId);
      setSwiperExpanded(false);
    }
  }, [swiperExpanded]);

  const handleSwiperContainerClick = useCallback(() => {
    if (!swiperExpanded) setSwiperExpanded(true);
  }, [swiperExpanded]);

  // Keep the active pill horizontally centered on screen when the swiper is expanded
  useLayoutEffect(() => {
    const swiper = swiperRef.current;
    if (!swiper) return;
    if (!swiperExpanded) {
      swiper.style.transform = '';
      return;
    }
    const activeId = previewMode || sortMode;
    const activeButton = swiper.querySelector(`[data-mode-id="${activeId}"]`);
    if (!activeButton) return;
    const swiperWidth = swiper.offsetWidth;
    const activeLeft = activeButton.offsetLeft;
    const activeWidth = activeButton.offsetWidth;
    const offset = swiperWidth / 2 - (activeLeft + activeWidth / 2);
    swiper.style.transform = `translateX(calc(-50% + ${offset}px))`;
  }, [swiperExpanded, sortMode, previewMode]);

  // Load all recipe calls once on mount for trending sort
  useEffect(() => {
    const loadRecipeCalls = async () => {
      try {
        const calls = await getRecipeCalls();
        setRecipeCalls(calls);
      } catch (error) {
        console.error('Error loading recipe calls:', error);
        setRecipeCalls([]);
      }
    };
    loadRecipeCalls();
  }, []);

  // Load all users once on mount
  useEffect(() => {
    const loadUsers = async () => {
      const users = await getUsers();
      setAllUsers(users);
    };
    loadUsers();
  }, []);

  // Load custom lists (meal categories) on mount
  useEffect(() => {
    const loadCustomLists = async () => {
      try {
        const lists = await getCustomLists();
        setCustomLists(lists);
      } catch (error) {
        console.error('Error loading custom lists:', error);
        // Set to empty on error, component will still work
        setCustomLists({ mealCategories: [] });
      }
    };
    loadCustomLists();
  }, []);

  // Load button icons on mount
  useEffect(() => {
    const loadButtonIcons = async () => {
      try {
        const icons = await getButtonIcons();
        setButtonIcons(icons);
      } catch (error) {
        console.error('Error loading button icons:', error);
        // Keep default values if loading fails
      }
    };
    loadButtonIcons();
  }, []);

  // Load favorite IDs when user changes or recipes change
  useEffect(() => {
    const loadFavorites = async () => {
      if (currentUser?.id) {
        const favorites = await getUserFavorites(currentUser.id);
        setFavoriteIds(favorites);
      } else {
        setFavoriteIds([]);
      }
    };
    loadFavorites();
  }, [currentUser?.id]);

  // Generate dynamic heading based on filters
  const getHeading = () => {
    if (activePrivateListName) {
      return activePrivateListName;
    }
    const prefix = showFavoritesOnly ? 'Meine ' : '';
    const category = categoryFilter || 'Rezepte';
    return `${prefix}${category}`;
  };

  const userCanEdit = canEditRecipes(currentUser);

  // Group recipes by parent first, memoized so the reference is stable between renders
  const allRecipeGroups = useMemo(() => groupRecipesByParent(recipes), [recipes]);

  // Build a map of recipeId -> call count from the last 30 days only
  const recentViewCountMap = useMemo(() => {
    const map = {};
    const cutoff = Date.now() - ONE_MONTH_MS;
    recipeCalls.forEach(call => {
      if (!call.recipeId) return;
      const ts = getTimestampMs(call.timestamp);
      if (ts > 0 && ts >= cutoff) {
        map[call.recipeId] = (map[call.recipeId] || 0) + 1;
      }
    });
    return map;
  }, [recipeCalls]);

  // Filter and sort recipe groups with memoization for performance
  const recipeGroups = useMemo(() => {
    // Filter groups based on favorites if enabled
    let filteredGroups = showFavoritesOnly
      ? allRecipeGroups.filter(group => group.allRecipes.some(r => favoriteIds.includes(r.id)))
      : allRecipeGroups;

    // Filter to only recipes from the last month when in "new" mode
    if (sortMode === 'new') {
      filteredGroups = filteredGroups.filter(group =>
        group.allRecipes.some(r => isNewRecipe(r))
      );
    }

    // Filter to only recipes with at least one call in the last 30 days in "trending" mode
    if (sortMode === 'trending') {
      filteredGroups = filteredGroups.filter(group =>
        group.allRecipes.some(r => (recentViewCountMap[r.id] || 0) > 0)
      );
    }

    // Filter by search term
    if (searchTerm && searchTerm.trim()) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      filteredGroups = filteredGroups.filter(group => {
        // Search in any recipe title within the group
        return group.allRecipes.some(recipe => 
          recipe.title?.toLowerCase().includes(lowerSearchTerm)
        );
      });
    }

    // Compute global average rating C for Bayesian score (across all recipe groups)
    const ratedRecipes = allRecipeGroups
      .map(g => g.primaryRecipe)
      .filter(r => r && r.ratingCount > 0 && r.ratingAvg != null);
    const globalAvgC = ratedRecipes.length > 0
      ? ratedRecipes.reduce((sum, r) => sum + r.ratingAvg, 0) / ratedRecipes.length
      : 0;

    const getBayesianScore = (recipe) => {
      const v = recipe?.ratingCount || 0;
      const R = recipe?.ratingAvg || 0;
      return (v / (v + SCORE_M)) * R + (SCORE_M / (v + SCORE_M)) * globalAvgC;
    };

    // Shared tiebreaker: alphabetical A–Z, then newest first
    const compareTitleAndDate = (recipeA, recipeB) => {
      const titleA = recipeA?.title?.toLowerCase() || '';
      const titleB = recipeB?.title?.toLowerCase() || '';
      const titleCompare = titleA.localeCompare(titleB);
      if (titleCompare !== 0) return titleCompare;
      return getTimestampMs(recipeB?.createdAt) - getTimestampMs(recipeA?.createdAt);
    };

    // Sort groups by selected sort mode (use spread to avoid mutating source array)
    return [...filteredGroups].sort((a, b) => {
      const recipeA = a.primaryRecipe;
      const recipeB = b.primaryRecipe;

      if (sortMode === 'trending') {
        // 1. View count descending (sum across all recipes in each group, last 30 days only)
        const groupViewCountA = a.allRecipes.reduce((sum, r) => sum + (recentViewCountMap[r.id] || 0), 0);
        const groupViewCountB = b.allRecipes.reduce((sum, r) => sum + (recentViewCountMap[r.id] || 0), 0);
        if (groupViewCountA !== groupViewCountB) return groupViewCountB - groupViewCountA;
        // 2+3. Title alphabetical A–Z, then newest first
        return compareTitleAndDate(recipeA, recipeB);
      } else if (sortMode === 'score') {
        // 1. Bayesian score descending (highest first)
        const scoreA = getBayesianScore(recipeA);
        const scoreB = getBayesianScore(recipeB);
        const scoreDiff = scoreB - scoreA;
        if (Math.abs(scoreDiff) > 1e-9) return scoreDiff;
        // 2+3. Title alphabetical A–Z, then newest first
        return compareTitleAndDate(recipeA, recipeB);
      } else if (sortMode === 'new') {
        // 1. Newest first (createdAt descending)
        const dateA = getTimestampMs(recipeA?.createdAt);
        const dateB = getTimestampMs(recipeB?.createdAt);
        if (dateA !== dateB) return dateB - dateA;
        // 2. Alphabetical A–Z
        const titleA = recipeA?.title?.toLowerCase() || '';
        const titleB = recipeB?.title?.toLowerCase() || '';
        return titleA.localeCompare(titleB);
      } else {
        // alphabetical: title A–Z, then newest first
        return compareTitleAndDate(recipeA, recipeB);
      }
    });
  }, [allRecipeGroups, showFavoritesOnly, favoriteIds, searchTerm, sortMode, recentViewCountMap]);

  const handleRecipeClick = (group) => {
    // Select the recipe that is at the top according to current sorting order
    // This ensures consistency between the overview and detail view
    const sortedVersions = sortRecipeVersions(group.allRecipes, currentUser?.id, (userId, recipeId) => favoriteIds.includes(recipeId), recipes);
    const topRecipe = sortedVersions[0] || group.primaryRecipe;
    onSelectRecipe(topRecipe);
  };

  // Helper function to get author name
  const getAuthorName = (authorId) => {
    if (!authorId) return null;
    const author = allUsers.find(u => u.id === authorId);
    if (!author) return null;
    return author.vorname;
  };

  return (
    <div className="recipe-list-container">
      <div className="recipe-list-header">
        <h2>{getHeading()}</h2>
        <div className="recipe-list-actions">
          <div className="filter-group">
            {onOpenFilterPage && (
              <button 
                className="filter-button"
                onClick={onOpenFilterPage}
                title="Weitere Filter"
              >
                {isBase64Image(buttonIcons.filterButton) ? (
                  <img src={buttonIcons.filterButton} alt="Filter" className="button-icon-image" />
                ) : (
                  buttonIcons.filterButton
                )}
              </button>
            )}
            {onCategoryFilterChange && (
              <select
                className="category-filter-select"
                value={categoryFilter}
                onChange={(e) => onCategoryFilterChange(e.target.value)}
                title="Nach Kategorie filtern"
              >
                <option value="">Alle Kategorien</option>
                {customLists.mealCategories.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            )}
            <button 
              className={`favorites-filter-button ${showFavoritesOnly ? 'active' : ''}`}
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              title={showFavoritesOnly ? 'Alle Rezepte anzeigen' : 'Nur Favoriten anzeigen'}
            >
              ★ Favoriten
            </button>
          </div>
          {userCanEdit && activePrivateListId ? (
            <button className="add-button" onClick={() => onAddRecipe(activePrivateListId)}>
              + Privates Rezept hinzufügen
            </button>
          ) : userCanEdit && (
            <button className="add-button" onClick={() => onAddRecipe()}>
              + Rezept hinzufügen
            </button>
          )}
        </div>
      </div>
      
      {recipeGroups.length === 0 ? (
        <div className="empty-state">
          <p>{getEmptyStateMessage(showFavoritesOnly, sortMode)}</p>
          <p className="empty-hint">
            {getEmptyStateHint(showFavoritesOnly, sortMode)}
          </p>
        </div>
      ) : (
        <div className="recipe-grid">
          {recipeGroups.map(group => {
            // Sort versions to get the one that should be displayed first
            const sortedVersions = sortRecipeVersions(group.allRecipes, currentUser?.id, (userId, recipeId) => favoriteIds.includes(recipeId), recipes);
            const recipe = sortedVersions[0] || group.primaryRecipe;
            const isFavorite = favoriteIds.includes(recipe.id);
            const authorName = getAuthorName(recipe.authorId);
            return (
              <div
                key={recipe.id}
                className="recipe-card"
                onClick={() => handleRecipeClick(group)}
              >
                {isFavorite && (
                  <div className="favorite-badge">★</div>
                )}
                {isNewRecipe(recipe) && (
                  <div className="new-badge">Neu</div>
                )}

                {recipe.image && (
                  <div className="recipe-image">
                    <img src={recipe.image} alt={recipe.title} />
                  </div>
                )}
                <div className="recipe-card-content">
                  <h3>{recipe.title}</h3>
                  {recipe.kulinarik && (Array.isArray(recipe.kulinarik) ? recipe.kulinarik.length > 0 : recipe.kulinarik.trim().length > 0) && (
                    <div className="recipe-kulinarik">
                      {Array.isArray(recipe.kulinarik)
                        ? recipe.kulinarik.map((k, i) => (
                            <span key={i} className="kulinarik-tag">{k}</span>
                          ))
                        : <span className="kulinarik-tag">{recipe.kulinarik}</span>
                      }
                    </div>
                  )}
                  <div className="recipe-footer">
                    {authorName && (
                      <div className="recipe-author">{authorName}</div>
                    )}
                    {group.versionCount > 1 && (
                      <div className="version-count">
                        {group.versionCount} Versionen
                      </div>
                    )}
                    <RecipeRating
                      recipeId={recipe.id}
                      ratingAvg={recipe.ratingAvg}
                      ratingCount={recipe.ratingCount}
                      currentUser={currentUser}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div
        className={`sort-swiper${swiperExpanded ? ' expanded' : ''}`}
        aria-label="Sortierung wählen"
        ref={swiperRef}
        onTouchStart={handleSwiperTouchStart}
        onTouchMove={handleSwiperTouchMove}
        onTouchEnd={handleSwiperTouchEnd}
        onClick={handleSwiperContainerClick}
      >
        <div className="sort-swiper-track">
          {SORT_MODES.map((mode) => (
            <button
              key={mode.id}
              data-mode-id={mode.id}
              className={`sort-swiper-item${
                (previewMode === mode.id || (!previewMode && sortMode === mode.id)) ? ' active' : ''
              }`}
              onClick={(e) => handleSwiperItemClick(e, mode.id)}
              aria-pressed={sortMode === mode.id}
              tabIndex={swiperExpanded || mode.id === sortMode ? 0 : -1}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default RecipeList;

import React, { useState, useEffect, useMemo, useRef } from 'react';
import './RecipeList.css';
import { canEditRecipes, getUsers } from '../utils/userManagement';
import { groupRecipesByParent, sortRecipeVersions } from '../utils/recipeVersioning';
import { getUserFavorites } from '../utils/userFavorites';
import { getCustomLists, getButtonIcons, DEFAULT_BUTTON_ICONS } from '../utils/customLists';
import { isBase64Image } from '../utils/imageUtils';
import RecipeRating from './RecipeRating';
import { getRecipeCalls } from '../utils/recipeCallsFirestore';

const SORT_MODES = [
  { id: 'trending', label: 'Im Trend' },
  { id: 'alphabetical', label: 'Alphabetisch' },
  { id: 'score', label: 'Nach Score' },
  { id: 'new', label: 'Neue Rezepte' },
];

const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

function isNewRecipe(recipe) {
  const ts = getTimestampMs(recipe?.createdAt);
  return ts > 0 && Date.now() - ts <= ONE_MONTH_MS;
}

const SCORE_M = 5; // Minimum number of ratings for full weighting in Bayesian score
const SWIPER_ITEM_TOTAL = 154; // 130px item + 2×12px margin = total slot width for scroll math
const SCROLL_SNAP_THRESHOLD = 5; // px – minimum distance before programmatic scroll is triggered
const HAPTIC_SNAP_MS = 10; // vibration duration on snap/menu open (ms)
const HAPTIC_HOVER_MS = 5; // vibration duration on long-press option hover (ms)

function getTimestampMs(ts) {
  if (!ts) return 0;
  if (typeof ts.toDate === 'function') return ts.toDate().getTime();
  return new Date(ts).getTime();
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
  const trackRef = useRef(null);
  const itemRefs = useRef([]);
  const scrollEndTimer = useRef(null);
  const longPressTimer = useRef(null);
  const longPressMenuOpenRef = useRef(false);
  const highlightedModeRef = useRef(null);
  const touchMoved = useRef(false);
  const sortModeRef = useRef('trending');
  const swiperRef = useRef(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartScrollLeft = useRef(0);

  const [longPressMenuVisible, setLongPressMenuVisible] = useState(false);
  const [highlightedMode, setHighlightedMode] = useState(null);
  const [swiperExpanded, setSwiperExpanded] = useState(false);
  const collapseTimerRef = useRef(null);
  
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

  // Keep sortModeRef in sync for use in non-reactive callbacks
  useEffect(() => {
    sortModeRef.current = sortMode;
  }, [sortMode]);

  // Sync sortMode → scroll position and update progressive scaling
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const idx = SORT_MODES.findIndex(m => m.id === sortMode);
    const targetScroll = idx * SWIPER_ITEM_TOTAL;
    if (typeof track.scrollTo === 'function' && Math.abs(track.scrollLeft - targetScroll) > SCROLL_SNAP_THRESHOLD) {
      track.scrollTo({ left: targetScroll, behavior: 'smooth' });
    }
    SORT_MODES.forEach((_, i) => {
      const item = itemRefs.current[i];
      if (!item) return;
      const distance = Math.abs(track.scrollLeft - i * SWIPER_ITEM_TOTAL);
      const normalized = Math.min(distance / SWIPER_ITEM_TOTAL, 1);
      item.style.transform = `scale(${1 - normalized * 0.3})`;
      item.style.opacity = Math.max(0.4, 1 - normalized * 0.6);
    });
  }, [sortMode]);

  // Attach non-passive touchmove listener for long-press menu navigation
  useEffect(() => {
    const swiper = swiperRef.current;
    if (!swiper) return;
    const handleTouchMoveDirect = (e) => {
      if (!longPressMenuOpenRef.current) return;
      e.preventDefault();
      const touch = e.touches[0];
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const menuItem = el?.closest('[data-mode-id]');
      if (menuItem) {
        const modeId = menuItem.dataset.modeId;
        if (modeId && modeId !== highlightedModeRef.current) {
          navigator.vibrate?.(HAPTIC_HOVER_MS);
          highlightedModeRef.current = modeId;
          setHighlightedMode(modeId);
        }
      }
    };
    swiper.addEventListener('touchmove', handleTouchMoveDirect, { passive: false });
    return () => swiper.removeEventListener('touchmove', handleTouchMoveDirect);
  }, []);

  // Clean up collapse timer on unmount to prevent state updates on unmounted component
  useEffect(() => {
    return () => clearTimeout(collapseTimerRef.current);
  }, []);

  // Mouse drag support for desktop
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging.current || !trackRef.current) return;
      trackRef.current.scrollLeft = dragStartScrollLeft.current + (dragStartX.current - e.clientX);
    };
    const handleMouseUp = () => {
      isDragging.current = false;
      collapseTimerRef.current = setTimeout(() => setSwiperExpanded(false), 500);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);
  
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

  // Build a map of recipeId -> total call count from all users
  const viewCountMap = useMemo(() => {
    const map = {};
    recipeCalls.forEach(call => {
      if (call.recipeId) {
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
        // 1. View count descending (sum across all recipes in each group)
        const groupViewCountA = a.allRecipes.reduce((sum, r) => sum + (viewCountMap[r.id] || 0), 0);
        const groupViewCountB = b.allRecipes.reduce((sum, r) => sum + (viewCountMap[r.id] || 0), 0);
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
  }, [allRecipeGroups, showFavoritesOnly, favoriteIds, searchTerm, sortMode, viewCountMap]);

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

  const activeSortIndex = SORT_MODES.findIndex(m => m.id === sortMode);

  // Scroll handler: progressive scaling + debounced snap detection
  const handleTrackScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    const scrollLeft = track.scrollLeft;
    SORT_MODES.forEach((_, i) => {
      const item = itemRefs.current[i];
      if (!item) return;
      const distance = Math.abs(scrollLeft - i * SWIPER_ITEM_TOTAL);
      const normalized = Math.min(distance / SWIPER_ITEM_TOTAL, 1);
      item.style.transform = `scale(${1 - normalized * 0.3})`;
      item.style.opacity = Math.max(0.4, 1 - normalized * 0.6);
    });
    clearTimeout(scrollEndTimer.current);
    scrollEndTimer.current = setTimeout(() => {
      const newIdx = Math.max(0, Math.min(SORT_MODES.length - 1, Math.round(track.scrollLeft / SWIPER_ITEM_TOTAL)));
      const newMode = SORT_MODES[newIdx].id;
      if (newMode !== sortModeRef.current) {
        navigator.vibrate?.(HAPTIC_SNAP_MS);
        setSortMode(newMode);
      }
    }, 100);
  };

  // Touch start: expand swiper and begin long-press timer
  const handleSwiperTouchStart = () => {
    clearTimeout(collapseTimerRef.current);
    setSwiperExpanded(true);
    touchMoved.current = false;
    clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      if (!touchMoved.current) {
        longPressMenuOpenRef.current = true;
        highlightedModeRef.current = sortModeRef.current;
        navigator.vibrate?.(HAPTIC_SNAP_MS);
        setHighlightedMode(sortModeRef.current);
        setLongPressMenuVisible(true);
      }
    }, 500);
  };

  // Touch move (React synthetic): cancel long-press on significant move
  const handleSwiperTouchMoveReact = () => {
    if (!longPressMenuOpenRef.current) {
      touchMoved.current = true;
      clearTimeout(longPressTimer.current);
    }
  };

  // Touch end: commit long-press selection and schedule swiper collapse
  const handleSwiperTouchEnd = () => {
    clearTimeout(longPressTimer.current);
    if (longPressMenuOpenRef.current) {
      if (highlightedModeRef.current) {
        setSortMode(highlightedModeRef.current);
      }
      setLongPressMenuVisible(false);
      longPressMenuOpenRef.current = false;
      setHighlightedMode(null);
      highlightedModeRef.current = null;
    }
    collapseTimerRef.current = setTimeout(() => setSwiperExpanded(false), 500);
  };

  // Mouse down: start drag for desktop and expand swiper
  const handleTrackMouseDown = (e) => {
    clearTimeout(collapseTimerRef.current);
    setSwiperExpanded(true);
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartScrollLeft.current = trackRef.current?.scrollLeft ?? 0;
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
          <p>{showFavoritesOnly ? 'Keine favorisierten Rezepte!' : sortMode === 'new' ? 'Keine neuen Rezepte!' : 'Noch keine Rezepte!'}</p>
          <p className="empty-hint">
            {showFavoritesOnly 
              ? 'Markieren Sie Rezepte als Favoriten, um sie schnell zu finden'
              : sortMode === 'new'
              ? 'Im letzten Monat wurden keine neuen Rezepte hinzugefügt.'
              : 'Das kannst du ändern, lege direkt ein Rezept an.'}
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
        ref={swiperRef}
        onTouchStart={handleSwiperTouchStart}
        onTouchMove={handleSwiperTouchMoveReact}
        onTouchEnd={handleSwiperTouchEnd}
        aria-label="Sortierung wählen"
      >
        <div
          className="sort-swiper-track"
          ref={trackRef}
          onScroll={handleTrackScroll}
          onMouseDown={handleTrackMouseDown}
        >
          <div className="sort-swiper-spacer" aria-hidden="true" />
          {SORT_MODES.map((mode, index) => (
            <button
              key={mode.id}
              ref={el => { itemRefs.current[index] = el; }}
              className={`sort-swiper-item${sortMode === mode.id ? ' active' : ''}`}
              onClick={() => setSortMode(mode.id)}
              aria-pressed={sortMode === mode.id}
            >
              {mode.label}
              <span className="sort-swiper-dot" aria-hidden="true" />
            </button>
          ))}
          <div className="sort-swiper-spacer" aria-hidden="true" />
        </div>
        {longPressMenuVisible && (
          <div className="sort-swiper-longpress-menu" role="menu" aria-label="Sortieroption wählen">
            {SORT_MODES.map((mode) => (
              <div
                key={mode.id}
                className={`sort-swiper-longpress-item${highlightedMode === mode.id ? ' highlighted' : ''}`}
                data-mode-id={mode.id}
                role="menuitem"
              >
                {mode.label}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default RecipeList;

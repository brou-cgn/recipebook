import React, { useState, useEffect, useMemo, useRef } from 'react';
import './RecipeList.css';
import { canEditRecipes, getUsers } from '../utils/userManagement';
import { groupRecipesByParent, sortRecipeVersions } from '../utils/recipeVersioning';
import { getUserFavorites } from '../utils/userFavorites';
import { getCustomLists, getButtonIcons, DEFAULT_BUTTON_ICONS, getEffectiveIcon, getDarkModePreference, getSortSettings, DEFAULT_TRENDING_DAYS, DEFAULT_TRENDING_MIN_VIEWS, DEFAULT_NEW_RECIPE_DAYS, DEFAULT_RATING_MIN_VOTES } from '../utils/customLists';
import { isBase64Image } from '../utils/imageUtils';
import SortCarousel from './SortCarousel';
import { getRecentRecipeCalls } from '../utils/recipeCallsFirestore';
import RecipeCard from './RecipeCard';

export function isNewRecipe(recipe, sortSettings) {
  if (!recipe?.createdAt && !recipe?.publishedAt) return false;
  const days = sortSettings?.newRecipeDays ?? DEFAULT_NEW_RECIPE_DAYS;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const ts = recipe.publishedAt || recipe.createdAt;
  const ms = typeof ts?.toDate === 'function' ? ts.toDate().getTime() : new Date(ts).getTime();
  return ms >= cutoff;
}

function sortRecipeGroups(groups, sortType, sortSettings, viewCounts) {
  const toMs = (ts) => {
    if (!ts) return 0;
    if (typeof ts.toDate === 'function') return ts.toDate().getTime();
    return new Date(ts).getTime();
  };

  const sorted = [...groups];

  if (sortType === 'alphabetical') {
    sorted.sort((a, b) => {
      const titleA = a.primaryRecipe?.title?.toLowerCase() || '';
      const titleB = b.primaryRecipe?.title?.toLowerCase() || '';
      const cmp = titleA.localeCompare(titleB);
      if (cmp !== 0) return cmp;
      return toMs(a.primaryRecipe?.createdAt) - toMs(b.primaryRecipe?.createdAt);
    });
    return sorted;
  } else if (sortType === 'newest') {
    const days = sortSettings?.newRecipeDays ?? DEFAULT_NEW_RECIPE_DAYS;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const effectiveMs = (recipe) => toMs(recipe?.publishedAt || recipe?.createdAt);
    const filtered = sorted.filter(g => effectiveMs(g.primaryRecipe) >= cutoff);
    filtered.sort((a, b) => {
      const dateDiff = effectiveMs(b.primaryRecipe) - effectiveMs(a.primaryRecipe);
      if (dateDiff !== 0) return dateDiff;
      const titleA = a.primaryRecipe?.title?.toLowerCase() || '';
      const titleB = b.primaryRecipe?.title?.toLowerCase() || '';
      return titleA.localeCompare(titleB);
    });
    return filtered;
  } else if (sortType === 'rating') {
    const m = sortSettings?.ratingMinVotes ?? DEFAULT_RATING_MIN_VOTES;
    const recipesWithRatings = groups.filter(g => (g.primaryRecipe?.ratingCount || 0) > 0);
    const C = recipesWithRatings.length > 0
      ? recipesWithRatings.reduce((sum, g) => sum + (g.primaryRecipe?.ratingAvg || 0), 0) / recipesWithRatings.length
      : 0;
    const score = (recipe) => {
      const v = recipe?.ratingCount || 0;
      const R = recipe?.ratingAvg || 0;
      return (v / (v + m)) * R + (m / (v + m)) * C;
    };
    sorted.sort((a, b) => score(b.primaryRecipe) - score(a.primaryRecipe));
    return sorted;
  } else if (sortType === 'trending') {
    const minViews = sortSettings?.trendingMinViews ?? DEFAULT_TRENDING_MIN_VIEWS;
    const getViewCount = (g) => viewCounts?.get(g.primaryRecipe?.id) || 0;
    const filtered = sorted.filter(g => getViewCount(g) >= minViews);
    filtered.sort((a, b) => {
      const countDiff = getViewCount(b) - getViewCount(a);
      if (countDiff !== 0) return countDiff;
      const titleA = a.primaryRecipe?.title?.toLowerCase() || '';
      const titleB = b.primaryRecipe?.title?.toLowerCase() || '';
      const cmp = titleA.localeCompare(titleB);
      if (cmp !== 0) return cmp;
      return toMs(a.primaryRecipe?.createdAt) - toMs(b.primaryRecipe?.createdAt);
    });
    return filtered;
  }
  return sorted;
}

const SORT_STORAGE_KEY = 'recipebook_active_sort';
const LONG_PRESS_DELAY_MS = 500;
const LONG_PRESS_CLICK_SUPPRESSION_MS = 500;

function RecipeList({ recipes, onSelectRecipe, onAddRecipe, categoryFilter, currentUser, onCategoryFilterChange, searchTerm, onOpenSearch, onClearSearch, activePrivateListName, activePrivateListId, activeFilters, onClearCuisineFilter, onClearAllFilters, showFavoritesOnly: showFavoritesOnlyProp, onShowFavoritesOnlyChange, privateLists, onAddToPrivateList, onRemoveFromPrivateList, publicGroupId, onMoveRecipeToPublic }) {
  const hasActiveFilters = !!(searchTerm?.trim() || showFavoritesOnlyProp || (activeFilters && (
    activeFilters.selectedGroup ||
    activeFilters.selectedCuisines?.length > 0 ||
    activeFilters.selectedAuthors?.length > 0 ||
    activeFilters.selectedPrivateLists?.length > 0
  )));
  const [internalShowFavoritesOnly, setInternalShowFavoritesOnly] = useState(false);
  const isControlled = showFavoritesOnlyProp !== undefined;
  const showFavoritesOnly = isControlled ? showFavoritesOnlyProp : internalShowFavoritesOnly;
  const setShowFavoritesOnly = (value) => {
    const newValue = typeof value === 'function' ? value(showFavoritesOnly) : value;
    if (isControlled) {
      onShowFavoritesOnlyChange?.(newValue);
    } else {
      setInternalShowFavoritesOnly(newValue);
    }
  };
  const [addPressed, setAddPressed] = useState(false);
  const [filterPressed, setFilterPressed] = useState(false);
  const filterLongPressTimer = useRef(null);
  const filterLongPressed = useRef(false);
  const filterLongPressJustFired = useRef(false);
  const filterButtonRef = useRef(null);
  const [activeSort, setActiveSort] = useState(
    () => sessionStorage.getItem(SORT_STORAGE_KEY) || 'alphabetical'
  );
  const [carouselExpanded, setCarouselExpanded] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [customLists, setCustomLists] = useState({ mealCategories: [] });
  const [buttonIcons, setButtonIcons] = useState({ ...DEFAULT_BUTTON_ICONS });
  const [isDarkMode, setIsDarkMode] = useState(getDarkModePreference);
  const [sortSettings, setSortSettings] = useState(null);
  const [viewCounts, setViewCounts] = useState(null);
  
  // Load button icons on mount (first to minimize icon-switch delay)
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

  // Listen for dark mode changes
  useEffect(() => {
    const handler = (e) => setIsDarkMode(e.detail.isDark);
    window.addEventListener('darkModeChange', handler);
    return () => window.removeEventListener('darkModeChange', handler);
  }, []);

  // Persist carousel sort selection
  useEffect(() => {
    sessionStorage.setItem(SORT_STORAGE_KEY, activeSort);
  }, [activeSort]);

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

  // Load sort settings on mount
  useEffect(() => {
    const loadSortSettings = async () => {
      try {
        const settings = await getSortSettings();
        setSortSettings(settings);
      } catch (error) {
        console.error('Error loading sort settings:', error);
      }
    };
    loadSortSettings();
  }, []);

  // Load recent view counts when trending sort is active and settings are loaded
  useEffect(() => {
    if (activeSort !== 'trending' || sortSettings === null) return;
    let cancelled = false;
    const days = sortSettings.trendingDays ?? DEFAULT_TRENDING_DAYS;
    const loadViewCounts = async () => {
      try {
        const calls = await getRecentRecipeCalls(days);
        if (cancelled) return;
        const counts = new Map();
        calls.forEach(call => {
          if (call.recipeId) {
            counts.set(call.recipeId, (counts.get(call.recipeId) || 0) + 1);
          }
        });
        setViewCounts(counts);
      } catch (error) {
        if (!cancelled) {
          console.error('Error loading view counts:', error);
          setViewCounts(new Map());
        }
      }
    };
    loadViewCounts();
    return () => { cancelled = true; };
  }, [activeSort, sortSettings]);

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
  
  const handleFilterTouchStart = () => {
    setFilterPressed(true);
    filterLongPressed.current = false;
    filterLongPressTimer.current = setTimeout(() => {
      filterLongPressed.current = true;
    }, LONG_PRESS_DELAY_MS);
  };

  const handleFilterTouchEnd = (e) => {
    setFilterPressed(false);
    if (filterLongPressTimer.current) {
      clearTimeout(filterLongPressTimer.current);
      filterLongPressTimer.current = null;
    }
    e.preventDefault();
    if (filterLongPressed.current) {
      filterLongPressed.current = false;
      filterLongPressJustFired.current = true;
      setTimeout(() => { filterLongPressJustFired.current = false; }, LONG_PRESS_CLICK_SUPPRESSION_MS);
      onClearAllFilters?.();
    } else {
      onOpenSearch?.();
    }
  };

  const handleFilterTouchCancel = () => {
    setFilterPressed(false);
    if (filterLongPressTimer.current) {
      clearTimeout(filterLongPressTimer.current);
      filterLongPressTimer.current = null;
    }
    filterLongPressed.current = false;
  };

  const handleFilterClick = () => {
    if (filterLongPressJustFired.current) {
      filterLongPressJustFired.current = false;
      return;
    }
    onOpenSearch?.();
  };

  // Generate dynamic heading based on filters
  const getHeading = () => {
    if (activePrivateListName) {
      return activePrivateListName;
    }
    if (!categoryFilter) {
      return showFavoritesOnly ? 'Mein Kochbuch' : 'Kochbuch';
    }
    const prefix = showFavoritesOnly ? 'Meine ' : '';
    return `${prefix}${categoryFilter}`;
  };

  const userCanEdit = canEditRecipes(currentUser);

  // Group recipes by parent first
  const allRecipeGroups = groupRecipesByParent(recipes);

  // Filter and sort recipe groups with memoization for performance
  const recipeGroups = useMemo(() => {
    // Filter groups based on favorites if enabled
    let filteredGroups = showFavoritesOnly
      ? allRecipeGroups.filter(group => group.allRecipes.some(r => favoriteIds.includes(r.id)))
      : allRecipeGroups;

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

    // Sort groups based on active sort option
    return sortRecipeGroups(filteredGroups, activeSort, sortSettings, viewCounts);
  }, [allRecipeGroups, showFavoritesOnly, favoriteIds, searchTerm, activeSort, sortSettings, viewCounts]);

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

  const targetExpandedWidth = Math.min(window.innerWidth * 0.85, 320);
  const collapsedWidth = 160; // oder später dynamisch aus dem Carousel ableiten
  const widthDelta = targetExpandedWidth - collapsedWidth;
  const filterShift = carouselExpanded ? -(widthDelta / 2) : 0;
  const filterTransform = `translateX(${filterShift}px)`;
  const addShift = carouselExpanded ? window.innerWidth : 0;

  return (
    <div className="recipe-list-container">
      <div className="recipe-list-header">
        <div className="recipe-list-header-top">
          <div className="recipe-list-title-area">
            <h2>{getHeading()}</h2>
            {onCategoryFilterChange && (
              <select
                className="category-filter-arrow"
                value={categoryFilter}
                onChange={(e) => onCategoryFilterChange(e.target.value)}
                title="Nach Kategorie filtern"
                aria-label="Kategorie filtern"
              >
                <option value="">Alle Kategorien</option>
                {customLists.mealCategories.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            )}
          </div>
          <div className="recipe-list-actions">
            <div className="filter-group">
              <button 
                  ref={filterButtonRef}
                  className={`filter-button ${hasActiveFilters ? 'has-active-filters' : ''} ${filterPressed ? 'pressed' : ''}`}
                  style={{ '--filter-transform': filterTransform }}
                  onTouchStart={handleFilterTouchStart}
                  onTouchEnd={handleFilterTouchEnd}
                  onTouchCancel={handleFilterTouchCancel}
                  onClick={handleFilterClick}
                  onMouseDown={() => setFilterPressed(true)}
                  onMouseUp={() => setFilterPressed(false)}
                  onMouseLeave={() => setFilterPressed(false)}
                  title="Weitere Filter"
                >
                  {hasActiveFilters ? (
                    isBase64Image(getEffectiveIcon(buttonIcons, 'filterButtonActive', isDarkMode)) ? (
                      <img src={getEffectiveIcon(buttonIcons, 'filterButtonActive', isDarkMode)} alt="Filter aktiv" className="button-icon-image" draggable="false" />
                    ) : (
                      getEffectiveIcon(buttonIcons, 'filterButtonActive', isDarkMode)
                    )
                  ) : (
                    isBase64Image(getEffectiveIcon(buttonIcons, 'filterButton', isDarkMode)) ? (
                      <img src={getEffectiveIcon(buttonIcons, 'filterButton', isDarkMode)} alt="Filter" className="button-icon-image" draggable="false" />
                    ) : (
                      getEffectiveIcon(buttonIcons, 'filterButton', isDarkMode)
                    )
                  )}
                </button>
              {userCanEdit && (
                <>
                  {!activePrivateListId && (
                    <button
                      className={`add-icon-button ${addPressed ? 'pressed' : ''}`}
                      style={{ '--add-shift': `${addShift}px` }}
                      onClick={() => onAddRecipe()}
                      onTouchStart={() => setAddPressed(true)}
                      onTouchEnd={() => setAddPressed(false)}
                      onTouchCancel={() => setAddPressed(false)}
                      onMouseDown={() => setAddPressed(true)}
                      onMouseUp={() => setAddPressed(false)}
                      onMouseLeave={() => setAddPressed(false)}
                      title="Rezept hinzufügen"
                      aria-label="Rezept hinzufügen"
                    >
                      {isBase64Image(getEffectiveIcon(buttonIcons, 'addRecipe', isDarkMode)) ? (
                        <img src={getEffectiveIcon(buttonIcons, 'addRecipe', isDarkMode)} alt="Rezept hinzufügen" className="button-icon-image" draggable="false" />
                      ) : (
                        getEffectiveIcon(buttonIcons, 'addRecipe', isDarkMode)
                      )}
                    </button>
                  )}
                  {activePrivateListId && (
                    <button
                      className={`add-icon-button ${addPressed ? 'pressed' : ''}`}
                      style={{ '--add-shift': `${addShift}px` }}
                      onClick={() => onAddRecipe(activePrivateListId)}
                      onTouchStart={() => setAddPressed(true)}
                      onTouchEnd={() => setAddPressed(false)}
                      onTouchCancel={() => setAddPressed(false)}
                      onMouseDown={() => setAddPressed(true)}
                      onMouseUp={() => setAddPressed(false)}
                      onMouseLeave={() => setAddPressed(false)}
                      title="Privates Rezept hinzufügen"
                      aria-label="Privates Rezept hinzufügen"
                    >
                      {isBase64Image(getEffectiveIcon(buttonIcons, 'addPrivateRecipe', isDarkMode)) ? (
                        <img src={getEffectiveIcon(buttonIcons, 'addPrivateRecipe', isDarkMode)} alt="Privates Rezept hinzufügen" className="button-icon-image" draggable="false" />
                      ) : (
                        getEffectiveIcon(buttonIcons, 'addPrivateRecipe', isDarkMode)
                      )}
                    </button>
                  )}
                </>
              )}
            </div>
            {currentUser?.sortCarousel && (
              <SortCarousel activeSort={activeSort} onSortChange={setActiveSort} onExpandChange={setCarouselExpanded} />
            )}
          </div>
        </div>
      </div>
      
      {recipeGroups.length === 0 ? (
        <div className="empty-state">
          <p>{searchTerm && searchTerm.trim() ? 'Keine Rezepte gefunden!' : showFavoritesOnly ? 'Keine favorisierten Rezepte!' : 'Noch keine Rezepte!'}</p>
          <p className="empty-hint">
            {searchTerm && searchTerm.trim()
              ? `Für "${searchTerm.trim()}" wurden keine passenden Rezepte gefunden.`
              : showFavoritesOnly 
                ? 'Markieren Sie Rezepte als Favoriten, um sie schnell zu finden' 
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
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                onClick={() => handleRecipeClick(group)}
                isFavorite={isFavorite}
                favoriteActiveIcon={getEffectiveIcon(buttonIcons, 'menuFavoritesButtonActive', isDarkMode)}
                isNew={isNewRecipe(recipe, sortSettings)}
                authorName={authorName}
                versionCount={group.versionCount}
                currentUser={currentUser}
                privateLists={privateLists}
                onAddToPrivateList={onAddToPrivateList}
                onRemoveFromPrivateList={onRemoveFromPrivateList}
                swipeRightIcon={getEffectiveIcon(buttonIcons, 'recipeCardSwipeRight', isDarkMode)}
                publicGroupId={publicGroupId}
                onMoveRecipeToPublic={onMoveRecipeToPublic}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export default RecipeList;

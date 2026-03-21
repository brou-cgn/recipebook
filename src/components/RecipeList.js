import React, { useState, useEffect, useMemo, useRef } from 'react';
import './RecipeList.css';
import { canEditRecipes, getUsers } from '../utils/userManagement';
import { groupRecipesByParent, sortRecipeVersions } from '../utils/recipeVersioning';
import { getUserFavorites } from '../utils/userFavorites';
import { getCustomLists, getButtonIcons, DEFAULT_BUTTON_ICONS, getSortSettings, DEFAULT_TRENDING_DAYS, DEFAULT_TRENDING_MIN_VIEWS, DEFAULT_NEW_RECIPE_DAYS, DEFAULT_RATING_MIN_VOTES } from '../utils/customLists';
import { isBase64Image } from '../utils/imageUtils';
import RecipeRating from './RecipeRating';
import SortCarousel from './SortCarousel';
import { getRecentRecipeCalls } from '../utils/recipeCallsFirestore';
import RecipeImageCarousel from './RecipeImageCarousel';

export function isNewRecipe(recipe, sortSettings) {
  if (!recipe?.createdAt) return false;
  const days = sortSettings?.newRecipeDays ?? DEFAULT_NEW_RECIPE_DAYS;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const ts = recipe.createdAt;
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
    const filtered = sorted.filter(g => toMs(g.primaryRecipe?.createdAt) >= cutoff);
    filtered.sort((a, b) => {
      const dateDiff = toMs(b.primaryRecipe?.createdAt) - toMs(a.primaryRecipe?.createdAt);
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

function RecipeList({ recipes, onSelectRecipe, onAddRecipe, categoryFilter, currentUser, onCategoryFilterChange, searchTerm, onOpenFilterPage, onOpenSearch, activePrivateListName, activePrivateListId, activeFilters }) {
  const hasActiveFilters = !!(activeFilters && (
    activeFilters.selectedGroup ||
    activeFilters.selectedCuisines?.length > 0 ||
    activeFilters.selectedAuthors?.length > 0
  ));
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [filterVisible, setFilterVisible] = useState(true);
  const [favPressed, setFavPressed] = useState(false);
  const longPressTimer = useRef(null);
  const longPressed = useRef(false);
  const filterLongPressTimer = useRef(null);
  const filterLongPressed = useRef(false);
  const filterButtonRef = useRef(null);
  const searchButtonRef = useRef(null);
  const favButtonRef = useRef(null);
  const [activeSort, setActiveSort] = useState(
    () => sessionStorage.getItem(SORT_STORAGE_KEY) || 'alphabetical'
  );
  const [carouselExpanded, setCarouselExpanded] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [customLists, setCustomLists] = useState({ mealCategories: [] });
  const [buttonIcons, setButtonIcons] = useState({
    filterButton: DEFAULT_BUTTON_ICONS.filterButton,
    filterButtonActive: DEFAULT_BUTTON_ICONS.filterButtonActive,
    addRecipe: DEFAULT_BUTTON_ICONS.addRecipe,
    addPrivateRecipe: DEFAULT_BUTTON_ICONS.addPrivateRecipe,
  });
  const [sortSettings, setSortSettings] = useState(null);
  const [viewCounts, setViewCounts] = useState(null);
  
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
  
  // Hide filter button when touching outside it and the favorites button
  useEffect(() => {
    if (!filterVisible) return;
    const handleOutsideTouch = (e) => {
      if (
        filterButtonRef.current && !filterButtonRef.current.contains(e.target) &&
        favButtonRef.current && !favButtonRef.current.contains(e.target) &&
        (searchButtonRef.current === null || !searchButtonRef.current.contains(e.target))
      ) {
        requestAnimationFrame(() => {
          setFilterVisible(false);
        });
      }
    };
    document.addEventListener('touchstart', handleOutsideTouch, { passive: true });
    document.addEventListener('mousedown', handleOutsideTouch);
    return () => {
      document.removeEventListener('touchstart', handleOutsideTouch);
      document.removeEventListener('mousedown', handleOutsideTouch);
    };
  }, [filterVisible]);

  const handleFavTouchStart = () => {
    setFavPressed(true);
    longPressed.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressed.current = true;
      setFilterVisible(true);
    }, LONG_PRESS_DELAY_MS);
  };

  const handleFavTouchEnd = (e) => {
    setFavPressed(false);
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (longPressed.current) {
      e.preventDefault();
      setTimeout(() => {
        longPressed.current = false;
      }, 400);
    }
  };

  const handleFavTouchCancel = () => {
    setFavPressed(false);
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    longPressed.current = false;
  };

  const handleFilterTouchStart = () => {
    filterLongPressed.current = false;
    filterLongPressTimer.current = setTimeout(() => {
      filterLongPressed.current = true;
      setFilterVisible(false);
      onOpenFilterPage();
    }, LONG_PRESS_DELAY_MS);
  };

  const handleFilterTouchEnd = (e) => {
    if (filterLongPressTimer.current) {
      clearTimeout(filterLongPressTimer.current);
      filterLongPressTimer.current = null;
    }
    if (filterLongPressed.current) {
      e.preventDefault();
      setTimeout(() => {
        filterLongPressed.current = false;
      }, 400);
    }
  };

  const handleFilterTouchCancel = () => {
    if (filterLongPressTimer.current) {
      clearTimeout(filterLongPressTimer.current);
      filterLongPressTimer.current = null;
    }
    filterLongPressed.current = false;
  };

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
  const isMobile = window.innerWidth <= 768;
  const filterTransform = (filterVisible && isMobile)
    ? `translateX(${filterShift}px) translateY(-76px)`
    : `translateX(${filterShift}px)`;
  const addShift = carouselExpanded ? window.innerWidth : 0;
  
  return (
    <div className="recipe-list-container">
      <div className="recipe-list-header">
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
            {onOpenFilterPage && (
              <button 
                ref={filterButtonRef}
                className={`filter-button ${filterVisible ? 'filter-visible' : ''} ${hasActiveFilters ? 'has-active-filters' : ''}`}
                style={{ transform: filterTransform }}
                onClick={() => {
                  if (!filterLongPressed.current) {
                    setFilterVisible(false);
                    if (window.innerWidth <= 768 && onOpenSearch) {
                      onOpenSearch();
                    } else {
                      onOpenFilterPage();
                    }
                  }
                }}
                onTouchStart={handleFilterTouchStart}
                onTouchEnd={handleFilterTouchEnd}
                onTouchCancel={handleFilterTouchCancel}
                onContextMenu={(e) => e.preventDefault()}
                title="Weitere Filter"
              >
                {hasActiveFilters ? (
                  isBase64Image(buttonIcons.filterButtonActive) ? (
                    <img src={buttonIcons.filterButtonActive} alt="Filter aktiv" className="button-icon-image" />
                  ) : (
                    buttonIcons.filterButtonActive
                  )
                ) : (
                  isBase64Image(buttonIcons.filterButton) ? (
                    <img src={buttonIcons.filterButton} alt="Filter" className="button-icon-image" />
                  ) : (
                    buttonIcons.filterButton
                  )
                )}
              </button>
            )}
            {onOpenSearch && (
              <button
                ref={searchButtonRef}
                className={`mobile-search-button ${filterVisible ? 'filter-visible' : ''}`}
                style={{ transform: filterTransform }}
                onClick={() => { setFilterVisible(false); onOpenSearch(); }}
                title="Suche"
                aria-label="Suche öffnen"
              >
                🔍
              </button>
            )}
            {userCanEdit && (
              <>
                {!activePrivateListId && (
                  <button
                    className="add-icon-button"
                    style={{ transform: `translateX(${addShift}px)` }}
                    onClick={() => onAddRecipe()}
                    title="Rezept hinzufügen"
                    aria-label="Rezept hinzufügen"
                  >
                    {isBase64Image(buttonIcons.addRecipe) ? (
                      <img src={buttonIcons.addRecipe} alt="Rezept hinzufügen" className="button-icon-image" />
                    ) : (
                      buttonIcons.addRecipe
                    )}
                  </button>
                )}
                {activePrivateListId && (
                  <button
                    className="add-icon-button"
                    style={{ transform: `translateX(${addShift}px)` }}
                    onClick={() => onAddRecipe(activePrivateListId)}
                    title="Privates Rezept hinzufügen"
                    aria-label="Privates Rezept hinzufügen"
                  >
                    {isBase64Image(buttonIcons.addPrivateRecipe) ? (
                      <img src={buttonIcons.addPrivateRecipe} alt="Privates Rezept hinzufügen" className="button-icon-image" />
                    ) : (
                      buttonIcons.addPrivateRecipe
                    )}
                  </button>
                )}
              </>
            )}
            <button 
              ref={favButtonRef}
              className={`recipe-favorites-filter-button ${showFavoritesOnly ? 'active' : ''} ${favPressed ? 'pressed' : ''}`}
              style={{ '--fav-shift': `${filterShift}px` }}
              onClick={() => { if (!longPressed.current) setShowFavoritesOnly(prev => !prev); }}
              onTouchStart={handleFavTouchStart}
              onTouchEnd={handleFavTouchEnd}
              onTouchCancel={handleFavTouchCancel}
              onMouseDown={() => setFavPressed(true)}
              onMouseUp={() => setFavPressed(false)}
              onMouseLeave={() => setFavPressed(false)}
              onContextMenu={(e) => e.preventDefault()}
              title={showFavoritesOnly ? 'Alle Rezepte anzeigen' : 'Nur Favoriten anzeigen'}
            >
              ★<span className="fav-label"> Favoriten</span>
            </button>
          </div>
          {currentUser?.sortCarousel && (
            <SortCarousel activeSort={activeSort} onSortChange={setActiveSort} onExpandChange={setCarouselExpanded} />
          )}
        </div>
      </div>
      
      {recipeGroups.length === 0 ? (
        <div className="empty-state">
          <p>{showFavoritesOnly ? 'Keine favorisierten Rezepte!' : 'Noch keine Rezepte!'}</p>
          <p className="empty-hint">
            {showFavoritesOnly 
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
              <div
                key={recipe.id}
                className="recipe-card"
                onClick={() => handleRecipeClick(group)}
              >
                {isFavorite && (
                  <div className="recipe-favorite-badge">★</div>
                )}
                {isNewRecipe(recipe, sortSettings) && (
                  <div className="new-badge">Neu</div>
                )}

                {(recipe.image || (Array.isArray(recipe.images) && recipe.images.length > 0)) && (() => {
                    const allImages = Array.isArray(recipe.images) && recipe.images.length > 0
                      ? recipe.images
                      : [{ url: recipe.image, isDefault: true }];
                    const orderedImages = [
                      ...allImages.filter(img => img.isDefault),
                      ...allImages.filter(img => !img.isDefault),
                    ];
                    return (
                      <div className="recipe-image" onClick={(e) => e.stopPropagation()}>
                        <RecipeImageCarousel
                          images={orderedImages}
                          altText={recipe.title}
                          onImageClick={() => handleRecipeClick(group)}
                        />
                      </div>
                    );
                  })()}
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
    </div>
  );
}

export default RecipeList;

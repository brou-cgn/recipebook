import React, { useMemo, useState } from 'react';
import { canEditRecipes } from '../utils/userManagement';
import './RecipeFilterSidebar.css';

const COLLAPSED_STORAGE_KEY = 'recipeFilterSidebar_collapsed';
const MAX_VISIBLE_PILLS = 5;

function getStoredCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Persistent left-hand navigation for the recipe overview on larger screens.
 * Mirrors every filter offered by MobileSearchOverlay's bottom sheet (search,
 * Favoriten/Saisonal toggles, Speisekategorien, Kulinariktypen, Autoren and
 * private Listen) so desktop users get the same filtering capabilities.
 * Collapsible so it can be tucked away on desktop when not needed.
 */
function RecipeFilterSidebar({
  recipes = [],
  currentUser,
  searchTerm = '',
  onSearchChange,
  showFavoritesOnly = false,
  onFavoritesToggle,
  showSeasonalOnly = false,
  onSeasonalToggle,
  cuisineTypes = [],
  cuisineGroups = [],
  selectedCuisines = [],
  onCuisineFilterChange,
  mealCategories = [],
  selectedCategories = [],
  onMealCategoryFilterChange,
  availableAuthors = [],
  selectedAuthors = [],
  onAuthorFilterChange,
  privateLists = [],
  selectedPrivateLists = [],
  onPrivateListFilterChange,
  showPrivateListFilters = true,
  onClearAllFilters,
  onAddRecipe,
  activePrivateListId = null,
}) {
  const [collapsed, setCollapsed] = useState(getStoredCollapsed);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [showAllCuisines, setShowAllCuisines] = useState(false);
  const userCanEdit = canEditRecipes(currentUser);

  const handleAddClick = () => {
    if (activePrivateListId) {
      onAddRecipe?.(activePrivateListId);
    } else {
      onAddRecipe?.();
    }
  };

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSED_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  // Only offer categories/cuisines that actually match at least one recipe,
  // same rule MobileSearchOverlay applies for its pills. Sorted by recipe
  // count (most recipes first) so the top-5 cap below keeps the most useful
  // pills visible.
  const availableCategories = useMemo(() => {
    if (!mealCategories || mealCategories.length === 0) return [];
    const counts = {};
    recipes.forEach((recipe) => {
      const speisekategorie = Array.isArray(recipe.speisekategorie)
        ? recipe.speisekategorie
        : (recipe.speisekategorie ? [recipe.speisekategorie] : []);
      speisekategorie.forEach((c) => { counts[c] = (counts[c] || 0) + 1; });
    });
    return mealCategories
      .filter((category) => counts[category] > 0)
      .sort((a, b) => counts[b] - counts[a]);
  }, [recipes, mealCategories]);

  const cuisinePills = useMemo(() => {
    if (!cuisineTypes || cuisineTypes.length === 0) return [];
    const counts = {};
    recipes.forEach((recipe) => {
      const kulinarik = Array.isArray(recipe.kulinarik) ? recipe.kulinarik : [];
      kulinarik.forEach((k) => { counts[k] = (counts[k] || 0) + 1; });
    });
    const availableTypes = new Set(cuisineTypes.filter((type) => counts[type] > 0));
    // A group pill's count is its own recipes plus every child's, so groups
    // rank alongside standalone types by total reach rather than always
    // sorting first.
    const pillCounts = new Map();
    (cuisineGroups || []).forEach((group) => {
      const hasAvailableChild = (group.children || []).some((child) => availableTypes.has(child));
      if ((availableTypes.has(group.name) || hasAvailableChild) && !pillCounts.has(group.name)) {
        const childCount = (group.children || []).reduce((sum, child) => sum + (counts[child] || 0), 0);
        pillCounts.set(group.name, (counts[group.name] || 0) + childCount);
      }
    });
    availableTypes.forEach((type) => {
      if (!pillCounts.has(type)) {
        pillCounts.set(type, counts[type] || 0);
      }
    });
    return Array.from(pillCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
  }, [recipes, cuisineTypes, cuisineGroups]);

  // Narrow the pill lists down to whatever matches the current search term,
  // same behaviour as MobileSearchOverlay's pill carousels. Already active
  // pills are kept sorted first among the survivors.
  const trimmedSearch = searchTerm?.trim().toLowerCase() || '';

  // While searching, show every match (no cap). Otherwise cap at the top 5
  // (by recipe count); the rest stay hidden behind a "+" toggle.
  const visibleCategories = useMemo(() => {
    if (trimmedSearch) {
      return availableCategories.filter((name) => name.toLowerCase().includes(trimmedSearch));
    }
    return showAllCategories ? availableCategories : availableCategories.slice(0, MAX_VISIBLE_PILLS);
  }, [availableCategories, trimmedSearch, showAllCategories]);

  const hiddenCategoriesCount = trimmedSearch || showAllCategories
    ? 0
    : Math.max(0, availableCategories.length - MAX_VISIBLE_PILLS);

  const visibleCuisinePills = useMemo(() => {
    if (trimmedSearch) {
      return cuisinePills.filter((name) => name.toLowerCase().includes(trimmedSearch));
    }
    return showAllCuisines ? cuisinePills : cuisinePills.slice(0, MAX_VISIBLE_PILLS);
  }, [cuisinePills, trimmedSearch, showAllCuisines]);

  const hiddenCuisinesCount = trimmedSearch || showAllCuisines
    ? 0
    : Math.max(0, cuisinePills.length - MAX_VISIBLE_PILLS);

  const visibleAuthors = useMemo(() => {
    if (!trimmedSearch) return availableAuthors;
    return availableAuthors.filter((author) => author.name?.toLowerCase().includes(trimmedSearch));
  }, [availableAuthors, trimmedSearch]);

  const visiblePrivateLists = useMemo(() => {
    if (!trimmedSearch) return privateLists;
    return privateLists.filter((list) => list.name?.toLowerCase().includes(trimmedSearch));
  }, [privateLists, trimmedSearch]);

  const hasActiveFilters = !!(
    searchTerm?.trim() ||
    showFavoritesOnly ||
    showSeasonalOnly ||
    selectedCuisines.length > 0 ||
    selectedCategories.length > 0 ||
    selectedAuthors.length > 0 ||
    selectedPrivateLists.length > 0
  );

  const toggleInList = (list, value) => (
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
  );

  const handleCategoryClick = (name) => {
    onMealCategoryFilterChange?.(toggleInList(selectedCategories, name));
  };

  const handleCuisineClick = (name) => {
    onCuisineFilterChange?.(toggleInList(selectedCuisines, name));
  };

  const handleAuthorClick = (id) => {
    onAuthorFilterChange?.(toggleInList(selectedAuthors, id));
  };

  const handlePrivateListClick = (id) => {
    // Single-select, same behaviour as the mobile filter dialog
    onPrivateListFilterChange?.(selectedPrivateLists.includes(id) ? [] : [id]);
  };

  return (
    <nav
      className={`recipe-filter-sidebar${collapsed ? ' recipe-filter-sidebar--collapsed' : ''}`}
      aria-label="Rezeptfilter"
    >
      <div className="recipe-filter-sidebar-header">
        {!collapsed && userCanEdit && (
          <button
            type="button"
            className="recipe-filter-sidebar-add-button"
            onClick={handleAddClick}
            title={activePrivateListId ? 'Privates Rezept hinzufügen' : 'Rezept hinzufügen'}
            aria-label={activePrivateListId ? 'Privates Rezept hinzufügen' : 'Rezept hinzufügen'}
          >
            {activePrivateListId ? '+ Privates Rezept' : '+ Rezept'}
          </button>
        )}
        <button
          type="button"
          className="recipe-filter-sidebar-toggle"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Filter einblenden' : 'Filter ausblenden'}
          title={collapsed ? 'Filter einblenden' : 'Filter ausblenden'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            {collapsed ? <polyline points="9 6 15 12 9 18" /> : <polyline points="15 6 9 12 15 18" />}
          </svg>
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="recipe-filter-sidebar-search-group">
            <div className="recipe-filter-sidebar-search">
              <span className="recipe-filter-sidebar-search-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                type="search"
                className="recipe-filter-sidebar-search-input"
                placeholder="Rezepte durchsuchen …"
                value={searchTerm}
                onChange={(e) => onSearchChange?.(e.target.value)}
                aria-label="Rezepte durchsuchen"
              />
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                className="recipe-filter-sidebar-reset"
                onClick={onClearAllFilters}
              >
                Filter zurücksetzen
              </button>
            )}
          </div>

          <div className="recipe-filter-sidebar-section recipe-filter-sidebar-quickfilters">
            <button
              type="button"
              className={`recipe-filter-sidebar-pill recipe-filter-sidebar-pill--quick${showFavoritesOnly ? ' active' : ''}`}
              onClick={() => onFavoritesToggle?.(!showFavoritesOnly)}
              aria-pressed={showFavoritesOnly}
            >
              ★ Favoriten
            </button>
            <button
              type="button"
              className={`recipe-filter-sidebar-pill recipe-filter-sidebar-pill--quick${showSeasonalOnly ? ' active' : ''}`}
              onClick={() => onSeasonalToggle?.(!showSeasonalOnly)}
              aria-pressed={showSeasonalOnly}
            >
              Saisonal
            </button>
          </div>

          {visibleCategories.length > 0 && (
            <div className="recipe-filter-sidebar-section">
              <h3 className="recipe-filter-sidebar-heading">Kategorien</h3>
              <div className="recipe-filter-sidebar-row">
                {visibleCategories.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className={`recipe-filter-sidebar-pill${selectedCategories.includes(name) ? ' active' : ''}`}
                    onClick={() => handleCategoryClick(name)}
                    aria-pressed={selectedCategories.includes(name)}
                  >
                    {name}
                  </button>
                ))}
                {hiddenCategoriesCount > 0 && (
                  <button
                    type="button"
                    className="recipe-filter-sidebar-pill recipe-filter-sidebar-pill--more"
                    onClick={() => setShowAllCategories(true)}
                    aria-label={`${hiddenCategoriesCount} weitere Kategorien anzeigen`}
                    title="Weitere Kategorien anzeigen"
                  >
                    +{hiddenCategoriesCount}
                  </button>
                )}
                {!trimmedSearch && showAllCategories && availableCategories.length > MAX_VISIBLE_PILLS && (
                  <button
                    type="button"
                    className="recipe-filter-sidebar-pill recipe-filter-sidebar-pill--more"
                    onClick={() => setShowAllCategories(false)}
                    aria-label="Weniger Kategorien anzeigen"
                    title="Weniger Kategorien anzeigen"
                  >
                    −
                  </button>
                )}
              </div>
            </div>
          )}

          {visibleCuisinePills.length > 0 && (
            <div className="recipe-filter-sidebar-section">
              <h3 className="recipe-filter-sidebar-heading">Küche</h3>
              <div className="recipe-filter-sidebar-row">
                {visibleCuisinePills.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className={`recipe-filter-sidebar-pill${selectedCuisines.includes(name) ? ' active' : ''}`}
                    onClick={() => handleCuisineClick(name)}
                    aria-pressed={selectedCuisines.includes(name)}
                  >
                    {name}
                  </button>
                ))}
                {hiddenCuisinesCount > 0 && (
                  <button
                    type="button"
                    className="recipe-filter-sidebar-pill recipe-filter-sidebar-pill--more"
                    onClick={() => setShowAllCuisines(true)}
                    aria-label={`${hiddenCuisinesCount} weitere Kulinariktypen anzeigen`}
                    title="Weitere Kulinariktypen anzeigen"
                  >
                    +{hiddenCuisinesCount}
                  </button>
                )}
                {!trimmedSearch && showAllCuisines && cuisinePills.length > MAX_VISIBLE_PILLS && (
                  <button
                    type="button"
                    className="recipe-filter-sidebar-pill recipe-filter-sidebar-pill--more"
                    onClick={() => setShowAllCuisines(false)}
                    aria-label="Weniger Kulinariktypen anzeigen"
                    title="Weniger Kulinariktypen anzeigen"
                  >
                    −
                  </button>
                )}
              </div>
            </div>
          )}

          {visibleAuthors.length > 0 && (
            <div className="recipe-filter-sidebar-section">
              <h3 className="recipe-filter-sidebar-heading">Autoren</h3>
              <div className="recipe-filter-sidebar-row">
                {visibleAuthors.map((author) => (
                  <button
                    key={author.id}
                    type="button"
                    className={`recipe-filter-sidebar-pill${selectedAuthors.includes(author.id) ? ' active' : ''}`}
                    onClick={() => handleAuthorClick(author.id)}
                    aria-pressed={selectedAuthors.includes(author.id)}
                  >
                    {author.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {showPrivateListFilters && currentUser && visiblePrivateLists.length > 0 && (
            <div className="recipe-filter-sidebar-section">
              <h3 className="recipe-filter-sidebar-heading">Listen</h3>
              <div className="recipe-filter-sidebar-row">
                {visiblePrivateLists.map((list) => (
                  <button
                    key={list.id}
                    type="button"
                    className={`recipe-filter-sidebar-pill${selectedPrivateLists.includes(list.id) ? ' active' : ''}`}
                    onClick={() => handlePrivateListClick(list.id)}
                    aria-pressed={selectedPrivateLists.includes(list.id)}
                  >
                    {list.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </nav>
  );
}

export default RecipeFilterSidebar;

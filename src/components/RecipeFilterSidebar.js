import React, { useMemo } from 'react';
import './RecipeFilterSidebar.css';

/**
 * Persistent left-hand navigation for the recipe overview on larger screens.
 * Mirrors every filter offered by MobileSearchOverlay's bottom sheet (search,
 * Favoriten/Saisonal toggles, Speisekategorien, Kulinariktypen, Autoren and
 * private Listen) so desktop users get the same filtering capabilities.
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
}) {
  // Only offer categories/cuisines that actually match at least one recipe,
  // same rule MobileSearchOverlay applies for its pills.
  const availableCategories = useMemo(() => {
    if (!mealCategories || mealCategories.length === 0) return [];
    const counts = {};
    recipes.forEach((recipe) => {
      const speisekategorie = Array.isArray(recipe.speisekategorie)
        ? recipe.speisekategorie
        : (recipe.speisekategorie ? [recipe.speisekategorie] : []);
      speisekategorie.forEach((c) => { counts[c] = (counts[c] || 0) + 1; });
    });
    return mealCategories.filter((category) => counts[category] > 0);
  }, [recipes, mealCategories]);

  const cuisinePills = useMemo(() => {
    if (!cuisineTypes || cuisineTypes.length === 0) return [];
    const counts = {};
    recipes.forEach((recipe) => {
      const kulinarik = Array.isArray(recipe.kulinarik) ? recipe.kulinarik : [];
      kulinarik.forEach((k) => { counts[k] = (counts[k] || 0) + 1; });
    });
    const availableTypes = new Set(cuisineTypes.filter((type) => counts[type] > 0));
    const result = [];
    const seen = new Set();
    (cuisineGroups || []).forEach((group) => {
      const hasAvailableChild = (group.children || []).some((child) => availableTypes.has(child));
      if ((availableTypes.has(group.name) || hasAvailableChild) && !seen.has(group.name)) {
        result.push(group.name);
        seen.add(group.name);
      }
    });
    availableTypes.forEach((type) => {
      if (!seen.has(type)) {
        result.push(type);
        seen.add(type);
      }
    });
    return result;
  }, [recipes, cuisineTypes, cuisineGroups]);

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
    <nav className="recipe-filter-sidebar" aria-label="Rezeptfilter">
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

      <div className="recipe-filter-sidebar-section recipe-filter-sidebar-row">
        <button
          type="button"
          className={`recipe-filter-sidebar-pill${showFavoritesOnly ? ' active' : ''}`}
          onClick={() => onFavoritesToggle?.(!showFavoritesOnly)}
          aria-pressed={showFavoritesOnly}
        >
          ★ Favoriten
        </button>
        <button
          type="button"
          className={`recipe-filter-sidebar-pill${showSeasonalOnly ? ' active' : ''}`}
          onClick={() => onSeasonalToggle?.(!showSeasonalOnly)}
          aria-pressed={showSeasonalOnly}
        >
          Saisonal
        </button>
      </div>

      {availableCategories.length > 0 && (
        <div className="recipe-filter-sidebar-section">
          <h3 className="recipe-filter-sidebar-heading">Kategorien</h3>
          <div className="recipe-filter-sidebar-row">
            {availableCategories.map((name) => (
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
          </div>
        </div>
      )}

      {cuisinePills.length > 0 && (
        <div className="recipe-filter-sidebar-section">
          <h3 className="recipe-filter-sidebar-heading">Küche</h3>
          <div className="recipe-filter-sidebar-row">
            {cuisinePills.map((name) => (
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
          </div>
        </div>
      )}

      {availableAuthors.length > 0 && (
        <div className="recipe-filter-sidebar-section">
          <h3 className="recipe-filter-sidebar-heading">Autoren</h3>
          <div className="recipe-filter-sidebar-row">
            {availableAuthors.map((author) => (
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

      {showPrivateListFilters && currentUser && privateLists.length > 0 && (
        <div className="recipe-filter-sidebar-section">
          <h3 className="recipe-filter-sidebar-heading">Listen</h3>
          <div className="recipe-filter-sidebar-row">
            {privateLists.map((list) => (
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

      {hasActiveFilters && (
        <button
          type="button"
          className="recipe-filter-sidebar-reset"
          onClick={onClearAllFilters}
        >
          Filter zurücksetzen
        </button>
      )}
    </nav>
  );
}

export default RecipeFilterSidebar;

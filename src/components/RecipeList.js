import React, { useState, useEffect, useMemo } from 'react';
import './RecipeList.css';
import { canEditRecipes, getUsers } from '../utils/userManagement';
import { groupRecipesByParent, sortRecipeVersions } from '../utils/recipeVersioning';
import { getUserFavorites } from '../utils/userFavorites';
import { getCustomLists, getButtonIcons, DEFAULT_BUTTON_ICONS, getTimelineBubbleIcon } from '../utils/customLists';
import { isBase64Image } from '../utils/imageUtils';
import RecipeTimeline from './RecipeTimeline';
import { getCategoryImages } from '../utils/categoryImages';

function RecipeList({ recipes, onSelectRecipe, onAddRecipe, categoryFilter, currentUser, onCategoryFilterChange, searchTerm, onOpenFilterPage }) {
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [customLists, setCustomLists] = useState({ mealCategories: [] });
  const [buttonIcons, setButtonIcons] = useState({
    filterButton: DEFAULT_BUTTON_ICONS.filterButton
  });
  const [viewMode, setViewMode] = useState('grid');
  const [timelineBubbleIcon, setTimelineBubbleIcon] = useState(null);
  const [categoryImages, setCategoryImages] = useState([]);
  
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

  // Load timeline-specific data (icon and category images)
  useEffect(() => {
    const loadTimelineData = async () => {
      try {
        const [icon, catImages] = await Promise.all([
          getTimelineBubbleIcon(),
          getCategoryImages(),
        ]);
        setTimelineBubbleIcon(icon);
        setCategoryImages(catImages);
      } catch (error) {
        console.error('Error loading timeline data:', error);
      }
    };
    loadTimelineData();
  }, []);
  
  // Generate dynamic heading based on filters
  const getHeading = () => {
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

    // Sort groups alphabetically by the primary recipe's title
    return filteredGroups.sort((a, b) => {
      const titleA = a.primaryRecipe?.title?.toLowerCase() || '';
      const titleB = b.primaryRecipe?.title?.toLowerCase() || '';
      return titleA.localeCompare(titleB);
    });
  }, [allRecipeGroups, showFavoritesOnly, favoriteIds, searchTerm]);

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
    return `${author.vorname} ${author.nachname}`;
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
            <button
              className={`view-mode-button ${viewMode === 'timeline' ? 'active' : ''}`}
              onClick={() => setViewMode(viewMode === 'grid' ? 'timeline' : 'grid')}
              title={viewMode === 'grid' ? 'Zeitleiste anzeigen' : 'Rasteransicht anzeigen'}
            >
              {viewMode === 'grid' ? '📅 Zeitleiste' : '⊞ Raster'}
            </button>
          </div>
          {userCanEdit && (
            <button className="add-button" onClick={onAddRecipe}>
              + Rezept hinzufügen
            </button>
          )}
        </div>
      </div>
      
      {recipeGroups.length === 0 ? (
        <div className="empty-state">
          <p>{showFavoritesOnly ? 'Keine favorisierten Rezepte!' : 'Noch keine Rezepte!'}</p>
          <p className="empty-hint">
            {showFavoritesOnly 
              ? 'Markieren Sie Rezepte als Favoriten, um sie schnell zu finden' 
              : 'Tippen Sie auf "Rezept hinzufügen", um Ihr erstes Rezept zu erstellen'}
          </p>
        </div>
      ) : viewMode === 'timeline' ? (
        <RecipeTimeline
          recipes={recipeGroups.map(group => {
            const sortedVersions = sortRecipeVersions(group.allRecipes, currentUser?.id, (userId, recipeId) => favoriteIds.includes(recipeId), recipes);
            return sortedVersions[0] || group.primaryRecipe;
          })}
          onSelectRecipe={onSelectRecipe}
          allUsers={allUsers}
          timelineBubbleIcon={timelineBubbleIcon}
          categoryImages={categoryImages}
        />
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

                {recipe.image && (
                  <div className="recipe-image">
                    <img src={recipe.image} alt={recipe.title} />
                  </div>
                )}
                <div className="recipe-card-content">
                  <h3>{recipe.title}</h3>
                  <div className="recipe-meta">
                    <span>{recipe.ingredients?.length || 0} Zutaten</span>
                    <span>{recipe.steps?.length || 0} Schritte</span>
                  </div>
                  <div className="recipe-footer">
                    {group.versionCount > 1 && (
                      <div className="version-count">
                        {group.versionCount} Versionen
                      </div>
                    )}
                    {authorName && (
                      <div className="recipe-author">{authorName}</div>
                    )}
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

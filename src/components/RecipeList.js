import React, { useState, useEffect } from 'react';
import './RecipeList.css';
import { canEditRecipes, getUsers } from '../utils/userManagement';
import { groupRecipesByParent, sortRecipeVersions } from '../utils/recipeVersioning';
import { isRecipeFavorite, hasAnyFavoriteInGroup } from '../utils/userFavorites';

function RecipeList({ recipes, onSelectRecipe, onAddRecipe, categoryFilter, currentUser }) {
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  
  // Load all users once on mount
  useEffect(() => {
    const loadUsers = async () => {
      const users = await getUsers();
      setAllUsers(users);
    };
    loadUsers();
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

  // Filter groups based on favorites if enabled
  const recipeGroups = showFavoritesOnly
    ? allRecipeGroups.filter(group => hasAnyFavoriteInGroup(currentUser?.id, group.allRecipes))
    : allRecipeGroups;

  const handleRecipeClick = (group) => {
    // Select the recipe that is at the top according to current sorting order
    // This ensures consistency between the overview and detail view
    const sortedVersions = sortRecipeVersions(group.allRecipes, currentUser?.id, isRecipeFavorite, recipes);
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
          <button 
            className={`favorites-filter-button ${showFavoritesOnly ? 'active' : ''}`}
            onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
            title={showFavoritesOnly ? 'Alle Rezepte anzeigen' : 'Nur Favoriten anzeigen'}
          >
            ★ Favoriten
          </button>
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
      ) : (
        <div className="recipe-grid">
          {recipeGroups.map(group => {
            // Sort versions to get the one that should be displayed first
            const sortedVersions = sortRecipeVersions(group.allRecipes, currentUser?.id, isRecipeFavorite, recipes);
            const recipe = sortedVersions[0] || group.primaryRecipe;
            const isFavorite = isRecipeFavorite(currentUser?.id, recipe.id);
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

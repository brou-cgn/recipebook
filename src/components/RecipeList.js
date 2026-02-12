import React from 'react';
import './RecipeList.css';
import { canEditRecipes, getUsers } from '../utils/userManagement';
import { groupRecipesByParent } from '../utils/recipeVersioning';
import { isRecipeFavorite } from '../utils/userFavorites';

function RecipeList({ recipes, onSelectRecipe, onAddRecipe, categoryFilter, showFavoritesOnly, currentUser }) {
  // Generate dynamic heading based on filters
  const getHeading = () => {
    const prefix = showFavoritesOnly ? 'Meine ' : '';
    const category = categoryFilter || 'Rezepte';
    return `${prefix}${category}`;
  };

  const userCanEdit = canEditRecipes(currentUser);

  // Group recipes by parent
  const recipeGroups = groupRecipesByParent(recipes);

  const handleRecipeClick = (group) => {
    // Always select the primary recipe; RecipeDetail will handle showing version selector
    onSelectRecipe(group.primaryRecipe);
  };

  // Helper function to get author name
  const getAuthorName = (authorId) => {
    if (!authorId) return null;
    const users = getUsers();
    const author = users.find(u => u.id === authorId);
    if (!author) return null;
    return `${author.vorname} ${author.nachname}`;
  };

  return (
    <div className="recipe-list-container">
      <div className="recipe-list-header">
        <h2>{getHeading()}</h2>
        {userCanEdit && (
          <button className="add-button" onClick={onAddRecipe}>
            + Rezept hinzufügen
          </button>
        )}
      </div>
      
      {recipes.length === 0 ? (
        <div className="empty-state">
          <p>Noch keine Rezepte!</p>
          <p className="empty-hint">Tippen Sie auf "Rezept hinzufügen", um Ihr erstes Rezept zu erstellen</p>
        </div>
      ) : (
        <div className="recipe-grid">
          {recipeGroups.map(group => {
            const recipe = group.primaryRecipe;
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
                {group.versionCount > 1 && (
                  <div className="version-badge">
                    {group.versionCount} Versionen
                  </div>
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
                  {authorName && (
                    <div className="recipe-author">{authorName}</div>
                  )}
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

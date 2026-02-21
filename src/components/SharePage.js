import React, { useState, useEffect } from 'react';
import './SharePage.css';
import { getRecipeByShareId, addRecipe } from '../utils/recipeFirestore';
import RecipeDetail from './RecipeDetail';

function SharePage({ shareId, currentUser, onAddToMyRecipes, onLogin }) {
  const [recipe, setRecipe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [addSuccess, setAddSuccess] = useState(false);
  const [addLoading, setAddLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const found = await getRecipeByShareId(shareId);
      if (found) {
        setRecipe(found);
      } else {
        setNotFound(true);
      }
      setLoading(false);
    };
    load();
  }, [shareId]);

  const handleAddToMyRecipes = async () => {
    if (!currentUser) {
      onLogin && onLogin();
      return;
    }
    setAddLoading(true);
    try {
      const recipeData = {
        title: recipe.title,
        image: recipe.image,
        portionen: recipe.portionen,
        portionUnitId: recipe.portionUnitId,
        kulinarik: recipe.kulinarik,
        schwierigkeit: recipe.schwierigkeit,
        kochdauer: recipe.kochdauer,
        speisekategorie: recipe.speisekategorie,
        ingredients: recipe.ingredients,
        steps: recipe.steps,
        isPrivate: false,
      };
      await addRecipe(recipeData, currentUser.id);
      setAddSuccess(true);
      onAddToMyRecipes && onAddToMyRecipes();
    } catch (error) {
      console.error('Error adding recipe:', error);
      alert('Fehler beim Hinzufügen des Rezepts.');
    }
    setAddLoading(false);
  };

  if (loading) {
    return (
      <div className="share-page-loading">
        Rezept wird geladen…
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="share-page-not-found">
        <h2>Rezept nicht gefunden</h2>
        <p>Dieser Share-Link ist ungültig oder das Rezept wurde nicht mehr geteilt.</p>
      </div>
    );
  }

  return (
    <RecipeDetail
      recipe={recipe}
      onBack={() => { window.location.hash = ''; }}
      currentUser={currentUser}
      allRecipes={[]}
      allUsers={[]}
      isSharedView={true}
      onAddToMyRecipes={handleAddToMyRecipes}
      isAddToMyRecipesLoading={addLoading}
      isAddToMyRecipesSuccess={addSuccess}
    />
  );
}

export default SharePage;

import React, { useState, useEffect } from 'react';
import './SharePage.css';
import { getRecipeByShareId } from '../utils/recipeFirestore';
import RecipeDetail from './RecipeDetail';

function SharePage({ shareId, currentUser }) {
  const [recipe, setRecipe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

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
    />
  );
}

export default SharePage;

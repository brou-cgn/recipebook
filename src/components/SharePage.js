import React, { useState, useEffect } from 'react';
import './SharePage.css';
import RecipeDetail from './RecipeDetail';

function SharePage({ shareId, currentUser }) {
  const [recipe, setRecipe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/shared-recipe/${shareId}`);
        if (response.ok) {
          const data = await response.json();
          setRecipe(data);
        } else {
          setNotFound(true);
        }
      } catch (error) {
        console.error('Error loading shared recipe:', error);
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

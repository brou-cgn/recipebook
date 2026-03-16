import React, { useState, useEffect } from 'react';
import './SharePage.css';
import MenuDetail from './MenuDetail';
import RecipeDetail from './RecipeDetail';

function MenuSharePage({ shareId, currentUser }) {
  const [menu, setMenu] = useState(null);
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/shared-menu/${shareId}`);
        if (response.ok) {
          const data = await response.json();
          setMenu(data.menu);
          setRecipes(data.recipes || []);
        } else {
          setNotFound(true);
        }
      } catch (error) {
        console.error('Error loading shared menu:', error);
        setNotFound(true);
      }
      setLoading(false);
    };
    load();
  }, [shareId]);

  if (loading) {
    return (
      <div className="share-page-loading">
        Menü wird geladen…
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="share-page-not-found">
        <h2>Menü nicht gefunden</h2>
        <p>Dieser Share-Link ist ungültig oder das Menü wurde nicht mehr geteilt.</p>
      </div>
    );
  }

  if (selectedRecipe) {
    return (
      <RecipeDetail
        recipe={selectedRecipe}
        onBack={() => setSelectedRecipe(null)}
        currentUser={currentUser}
        allRecipes={[]}
        allUsers={[]}
        isSharedView={true}
      />
    );
  }

  return (
    <MenuDetail
      menu={menu}
      recipes={recipes}
      onBack={() => { window.location.hash = ''; }}
      onSelectRecipe={setSelectedRecipe}
      currentUser={currentUser}
      allUsers={[]}
      isSharedView={true}
    />
  );
}

export default MenuSharePage;

import React, { useState, useEffect } from 'react';
import './SharePage.css';
import { getMenuByShareId } from '../utils/menuFirestore';
import { getRecipesByIds } from '../utils/recipeFirestore';
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
      const found = await getMenuByShareId(shareId);
      if (found) {
        setMenu(found);
        // Extract all recipe IDs from the menu sections or legacy recipeIds
        const recipeIds = [];
        if (found.sections && found.sections.length > 0) {
          found.sections.forEach(section => {
            if (section.recipeIds) {
              recipeIds.push(...section.recipeIds);
            }
          });
        } else if (found.recipeIds) {
          recipeIds.push(...found.recipeIds);
        }
        // Fetch the associated recipes (deduplicated)
        if (recipeIds.length > 0) {
          const fetchedRecipes = await getRecipesByIds([...new Set(recipeIds)]);
          setRecipes(fetchedRecipes);
        }
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

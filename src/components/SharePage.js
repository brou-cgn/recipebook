import React, { useState, useEffect } from 'react';
import './SharePage.css';
import { getRecipeByShareId, addRecipe } from '../utils/recipeFirestore';
import RecipeDetail from './RecipeDetail';
import { getButtonIcons } from '../utils/customLists';
import { isBase64Image } from '../utils/imageUtils';

function SharePage({ shareId, currentUser, onAddToMyRecipes, onLogin }) {
  const [recipe, setRecipe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [addSuccess, setAddSuccess] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [copyLinkIcon, setCopyLinkIcon] = useState('📋');

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

  useEffect(() => {
    const loadIcons = async () => {
      const icons = await getButtonIcons();
      setCopyLinkIcon(icons.copyLink || '📋');
    };
    loadIcons();
  }, []);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      // Legacy fallback for older browsers that don't support the Clipboard API
      const input = document.createElement('input');
      input.value = window.location.href;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

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
      <div className="share-page">
        <div className="share-page-loading">Rezept wird geladen…</div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="share-page">
        <div className="share-page-not-found">
          <h2>Rezept nicht gefunden</h2>
          <p>Dieser Share-Link ist ungültig oder das Rezept wurde nicht mehr geteilt.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="share-page-actions-banner">
        <button className="share-copy-button" onClick={handleCopyUrl} title="Link kopieren">
          {copySuccess ? '✓' : (
            isBase64Image(copyLinkIcon) ? (
              <img src={copyLinkIcon} alt="Link kopieren" className="button-icon-img" />
            ) : (
              copyLinkIcon
            )
          )}
        </button>
        {addSuccess ? (
          <span className="share-add-success">✓ Zu deinen Rezepten hinzugefügt!</span>
        ) : (
          <button
            className="share-add-button"
            onClick={handleAddToMyRecipes}
            disabled={addLoading}
          >
            {addLoading ? 'Wird hinzugefügt…' : currentUser ? '+ Zu meinen Rezepten' : 'Anmelden & hinzufügen'}
          </button>
        )}
      </div>
      <RecipeDetail
        recipe={recipe}
        onBack={() => { window.location.hash = ''; }}
        currentUser={currentUser}
        allRecipes={[]}
        allUsers={[]}
      />
    </>
  );
}

export default SharePage;

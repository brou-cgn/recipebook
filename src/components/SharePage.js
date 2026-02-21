import React, { useState, useEffect } from 'react';
import './SharePage.css';
import { getRecipeByShareId, addRecipe } from '../utils/recipeFirestore';

function SharePage({ shareId, currentUser, onAddToMyRecipes, onLogin }) {
  const [recipe, setRecipe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
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

  const cuisineDisplay = Array.isArray(recipe.kulinarik)
    ? recipe.kulinarik.join(', ')
    : recipe.kulinarik;

  const categoryDisplay = Array.isArray(recipe.speisekategorie)
    ? recipe.speisekategorie.join(', ')
    : recipe.speisekategorie;

  return (
    <div className="share-page">
      <div className="share-page-header">
        <div className="share-page-actions">
          <button className="share-copy-button" onClick={handleCopyUrl} title="Link kopieren">
            {copySuccess ? '✓ Kopiert!' : '🔗 Link kopieren'}
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
      </div>

      <div className="share-page-content">
        {recipe.image && (
          <div className="share-recipe-image">
            <img src={recipe.image} alt={recipe.title} />
          </div>
        )}

        <h1 className="share-recipe-title">{recipe.title}</h1>

        <div className="share-recipe-meta">
          {cuisineDisplay && <span className="share-meta-item">🍽 {cuisineDisplay}</span>}
          {categoryDisplay && <span className="share-meta-item">📂 {categoryDisplay}</span>}
          {recipe.kochdauer && <span className="share-meta-item">⏱ {recipe.kochdauer} Min.</span>}
          {recipe.portionen && <span className="share-meta-item">👤 {recipe.portionen} Portionen</span>}
          {recipe.schwierigkeit && (
            <span className="share-meta-item">
              {'★'.repeat(recipe.schwierigkeit)}{'☆'.repeat(5 - recipe.schwierigkeit)}
            </span>
          )}
        </div>

        <section className="share-recipe-section">
          <h2>Zutaten</h2>
          <ul className="share-ingredients-list">
            {recipe.ingredients?.map((ingredient, index) => {
              const item = typeof ingredient === 'string'
                ? { type: 'ingredient', text: ingredient }
                : ingredient;
              if (item.type === 'heading') {
                return <li key={index} className="share-ingredient-heading">{item.text}</li>;
              }
              return <li key={index}>{item.text}</li>;
            }) || <li>Keine Zutaten aufgelistet</li>}
          </ul>
        </section>

        <section className="share-recipe-section">
          <h2>Zubereitung</h2>
          <ol className="share-steps-list">
            {recipe.steps?.map((step, index) => {
              const item = typeof step === 'string'
                ? { type: 'step', text: step }
                : step;
              if (item.type === 'heading') {
                return <li key={index} className="share-step-heading">{item.text}</li>;
              }
              return <li key={index}>{item.text}</li>;
            }) || <li>Keine Zubereitungsschritte aufgelistet</li>}
          </ol>
        </section>
      </div>
    </div>
  );
}

export default SharePage;

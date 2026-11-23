import React, { useState, useEffect } from 'react';
import './SharePage.css';
import { getRecipeByShareId } from '../utils/recipeFirestore';
import RecipeDetail from './RecipeDetail';
import { useTexte } from '../contexts/SpracheContext';
import rezeptansichtTexte from '../i18n/texte/rezeptansicht';

function SharePage({ shareId, currentUser, onClose }) {
  const [recipe, setRecipe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  // Ohne Anmeldung gilt die Sprache des Browsers (Mehrsprachigkeit PR 6o)
  const t = useTexte(rezeptansichtTexte);

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
        {t('freigabeLaedt')}
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="share-page-not-found">
        <h2>{t('freigabeNichtGefunden')}</h2>
        <p>{t('freigabeLinkUngueltig')}</p>
      </div>
    );
  }

  return (
    <RecipeDetail
      recipe={recipe}
      onBack={onClose || (() => { window.location.hash = ''; })}
      currentUser={currentUser}
      allRecipes={[]}
      allUsers={[]}
      isSharedView={true}
    />
  );
}

export default SharePage;

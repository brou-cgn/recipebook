import React, { useState, useEffect } from 'react';
import './MeineKuechenstarsPage.css';
import { getRecentRecipeCalls } from '../utils/recipeCallsFirestore';
import { getButtonIcons, DEFAULT_BUTTON_ICONS, getEffectiveIcon, getDarkModePreference } from '../utils/customLists';
import { isBase64Image } from '../utils/imageUtils';

function MeineKuechenstarsPage({ onBack, currentUser, recipes = [] }) {
  const [recipeCalls, setRecipeCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [closeIcon, setCloseIcon] = useState(DEFAULT_BUTTON_ICONS.privateListBack);
  const [allButtonIcons, setAllButtonIcons] = useState({ ...DEFAULT_BUTTON_ICONS });
  const [isDarkMode, setIsDarkMode] = useState(getDarkModePreference);

  useEffect(() => {
    getRecentRecipeCalls(14)
      .then(calls => {
        setRecipeCalls(calls);
        setLoading(false);
      })
      .catch(err => {
        console.error('Fehler beim Laden der Rezeptaufrufe:', err);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    getButtonIcons().then((icons) => {
      setAllButtonIcons(icons);
    });
  }, []);

  useEffect(() => {
    setCloseIcon(getEffectiveIcon(allButtonIcons, 'privateListBack', isDarkMode) || DEFAULT_BUTTON_ICONS.privateListBack);
  }, [allButtonIcons, isDarkMode]);

  useEffect(() => {
    const handler = (e) => setIsDarkMode(e.detail.isDark);
    window.addEventListener('darkModeChange', handler);
    return () => window.removeEventListener('darkModeChange', handler);
  }, []);

  const ownRecipes = recipes.filter(r => r.authorId === currentUser?.id);

  const top20 = (() => {
    const callCountById = new Map();
    recipeCalls.forEach(call => {
      callCountById.set(call.recipeId, (callCountById.get(call.recipeId) || 0) + 1);
    });
    return ownRecipes
      .map(recipe => ({ recipe, count: callCountById.get(recipe.id) || 0 }))
      .filter(({ count }) => count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  })();

  return (
    <div className="meine-kuechenstars-container">
      <div className="meine-kuechenstars-header">
        <h2>Meine Küchenstars</h2>
        {onBack && (
          <button
            className="meine-kuechenstars-close-btn"
            onClick={onBack}
            aria-label="Schließen"
            title="Schließen"
          >
            {isBase64Image(closeIcon) ? (
              <img src={closeIcon} alt="Schließen" className="meine-kuechenstars-close-icon-img" />
            ) : (
              <span>{closeIcon}</span>
            )}
          </button>
        )}
      </div>
      <div className="meine-kuechenstars-content">
        <p className="meine-kuechenstars-info-text">
          Hier sind deine Top 20 Rezepte nach Anzahl der Aufrufe der letzten 14 Tage.
        </p>
        {loading ? (
          <div className="meine-kuechenstars-empty">Laden...</div>
        ) : top20.length === 0 ? (
          <div className="meine-kuechenstars-empty">Noch keine Rezeptaufrufe vorhanden.</div>
        ) : (
          <div className="meine-kuechenstars-table-container">
            <table className="meine-kuechenstars-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Rezept</th>
                  <th>Aufrufe</th>
                </tr>
              </thead>
              <tbody>
                {top20.map(({ recipe, count }, index) => (
                  <tr key={recipe.id}>
                    <td className="meine-kuechenstars-rank">{index + 1}</td>
                    <td>{recipe.title}</td>
                    <td className="meine-kuechenstars-count">{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default MeineKuechenstarsPage;

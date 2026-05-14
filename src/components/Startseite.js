import React, { useState, useEffect } from 'react';
import './Startseite.css';
import { getRecentRecipeCalls } from '../utils/recipeCallsFirestore';
import { getDarkModePreference } from '../utils/customLists';
import RecipeCard from './RecipeCard';

const TRENDING_DAYS = 7;
const TRENDING_TOP = 10;
const SORT_STORAGE_KEY = 'recipebook_active_sort';

function Startseite({ currentUser, onViewChange, recipes = [] }) {
  const [topRecipes, setTopRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(getDarkModePreference);

  useEffect(() => {
    const handler = (e) => setIsDarkMode(e.detail.isDark);
    window.addEventListener('darkModeChange', handler);
    return () => window.removeEventListener('darkModeChange', handler);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchTrending = async () => {
      try {
        const calls = await getRecentRecipeCalls(TRENDING_DAYS);
        if (cancelled) return;
        const callCounts = new Map();
        calls.forEach(call => {
          if (call.recipeId) {
            callCounts.set(call.recipeId, (callCounts.get(call.recipeId) || 0) + 1);
          }
        });
        const top = recipes
          .filter(r => callCounts.has(r.id))
          .map(r => ({ recipe: r, count: callCounts.get(r.id) }))
          .sort((a, b) => b.count - a.count)
          .slice(0, TRENDING_TOP)
          .map(item => item.recipe);
        setTopRecipes(top);
      } catch (error) {
        console.error('Fehler beim Laden der Trendrezepte:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchTrending();
    return () => { cancelled = true; };
  }, [recipes]);

  const handleMehrClick = () => {
    try {
      sessionStorage.setItem(SORT_STORAGE_KEY, 'trending');
    } catch (e) {
      // sessionStorage might be unavailable in some environments
    }
    onViewChange?.('trendingRecipes');
  };

  return (
    <div className="startseite-container">
      <div className="startseite-trending-section">
        <h2 className="startseite-section-title">Im Trend</h2>
        {loading ? (
          <div className="startseite-loading">Laden…</div>
        ) : topRecipes.length === 0 ? (
          <div className="startseite-empty">Keine Trendrezepte vorhanden.</div>
        ) : (
          <div className="startseite-carousel">
            {topRecipes.map(recipe => (
              <div key={recipe.id} className="startseite-carousel-item">
                <RecipeCard
                  recipe={recipe}
                  currentUser={currentUser}
                  isDarkMode={isDarkMode}
                />
              </div>
            ))}
          </div>
        )}
        <div className="startseite-mehr-container">
          <button
            className="startseite-mehr-btn"
            onClick={handleMehrClick}
          >
            mehr
          </button>
        </div>
      </div>
    </div>
  );
}

export default Startseite;

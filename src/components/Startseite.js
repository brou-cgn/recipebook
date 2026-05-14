import React, { useState, useEffect, useMemo } from 'react';
import './Startseite.css';
import { getRecentRecipeCalls } from '../utils/recipeCallsFirestore';
import TrendingCard from './TrendingCard';
import StartseitenKarussell from './StartseitenKarussell';
import { getButtonIcons, DEFAULT_BUTTON_ICONS, getEffectiveIcon, getDarkModePreference } from '../utils/customLists';

const TRENDING_DAYS = 7;
const TRENDING_TOP = 10;
const NEUE_REZEPTE_TOP = 10;
const SORT_STORAGE_KEY = 'recipebook_active_sort';

function Startseite({ currentUser, onViewChange, onSelectRecipe, recipes = [] }) {
  const [topRecipes, setTopRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [buttonIcons, setButtonIcons] = useState({ ...DEFAULT_BUTTON_ICONS });
  const [isDarkMode, setIsDarkMode] = useState(getDarkModePreference);

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

  // Load button icons on mount
  useEffect(() => {
    const loadIcons = async () => {
      try {
        const icons = await getButtonIcons();
        setButtonIcons(icons);
      } catch (error) {
        // Keep default values if loading fails
      }
    };
    loadIcons();
  }, []);

  // Listen for dark mode changes
  useEffect(() => {
    const handler = (e) => setIsDarkMode(e.detail.isDark);
    window.addEventListener('darkModeChange', handler);
    return () => window.removeEventListener('darkModeChange', handler);
  }, []);

  const handleMehrClick = () => {
    try {
      sessionStorage.setItem(SORT_STORAGE_KEY, 'trending');
    } catch (e) {
      // sessionStorage might be unavailable in some environments
    }
    onViewChange?.('trendingRecipes');
  };

  const neueRezepte = useMemo(() => {
    const toMs = (ts) => {
      if (!ts) return 0;
      if (typeof ts.toDate === 'function') return ts.toDate().getTime();
      return new Date(ts).getTime();
    };
    return [...recipes]
      .sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt))
      .slice(0, NEUE_REZEPTE_TOP);
  }, [recipes]);

  const handleNeueRezepteMehrClick = () => {
    try {
      sessionStorage.setItem(SORT_STORAGE_KEY, 'newest');
    } catch (e) {
      // sessionStorage might be unavailable in some environments
    }
    onViewChange?.('neueRezepte');
  };

  return (
    <div className="startseite-container">
      <StartseitenKarussell
        title="Im Trend"
        items={topRecipes}
        loading={loading}
        renderItem={(recipe) => (
          <TrendingCard
            recipe={recipe}
            onSelectRecipe={onSelectRecipe}
            difficultyIcon={getEffectiveIcon(buttonIcons, 'trendingDifficultyIcon', isDarkMode)}
            timeIcon={getEffectiveIcon(buttonIcons, 'trendingTimeIcon', isDarkMode)}
          />
        )}
        emptyText="Keine Trendrezepte vorhanden."
        onMehr={handleMehrClick}
      />
      <StartseitenKarussell
        title="Neue Rezepte"
        items={neueRezepte}
        loading={false}
        renderItem={(recipe) => (
          <TrendingCard
            recipe={recipe}
            onSelectRecipe={onSelectRecipe}
            difficultyIcon={getEffectiveIcon(buttonIcons, 'trendingDifficultyIcon', isDarkMode)}
            timeIcon={getEffectiveIcon(buttonIcons, 'trendingTimeIcon', isDarkMode)}
          />
        )}
        emptyText="Keine Rezepte vorhanden."
        onMehr={handleNeueRezepteMehrClick}
      />
    </div>
  );
}

export default Startseite;

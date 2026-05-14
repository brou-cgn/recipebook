import React, { useState, useEffect, useMemo } from 'react';
import './Startseite.css';
import { getRecentRecipeCalls } from '../utils/recipeCallsFirestore';
import TrendingCard from './TrendingCard';
import StartseitenKarussell from './StartseitenKarussell';
import { getButtonIcons, DEFAULT_BUTTON_ICONS, getEffectiveIcon, getDarkModePreference, getGroupStatusThresholds, getStartseitenKandidatenHinweis, DEFAULT_STARTSEITEN_KANDIDATEN_HINWEIS } from '../utils/customLists';
import { getAllMembersSwipeFlags, computeGroupRecipeStatus } from '../utils/recipeSwipeFlags';

const TRENDING_DAYS = 7;
const TRENDING_TOP = 10;
const NEUE_REZEPTE_TOP = 10;
const SORT_STORAGE_KEY = 'recipebook_active_sort';

function Startseite({ currentUser, onViewChange, onSelectRecipe, recipes = [], groups = [] }) {
  const [topRecipes, setTopRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [buttonIcons, setButtonIcons] = useState({ ...DEFAULT_BUTTON_ICONS });
  const [isDarkMode, setIsDarkMode] = useState(getDarkModePreference);
  const [gemeinsameKandidaten, setGemeinsameKandidaten] = useState([]);
  const [kandidatenLoading, setKandidatenLoading] = useState(false);
  const [kandidatenHinweis, setKandidatenHinweis] = useState(DEFAULT_STARTSEITEN_KANDIDATEN_HINWEIS);

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

  // Load configurable hint text for Gemeinsame Kandidaten carousel
  useEffect(() => {
    let cancelled = false;
    getStartseitenKandidatenHinweis()
      .then((text) => { if (!cancelled) setKandidatenHinweis(text); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Load and compute Gemeinsame Kandidaten from the default web import list
  useEffect(() => {
    const defaultListId = currentUser?.defaultWebImportListId;
    if (!defaultListId) {
      setGemeinsameKandidaten([]);
      setKandidatenLoading(false);
      return;
    }

    const list = groups.find(g => g.id === defaultListId);
    if (!list) {
      setGemeinsameKandidaten([]);
      setKandidatenLoading(false);
      return;
    }

    const memberIds = [
      ...(list.ownerId ? [list.ownerId] : []),
      ...(Array.isArray(list.memberIds) ? list.memberIds : []),
    ].filter((v, i, arr) => arr.indexOf(v) === i); // deduplicate

    if (memberIds.length <= 1) {
      setGemeinsameKandidaten([]);
      setKandidatenLoading(false);
      return;
    }

    let cancelled = false;
    setKandidatenLoading(true);

    const fetchKandidaten = async () => {
      try {
        const [allMembersFlags, thresholds] = await Promise.all([
          getAllMembersSwipeFlags(list.id, memberIds),
          getGroupStatusThresholds(),
        ]);
        if (cancelled) return;

        const listRecipeIds = new Set(list.recipeIds || []);
        const listRecipes = recipes.filter(r => listRecipeIds.has(r.id));

        const kandidaten = listRecipes
          .filter(r => computeGroupRecipeStatus(memberIds, allMembersFlags, r.id, thresholds, currentUser?.id) === 'kandidat')
          .sort((a, b) => (a.title || '').localeCompare(b.title || '', 'de'));

        if (!cancelled) setGemeinsameKandidaten(kandidaten);
      } catch (error) {
        console.error('Fehler beim Laden der gemeinsamen Kandidaten:', error);
        if (!cancelled) setGemeinsameKandidaten([]);
      } finally {
        if (!cancelled) setKandidatenLoading(false);
      }
    };

    fetchKandidaten();
    return () => { cancelled = true; };
  }, [currentUser, groups, recipes]);

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
    const effectiveMs = (recipe) => toMs(recipe.publishedAt || recipe.createdAt);
    return [...recipes]
      .sort((a, b) => effectiveMs(b) - effectiveMs(a))
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

  const handleKandidatenMehrClick = () => {
    onViewChange?.('tagesmenu');
  };

  const showKandidatenKarussell = !!(currentUser?.defaultWebImportListId && groups.find(g => g.id === currentUser.defaultWebImportListId));

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
      {showKandidatenKarussell && (
        <StartseitenKarussell
          title="Gemeinsame Kandidaten"
          items={gemeinsameKandidaten}
          loading={kandidatenLoading}
          renderItem={(recipe) => (
            <TrendingCard
              recipe={recipe}
              onSelectRecipe={onSelectRecipe}
              difficultyIcon={getEffectiveIcon(buttonIcons, 'trendingDifficultyIcon', isDarkMode)}
              timeIcon={getEffectiveIcon(buttonIcons, 'trendingTimeIcon', isDarkMode)}
            />
          )}
          emptyText={kandidatenHinweis}
          onMehr={handleKandidatenMehrClick}
        />
      )}
    </div>
  );
}

export default Startseite;

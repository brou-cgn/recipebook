import React, { useState, useEffect, useMemo } from 'react';
import './Startseite.css';
import { getRecentRecipeCalls } from '../utils/recipeCallsFirestore';
import { getAllCookDates } from '../utils/recipeCookDates';
import TrendingCard from './TrendingCard';
import StartseitenKarussell from './StartseitenKarussell';
import { getButtonIcons, DEFAULT_BUTTON_ICONS, getEffectiveIcon, getDarkModePreference, getGroupStatusThresholds, getMaxKandidatenSchwelle, getStartseitenKandidatenLeertext, DEFAULT_STARTSEITEN_KANDIDATEN_LEERTEXT } from '../utils/customLists';
import { getAllMembersSwipeFlags, computeGroupRecipeStatus } from '../utils/recipeSwipeFlags';

const TRENDING_DAYS = 7;
const TRENDING_TOP = 10;
const NEUE_REZEPTE_TOP = 10;
const ALLTAGSKLASSIKER_TOP = 10;
const SORT_STORAGE_KEY = 'recipebook_active_sort';

function Startseite({ currentUser, onViewChange, onSelectRecipe, recipes = [], groups = [], onCreateInspirationList, onAssignEverydayClassicsList, onOpenPrivateListRecipes }) {
  const [topRecipes, setTopRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [buttonIcons, setButtonIcons] = useState({ ...DEFAULT_BUTTON_ICONS });
  const [isDarkMode, setIsDarkMode] = useState(getDarkModePreference);
  const [isCreatingInspiration, setIsCreatingInspiration] = useState(false);
  const [showAlltagsklassikerPicker, setShowAlltagsklassikerPicker] = useState(false);
  const [isAssigningAlltagsklassiker, setIsAssigningAlltagsklassiker] = useState(false);
  const [lastOwnCookDateByRecipeId, setLastOwnCookDateByRecipeId] = useState({});

  // State for Gemeinsame Kandidaten carousel
  const [allMembersFlags, setAllMembersFlags] = useState({});
  const [groupThresholds, setGroupThresholds] = useState({});
  const [maxKandidatenSchwelle, setMaxKandidatenSchwelle] = useState(null);
  const [kandidatenLoading, setKandidatenLoading] = useState(true);
  const [kandidatenLeertext, setKandidatenLeertext] = useState(DEFAULT_STARTSEITEN_KANDIDATEN_LEERTEXT);

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

  // Load settings and swipe flags for Gemeinsame Kandidaten carousel
  useEffect(() => {
    let cancelled = false;
    const loadKandidatenSettings = async () => {
      try {
        const [thresholds, schwelle, leertext] = await Promise.all([
          getGroupStatusThresholds(),
          getMaxKandidatenSchwelle(),
          getStartseitenKandidatenLeertext(),
        ]);
        if (cancelled) return;
        setGroupThresholds(thresholds);
        setMaxKandidatenSchwelle(schwelle);
        setKandidatenLeertext(leertext);
      } catch (error) {
        // Keep defaults on error
      }
    };
    loadKandidatenSettings();
    return () => { cancelled = true; };
  }, []);

  // Derive the default web import list from groups and currentUser
  const defaultWebImportList = useMemo(() => {
    const listId = currentUser?.defaultWebImportListId;
    if (!listId) return null;
    return groups.find(g => g.id === listId) || null;
  }, [groups, currentUser?.defaultWebImportListId]);

  const privateListsForCurrentUser = useMemo(() => (
    groups.filter(g => g.type === 'private' && (g.ownerId === currentUser?.id || (Array.isArray(g.memberIds) && g.memberIds.includes(currentUser?.id))))
  ), [groups, currentUser?.id]);

  const defaultEverydayClassicsList = useMemo(() => {
    const listId = currentUser?.defaultEverydayClassicsListId;
    if (!listId) return null;
    return privateListsForCurrentUser.find(g => g.id === listId) || null;
  }, [privateListsForCurrentUser, currentUser?.defaultEverydayClassicsListId]);

  // Load allMembersFlags whenever the default web import list changes
  useEffect(() => {
    let cancelled = false;
    if (!defaultWebImportList) {
      setAllMembersFlags({});
      setKandidatenLoading(false);
      return;
    }
    setKandidatenLoading(true);
    const memberIds = Array.isArray(defaultWebImportList.memberIds) ? defaultWebImportList.memberIds : [];
    const allMemberIds = defaultWebImportList.ownerId
      ? [...new Set([defaultWebImportList.ownerId, ...memberIds])]
      : memberIds;
    if (allMemberIds.length === 0) {
      setAllMembersFlags({});
      setKandidatenLoading(false);
      return;
    }
    getAllMembersSwipeFlags(defaultWebImportList.id, allMemberIds)
      .then((flags) => {
        if (cancelled) return;
        setAllMembersFlags(flags);
        setKandidatenLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setAllMembersFlags({});
        setKandidatenLoading(false);
      });
    return () => { cancelled = true; };
  }, [defaultWebImportList]);

  // Compute list member IDs for the default web import list
  const listMemberIds = useMemo(() => {
    if (!defaultWebImportList) return [];
    const memberIds = Array.isArray(defaultWebImportList.memberIds) ? defaultWebImportList.memberIds : [];
    return defaultWebImportList.ownerId
      ? [...new Set([defaultWebImportList.ownerId, ...memberIds])]
      : memberIds;
  }, [defaultWebImportList]);

  // All recipes belonging to the default web import list
  const allListRecipes = useMemo(() => {
    if (!defaultWebImportList) return [];
    const groupRecipeIds = Array.isArray(defaultWebImportList.recipeIds) ? defaultWebImportList.recipeIds : [];
    return recipes.filter(
      (r) => r.groupId === defaultWebImportList.id || groupRecipeIds.includes(r.id)
    );
  }, [recipes, defaultWebImportList]);

  const allAlltagsklassikerRecipes = useMemo(() => {
    if (!defaultEverydayClassicsList) return [];
    const groupRecipeIds = Array.isArray(defaultEverydayClassicsList.recipeIds) ? defaultEverydayClassicsList.recipeIds : [];
    return recipes.filter(
      (r) => r.groupId === defaultEverydayClassicsList.id || groupRecipeIds.includes(r.id)
    );
  }, [recipes, defaultEverydayClassicsList]);

  // Precompute group status for each recipe in the list
  const groupStatusByRecipeId = useMemo(() => {
    if (listMemberIds.length <= 1) return {};
    return Object.fromEntries(
      allListRecipes.map((r) => {
        const status = computeGroupRecipeStatus(listMemberIds, allMembersFlags, r.id, groupThresholds, currentUser?.id);
        return [r.id, status];
      })
    );
  }, [allListRecipes, listMemberIds, allMembersFlags, groupThresholds, currentUser?.id]);

  // Gemeinsame Kandidaten: all recipes with group status 'kandidat', sorted alphabetically
  const gemeinsameKandidaten = useMemo(() => {
    if (maxKandidatenSchwelle === null || listMemberIds.length <= 1) return [];
    const pool = allListRecipes.filter((r) => groupStatusByRecipeId[r.id] === 'kandidat');
    return [...pool].sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' }));
  }, [allListRecipes, listMemberIds, groupStatusByRecipeId, maxKandidatenSchwelle]);

  const handleKandidatenMehrClick = () => {
    onViewChange?.('tagesmenu');
  };

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

  const handleCreateInspirationClick = async () => {
    if (!onCreateInspirationList || isCreatingInspiration) return;
    setIsCreatingInspiration(true);
    try {
      await onCreateInspirationList();
    } finally {
      setIsCreatingInspiration(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (!currentUser?.id || allAlltagsklassikerRecipes.length === 0) {
      setLastOwnCookDateByRecipeId((prev) => (Object.keys(prev).length > 0 ? {} : prev));
      return;
    }
    Promise.all(allAlltagsklassikerRecipes.map((recipe) => getAllCookDates(recipe.id)))
      .then((cookDateLists) => {
        if (cancelled) return;
        const nextMap = {};
        allAlltagsklassikerRecipes.forEach((recipe, index) => {
          const ownCookDates = (cookDateLists[index] || []).filter((cd) => cd.userId === currentUser.id);
          const lastOwn = ownCookDates.reduce((latest, current) => {
            const currentDate = current?.date instanceof Date ? current.date : new Date(current?.date);
            if (Number.isNaN(currentDate?.getTime?.())) return latest;
            return !latest || currentDate > latest ? currentDate : latest;
          }, null);
          nextMap[recipe.id] = lastOwn ? lastOwn.getTime() : 0;
        });
        setLastOwnCookDateByRecipeId(nextMap);
      })
      .catch(() => {
        if (cancelled) return;
        setLastOwnCookDateByRecipeId((prev) => (Object.keys(prev).length > 0 ? {} : prev));
      });
    return () => { cancelled = true; };
  }, [allAlltagsklassikerRecipes, currentUser?.id]);

  const alltagsklassikerRecipes = useMemo(() => (
    [...allAlltagsklassikerRecipes]
      .sort((a, b) => (lastOwnCookDateByRecipeId[b.id] || 0) - (lastOwnCookDateByRecipeId[a.id] || 0))
      .slice(0, ALLTAGSKLASSIKER_TOP)
  ), [allAlltagsklassikerRecipes, lastOwnCookDateByRecipeId]);

  const handleAssignAlltagsklassikerList = async (listId) => {
    if (!onAssignEverydayClassicsList || isAssigningAlltagsklassiker) return;
    setIsAssigningAlltagsklassiker(true);
    try {
      const success = await onAssignEverydayClassicsList(listId);
      if (success) {
        setShowAlltagsklassikerPicker(false);
      }
    } finally {
      setIsAssigningAlltagsklassiker(false);
    }
  };

  const handleAlltagsklassikerMehrClick = () => {
    if (defaultEverydayClassicsList?.id && onOpenPrivateListRecipes) {
      onOpenPrivateListRecipes(defaultEverydayClassicsList.id);
      return;
    }
    onViewChange?.('recipes');
  };

  // Condition: show setup button when no default list or the list is not interactive
  const showInspirationSetupButton = !defaultWebImportList || defaultWebImportList.listKind !== 'interactive';
  const showInspirationButtonInKochideen = showInspirationSetupButton && onCreateInspirationList;
  const showAlltagsklassikerSetupButton = !defaultEverydayClassicsList;

  return (
    <div className="startseite-container">
      {showAlltagsklassikerPicker && (
        <div className="startseite-alltagsklassiker-picker-overlay">
          <div className="startseite-alltagsklassiker-picker">
            <div className="startseite-alltagsklassiker-picker-header">
              <h3>Alltagsklassiker zuordnen</h3>
              <button
                type="button"
                className="startseite-alltagsklassiker-picker-close"
                onClick={() => setShowAlltagsklassikerPicker(false)}
                aria-label="Schließen"
                disabled={isAssigningAlltagsklassiker}
              >
                ×
              </button>
            </div>
            <div className="startseite-alltagsklassiker-picker-list">
              {privateListsForCurrentUser.map((list) => (
                <button
                  key={list.id}
                  type="button"
                  className="startseite-alltagsklassiker-picker-item"
                  onClick={() => handleAssignAlltagsklassikerList(list.id)}
                  disabled={isAssigningAlltagsklassiker}
                >
                  {list.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      <StartseitenKarussell
        title="Meine Kochideen"
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
        emptyText={showInspirationButtonInKochideen ? '' : kandidatenLeertext}
        emptyContent={showInspirationButtonInKochideen ? (
          <div className="startseite-inspiration-setup">
            <button
              type="button"
              className="startseite-inspiration-btn"
              onClick={handleCreateInspirationClick}
              disabled={isCreatingInspiration}
            >
              {isCreatingInspiration ? 'Wird angelegt…' : 'Inspirationssammlung anlegen'}
            </button>
          </div>
        ) : null}
        onMehr={handleKandidatenMehrClick}
      />
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
      <StartseitenKarussell
        title="Meine Alltagsklassiker"
        items={alltagsklassikerRecipes}
        loading={false}
        renderItem={(recipe) => (
          <TrendingCard
            recipe={recipe}
            onSelectRecipe={onSelectRecipe}
            difficultyIcon={getEffectiveIcon(buttonIcons, 'trendingDifficultyIcon', isDarkMode)}
            timeIcon={getEffectiveIcon(buttonIcons, 'trendingTimeIcon', isDarkMode)}
          />
        )}
        emptyText={showAlltagsklassikerSetupButton ? '' : 'Keine Alltagsklassiker vorhanden.'}
        emptyContent={showAlltagsklassikerSetupButton ? (
          <div className="startseite-inspiration-setup">
            <button
              type="button"
              className="startseite-inspiration-btn"
              onClick={() => setShowAlltagsklassikerPicker(true)}
              disabled={!onAssignEverydayClassicsList || privateListsForCurrentUser.length === 0 || isAssigningAlltagsklassiker}
            >
              Alltagsklassiker zuordnen
            </button>
          </div>
        ) : null}
        onMehr={handleAlltagsklassikerMehrClick}
      />
    </div>
  );
}

export default Startseite;

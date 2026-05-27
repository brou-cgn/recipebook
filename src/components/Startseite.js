import React, { useState, useEffect, useMemo } from 'react';
import './Startseite.css';
import { getRecentRecipeCalls } from '../utils/recipeCallsFirestore';
import { getAllCookDates } from '../utils/recipeCookDates';
import { getUserFavorites } from '../utils/userFavorites';
import TrendingCard from './TrendingCard';
import StartseitenKarussell from './StartseitenKarussell';
import { getButtonIcons, DEFAULT_BUTTON_ICONS, getEffectiveIcon, getDarkModePreference, getGroupStatusThresholds, getMaxKandidatenSchwelle, getStartseitenKandidatenLeertext, DEFAULT_STARTSEITEN_KANDIDATEN_LEERTEXT, DEFAULT_MAX_KANDIDATEN_SCHWELLE } from '../utils/customLists';
import { getAllMembersSwipeFlagDocsForList } from '../utils/recipeSwipeFlags';
import { isBase64Image } from '../utils/imageUtils';
import { subscribeToSeasonMatrix } from '../utils/seasonMatrix';
import { calculateRecipeSortIndex, hasHauptsaisonIngredient } from '../utils/recipeSortIndex';

const TRENDING_DAYS = 7;
const TRENDING_TOP = 10;
const SAISONALE_REZEPTE_TOP = 10;
const NEUE_REZEPTE_TOP = 10;
const ALLTAGSKLASSIKER_TOP = 10;
const KOCHIDEEN_KARUSSELL_MAX = 6;
const SORT_STORAGE_KEY = 'recipebook_active_sort';

function Startseite({ currentUser, onViewChange, onSelectRecipe, recipes = [], groups = [], groupsLoading = false, onCreateInspirationList, onSelectExistingInspirationList, onAssignEverydayClassicsList, onOpenPrivateListRecipes, onOpenSeasonalRecipes, onAddRecipe }) {
  const [topRecipes, setTopRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [buttonIcons, setButtonIcons] = useState({ ...DEFAULT_BUTTON_ICONS });
  const [isDarkMode, setIsDarkMode] = useState(getDarkModePreference);
  const [isCreatingInspiration, setIsCreatingInspiration] = useState(false);
  const [showInspirationPicker, setShowInspirationPicker] = useState(false);
  const [showAlltagsklassikerPicker, setShowAlltagsklassikerPicker] = useState(false);
  const [isAssigningAlltagsklassiker, setIsAssigningAlltagsklassiker] = useState(false);
  const [lastOwnCookDateByRecipeId, setLastOwnCookDateByRecipeId] = useState({});
  const [favoriteRecipeIds, setFavoriteRecipeIds] = useState([]);
  const [seasonMatrixEntries, setSeasonMatrixEntries] = useState([]);

  // State for Gemeinsame Kandidaten carousel
  const [allMembersFlagDocs, setAllMembersFlagDocs] = useState({});
  const [groupThresholds, setGroupThresholds] = useState({});
  const [maxKandidatenSchwelle, setMaxKandidatenSchwelle] = useState(DEFAULT_MAX_KANDIDATEN_SCHWELLE);
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

  // Derive the default web import list from groups and currentUser
  const defaultWebImportList = useMemo(() => {
    const listId = currentUser?.defaultWebImportListId;
    if (!listId) return null;
    return groups.find(g => g.id === listId) || null;
  }, [groups, currentUser?.defaultWebImportListId]);

  const privateListsForCurrentUser = useMemo(() => (
    groups.filter(g => g.type === 'private' && (g.ownerId === currentUser?.id || (Array.isArray(g.memberIds) && g.memberIds.includes(currentUser?.id))))
  ), [groups, currentUser?.id]);

  const interactiveListsForCurrentUser = useMemo(() => (
    privateListsForCurrentUser.filter(g => g.listKind === 'interactive')
  ), [privateListsForCurrentUser]);

  const defaultEverydayClassicsList = useMemo(() => {
    const listId = currentUser?.defaultEverydayClassicsListId;
    if (!listId) return null;
    return privateListsForCurrentUser.find(g => g.id === listId) || null;
  }, [privateListsForCurrentUser, currentUser?.defaultEverydayClassicsListId]);

  useEffect(() => {
    const unsubscribe = subscribeToSeasonMatrix((entries) => {
      setSeasonMatrixEntries(Array.isArray(entries) ? entries : []);
    });

    return () => unsubscribe();
  }, []);

  // Load settings and swipe flags for Gemeinsame Kandidaten carousel in parallel.
  // Settings are fetched unconditionally; swipe flags require defaultWebImportList.
  // Starting both at the same time reduces total wait to max(settingsTime, swipeFlagsTime).
  useEffect(() => {
    let cancelled = false;
    setKandidatenLoading(true);
    const memberIds = defaultWebImportList ? (Array.isArray(defaultWebImportList.memberIds) ? defaultWebImportList.memberIds : []) : [];
    const allMemberIds = defaultWebImportList?.ownerId
      ? [...new Set([defaultWebImportList.ownerId, ...memberIds])]
      : memberIds;
    const swipeFlagsPromise = defaultWebImportList && allMemberIds.length > 0
      ? getAllMembersSwipeFlagDocsForList(defaultWebImportList.id, allMemberIds)
      : Promise.resolve({});
    Promise.all([
      Promise.all([getGroupStatusThresholds(), getMaxKandidatenSchwelle(), getStartseitenKandidatenLeertext()]),
      swipeFlagsPromise,
    ]).then(([[thresholds, schwelle, leertext], flagDocs]) => {
      if (cancelled) return;
      setGroupThresholds(thresholds);
      setMaxKandidatenSchwelle(schwelle);
      setKandidatenLeertext(leertext);
      setAllMembersFlagDocs(flagDocs);
      setKandidatenLoading(false);
    }).catch(() => {
      if (cancelled) return;
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

  const recipesWithCookDateLookup = useMemo(() => {
    const recipeById = new Map();
    [...recipes, ...allAlltagsklassikerRecipes].forEach((recipe) => {
      if (!recipe?.id || recipeById.has(recipe.id)) return;
      recipeById.set(recipe.id, recipe);
    });
    return Array.from(recipeById.values());
  }, [recipes, allAlltagsklassikerRecipes]);

  // Gemeinsame Kandidaten: recipes where at least one member's calculatedFlag is 'kandidat'
  // with a future calculatedExpiresAt. Sorted alphabetically.
  // Note: in allMembersFlagDocs, `.flag` stores calculatedFlag, `.explicitFlag` stores the
  // explicit swipe flag, and `.expiresAtMillis` stores calculatedExpiresAt in ms.
  const kandidatRecipeIds = useMemo(() => {
    const ids = new Set();
    for (const uid of listMemberIds) {
      const userDocs = allMembersFlagDocs[uid] || {};
      for (const [recipeId, doc] of Object.entries(userDocs)) {
        if (doc && doc.explicitFlag !== null && doc.flag === 'kandidat' && !doc.isExpired && doc.expiresAtMillis !== null) {
          ids.add(recipeId);
        }
      }
    }
    return ids;
  }, [allMembersFlagDocs, listMemberIds]);

  const gemeinsameKandidaten = useMemo(() => {
    if (maxKandidatenSchwelle === null || listMemberIds.length <= 1) return [];
    const pool = allListRecipes.filter((r) => {
      const currentUserDoc = allMembersFlagDocs[currentUser?.id]?.[r.id];
      if (!currentUserDoc || currentUserDoc.explicitFlag === null) return false;
      return kandidatRecipeIds.has(r.id);
    });
    const sorted = [...pool].sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' }));
    return sorted.slice(0, maxKandidatenSchwelle);
  }, [allListRecipes, listMemberIds, allMembersFlagDocs, currentUser?.id, maxKandidatenSchwelle, kandidatRecipeIds]);

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
    const currentMonth = new Date().getMonth() + 1;
    return [...recipes]
      .sort((a, b) => {
        const scoreA = calculateRecipeSortIndex({
          isFavorite: favoriteRecipeIds.includes(a.id),
          lastCookDateMs: lastOwnCookDateByRecipeId[a.id] ?? null,
          seasonMatrixEntries,
          recipe: a,
          currentMonth,
        });
        const scoreB = calculateRecipeSortIndex({
          isFavorite: favoriteRecipeIds.includes(b.id),
          lastCookDateMs: lastOwnCookDateByRecipeId[b.id] ?? null,
          seasonMatrixEntries,
          recipe: b,
          currentMonth,
        });
        const scoreDiff = scoreB - scoreA;
        if (scoreDiff !== 0) return scoreDiff;

        const titleDiff = (a.title || '').localeCompare((b.title || ''), undefined, { sensitivity: 'base' });
        if (titleDiff !== 0) return titleDiff;

        return (a.id || '').localeCompare((b.id || ''), undefined, { sensitivity: 'base' });
      })
      .slice(0, NEUE_REZEPTE_TOP);
  }, [recipes, lastOwnCookDateByRecipeId, favoriteRecipeIds, seasonMatrixEntries]);

  const saisonaleRezepte = useMemo(() => (
    recipes
      .filter((recipe) => hasHauptsaisonIngredient(recipe, seasonMatrixEntries))
      .slice(0, SAISONALE_REZEPTE_TOP)
  ), [recipes, seasonMatrixEntries]);

  const handleNeueRezepteMehrClick = () => {
    try {
      sessionStorage.setItem(SORT_STORAGE_KEY, 'newest');
    } catch (e) {
      // sessionStorage might be unavailable in some environments
    }
    onViewChange?.('neueRezepte');
  };

  const handleSaisonaleRezepteMehrClick = () => {
    if (onOpenSeasonalRecipes) {
      onOpenSeasonalRecipes();
      return;
    }
    onViewChange?.('seasonalRecipes');
  };

  const handleCreateInspirationClick = async () => {
    if (!onCreateInspirationList || isCreatingInspiration) return;
    if (interactiveListsForCurrentUser.length > 0 && onSelectExistingInspirationList) {
      setShowInspirationPicker(true);
      return;
    }
    setIsCreatingInspiration(true);
    try {
      await onCreateInspirationList();
    } finally {
      setIsCreatingInspiration(false);
    }
  };

  const handleInspirationPickerSelect = async (listId) => {
    setShowInspirationPicker(false);
    setIsCreatingInspiration(true);
    try {
      if (listId === '__new__') {
        await onCreateInspirationList();
      } else if (onSelectExistingInspirationList) {
        await onSelectExistingInspirationList(listId);
      }
    } finally {
      setIsCreatingInspiration(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (!currentUser?.id) {
      setFavoriteRecipeIds([]);
      return;
    }

    getUserFavorites(currentUser.id)
      .then((favoriteIds) => {
        if (cancelled) return;
        setFavoriteRecipeIds(Array.isArray(favoriteIds) ? favoriteIds : []);
      })
      .catch(() => {
        if (cancelled) return;
        setFavoriteRecipeIds([]);
      });

    return () => { cancelled = true; };
  }, [currentUser?.id]);

  useEffect(() => {
    let cancelled = false;
    if (!currentUser?.id || recipesWithCookDateLookup.length === 0) {
      setLastOwnCookDateByRecipeId((prev) => (Object.keys(prev).length > 0 ? {} : prev));
      return;
    }
    Promise.all(recipesWithCookDateLookup.map((recipe) => getAllCookDates(recipe.id)))
      .then((cookDateLists) => {
        if (cancelled) return;
        const nextMap = {};
        recipesWithCookDateLookup.forEach((recipe, index) => {
          const ownCookDates = (cookDateLists[index] || []).filter((cd) => cd.userId === currentUser.id);
          const lastOwn = ownCookDates.reduce((latest, current) => {
            const currentDate = current?.date instanceof Date ? current.date : new Date(current?.date);
            if (Number.isNaN(currentDate?.getTime?.())) return latest;
            return !latest || currentDate > latest ? currentDate : latest;
          }, null);
          nextMap[recipe.id] = lastOwn ? lastOwn.getTime() : null;
        });
        setLastOwnCookDateByRecipeId(nextMap);
      })
      .catch(() => {
        if (cancelled) return;
        setLastOwnCookDateByRecipeId((prev) => (Object.keys(prev).length > 0 ? {} : prev));
      });
    return () => { cancelled = true; };
  }, [recipesWithCookDateLookup, currentUser?.id]);

  const alltagsklassikerRecipes = useMemo(() => {
    const currentMonth = new Date().getMonth() + 1;

    return [...allAlltagsklassikerRecipes]
      .sort((a, b) => {
        const scoreA = calculateRecipeSortIndex({
          isFavorite: favoriteRecipeIds.includes(a.id),
          lastCookDateMs: lastOwnCookDateByRecipeId[a.id] ?? null,
          seasonMatrixEntries,
          recipe: a,
          currentMonth,
        });
        const scoreB = calculateRecipeSortIndex({
          isFavorite: favoriteRecipeIds.includes(b.id),
          lastCookDateMs: lastOwnCookDateByRecipeId[b.id] ?? null,
          seasonMatrixEntries,
          recipe: b,
          currentMonth,
        });
        const scoreDiff = scoreB - scoreA;
        if (scoreDiff !== 0) return scoreDiff;

        const titleDiff = (a.title || '').localeCompare((b.title || ''), undefined, { sensitivity: 'base' });
        if (titleDiff !== 0) return titleDiff;

        return (a.id || '').localeCompare((b.id || ''), undefined, { sensitivity: 'base' });
      })
      .slice(0, ALLTAGSKLASSIKER_TOP);
  }, [allAlltagsklassikerRecipes, lastOwnCookDateByRecipeId, favoriteRecipeIds, seasonMatrixEntries]);

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
  const showInspirationSetupButton = !groupsLoading && (!defaultWebImportList || defaultWebImportList.listKind !== 'interactive');
  const showInspirationButtonInKochideen = showInspirationSetupButton && onCreateInspirationList;
  const showAlltagsklassikerSetupButton = !groupsLoading && !defaultEverydayClassicsList;

  return (
    <div className="startseite-container">
      {showInspirationPicker && (
        <div className="startseite-inspiration-picker-overlay">
          <div className="startseite-inspiration-picker">
            <div className="startseite-inspiration-picker-header">
              <h3>Inspirationssammlung auswählen</h3>
              <button
                type="button"
                className="startseite-inspiration-picker-close"
                onClick={() => setShowInspirationPicker(false)}
                aria-label="Schließen"
                disabled={isCreatingInspiration}
              >
                ×
              </button>
            </div>
            <div className="startseite-inspiration-picker-list">
              {interactiveListsForCurrentUser.map((list) => (
                <button
                  key={list.id}
                  type="button"
                  className="startseite-inspiration-picker-item"
                  onClick={() => handleInspirationPickerSelect(list.id)}
                  disabled={isCreatingInspiration}
                >
                  {list.name}
                </button>
              ))}
              <button
                type="button"
                className="startseite-inspiration-picker-item startseite-inspiration-picker-item--new"
                onClick={() => handleInspirationPickerSelect('__new__')}
                disabled={isCreatingInspiration}
              >
                Neue Liste erstellen
              </button>
            </div>
          </div>
        </div>
      )}
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
        items={gemeinsameKandidaten.slice(0, KOCHIDEEN_KARUSSELL_MAX)}
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
        titleAction={!showInspirationSetupButton && onAddRecipe ? (
          <button
            type="button"
            className="startseite-add-recipe-btn"
            onClick={() => onAddRecipe(defaultWebImportList.id)}
            title="Neues Rezept hinzufügen"
            aria-label="Neues Rezept hinzufügen"
          >
            {isBase64Image(getEffectiveIcon(buttonIcons, 'addRecipeToList', isDarkMode)) ? (
              <img src={getEffectiveIcon(buttonIcons, 'addRecipeToList', isDarkMode)} alt="Neues Rezept hinzufügen" className="button-icon-image" draggable="false" />
            ) : (
              getEffectiveIcon(buttonIcons, 'addRecipeToList', isDarkMode)
            )}
          </button>
        ) : null}
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
        titleAction={!showAlltagsklassikerSetupButton && onAddRecipe ? (
          <button
            type="button"
            className="startseite-add-recipe-btn"
            onClick={() => onAddRecipe(defaultEverydayClassicsList.id)}
            title="Neues Rezept hinzufügen"
            aria-label="Neues Rezept hinzufügen"
          >
            {isBase64Image(getEffectiveIcon(buttonIcons, 'addRecipeToList', isDarkMode)) ? (
              <img src={getEffectiveIcon(buttonIcons, 'addRecipeToList', isDarkMode)} alt="Neues Rezept hinzufügen" className="button-icon-image" draggable="false" />
            ) : (
              getEffectiveIcon(buttonIcons, 'addRecipeToList', isDarkMode)
            )}
          </button>
        ) : null}
      />
      <div className="startseite-rezeptsammlungen-wrapper">
        <button
          type="button"
          className="startseite-rezeptsammlungen-btn"
          onClick={() => onViewChange?.('groups')}
        >
          Meine Rezeptsammlungen
        </button>
      </div>
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
        title="Saisonale Rezepte"
        items={saisonaleRezepte}
        loading={false}
        renderItem={(recipe) => (
          <TrendingCard
            recipe={recipe}
            onSelectRecipe={onSelectRecipe}
            difficultyIcon={getEffectiveIcon(buttonIcons, 'trendingDifficultyIcon', isDarkMode)}
            timeIcon={getEffectiveIcon(buttonIcons, 'trendingTimeIcon', isDarkMode)}
          />
        )}
        emptyText="Keine saisonalen Rezepte vorhanden."
        onMehr={handleSaisonaleRezepteMehrClick}
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

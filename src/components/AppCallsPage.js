import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import './AppCallsPage.css';
import { getAppCalls } from '../utils/appCallsFirestore';
import { getRecipeCalls } from '../utils/recipeCallsFirestore';
import {
  getButtonIcons,
  DEFAULT_BUTTON_ICONS,
  getEffectiveIcon,
  getDarkModePreference,
  getCustomLists,
  saveCustomLists,
  getInspirationListSettings,
  saveInspirationListSettings,
  DEFAULT_INSPIRATION_LIST_NAME,
  DEFAULT_INSPIRATION_LIST_DESCRIPTION,
  DEFAULT_INSPIRATION_TARGET_LIST_NAME,
  DEFAULT_INSPIRATION_TARGET_LIST_DESCRIPTION,
} from '../utils/customLists';
import { isBase64Image } from '../utils/imageUtils';
import { enableRecipeSharing } from '../utils/recipeFirestore';
import { useNutritionReference } from '../contexts/NutritionReferenceContext';
import NutritionModal from './NutritionModal';
import { db } from '../firebase';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  buildPendingNutritionReferenceDraft,
  hasMissingIngredientIDs,
  setCustomIngredientMatchingTerms,
} from '../utils/ingredientIdMatching';
import { NUTRITION_REFERENCE_NEW_STATUS, normalizeNutritionReferenceId } from '../utils/nutritionReferenceUtils';
import {
  getCuisineProposals,
  updateCuisineProposal,
  releaseCuisineProposal,
} from '../utils/cuisineProposalsFirestore';
import {
  INGREDIENT_MATCH_CREATE_NEW_OPTION,
  INGREDIENT_MATCH_IGNORE_OPTION,
  useIngredientIDMatching,
} from '../hooks/useIngredientIDMatching';

function CuisineTypeListItem({ label, onRemove, onRename }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(label);

  const handleEditStart = () => {
    setEditValue(label);
    setIsEditing(true);
  };

  const handleEditConfirm = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== label && onRename) {
      onRename(label, trimmed);
    }
    setIsEditing(false);
  };

  const handleEditKeyDown = (e) => {
    if (e.key === 'Enter') handleEditConfirm();
    else if (e.key === 'Escape') setIsEditing(false);
  };

  return (
    <div className="list-item">
      {isEditing ? (
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleEditConfirm}
          onKeyDown={handleEditKeyDown}
          autoFocus
          className="list-item-edit-input"
          aria-label="Kulinariktyp umbenennen"
        />
      ) : (
        <span>{label}</span>
      )}
      {onRename && !isEditing && (
        <button className="edit-btn" onClick={handleEditStart} title="Umbenennen">✎</button>
      )}
      <button className="remove-btn" onClick={onRemove} title="Entfernen">×</button>
    </div>
  );
}

function AppCallsPage({ onBack, currentUser, recipes = [], onUpdateRecipe, onSelectRecipe, activeTab: activeTabProp, onActiveTabChange }) {
  const [appCalls, setAppCalls] = useState([]);
  const [recipeCalls, setRecipeCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const isControlled = activeTabProp !== undefined && onActiveTabChange !== undefined;
  const [localActiveTab, setLocalActiveTab] = useState(activeTabProp ?? 'app');
  const activeTab = isControlled ? activeTabProp : localActiveTab;
  const setActiveTab = (tab) => {
    if (isControlled) {
      onActiveTabChange(tab);
    } else {
      setLocalActiveTab(tab);
    }
  };
  const [closeIcon, setCloseIcon] = useState(DEFAULT_BUTTON_ICONS.privateListBack);
  const [allButtonIcons, setAllButtonIcons] = useState({ ...DEFAULT_BUTTON_ICONS });
  const [isDarkMode, setIsDarkMode] = useState(getDarkModePreference);
  const [creatingShareIds, setCreatingShareIds] = useState({});
  const [sharedRecipeIds, setSharedRecipeIds] = useState(new Set());
  const [shareLinkErrors, setShareLinkErrors] = useState({});
  const [abortingCalcId, setAbortingCalcId] = useState(null);
  const [selectedNutritionRecipeId, setSelectedNutritionRecipeId] = useState(null);
  const [retryAutoCalculateToken, setRetryAutoCalculateToken] = useState(0);
  const [expandedAppCallId, setExpandedAppCallId] = useState(null);
  const [expandedRecipeCallId, setExpandedRecipeCallId] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [filterBenjaminRousselli, setFilterBenjaminRousselli] = useState(true);
  const tabsRef = useRef(null);
  const ingredientMatchFromModalRef = useRef(false);
  const { rows: nutritionReferenceRows, reload: reloadNutritionReferences } = useNutritionReference();

  // Kulinariktypen state
  const [cuisineProposals, setCuisineProposals] = useState([]);
  const [cuisineTypes, setCuisineTypes] = useState([]);
  const [cuisineGroups, setCuisineGroups] = useState([]);
  const [editingProposalId, setEditingProposalId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [editingGroup, setEditingGroup] = useState('');
  const [releasingId, setReleasingId] = useState(null);

  // Cuisine list management state
  const [newCuisineTypeName, setNewCuisineTypeName] = useState('');
  const [newCuisineGroupName, setNewCuisineGroupName] = useState('');
  const [customIngredientUnits, setCustomIngredientUnits] = useState([]);
  const [customIngredientAdjectives, setCustomIngredientAdjectives] = useState([]);
  const [newCustomIngredientUnit, setNewCustomIngredientUnit] = useState('');
  const [newCustomIngredientAdjective, setNewCustomIngredientAdjective] = useState('');
  const [standardTermsFeedback, setStandardTermsFeedback] = useState('');
  const [standardTermsDeployFeedback, setStandardTermsDeployFeedback] = useState('');
  const [deployingStandardTerms, setDeployingStandardTerms] = useState(false);
  const [inspirationListName, setInspirationListName] = useState(DEFAULT_INSPIRATION_LIST_NAME);
  const [inspirationListDescription, setInspirationListDescription] = useState(DEFAULT_INSPIRATION_LIST_DESCRIPTION);
  const [inspirationTargetListName, setInspirationTargetListName] = useState(DEFAULT_INSPIRATION_TARGET_LIST_NAME);
  const [inspirationTargetListDescription, setInspirationTargetListDescription] = useState(DEFAULT_INSPIRATION_TARGET_LIST_DESCRIPTION);
  const [savingKochatelierSettings, setSavingKochatelierSettings] = useState(false);
  const [kochatelierSettingsFeedback, setKochatelierSettingsFeedback] = useState('');
  const inspirationDescriptionRef = useRef(null);
  const targetDescriptionRef = useRef(null);
  const canManageKochatelierSettings = currentUser?.role === 'admin' || currentUser?.role === 'moderator' || currentUser?.isAdmin === true;

  const resizeTextarea = useCallback((textarea) => {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, []);

  useEffect(() => {
    const loadData = async () => {
      const [fetchedAppCalls, fetchedRecipeCalls] = await Promise.all([getAppCalls(), getRecipeCalls()]);
      setAppCalls(fetchedAppCalls);
      setRecipeCalls(fetchedRecipeCalls);
      setLoading(false);
    };
    loadData();
    getButtonIcons().then((icons) => {
      setAllButtonIcons(icons);
    });
    // Load cuisine data (types + groups + proposals)
    getCustomLists().then((lists) => {
      setCuisineTypes(lists.cuisineTypes || []);
      setCuisineGroups(lists.cuisineGroups || []);
      const loadedCustomUnits = Array.isArray(lists.customUnits) ? lists.customUnits : [];
      const loadedCustomAdjectives = Array.isArray(lists.customIngredientAdjectives) ? lists.customIngredientAdjectives : [];
      setCustomIngredientUnits(loadedCustomUnits);
      setCustomIngredientAdjectives(loadedCustomAdjectives);
      setCustomIngredientMatchingTerms({
        units: loadedCustomUnits,
        adjectives: loadedCustomAdjectives,
      });
    }).catch(() => {});
    getCuisineProposals().then((proposals) => {
      setCuisineProposals(proposals);
    }).catch(() => {});
    getInspirationListSettings().then((settings) => {
      setInspirationListName(settings.inspirationListName);
      setInspirationListDescription(settings.inspirationListDescription);
      setInspirationTargetListName(settings.inspirationTargetListName);
      setInspirationTargetListDescription(settings.inspirationTargetListDescription);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setCloseIcon(getEffectiveIcon(allButtonIcons, 'privateListBack', isDarkMode) || DEFAULT_BUTTON_ICONS.privateListBack);
  }, [allButtonIcons, isDarkMode]);

  useEffect(() => {
    const handler = (e) => setIsDarkMode(e.detail.isDark);
    window.addEventListener('darkModeChange', handler);
    return () => window.removeEventListener('darkModeChange', handler);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    resizeTextarea(inspirationDescriptionRef.current);
    resizeTextarea(targetDescriptionRef.current);
  }, [inspirationListDescription, inspirationTargetListDescription, resizeTextarea]);

  const recipesWithoutLink = useMemo(
    () => recipes.filter(r => r.publishedToPublic && !r.shareId && !sharedRecipeIds.has(r.id)),
    [recipes, sharedRecipeIds]
  );

  const filteredAppCalls = useMemo(
    () => filterBenjaminRousselli
      ? appCalls.filter(c => !(c.userVorname === 'Benjamin' && c.userNachname === 'Rousselli'))
      : appCalls,
    [appCalls, filterBenjaminRousselli]
  );

  const nutritionListData = useMemo(() => {
    const withNutrition = recipes.filter((recipe) => recipe.naehrwerte);
    const pending = withNutrition.filter((recipe) => recipe.naehrwerte?.calcPending === true);
    const completed = withNutrition
      .filter((recipe) => recipe.naehrwerte?.calcPending !== true)
      .sort((a, b) => {
        const aDate = a.naehrwerte?.calcCompletedAt ?? a.naehrwerte?.calcPendingAt ?? 0;
        const bDate = b.naehrwerte?.calcCompletedAt ?? b.naehrwerte?.calcPendingAt ?? 0;
        if (bDate !== aDate) return bDate - aDate;
        const aTitle = (a.title || a.id || '').toString();
        const bTitle = (b.title || b.id || '').toString();
        return aTitle.localeCompare(bTitle, 'de-DE');
      });
    return { pending, completed };
  }, [recipes]);

  // Fehlende Zutaten-IDs tab state
  const [assigningIngredientIdRecipeId, setAssigningIngredientIdRecipeId] = useState(null);

  const recipesWithMissingIngredientIDs = useMemo(
    () =>
      recipes
        .filter((recipe) => hasMissingIngredientIDs(recipe))
        .sort((a, b) => (a.title || a.id || '').localeCompare(b.title || b.id || '', 'de-DE')),
    [recipes]
  );

  const selectedNutritionRecipe = useMemo(
    () => recipes.find((recipe) => recipe.id === selectedNutritionRecipeId) || null,
    [recipes, selectedNutritionRecipeId]
  );
  const {
    ingredientMatchDialog,
    setIngredientMatchDialog,
    persistIngredientIDs,
    handleEnsureIngredientIDsForModal,
  } = useIngredientIDMatching({
    recipe: selectedNutritionRecipe,
    nutritionReferenceRows,
    currentUserId: currentUser?.id || null,
    ingredientMatchFromModalRef,
    persistIngredientIDs: async ({ recipe: targetRecipe, fieldName, updatedIngredients }) => {
      const recipeId = targetRecipe?.id;
      if (!recipeId || !fieldName || !onUpdateRecipe) return;
      try {
        await onUpdateRecipe(recipeId, { [fieldName]: updatedIngredients });
      } catch (err) {
        console.error('Could not persist ingredientIDs:', err);
      }
    },
  });

  const hasNotIncludedNutritionIngredients = (recipe) => (
    Array.isArray(recipe?.naehrwerte?.calcNotIncluded) && recipe.naehrwerte.calcNotIncluded.length > 0
  );

  const handleAssignIngredientIDs = async (recipe) => {
    setAssigningIngredientIdRecipeId(recipe.id);
    try {
      await handleEnsureIngredientIDsForModal(recipe);
    } finally {
      setAssigningIngredientIdRecipeId(null);
    }
  };

  const formatCalcDuration = useCallback((calcPendingAt) => {
    if (!calcPendingAt) return null;
    const startTime = new Date(calcPendingAt);
    const elapsedMs = now - calcPendingAt;
    const elapsedMin = Math.floor(elapsedMs / 60000);
    const timeStr = startTime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    if (elapsedMin < 1) return `${timeStr} Uhr (< 1 min)`;
    if (elapsedMin < 60) return `${timeStr} Uhr (${elapsedMin} min)`;
    const h = Math.floor(elapsedMin / 60);
    const m = elapsedMin % 60;
    return `${timeStr} Uhr (${h} h ${m} min)`;
  }, [now]);

  const handleCreateShareLink = async (recipe) => {
    setCreatingShareIds(prev => ({ ...prev, [recipe.id]: true }));
    setShareLinkErrors(prev => ({ ...prev, [recipe.id]: null }));
    try {
      await enableRecipeSharing(recipe.id);
      setSharedRecipeIds(prev => new Set([...Array.from(prev), recipe.id]));
    } catch (err) {
      console.error('Error creating share link:', err);
      setShareLinkErrors(prev => ({ ...prev, [recipe.id]: 'Fehler beim Erstellen des Links.' }));
    } finally {
      setCreatingShareIds(prev => ({ ...prev, [recipe.id]: false }));
    }
  };

  const handleAbortCalcForRecipe = async (recipe) => {
    if (!onUpdateRecipe) return;
    setAbortingCalcId(recipe.id);
    try {
      await onUpdateRecipe(recipe.id, {
        naehrwerte: {
          ...(recipe.naehrwerte || {}),
          calcPending: false,
          calcCompletedAt: Date.now(),
          calcError: 'Berechnung abgebrochen',
        },
      });
    } catch (err) {
      console.error('Error aborting calculation:', err);
    } finally {
      setAbortingCalcId(null);
    }
  };

  const handleSaveNutrition = async (recipeId, naehrwerte) => {
    if (!onUpdateRecipe) return;
    await onUpdateRecipe(recipeId, { naehrwerte });
  };

  const handleIngredientMatchSelectionChange = (index, ingredientID) => {
    setIngredientMatchDialog((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        errorMessage: '',
        selections: {
          ...prev.selections,
          [index]: ingredientID,
        },
      };
    });
  };

  const handleIngredientMatchConfirm = async () => {
    if (!ingredientMatchDialog) return;
    const { recipe: dialogRecipe, fieldName, updatedIngredients, unresolved, selections } = ingredientMatchDialog;
    const nextIngredients = [...updatedIngredients];
    const createdReferenceDrafts = new Map();
    const referencesToCreate = [];

    for (const entry of unresolved) {
      const selectedOption = String(selections?.[entry.index] || '').trim();
      if (!selectedOption) {
        setIngredientMatchDialog((prev) => prev ? {
          ...prev,
          errorMessage: 'Bitte für jede Zutat eine ingredientID auswählen.',
        } : prev);
        return;
      }

      if (selectedOption === INGREDIENT_MATCH_IGNORE_OPTION) {
        const original = nextIngredients[entry.index];
        nextIngredients[entry.index] = typeof original === 'string'
          ? { type: 'ingredient', text: original, ingredientID: '', ignoreNutritionCalculation: true }
          : { ...original, ingredientID: '', ignoreNutritionCalculation: true };
        continue;
      }

      let selectedIngredientID = selectedOption;
      if (selectedOption === INGREDIENT_MATCH_CREATE_NEW_OPTION) {
        const draftKey = buildPendingNutritionReferenceDraft(entry.ingredient, nutritionReferenceRows);
        const createdDraft = draftKey?.canonicalKey
          ? createdReferenceDrafts.get(draftKey.canonicalKey)
          : null;
        const nextDraft = createdDraft || buildPendingNutritionReferenceDraft(
          entry.ingredient,
          [...nutritionReferenceRows, ...Array.from(createdReferenceDrafts.values())]
        );

        if (!nextDraft) {
          setIngredientMatchDialog((prev) => prev ? {
            ...prev,
            errorMessage: `Für "${entry.ingredient}" konnte keine neue ingredientID angelegt werden.`,
          } : prev);
          return;
        }

        if (!createdDraft) {
          createdReferenceDrafts.set(nextDraft.canonicalKey, nextDraft);
          referencesToCreate.push(nextDraft);
        }
        selectedIngredientID = nextDraft.ingredientID;
      }

      const original = nextIngredients[entry.index];
      const originalObject = (original && typeof original === 'object') ? original : null;
      const { ignoreNutritionCalculation: _ignoredFlag, ...restOriginal } = originalObject || {};
      nextIngredients[entry.index] = typeof original === 'string'
        ? { type: 'ingredient', text: original, ingredientID: selectedIngredientID }
        : { ...restOriginal, ingredientID: selectedIngredientID };
    }

    if (referencesToCreate.length > 0) {
      await Promise.all(referencesToCreate.map(async (draft) => {
        try {
          await setDoc(
            doc(db, 'nutritionReferences', draft.ingredientID),
            {
              ingredientID: draft.ingredientID,
              displayName: draft.displayName,
              synonyms: draft.synonyms,
              normalizedSynonyms: [...new Set(draft.synonyms.map((value) => normalizeNutritionReferenceId(value)).filter(Boolean))],
              name: draft.synonyms[0] || draft.displayName || draft.ingredientID,
              possibleUnits: draft.possibleUnits,
              status: NUTRITION_REFERENCE_NEW_STATUS,
              source: 'auto-created',
              updatedAt: serverTimestamp(),
              updatedBy: currentUser?.id || null,
            },
            { merge: true }
          );
        } catch (err) {
          console.error('Could not create pending nutrition reference:', err);
        }
      }));
    }

    await persistIngredientIDs(fieldName, nextIngredients, dialogRecipe);
    setIngredientMatchDialog(null);
    ingredientMatchFromModalRef.current = false;
    setRetryAutoCalculateToken((prev) => prev + 1);
  };

  const handleStartEdit = (proposal) => {
    setEditingProposalId(proposal.id);
    setEditingName(proposal.name);
    setEditingGroup(proposal.groupName || '');
  };

  const handleCancelEdit = () => {
    setEditingProposalId(null);
    setEditingName('');
    setEditingGroup('');
  };

  const handleSaveEdit = async (proposalId) => {
    const name = editingName.trim();
    if (!name) return;
    try {
      await updateCuisineProposal(proposalId, { name, groupName: editingGroup || null });
      setCuisineProposals(prev =>
        prev.map(p => p.id === proposalId ? { ...p, name, groupName: editingGroup || null } : p)
      );
      handleCancelEdit();
    } catch (err) {
      console.error('Error updating cuisine proposal:', err);
    }
  };

  const handleRelease = async (proposal) => {
    setReleasingId(proposal.id);
    try {
      // Mark proposal as released in Firestore
      await releaseCuisineProposal(proposal.id);

      // The name originally added to cuisineTypes (may differ if the proposal was renamed)
      const originalName = proposal.originalName || proposal.name;
      const wasRenamed = originalName.toLowerCase() !== proposal.name.toLowerCase();

      // Normalize a recipe's kulinarik field to an array
      const toKulinarikArray = (kulinarik) =>
        Array.isArray(kulinarik) ? kulinarik : kulinarik ? [kulinarik] : [];

      // Add to the main cuisineTypes list and optionally to a cuisineGroup
      const lists = await getCustomLists();
      let updatedTypes;
      if (wasRenamed && lists.cuisineTypes.some(t => t.toLowerCase() === originalName.toLowerCase())) {
        // Replace the original name with the new name in the types list
        updatedTypes = lists.cuisineTypes.map(t =>
          t.toLowerCase() === originalName.toLowerCase() ? proposal.name : t
        );
      } else {
        updatedTypes = lists.cuisineTypes.some(t => t.toLowerCase() === proposal.name.toLowerCase())
          ? lists.cuisineTypes
          : [...lists.cuisineTypes, proposal.name];
      }

      let updatedGroups = lists.cuisineGroups || [];
      if (proposal.groupName) {
        updatedGroups = updatedGroups.map(g => {
          if (g.name !== proposal.groupName) return g;
          // Replace originalName with new name (or just add if not present)
          const filteredChildren = wasRenamed
            ? g.children.filter(c => c.toLowerCase() !== originalName.toLowerCase())
            : g.children;
          return !filteredChildren.some(c => c.toLowerCase() === proposal.name.toLowerCase())
            ? { ...g, children: [...filteredChildren, proposal.name] }
            : { ...g, children: filteredChildren };
        });
      } else if (wasRenamed) {
        // Update originalName → new name inside any group children
        updatedGroups = updatedGroups.map(g => ({
          ...g,
          children: g.children.map(c =>
            c.toLowerCase() === originalName.toLowerCase() ? proposal.name : c
          ),
        }));
      }

      await saveCustomLists({ cuisineTypes: updatedTypes, cuisineGroups: updatedGroups });

      // Propagate rename to all recipes that reference the original name
      if (wasRenamed && onUpdateRecipe) {
        const affectedRecipes = recipes.filter(r =>
          toKulinarikArray(r.kulinarik).some(k => k.toLowerCase() === originalName.toLowerCase())
        );
        for (const recipe of affectedRecipes) {
          const updatedKulinarik = toKulinarikArray(recipe.kulinarik).map(k =>
            k.toLowerCase() === originalName.toLowerCase() ? proposal.name : k
          );
          await onUpdateRecipe(recipe.id, { kulinarik: updatedKulinarik });
        }
      }

      // Remove released proposal from local state
      setCuisineProposals(prev => prev.filter(p => p.id !== proposal.id));
    } catch (err) {
      console.error('Error releasing cuisine proposal:', err);
    } finally {
      setReleasingId(null);
    }
  };

  const renderSourceBadge = (source) => {
    if (source === 'recipe_form') {
      return <span className="cuisine-proposal-source-badge cuisine-proposal-source-recipe">Rezept-Formular</span>;
    }
    return <span className="cuisine-proposal-source-badge cuisine-proposal-source-manual">Manuell</span>;
  };

  // Cuisine list management helpers
  const saveCuisineLists = async (updatedTypes, updatedGroups) => {
    try {
      await saveCustomLists({ cuisineTypes: updatedTypes, cuisineGroups: updatedGroups });
    } catch (err) {
      console.error('Error saving cuisine lists:', err);
    }
  };

  const handleAddCuisineType = async () => {
    const name = newCuisineTypeName.trim();
    if (!name || cuisineTypes.some(t => t.toLowerCase() === name.toLowerCase())) return;
    const updated = [...cuisineTypes, name];
    setCuisineTypes(updated);
    setNewCuisineTypeName('');
    await saveCuisineLists(updated, cuisineGroups);
  };

  const handleRemoveCuisineType = async (typeLabel) => {
    const updatedTypes = cuisineTypes.filter(t => t !== typeLabel);
    const updatedGroups = cuisineGroups.map(g => ({
      ...g,
      children: g.children.filter(c => c !== typeLabel),
    }));
    setCuisineTypes(updatedTypes);
    setCuisineGroups(updatedGroups);
    await saveCuisineLists(updatedTypes, updatedGroups);
  };

  const handleRenameCuisineType = async (oldLabel, newLabel) => {
    const trimmed = newLabel.trim();
    if (!trimmed || trimmed === oldLabel) return;
    if (cuisineTypes.some(t => t !== oldLabel && t.toLowerCase() === trimmed.toLowerCase())) return;
    const updatedTypes = cuisineTypes.map(t => t === oldLabel ? trimmed : t);
    const updatedGroups = cuisineGroups.map(g => ({
      ...g,
      children: g.children.map(c => c === oldLabel ? trimmed : c),
    }));
    setCuisineTypes(updatedTypes);
    setCuisineGroups(updatedGroups);
    await saveCuisineLists(updatedTypes, updatedGroups);
  };

  const handleAddCuisineGroup = async () => {
    const name = newCuisineGroupName.trim();
    if (!name || cuisineGroups.some(g => g.name === name)) return;
    const updated = [...cuisineGroups, { name, children: [] }];
    setCuisineGroups(updated);
    setNewCuisineGroupName('');
    await saveCuisineLists(cuisineTypes, updated);
  };

  const handleRemoveCuisineGroup = async (groupName) => {
    const updated = cuisineGroups.filter(g => g.name !== groupName);
    setCuisineGroups(updated);
    await saveCuisineLists(cuisineTypes, updated);
  };

  const handleAddChildToGroup = async (groupName, childName) => {
    const updated = cuisineGroups.map(g =>
      g.name === groupName && !g.children.includes(childName)
        ? { ...g, children: [...g.children, childName] }
        : g
    );
    setCuisineGroups(updated);
    await saveCuisineLists(cuisineTypes, updated);
  };

  const handleRemoveChildFromGroup = async (groupName, childName) => {
    const updated = cuisineGroups.map(g =>
      g.name === groupName
        ? { ...g, children: g.children.filter(c => c !== childName) }
        : g
    );
    setCuisineGroups(updated);
    await saveCuisineLists(cuisineTypes, updated);
  };

  const normalizeUniqueEntries = useCallback((entries = []) => (
    entries
      .map((entry) => String(entry || '').trim())
      .filter(Boolean)
      .filter((entry, index, arr) => arr.findIndex((other) => other.toLowerCase() === entry.toLowerCase()) === index)
  ), []);

  const saveStandardTerms = async (units, adjectives) => {
    const normalizedUnits = normalizeUniqueEntries(units);
    const normalizedAdjectives = normalizeUniqueEntries(adjectives);
    setCustomIngredientUnits(normalizedUnits);
    setCustomIngredientAdjectives(normalizedAdjectives);
    setCustomIngredientMatchingTerms({
      units: normalizedUnits,
      adjectives: normalizedAdjectives,
    });
    setStandardTermsFeedback('');
    try {
      await saveCustomLists({
        customUnits: normalizedUnits,
        customIngredientAdjectives: normalizedAdjectives,
      });
      setStandardTermsFeedback('Standardeinheiten/-adjektive gespeichert.');
    } catch (err) {
      console.error('Error saving standard units/adjectives:', err);
      setStandardTermsFeedback('Fehler beim Speichern der Standardeinheiten/-adjektive.');
    }
  };

  const handleAddCustomIngredientUnit = async () => {
    const entry = newCustomIngredientUnit.trim();
    if (!entry) return;
    if (customIngredientUnits.some((unit) => unit.toLowerCase() === entry.toLowerCase())) return;
    setNewCustomIngredientUnit('');
    await saveStandardTerms([...customIngredientUnits, entry], customIngredientAdjectives);
  };

  const handleRemoveCustomIngredientUnit = async (entry) => {
    await saveStandardTerms(
      customIngredientUnits.filter((unit) => unit !== entry),
      customIngredientAdjectives
    );
  };

  const handleAddCustomIngredientAdjective = async () => {
    const entry = newCustomIngredientAdjective.trim();
    if (!entry) return;
    if (customIngredientAdjectives.some((adjective) => adjective.toLowerCase() === entry.toLowerCase())) return;
    setNewCustomIngredientAdjective('');
    await saveStandardTerms(customIngredientUnits, [...customIngredientAdjectives, entry]);
  };

  const handleRemoveCustomIngredientAdjective = async (entry) => {
    await saveStandardTerms(
      customIngredientUnits,
      customIngredientAdjectives.filter((adjective) => adjective !== entry)
    );
  };

  const handleDeployStandardTerms = async () => {
    setStandardTermsDeployFeedback('');
    setDeployingStandardTerms(true);
    try {
      const requestId = `ingredient-matching-${Date.now()}`;
      await setDoc(doc(db, 'developmentDeployRequests', requestId), {
        kind: 'ingredient-id-matching',
        status: 'pending',
        requestedAt: serverTimestamp(),
        requestedBy: currentUser?.id || null,
        payload: {
          customUnits: customIngredientUnits,
          customIngredientAdjectives,
        },
      });
      setStandardTermsDeployFeedback('Deployment wurde gestartet. Der Entwicklungs-Workflow wurde angefragt.');
    } catch (err) {
      console.error('Error starting standard terms deployment:', err);
      setStandardTermsDeployFeedback('Fehler beim Starten des Deployments. Bitte erneut versuchen.');
    } finally {
      setDeployingStandardTerms(false);
    }
  };

  const handleSaveKochatelierSettings = async () => {
    if (!canManageKochatelierSettings) {
      setKochatelierSettingsFeedback('Nur Administratoren und Moderatoren können diese Einstellungen speichern.');
      return;
    }
    setSavingKochatelierSettings(true);
    setKochatelierSettingsFeedback('');
    try {
      await saveInspirationListSettings({
        inspirationListName,
        inspirationListDescription,
        inspirationTargetListName,
        inspirationTargetListDescription,
      });
      setKochatelierSettingsFeedback('Kochateliereinstellungen gespeichert.');
    } catch (err) {
      console.error('Error saving kochatelier settings:', err);
      setKochatelierSettingsFeedback('Fehler beim Speichern der Kochateliereinstellungen.');
    } finally {
      setSavingKochatelierSettings(false);
    }
  };

  if (!currentUser?.appCalls) {
    return (
      <div className="app-calls-container">
        <div className="app-calls-header">
          <h2>Küchenbetrieb</h2>
          <button
            className="group-list-close-btn"
            onClick={onBack}
            aria-label="Schließen"
            title="Schließen"
          >
            {isBase64Image(closeIcon) ? (
              <img src={closeIcon} alt="Schließen" className="group-list-close-icon-img" />
            ) : (
              <span>{closeIcon}</span>
            )}
          </button>
        </div>
        <div className="app-calls-content">
          <p className="app-calls-info-text">
            Sie haben keine Berechtigung, diese Seite aufzurufen.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-calls-container">
      <div className="app-calls-header">
        <h2>Küchenbetrieb</h2>
        <button
          className="group-list-close-btn"
          onClick={onBack}
          aria-label="Schließen"
          title="Schließen"
        >
          {isBase64Image(closeIcon) ? (
            <img src={closeIcon} alt="Schließen" className="group-list-close-icon-img" />
          ) : (
            <span>{closeIcon}</span>
          )}
        </button>
      </div>
      <div className="app-calls-tabs" ref={tabsRef}>
        <button
          className={`app-calls-tab${activeTab === 'app' ? ' active' : ''}`}
          onClick={() => setActiveTab('app')}
        >
          App-Aufrufe
        </button>
        <button
          className={`app-calls-tab${activeTab === 'recipe' ? ' active' : ''}`}
          onClick={() => setActiveTab('recipe')}
        >
          Rezeptaufrufe
        </button>
        <button
          className={`app-calls-tab${activeTab === 'nolink' ? ' active' : ''}`}
          onClick={() => setActiveTab('nolink')}
        >
          Rezepte ohne Link
        </button>
        <button
          className={`app-calls-tab${activeTab === 'naehrwert' ? ' active' : ''}`}
          onClick={() => setActiveTab('naehrwert')}
        >
          Nährwertberechnungen
        </button>
        <button
          className={`app-calls-tab${activeTab === 'missingIngredientIDs' ? ' active' : ''}`}
          onClick={() => setActiveTab('missingIngredientIDs')}
        >
          Fehlende Zutaten-IDs
        </button>
        <button
          className={`app-calls-tab${activeTab === 'kulinariktypen' ? ' active' : ''}`}
          onClick={() => setActiveTab('kulinariktypen')}
        >
          Kulinariktypen
        </button>
        <button
          className={`app-calls-tab${activeTab === 'standardeinheiten' ? ' active' : ''}`}
          onClick={() => setActiveTab('standardeinheiten')}
        >
          Standardeinheiten/-adjektive
        </button>
        <button
          className={`app-calls-tab${activeTab === 'kochatelier' ? ' active' : ''}`}
          onClick={() => setActiveTab('kochatelier')}
        >
          Kochateliereinstellungen
        </button>
      </div>
      <div className="app-calls-content">
        {activeTab === 'app' ? (
          <>
            <p className="app-calls-info-text">
              Hier sind alle Appaufrufe gemeinsam mit den zugehörigen Anwendern dokumentiert.
              Diese Übersicht dient der Nachvollziehbarkeit und kann für Auditing- oder Supportzwecke
              herangezogen werden.
            </p>
            {loading ? (
              <div className="app-calls-empty">Laden...</div>
            ) : appCalls.length === 0 ? (
              <div className="app-calls-empty">Noch keine Appaufrufe vorhanden.</div>
            ) : (
              <>
                <div className="app-calls-filter-row">
                  <label className="app-calls-filter-label">
                    <input
                      type="checkbox"
                      checked={filterBenjaminRousselli}
                      onChange={(e) => setFilterBenjaminRousselli(e.target.checked)}
                      className="app-calls-filter-checkbox"
                    />
                    Benjamin Rousselli ausblenden
                  </label>
                </div>
                <div className="app-calls-table-container">
                  <table className="app-calls-table">
                    <thead>
                      <tr>
                        <th>Datum &amp; Uhrzeit</th>
                        <th>Vorname</th>
                        <th>Nachname</th>
                        <th className="app-calls-col-desktop">E-Mail</th>
                        <th className="app-calls-col-desktop">Art</th>
                        <th className="app-calls-col-mobile">Info</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAppCalls.map((call) => (
                        <React.Fragment key={call.id}>
                          <tr>
                            <td>
                              {call.timestamp?.toDate
                                ? call.timestamp.toDate().toLocaleString('de-DE')
                                : '–'}
                            </td>
                            <td>{call.userVorname}</td>
                            <td>{call.userNachname}</td>
                            <td className="app-calls-col-desktop">{call.userEmail}</td>
                            <td className="app-calls-col-desktop">{call.isGuest ? 'Gast' : 'Angemeldet'}</td>
                            <td className="app-calls-col-mobile">
                              <button
                                className={`app-calls-info-btn${expandedAppCallId === call.id ? ' active' : ''}`}
                                onClick={() => setExpandedAppCallId(expandedAppCallId === call.id ? null : call.id)}
                                aria-label="Details anzeigen"
                                title="Details anzeigen"
                              >
                                ⓘ
                              </button>
                            </td>
                          </tr>
                          {expandedAppCallId === call.id && (
                            <tr className="app-calls-detail-row">
                              <td colSpan={6}>
                                <div className="app-calls-detail-content">
                                  <span><strong>E-Mail:</strong> {call.userEmail || '–'}</span>
                                  <span><strong>Art:</strong> {call.isGuest ? 'Gast' : 'Angemeldet'}</span>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="app-calls-stats">
                  Gesamt: <strong>{filteredAppCalls.length}</strong>{filterBenjaminRousselli && filteredAppCalls.length !== appCalls.length ? <> von {appCalls.length} Einträgen (gefiltert)</> : <> Einträge</>}
                </div>
              </>
            )}
          </>
        ) : activeTab === 'recipe' ? (
          <>
            <p className="app-calls-info-text">
              Hier werden alle Rezeptaufrufe mit den zugehörigen Anwendern und Rezepten protokolliert.
              Diese Übersicht ermöglicht die Auswertung, welche Rezepte wie häufig aufgerufen werden.
            </p>
            {loading ? (
              <div className="app-calls-empty">Laden...</div>
            ) : recipeCalls.length === 0 ? (
              <div className="app-calls-empty">Noch keine Rezeptaufrufe vorhanden.</div>
            ) : (
              <>
                <div className="app-calls-table-container">
                  <table className="app-calls-table">
                    <thead>
                      <tr>
                        <th>Datum &amp; Uhrzeit</th>
                        <th>Rezept</th>
                        <th>Vorname</th>
                        <th>Nachname</th>
                        <th className="app-calls-col-desktop">E-Mail</th>
                        <th className="app-calls-col-desktop">Art</th>
                        <th className="app-calls-col-mobile">Info</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recipeCalls.map((call) => (
                        <React.Fragment key={call.id}>
                          <tr>
                            <td>
                              {call.timestamp?.toDate
                                ? call.timestamp.toDate().toLocaleString('de-DE')
                                : '–'}
                            </td>
                            <td>{call.recipeTitle}</td>
                            <td>{call.userVorname}</td>
                            <td>{call.userNachname}</td>
                            <td className="app-calls-col-desktop">{call.userEmail}</td>
                            <td className="app-calls-col-desktop">{call.isGuest ? 'Gast' : 'Angemeldet'}</td>
                            <td className="app-calls-col-mobile">
                              <button
                                className={`app-calls-info-btn${expandedRecipeCallId === call.id ? ' active' : ''}`}
                                onClick={() => setExpandedRecipeCallId(expandedRecipeCallId === call.id ? null : call.id)}
                                aria-label="Details anzeigen"
                                title="Details anzeigen"
                              >
                                ⓘ
                              </button>
                            </td>
                          </tr>
                          {expandedRecipeCallId === call.id && (
                            <tr className="app-calls-detail-row">
                              <td colSpan={7}>
                                <div className="app-calls-detail-content">
                                  <span><strong>E-Mail:</strong> {call.userEmail || '–'}</span>
                                  <span><strong>Art:</strong> {call.isGuest ? 'Gast' : 'Angemeldet'}</span>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="app-calls-stats">
                  Gesamt: <strong>{recipeCalls.length}</strong> Einträge
                </div>
              </>
            )}
          </>
        ) : activeTab === 'nolink' ? (
          <>
            <p className="app-calls-info-text">
              Hier sind alle öffentlichen Rezepte aufgelistet, die noch keinen Shared Link besitzen.
              Per Klick auf den Button kann ein Shared Link für das jeweilige Rezept erstellt werden.
            </p>
            {recipesWithoutLink.length === 0 ? (
              <div className="app-calls-empty">Alle öffentlichen Rezepte haben bereits einen Shared Link.</div>
            ) : (
              <>
                <div className="app-calls-table-container">
                  <table className="app-calls-table">
                    <thead>
                      <tr>
                        <th>Rezept</th>
                        <th>Aktion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recipesWithoutLink.map((recipe) => (
                        <tr key={recipe.id}>
                          <td>{recipe.title}</td>
                          <td>
                            <button
                              className="app-calls-share-btn"
                              onClick={() => handleCreateShareLink(recipe)}
                              disabled={creatingShareIds[recipe.id]}
                            >
                              {creatingShareIds[recipe.id] ? 'Wird erstellt…' : 'Link erstellen'}
                            </button>
                            {shareLinkErrors[recipe.id] && (
                              <span className="app-calls-share-error">{shareLinkErrors[recipe.id]}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="app-calls-stats">
                  Gesamt: <strong>{recipesWithoutLink.length}</strong> {recipesWithoutLink.length === 1 ? 'Rezept' : 'Rezepte'} ohne Link
                </div>
              </>
            )}
          </>
        ) : activeTab === 'naehrwert' ? (
          <>
            <p className="app-calls-info-text">
              Übersicht aktiver und abgeschlossener Nährwertberechnungen. Laufende Berechnungen können abgebrochen werden, abgeschlossene Berechnungen lassen sich direkt öffnen.
            </p>
            {nutritionListData.pending.length === 0 ? (
              <div className="app-calls-empty">Keine aktiven Berechnungen vorhanden.</div>
            ) : (
              <>
                <div className="app-calls-table-container">
                  <table className="app-calls-table">
                    <thead>
                      <tr>
                        <th>Rezept</th>
                        <th>Gestartet</th>
                        <th>Aktion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nutritionListData.pending.map(recipe => (
                        <tr key={recipe.id}>
                          <td>
                            <button
                              type="button"
                              className="app-calls-recipe-link-btn"
                              onClick={() => onSelectRecipe?.(recipe)}
                            >
                              {recipe.title || recipe.id}
                            </button>
                          </td>
                          <td className="app-calls-calc-duration">{formatCalcDuration(recipe.naehrwerte?.calcPendingAt) || '—'}</td>
                          <td>
                            <button
                              className="nutrition-abort-settings-button"
                              onClick={() => handleAbortCalcForRecipe(recipe)}
                              disabled={abortingCalcId === recipe.id}
                              title="Berechnung abbrechen"
                            >
                              {abortingCalcId === recipe.id ? 'Wird abgebrochen…' : 'Abbrechen'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="app-calls-stats">
                  Gesamt: <strong>{nutritionListData.pending.length}</strong> {nutritionListData.pending.length === 1 ? 'aktive Berechnung' : 'aktive Berechnungen'}
                </div>
              </>
            )}
            <h3>Abgeschlossene Berechnungen</h3>
            {nutritionListData.completed.length === 0 ? (
              <div className="app-calls-empty">Keine abgeschlossenen Berechnungen vorhanden.</div>
            ) : (
              <>
                <div className="app-calls-table-container">
                  <table className="app-calls-table">
                    <thead>
                      <tr>
                        <th>Rezept</th>
                        <th>Abgeschlossen</th>
                        <th>Aktion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nutritionListData.completed.map(recipe => (
                        <tr key={recipe.id}>
                          <td>
                            <button
                              type="button"
                              className="app-calls-recipe-link-btn"
                              onClick={() => onSelectRecipe?.(recipe)}
                            >
                              {recipe.title || recipe.id}
                            </button>
                          </td>
                          <td className="app-calls-calc-duration">
                            {recipe.naehrwerte?.calcCompletedAt
                              ? new Date(recipe.naehrwerte.calcCompletedAt).toLocaleString('de-DE')
                              : (recipe.naehrwerte?.calcPendingAt ? new Date(recipe.naehrwerte.calcPendingAt).toLocaleString('de-DE') : '—')}
                          </td>
                          <td>
                            {hasNotIncludedNutritionIngredients(recipe) && (
                              <span
                                className="app-calls-warning-icon"
                                title="Enthält nicht einkalkulierte Zutaten"
                                role="img"
                                aria-label="Enthält nicht einkalkulierte Zutaten"
                              >
                                !
                              </span>
                            )}
                            <button
                              className="app-calls-share-btn"
                              onClick={() => setSelectedNutritionRecipeId(recipe.id)}
                              title="Nährwertedialog öffnen"
                            >
                              Öffnen
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="app-calls-stats">
                  Gesamt: <strong>{nutritionListData.completed.length}</strong> {nutritionListData.completed.length === 1 ? 'abgeschlossene Berechnung' : 'abgeschlossene Berechnungen'}
                </div>
              </>
            )}
          </>
        ) : activeTab === 'missingIngredientIDs' ? (
          <>
            <p className="app-calls-info-text">
              Hier werden alle Rezepte aufgelistet, bei denen mindestens eine Zutat noch keine ingredientID besitzt.
              Über den Button „IDs zuordnen" kann die Zuordnung direkt vorgenommen werden.
            </p>
            {recipesWithMissingIngredientIDs.length === 0 ? (
              <div className="app-calls-empty">Alle Zutaten haben bereits eine ingredientID.</div>
            ) : (
              <>
                <div className="app-calls-table-container">
                  <table className="app-calls-table">
                    <thead>
                      <tr>
                        <th>Rezept</th>
                        <th>Aktion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recipesWithMissingIngredientIDs.map((recipe) => (
                        <tr key={recipe.id}>
                          <td>
                            <button
                              type="button"
                              className="app-calls-recipe-link-btn"
                              onClick={() => onSelectRecipe?.(recipe)}
                            >
                              {recipe.title || recipe.id}
                            </button>
                          </td>
                          <td>
                            <button
                              className="app-calls-share-btn"
                              onClick={() => handleAssignIngredientIDs(recipe)}
                              disabled={assigningIngredientIdRecipeId === recipe.id}
                              title="ingredientIDs zuordnen"
                            >
                              {assigningIngredientIdRecipeId === recipe.id ? 'Wird zugeordnet…' : 'IDs zuordnen'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="app-calls-stats">
                  Gesamt: <strong>{recipesWithMissingIngredientIDs.length}</strong> {recipesWithMissingIngredientIDs.length === 1 ? 'Rezept' : 'Rezepte'} mit fehlenden Zutaten-IDs
                </div>
              </>
            )}
          </>
        ) : activeTab === 'kulinariktypen' ? (
          <>
            {/* Offene Vorschläge section */}
            <div className="settings-section">
              <h3>Offene Vorschläge</h3>
              <p className="app-calls-info-text">
                Hier können neue Kulinariktypen bestehenden Kulinarikgruppen zugeordnet, bearbeitet und freigegeben werden.
                Freigegebene Kulinariktypen werden in der Hauptliste ergänzt und erscheinen nicht mehr hier.
              </p>
              {cuisineProposals.length === 0 ? (
                <div className="app-calls-empty">Keine offenen Kulinariktypen vorhanden.</div>
              ) : (
                <div className="app-calls-table-container">
                  <table className="app-calls-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Gruppe</th>
                        <th>Quelle</th>
                        <th>Aktionen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cuisineProposals.map(proposal => (
                        <tr key={proposal.id}>
                          {editingProposalId === proposal.id ? (
                            <>
                              <td>
                                <input
                                  type="text"
                                  className="cuisine-proposal-edit-input"
                                  value={editingName}
                                  onChange={(e) => setEditingName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveEdit(proposal.id);
                                    if (e.key === 'Escape') handleCancelEdit();
                                  }}
                                  aria-label="Kulinariktyp Name bearbeiten"
                                  autoFocus
                                />
                              </td>
                              <td>
                                <select
                                  className="cuisine-proposal-group-select"
                                  value={editingGroup}
                                  onChange={(e) => setEditingGroup(e.target.value)}
                                  aria-label="Kulinarikgruppe bearbeiten"
                                >
                                  <option value="">Keine Gruppe</option>
                                  {cuisineGroups.map(g => (
                                    <option key={g.name} value={g.name}>{g.name}</option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                {renderSourceBadge(proposal.source)}
                              </td>
                              <td className="cuisine-proposal-actions">
                                <button
                                  className="app-calls-share-btn"
                                  onClick={() => handleSaveEdit(proposal.id)}
                                  disabled={!editingName.trim()}
                                >
                                  Speichern
                                </button>
                                <button
                                  className="cuisine-proposal-cancel-btn"
                                  onClick={handleCancelEdit}
                                >
                                  Abbrechen
                                </button>
                              </td>
                            </>
                          ) : (
                            <>
                              <td>{proposal.name}</td>
                              <td>{proposal.groupName || <span className="cuisine-proposal-no-group">–</span>}</td>
                              <td>
                                {renderSourceBadge(proposal.source)}
                              </td>
                              <td className="cuisine-proposal-actions">
                                <button
                                  className="cuisine-proposal-edit-btn"
                                  onClick={() => handleStartEdit(proposal)}
                                  title="Kulinariktyp bearbeiten"
                                >
                                  Bearbeiten
                                </button>
                                <button
                                  className="cuisine-proposal-release-btn"
                                  onClick={() => handleRelease(proposal)}
                                  disabled={releasingId === proposal.id}
                                  title="Kulinariktyp freigeben"
                                >
                                  {releasingId === proposal.id ? 'Wird freigegeben…' : '✓ Freigeben'}
                                </button>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="app-calls-stats">
                Gesamt: <strong>{cuisineProposals.length}</strong> {cuisineProposals.length === 1 ? 'offener Kulinariktyp' : 'offene Kulinariktypen'}
              </div>
            </div>

            {/* Kulinarik-Typen section */}
            <div className="settings-section">
              <h3>Kulinarik-Typen</h3>
              <div className="list-input">
                <input
                  type="text"
                  value={newCuisineTypeName}
                  onChange={(e) => setNewCuisineTypeName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddCuisineType()}
                  placeholder="Neuen Kulinarik-Typ hinzufügen..."
                  aria-label="Neuen Kulinarik-Typ eingeben"
                />
                <button onClick={handleAddCuisineType}>Hinzufügen</button>
              </div>
              <div className="list-items">
                {cuisineTypes.length === 0 ? (
                  <p className="section-description">Noch keine Kulinarik-Typen vorhanden.</p>
                ) : (
                  cuisineTypes.map((type) => (
                    <CuisineTypeListItem
                      key={type}
                      label={type}
                      onRemove={() => handleRemoveCuisineType(type)}
                      onRename={handleRenameCuisineType}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Kulinarik-Gruppen section */}
            <div className="settings-section">
              <h3>Kulinarik-Gruppen</h3>
              <p className="section-description">
                Übergeordnete Kategorien für die Suchfilterung. Untergeordnete Typen können aus der Liste der Kulinarik-Typen ausgewählt werden.
              </p>
              <div className="list-input">
                <input
                  type="text"
                  value={newCuisineGroupName}
                  onChange={(e) => setNewCuisineGroupName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddCuisineGroup()}
                  placeholder="Neue Gruppe hinzufügen (z.B. Asiatische Küche)..."
                  aria-label="Neue Kulinarik-Gruppe eingeben"
                />
                <button onClick={handleAddCuisineGroup}>Hinzufügen</button>
              </div>
              <div className="list-items">
                {cuisineGroups.length === 0 ? (
                  <p className="section-description">Noch keine Kulinarik-Gruppen vorhanden.</p>
                ) : (
                  cuisineGroups.map(group => (
                    <div key={group.name} className="cuisine-group-item">
                      <div className="cuisine-group-header">
                        <strong>{group.name}</strong>
                        <button
                          className="remove-btn"
                          onClick={() => handleRemoveCuisineGroup(group.name)}
                          title="Gruppe entfernen"
                        >×</button>
                      </div>
                      <div className="cuisine-group-children">
                        {group.children.map(child => (
                          <span key={child} className="cuisine-group-child-tag">
                            {child}
                            <button
                              className="remove-child-btn"
                              onClick={() => handleRemoveChildFromGroup(group.name, child)}
                              title="Untertyp entfernen"
                              aria-label={`${child} aus Gruppe entfernen`}
                            >×</button>
                          </span>
                        ))}
                        <select
                          className="cuisine-group-add-child"
                          value=""
                          onChange={(e) => {
                            if (e.target.value) handleAddChildToGroup(group.name, e.target.value);
                          }}
                          aria-label={`Untertyp zu ${group.name} hinzufügen`}
                        >
                          <option value="">+ Untertyp hinzufügen...</option>
                          {cuisineTypes
                            .filter(c => !group.children.includes(c))
                            .map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        ) : activeTab === 'standardeinheiten' ? (
          <>
            <div className="settings-section">
              <h3>Standardeinheiten</h3>
              <p className="section-description">
                Einheiten, die beim ingredientID-Matching als Mengenangaben erkannt werden.
              </p>
              <div className="list-input">
                <input
                  type="text"
                  value={newCustomIngredientUnit}
                  onChange={(e) => setNewCustomIngredientUnit(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddCustomIngredientUnit()}
                  placeholder="Neue Einheit hinzufügen (z.B. Päckchen)..."
                  aria-label="Neue Standardeinheit eingeben"
                />
                <button onClick={handleAddCustomIngredientUnit}>Hinzufügen</button>
              </div>
              <div className="list-items">
                {customIngredientUnits.length === 0 ? (
                  <p className="section-description">Noch keine zusätzlichen Einheiten vorhanden.</p>
                ) : (
                  customIngredientUnits.map((unit) => (
                    <div key={unit} className="list-item">
                      <span>{unit}</span>
                      <button
                        className="remove-btn"
                        onClick={() => handleRemoveCustomIngredientUnit(unit)}
                        title="Entfernen"
                      >
                        ×
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="settings-section">
              <h3>Standardadjektive</h3>
              <p className="section-description">
                Adjektive, die beim ingredientID-Matching automatisch entfernt werden.
              </p>
              <div className="list-input">
                <input
                  type="text"
                  value={newCustomIngredientAdjective}
                  onChange={(e) => setNewCustomIngredientAdjective(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddCustomIngredientAdjective()}
                  placeholder="Neues Adjektiv hinzufügen (z.B. gehackt)..."
                  aria-label="Neues Standardadjektiv eingeben"
                />
                <button onClick={handleAddCustomIngredientAdjective}>Hinzufügen</button>
              </div>
              <div className="list-items">
                {customIngredientAdjectives.length === 0 ? (
                  <p className="section-description">Noch keine zusätzlichen Adjektive vorhanden.</p>
                ) : (
                  customIngredientAdjectives.map((adjective) => (
                    <div key={adjective} className="list-item">
                      <span>{adjective}</span>
                      <button
                        className="remove-btn"
                        onClick={() => handleRemoveCustomIngredientAdjective(adjective)}
                        title="Entfernen"
                      >
                        ×
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="settings-section">
              <h3>Entwicklungspfad</h3>
              <p className="section-description">
                Überträgt die aktuellen Einheiten/Adjektive in den automatisierten Entwicklungs- und Deployment-Prozess.
              </p>
              <button
                className="app-calls-share-btn"
                onClick={handleDeployStandardTerms}
                disabled={deployingStandardTerms}
              >
                {deployingStandardTerms ? 'Deployment wird gestartet…' : 'Jetzt deployen'}
              </button>
              {standardTermsFeedback && (
                <p className="app-calls-info-text">{standardTermsFeedback}</p>
              )}
              {standardTermsDeployFeedback && (
                <p className="app-calls-info-text">{standardTermsDeployFeedback}</p>
              )}
            </div>
          </>
        ) : (
          <div className="kochatelier-settings-section">
            <p className="app-calls-info-text">
              Konfigurieren Sie Name und Beschreibung für Inspirationsliste und Zielliste. Beschreibungen sind mehrzeilig und wachsen automatisch mit dem Inhalt.
            </p>
            {!canManageKochatelierSettings && (
              <p className="app-calls-info-text">
                Nur Administratoren und Moderatoren können diese Einstellungen bearbeiten.
              </p>
            )}
            <div className="kochatelier-settings-grid">
              <div className="kochatelier-settings-group">
                <h3>Inspirationsliste (interaktiv)</h3>
                <div className="kochatelier-settings-field">
                  <label htmlFor="kochatelierInspirationListName">Name:</label>
                  <input
                    id="kochatelierInspirationListName"
                    type="text"
                    value={inspirationListName}
                    onChange={(e) => setInspirationListName(e.target.value)}
                    onBlur={handleSaveKochatelierSettings}
                    disabled={!canManageKochatelierSettings}
                  />
                </div>
                <div className="kochatelier-settings-field">
                  <label htmlFor="kochatelierInspirationListDescription">Beschreibung:</label>
                  <textarea
                    id="kochatelierInspirationListDescription"
                    ref={inspirationDescriptionRef}
                    rows={2}
                    value={inspirationListDescription}
                    onChange={(e) => setInspirationListDescription(e.target.value)}
                    onInput={(e) => resizeTextarea(e.target)}
                    onBlur={handleSaveKochatelierSettings}
                    disabled={!canManageKochatelierSettings}
                  />
                </div>
              </div>
              <div className="kochatelier-settings-group">
                <h3>Zielliste (klassisch)</h3>
                <div className="kochatelier-settings-field">
                  <label htmlFor="kochatelierInspirationTargetListName">Name:</label>
                  <input
                    id="kochatelierInspirationTargetListName"
                    type="text"
                    value={inspirationTargetListName}
                    onChange={(e) => setInspirationTargetListName(e.target.value)}
                    onBlur={handleSaveKochatelierSettings}
                    disabled={!canManageKochatelierSettings}
                  />
                </div>
                <div className="kochatelier-settings-field">
                  <label htmlFor="kochatelierInspirationTargetListDescription">Beschreibung:</label>
                  <textarea
                    id="kochatelierInspirationTargetListDescription"
                    ref={targetDescriptionRef}
                    rows={2}
                    value={inspirationTargetListDescription}
                    onChange={(e) => setInspirationTargetListDescription(e.target.value)}
                    onInput={(e) => resizeTextarea(e.target)}
                    onBlur={handleSaveKochatelierSettings}
                    disabled={!canManageKochatelierSettings}
                  />
                </div>
              </div>
            </div>
            <div className="kochatelier-settings-actions">
              <button
                className="app-calls-share-btn"
                onClick={handleSaveKochatelierSettings}
                disabled={savingKochatelierSettings || !canManageKochatelierSettings}
              >
                {savingKochatelierSettings ? 'Wird gespeichert…' : 'Kochateliereinstellungen speichern'}
              </button>
              {kochatelierSettingsFeedback && (
                <span className="kochatelier-settings-feedback">{kochatelierSettingsFeedback}</span>
              )}
            </div>
          </div>
        )}
      </div>
      {selectedNutritionRecipe && (
        <NutritionModal
          recipe={selectedNutritionRecipe}
          allRecipes={recipes}
          currentUser={currentUser}
          onClose={() => setSelectedNutritionRecipeId(null)}
          onSave={(naehrwerte) => handleSaveNutrition(selectedNutritionRecipe.id, naehrwerte)}
          onEnsureIngredientIDs={handleEnsureIngredientIDsForModal}
          nutritionReferenceRows={nutritionReferenceRows}
          onReloadNutritionReferences={reloadNutritionReferences}
          retryAutoCalculateToken={retryAutoCalculateToken}
        />
      )}
      {ingredientMatchDialog && (
        <div className="ingredient-match-dialog-overlay" onClick={() => setIngredientMatchDialog(null)}>
          <div
            className="ingredient-match-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="ingredientID-Zuordnung"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ingredient-match-dialog-header">
              <h2 className="ingredient-match-dialog-title">ingredientID prüfen</h2>
              <button
                type="button"
                className="ingredient-match-dialog-close"
                onClick={() => setIngredientMatchDialog(null)}
                aria-label="ingredientID-Dialog schließen"
              >
                ×
              </button>
            </div>
            <p className="ingredient-match-dialog-note">
              Bitte bestätigen Sie die vorgeschlagenen ingredientIDs, bevor die Nährwerte berechnet werden. Bei Uneindeutigkeit können Sie auch
              {' '}
              „Neue Zutat“
              {' '}
              oder „Zutat ignorieren“ wählen.
            </p>
            {ingredientMatchDialog.errorMessage ? (
              <p className="ingredient-match-dialog-error">{ingredientMatchDialog.errorMessage}</p>
            ) : null}
            <ul className="ingredient-match-dialog-list">
              {ingredientMatchDialog.unresolved.map((entry) => (
                <li key={entry.index}>
                  <span>{entry.ingredient}</span>
                  <select
                    value={ingredientMatchDialog.selections?.[entry.index] || ''}
                    onChange={(e) => handleIngredientMatchSelectionChange(entry.index, e.target.value)}
                    aria-label={`ingredientID für ${entry.ingredient}`}
                  >
                    <option value="">Bitte auswählen</option>
                    {entry.suggestions.map((suggestion) => (
                      <option key={suggestion.ingredientID} value={suggestion.ingredientID}>
                        {suggestion.displayName || suggestion.ingredientID} ({suggestion.confidencePercent}%)
                      </option>
                    ))}
                    <option value={INGREDIENT_MATCH_CREATE_NEW_OPTION}>Neue Zutat</option>
                    <option value={INGREDIENT_MATCH_IGNORE_OPTION}>Zutat ignorieren</option>
                  </select>
                </li>
              ))}
            </ul>
            <div className="ingredient-match-dialog-actions">
              <button type="button" className="ingredient-match-dialog-cancel" onClick={() => setIngredientMatchDialog(null)}>
                Abbrechen
              </button>
              <button type="button" className="ingredient-match-dialog-confirm" onClick={handleIngredientMatchConfirm}>
                Übernehmen & berechnen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AppCallsPage;

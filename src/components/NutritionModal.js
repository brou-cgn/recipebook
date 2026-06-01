import React, { useState, useEffect, useRef, useMemo } from 'react';
import { functions, db } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import { setDoc, doc, serverTimestamp } from 'firebase/firestore';
import { mapNutritionCalcError, naehrwertePerPortion, naehrwerteToTotals, extractQuantityFromPrefix } from '../utils/nutritionUtils';
import { decodeRecipeLink } from '../utils/recipeLinks';
import { parseIngredientNameAndUnit } from '../utils/ingredientIdMatching';
import { normalizeNutritionReferenceId, NUTRITION_REFERENCE_FIELDS, scaleNutritionValues } from '../utils/nutritionReferenceUtils';
import './NutritionModal.css';

const CALC_RESULT_STORAGE_KEY_PREFIX = 'nutrition_calc_result_';

function loadStoredCalcResult(recipeId) {
  if (!recipeId) return null;
  try {
    const stored = localStorage.getItem(CALC_RESULT_STORAGE_KEY_PREFIX + recipeId);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (
      typeof parsed === 'object' && parsed !== null &&
      typeof parsed.foundCount === 'number' &&
      typeof parsed.totalCount === 'number' &&
      Array.isArray(parsed.notIncluded)
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function saveStoredCalcResult(recipeId, result) {
  if (!recipeId) return;
  try { localStorage.setItem(CALC_RESULT_STORAGE_KEY_PREFIX + recipeId, JSON.stringify(result)); } catch { /* ignore */ }
}

function clearStoredCalcResult(recipeId) {
  if (!recipeId) return;
  try { localStorage.removeItem(CALC_RESULT_STORAGE_KEY_PREFIX + recipeId); } catch { /* ignore */ }
}

export function getRecipeCalcResult(recipe) {
  const fc = recipe?.naehrwerte?.calcFoundCount;
  const tc = recipe?.naehrwerte?.calcTotalCount;
  const ingredientDetails = recipe?.naehrwerte?.calcIngredientDetails;
  if (fc == null || tc == null) {
    if (!Array.isArray(ingredientDetails)) {
      return null;
    }
  }
  return {
    foundCount: fc ?? 0,
    totalCount: tc ?? ingredientDetails?.length ?? 0,
    notIncluded: recipe?.naehrwerte?.calcNotIncluded || [],
    ...(recipe?.naehrwerte?.calcReformulations && { calcReformulations: recipe.naehrwerte.calcReformulations }),
    ...(recipe?.naehrwerte?.calcAcceptedIngredients && { acceptedIngredients: recipe.naehrwerte.calcAcceptedIngredients }),
    ...(ingredientDetails && { ingredientDetails }),
  };
}

export function buildNutritionCompositionRows(recipe, calcResult, reformulationMap = {}, acceptedIngredientsInput = []) {
  const rawIngredients = recipe?.zutaten || recipe?.ingredients || [];
  const ingredientTexts = rawIngredients
    .filter(item => typeof item === 'string' || (item && typeof item === 'object' && item.type !== 'heading'))
    .map(item => typeof item === 'string' ? item : item.text)
    .filter(Boolean);
  const notIncluded = calcResult?.notIncluded || recipe?.naehrwerte?.calcNotIncluded || [];
  const acceptedIngredients = acceptedIngredientsInput instanceof Set
    ? acceptedIngredientsInput
    : new Set(acceptedIngredientsInput || []);
  const notIncludedByIngredient = new Map(notIncluded.map(item => [item.ingredient, item]));
  const ingredientDetails = calcResult?.ingredientDetails || recipe?.naehrwerte?.calcIngredientDetails || [];
  const detailsByIngredient = new Map(ingredientDetails.map(d => [d.ingredient, d]));

  return ingredientTexts.map((ingredient) => {
    const link = decodeRecipeLink(ingredient);
    const notIncludedItem = notIncludedByIngredient.get(ingredient);
    const reformulation = reformulationMap?.[ingredient]?.text || notIncludedItem?.reformulation || null;
    const ingredientDetail = detailsByIngredient.get(ingredient);
    const searchTerm = ingredientDetail?.searchTerm || null;
    let status = 'Berechnet';
    if (acceptedIngredients.has(ingredient)) {
      status = 'Akzeptiert';
    } else if (notIncludedItem) {
      status = 'Nicht enthalten';
    }
    const hasNaehrwerte = Boolean(ingredientDetail?.naehrwerte);
    return {
      ingredient,
      source: link ? `Rezeptlink: ${link.recipeName}` : 'Zutat',
      status,
      detail: notIncludedItem?.error ||
        (reformulation
          ? `Umformulierung: ${reformulation}`
          : (searchTerm
            ? `Suchbegriff: ${searchTerm}`
            : (!hasNaehrwerte && status === 'Berechnet' ? 'Neu berechnen' : '—'))),
      naehrwerte: ingredientDetail?.naehrwerte || null,
      searchTerm,
      aiEstimated: ingredientDetail?.aiEstimated || false,
    };
  });
}

/**
 * Compute the amount in grams for a given ingredient text and reference row.
 * Returns null if it cannot be determined.
 */
export function computeIngredientAmountG(ingredientText, referenceRow) {
  const { quantity, unit } = parseIngredientNameAndUnit(ingredientText);
  const normalizedUnit = unit ? normalizeNutritionReferenceId(unit) : null;

  if (normalizedUnit === 'g') {
    return quantity != null ? quantity : null;
  }
  if (normalizedUnit === 'kg') {
    return quantity != null ? quantity * 1000 : null;
  }

  // For other units or no unit, scale by defaultAmountG from the reference row
  const defaultAmountG = referenceRow?.defaultAmountG;
  if (defaultAmountG != null) {
    const multiplier = quantity != null ? quantity : 1;
    return multiplier * defaultAmountG;
  }

  return null;
}

const PREFERRED_NUTRITION_SOURCES = new Set(['openfoodfacts', 'manual']);

/**
 * Resolve nutrition values for an ingredient from the nutritionReferences cache.
 *
 * Returns `{ naehrwerte, fromReference: true, source, amountG }` when the
 * ingredient has an ingredientID that maps to a reference row with a preferred
 * source ('openfoodfacts' or 'manual') AND the amount in grams can be computed.
 * Returns `null` otherwise (caller should fall back to OpenFoodFacts).
 */
export function resolveIngredientNutritionFromReference(ingredientObj, nutritionReferenceRows) {
  const ingredientID = String(ingredientObj?.ingredientID || '').trim();
  if (!ingredientID) return null;

  const row = (nutritionReferenceRows || []).find(r => r.ingredientID === ingredientID);
  if (!row) return null;

  const source = row.source || '';
  if (!PREFERRED_NUTRITION_SOURCES.has(source)) return null;

  const amountG = computeIngredientAmountG(ingredientObj.text || '', row);
  if (amountG == null) return null;

  const naehrwerte = scaleNutritionValues(row, amountG);
  return { naehrwerte, fromReference: true, source, amountG };
}

function NutritionModal({ recipe, onClose, onSave, allRecipes = [], currentUser, isStale = false, onEnsureIngredientIDs, nutritionReferenceRows = [] }) {
  const [kalorien, setKalorien] = useState('');
  const [protein, setProtein] = useState('');
  const [fett, setFett] = useState('');
  const [kohlenhydrate, setKohlenhydrate] = useState('');
  const [zucker, setZucker] = useState('');
  const [ballaststoffe, setBallaststoffe] = useState('');
  const [salz, setSalz] = useState('');
  const [saving, setSaving] = useState(false);
  const [autoCalcLoading, setAutoCalcLoading] = useState(false);
  const [autoCalcResult, setAutoCalcResult] = useState(() => {
    const fromRecipe = getRecipeCalcResult(recipe);
    if (fromRecipe) return fromRecipe;
    const stored = loadStoredCalcResult(recipe?.id);
    if (stored) return stored;
    return null;
  });
  const [calcProgress, setCalcProgress] = useState(null);
  const [editingIngredient, setEditingIngredient] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [reformulations, setReformulations] = useState(() => {
    const stored = loadStoredCalcResult(recipe?.id);
    const notIncluded = recipe?.naehrwerte?.calcNotIncluded || stored?.notIncluded || [];
    const persistedReformulations = {
      ...(stored?.calcReformulations || {}),
      ...(recipe?.naehrwerte?.calcReformulations || {}),
    };
    const map = { ...persistedReformulations };
    for (const item of notIncluded) {
      if (item.reformulation) {
        map[item.ingredient] = { text: item.reformulation, changeLog: item.changeLog || [] };
      }
    }
    return map;
  });
  const [acceptedIngredients, setAcceptedIngredients] = useState(() => {
    const stored = loadStoredCalcResult(recipe?.id);
    const list = recipe?.naehrwerte?.calcAcceptedIngredients || stored?.acceptedIngredients || [];
    return new Set(list);
  });
  const closeButtonRef = useRef(null);
  const abortControllerRef = useRef(null);
  const [showCompositionTable, setShowCompositionTable] = useState(false);

  // Initialise fields from existing recipe data (stored as totals; display per portion)
  useEffect(() => {
    const n = naehrwertePerPortion(recipe.naehrwerte, recipe.portionen);
    setKalorien(n.kalorien != null ? String(n.kalorien) : '');
    setProtein(n.protein != null ? String(n.protein) : '');
    setFett(n.fett != null ? String(n.fett) : '');
    setKohlenhydrate(n.kohlenhydrate != null ? String(n.kohlenhydrate) : '');
    setZucker(n.zucker != null ? String(n.zucker) : '');
    setBallaststoffe(n.ballaststoffe != null ? String(n.ballaststoffe) : '');
    setSalz(n.salz != null ? String(n.salz) : '');
  }, [recipe]);

  // Focus close button when modal opens
  useEffect(() => {
    if (closeButtonRef.current) {
      closeButtonRef.current.focus();
    }
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const parsePositiveNumber = (value) => {
    const n = parseFloat(value.replace(',', '.'));
    return isNaN(n) || n < 0 ? null : n;
  };

  const formatNutritionValue = (naehrwerte, key, decimals = 1) => {
    if (naehrwerte == null) return '—';
    const value = naehrwerte[key] ?? 0;
    const factor = Math.pow(10, decimals);
    return String(Math.round(value * factor) / factor);
  };

  const handleSave = async () => {
    const portionen = recipe.portionen || 1;
    // Form fields hold per-portion values; multiply back to store totals
    const perPortion = {
      kalorien: parsePositiveNumber(kalorien),
      protein: parsePositiveNumber(protein),
      fett: parsePositiveNumber(fett),
      kohlenhydrate: parsePositiveNumber(kohlenhydrate),
      zucker: parsePositiveNumber(zucker),
      ballaststoffe: parsePositiveNumber(ballaststoffe),
      salz: parsePositiveNumber(salz),
    };
    // Preserve calc metadata so the error log remains visible after manual save
    const { calcError } = recipe?.naehrwerte || {};
    const calcFoundCount = autoCalcResult?.foundCount ?? recipe?.naehrwerte?.calcFoundCount;
    const calcTotalCount = autoCalcResult?.totalCount ?? recipe?.naehrwerte?.calcTotalCount;
    const calcNotIncluded = autoCalcResult?.notIncluded ?? recipe?.naehrwerte?.calcNotIncluded;
    const calcReformulations = autoCalcResult?.calcReformulations ?? recipe?.naehrwerte?.calcReformulations;
    const calcAcceptedIngredients = acceptedIngredients.size > 0
      ? [...acceptedIngredients]
      : recipe?.naehrwerte?.calcAcceptedIngredients;
    const calcIngredientDetails = autoCalcResult?.ingredientDetails ?? recipe?.naehrwerte?.calcIngredientDetails;
    const naehrwerte = {
      ...naehrwerteToTotals(perPortion, portionen),
      calcPending: false,
      calcCompletedAt: Date.now(),
      ...(calcFoundCount !== undefined && { calcFoundCount }),
      ...(calcTotalCount !== undefined && { calcTotalCount }),
      ...(calcNotIncluded !== undefined && { calcNotIncluded }),
      ...(calcReformulations !== undefined && { calcReformulations }),
      ...(calcAcceptedIngredients !== undefined && { calcAcceptedIngredients }),
      ...(calcIngredientDetails !== undefined && { calcIngredientDetails }),
      ...(calcError !== undefined && { calcError }),
    };

    setSaving(true);
    try {
      await onSave(naehrwerte);
      onClose();
    } catch (err) {
      console.error('Error saving nutritional values:', err);
      alert('Fehler beim Speichern der Nährwerte. Bitte versuchen Sie es erneut.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveReformulation = async (ingredient, newText) => {
    const trimmed = newText.trim();
    setEditingIngredient(null);
    if (!trimmed) return;
    const prev = reformulations[ingredient];
    const prevText = prev?.text || ingredient;
    if (trimmed === prevText) return;

    const changeLogEntry = { from: prevText, to: trimmed, timestamp: new Date().toISOString() };
    const updated = { text: trimmed, changeLog: [...(prev?.changeLog || []), changeLogEntry] };
    const newReformulations = { ...reformulations, [ingredient]: updated };
    setReformulations(newReformulations);

    if (autoCalcResult?.notIncluded) {
      const updatedNotIncluded = autoCalcResult.notIncluded.map(item =>
        item.ingredient === ingredient
          ? { ...item, reformulation: updated.text, changeLog: updated.changeLog }
          : item
      );
      const updatedResult = { ...autoCalcResult, notIncluded: updatedNotIncluded };
      setAutoCalcResult(updatedResult);
      saveStoredCalcResult(recipe?.id, updatedResult);
      try {
        await onSave({
          ...(recipe?.naehrwerte || {}),
          calcNotIncluded: updatedNotIncluded,
          calcReformulations: updatedResult.calcReformulations ?? recipe?.naehrwerte?.calcReformulations ?? null,
        });
      } catch (err) {
        console.error('Could not save reformulation to Firebase:', err);
      }
    }
  };

  const handleAcceptIngredient = async (ingredient) => {
    const newAccepted = new Set(acceptedIngredients);
    newAccepted.add(ingredient);
    setAcceptedIngredients(newAccepted);
    const acceptedArray = [...newAccepted];

    const updatedNotIncluded = autoCalcResult?.notIncluded
      ? autoCalcResult.notIncluded.filter(item => item.ingredient !== ingredient)
      : null;
    const updatedFoundCount = autoCalcResult ? autoCalcResult.foundCount + 1 : undefined;

    if (updatedNotIncluded !== null && updatedFoundCount !== undefined) {
      const updatedResult = { ...autoCalcResult, notIncluded: updatedNotIncluded, foundCount: updatedFoundCount };
      setAutoCalcResult(updatedResult);
      saveStoredCalcResult(recipe?.id, { ...updatedResult, acceptedIngredients: acceptedArray });
    }

    try {
      await onSave({
        ...(recipe?.naehrwerte || {}),
        ...(updatedNotIncluded !== null && {
          calcNotIncluded: updatedNotIncluded.length > 0 ? updatedNotIncluded : null,
        }),
        ...(updatedFoundCount !== undefined && { calcFoundCount: updatedFoundCount }),
        calcReformulations: autoCalcResult?.calcReformulations ?? recipe?.naehrwerte?.calcReformulations ?? null,
        calcAcceptedIngredients: acceptedArray,
      });
    } catch (err) {
      console.error('Could not save accepted ingredient to Firebase:', err);
    }
  };

  const handleAutoCalculate = async () => {
    // Step 1: Ensure ingredient IDs are set before calculating
    let currentRecipe = recipe;
    if (onEnsureIngredientIDs) {
      const matchResult = await onEnsureIngredientIDs();
      if (matchResult === null) {
        // Dialog was opened for manual selection – stop and let user interact
        return;
      }
      if (matchResult) {
        // updatedIngredients have been persisted; use them for this calculation
        currentRecipe = {
          ...recipe,
          [matchResult.fieldName]: matchResult.updatedIngredients,
        };
      }
    }

    const rawIngredients = currentRecipe.zutaten || currentRecipe.ingredients || [];
    const allIngredientItems = rawIngredients
      .filter(item => typeof item === 'string' || (item && typeof item === 'object' && item.type !== 'heading'));

    // Keep as objects with text + optional ingredientID
    const normalizedItems = allIngredientItems.map(item =>
      typeof item === 'string' ? { text: item } : { ...item, text: item.text || '' }
    );

    // Separate recipe-link ingredients from regular ingredients
    const ingredients = []; // { text, ingredientID? }
    const recipeLinkItems = [];
    for (const item of normalizedItems) {
      const link = decodeRecipeLink(item.text);
      if (link) {
        recipeLinkItems.push({ ingredient: item.text, link });
      } else {
        ingredients.push(item);
      }
    }

    if (ingredients.length === 0 && recipeLinkItems.length === 0) {
      setAutoCalcResult({ error: 'Keine Zutaten im Rezept gefunden.' });
      return;
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setAutoCalcLoading(true);
    setAutoCalcResult(null);
    clearStoredCalcResult(recipe?.id);
    setCalcProgress({ done: 0, total: ingredients.length + recipeLinkItems.length, current: ingredients[0]?.text || (recipeLinkItems[0]?.link.recipeName) || '' });

    // Persist calcPending so the loading indicator survives navigation away from this modal
    try {
      await onSave({ ...(recipe?.naehrwerte || {}), calcPending: true, calcPendingAt: Date.now(), calcError: null });
    } catch (err) {
      console.error('Could not set calcPending:', err);
    }

    const calculateNutrition = httpsCallable(functions, 'calculateNutritionFromOpenFoodFacts');
    const totals = { kalorien: 0, protein: 0, fett: 0, kohlenhydrate: 0, zucker: 0, ballaststoffe: 0, salz: 0 };
    const notIncluded = [];
    const successfulReformulations = {};
    const ingredientDetails = [];
    const aiEstimatedIngredients = new Set(
      (autoCalcResult?.ingredientDetails || [])
        .filter(d => d.aiEstimated)
        .map(d => d.ingredient)
    );
    let foundCount = 0;

    // Process regular ingredients
    for (let i = 0; i < ingredients.length; i++) {
      if (abortController.signal.aborted) {
        break;
      }
      const ingredientItem = ingredients[i];
      const ingredient = ingredientItem.text;

      // Skip accepted ingredients – but NOT AI-estimated ones (re-check against OpenFoodFacts)
      if (acceptedIngredients.has(ingredient) && !aiEstimatedIngredients.has(ingredient)) {
        setCalcProgress({ done: i, total: ingredients.length + recipeLinkItems.length, current: ingredient });
        foundCount++;
        continue;
      }

      setCalcProgress({ done: i, total: ingredients.length + recipeLinkItems.length, current: ingredient });

      // Check nutrition reference cache first if ingredient has an ingredientID
      const fromRef = resolveIngredientNutritionFromReference(ingredientItem, nutritionReferenceRows);
      if (fromRef) {
        const { naehrwerte: n, fromReference, source } = fromRef;
        Object.keys(totals).forEach(key => {
          totals[key] += n[key] || 0;
        });
        foundCount++;
        ingredientDetails.push({
          ingredient,
          naehrwerte: n,
          searchTerm: null,
          aiEstimated: false,
          fromReference,
          source,
        });
        continue;
      }

      // Fall back to OpenFoodFacts
      try {
        const result = await calculateNutrition({ ingredients: [ingredient], portionen: 1 });
        const { naehrwerte: n, details } = result.data;
        const detail = details && details[0];
        if (detail && detail.found) {
          Object.keys(totals).forEach(key => {
            totals[key] += n[key] || 0;
          });
          foundCount++;
          ingredientDetails.push({
            ingredient,
            naehrwerte: n,
            searchTerm: detail.searchTerm || null,
            aiEstimated: detail.aiEstimated || false,
          });
          if (reformulations[ingredient]) {
            successfulReformulations[ingredient] = reformulations[ingredient];
          }

          // Write back to nutritionReferences when we have an ingredientID whose
          // existing source is not preferred (openfoodfacts / manual)
          const ingredientID = String(ingredientItem.ingredientID || '').trim();
          if (ingredientID) {
            const existingRow = (nutritionReferenceRows || []).find(r => r.ingredientID === ingredientID);
            const existingSource = existingRow?.source || '';
            if (!PREFERRED_NUTRITION_SOURCES.has(existingSource)) {
              const amountG = computeIngredientAmountG(ingredient, existingRow);

              if (amountG != null && amountG > 0) {
                const per100g = {};
                NUTRITION_REFERENCE_FIELDS.forEach(field => {
                  if (n[field] != null) per100g[field] = (n[field] / amountG) * 100;
                });
                setDoc(
                  doc(db, 'nutritionReferences', ingredientID),
                  { ...per100g, source: 'openfoodfacts', updatedAt: serverTimestamp() },
                  { merge: true }
                ).catch(err => console.error('Could not write back nutritionReferences:', err));
              }
            }
          }
        } else {
          const reform = reformulations[ingredient];
          notIncluded.push({
            ingredient,
            error: detail?.error || 'Nicht gefunden',
            ...(reform && { reformulation: reform.text, changeLog: reform.changeLog }),
          });
        }
      } catch (err) {
        console.error(`Auto-calculation failed for "${ingredient}":`, err);
        const reform = reformulations[ingredient];
        notIncluded.push({
          ingredient,
          error: mapNutritionCalcError(err),
          ...(reform && { reformulation: reform.text, changeLog: reform.changeLog }),
        });
      }
    }

    // Process recipe-link ingredients dynamically from linked recipe's naehrwerte
    for (let i = 0; i < recipeLinkItems.length; i++) {
      if (abortController.signal.aborted) {
        break;
      }
      const { ingredient, link } = recipeLinkItems[i];

      // Skip accepted ingredients – count them as found without resolution
      if (acceptedIngredients.has(ingredient)) {
        setCalcProgress({ done: ingredients.length + i, total: ingredients.length + recipeLinkItems.length, current: ingredient });
        foundCount++;
        continue;
      }

      setCalcProgress({ done: ingredients.length + i, total: ingredients.length + recipeLinkItems.length, current: link.recipeName });

      const linkedRecipe = allRecipes.find(r => r.id === link.recipeId);
      if (linkedRecipe && linkedRecipe.naehrwerte) {
        const linkedPortionen = linkedRecipe.portionen || 1;
        const parsedQuantity = extractQuantityFromPrefix(link.quantityPrefix);
        if (parsedQuantity === null && link.quantityPrefix) {
          console.warn(`Could not parse quantity prefix "${link.quantityPrefix}" for linked recipe "${link.recipeName}". Defaulting to 1.`);
        }
        const quantity = parsedQuantity || 1;
        const multiplier = quantity / linkedPortionen;
        const linkNaehrwerte = {};
        Object.keys(totals).forEach(key => {
          const val = (linkedRecipe.naehrwerte[key] || 0) * multiplier;
          linkNaehrwerte[key] = val;
          totals[key] += val;
        });
        ingredientDetails.push({ ingredient, naehrwerte: linkNaehrwerte, searchTerm: null, aiEstimated: false });
        foundCount++;
      } else {
        notIncluded.push({
          ingredient,
          error: linkedRecipe
            ? `Verlinktes Rezept "${link.recipeName}" hat keine gespeicherten Nährwerte. Bitte berechnen Sie zuerst die Nährwerte für dieses Rezept.`
            : `Verlinktes Rezept "${link.recipeName}" nicht gefunden. Möglicherweise wurde das Rezept gelöscht.`,
          isRecipeLink: true,
        });
      }
    }

    // Set per-portion display values in form fields (totals ÷ portionen)
    const portionen = recipe.portionen || 1;
    const perPortion = naehrwertePerPortion(totals, portionen);
    setKalorien(perPortion.kalorien != null ? String(perPortion.kalorien) : '');
    setProtein(perPortion.protein != null ? String(perPortion.protein) : '');
    setFett(perPortion.fett != null ? String(perPortion.fett) : '');
    setKohlenhydrate(perPortion.kohlenhydrate != null ? String(perPortion.kohlenhydrate) : '');
    setZucker(perPortion.zucker != null ? String(perPortion.zucker) : '');
    setBallaststoffe(perPortion.ballaststoffe != null ? String(perPortion.ballaststoffe) : '');
    setSalz(perPortion.salz != null ? String(perPortion.salz) : '');

    abortControllerRef.current = null;
    setCalcProgress(null);
    setAutoCalcLoading(false);

    if (abortController.signal.aborted) {
      return;
    }

    const totalCount = ingredients.length + recipeLinkItems.length;
    const acceptedArray = acceptedIngredients.size > 0 ? [...acceptedIngredients] : undefined;
    const mergedReformulations = {
      ...(recipe?.naehrwerte?.calcReformulations || {}),
      ...(autoCalcResult?.calcReformulations || {}),
      ...successfulReformulations,
    };
    const result = {
      foundCount,
      totalCount,
      notIncluded,
      ...(acceptedArray && { acceptedIngredients: acceptedArray }),
      ...(Object.keys(mergedReformulations).length > 0 && { calcReformulations: mergedReformulations }),
      ...(ingredientDetails.length > 0 && { ingredientDetails }),
    };
    setAutoCalcResult(result);
    saveStoredCalcResult(recipe?.id, result);

    // Persist totals and per-ingredient errors to Firestore automatically
    const finalNaehrwerte = {
      ...totals,
      calcPending: false,
      calcCompletedAt: Date.now(),
      calcError: null,
      calcNotIncluded: notIncluded.length > 0 ? notIncluded : null,
      calcFoundCount: foundCount,
      calcTotalCount: totalCount,
      calcReformulations: Object.keys(mergedReformulations).length > 0 ? mergedReformulations : null,
      calcAcceptedIngredients: acceptedArray || null,
      calcIngredientDetails: ingredientDetails.length > 0 ? ingredientDetails : null,
    };
    try {
      await onSave(finalNaehrwerte);
    } catch (saveErr) {
      console.error('Could not auto-save nutrition data:', saveErr);
      setAutoCalcResult(prev => prev ? { ...prev, saveError: true } : null);
    }
  };

  const handleRecalcReformulated = async () => {
    const notIncludedItems = autoCalcResult?.notIncluded || [];
    if (notIncludedItems.length === 0) return;

    const regularItems = notIncludedItems.filter(item => !item.isRecipeLink);
    const recipeLinkNotIncluded = notIncludedItems.filter(item => item.isRecipeLink);
    const totalToProcess = regularItems.length + recipeLinkNotIncluded.length;

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setAutoCalcLoading(true);
    setCalcProgress({
      done: 0,
      total: totalToProcess,
      current: regularItems[0]?.ingredient || recipeLinkNotIncluded[0]?.ingredient || '',
    });

    // Derive existing totals from the current form field values (per-portion × portionen)
    const portionen = recipe.portionen || 1;
    const existingPerPortion = {
      kalorien: parsePositiveNumber(kalorien),
      protein: parsePositiveNumber(protein),
      fett: parsePositiveNumber(fett),
      kohlenhydrate: parsePositiveNumber(kohlenhydrate),
      zucker: parsePositiveNumber(zucker),
      ballaststoffe: parsePositiveNumber(ballaststoffe),
      salz: parsePositiveNumber(salz),
    };
    const existingTotals = naehrwerteToTotals(existingPerPortion, portionen);

    const calculateNutrition = httpsCallable(functions, 'calculateNutritionFromOpenFoodFacts');
    const newTotals = { kalorien: 0, protein: 0, fett: 0, kohlenhydrate: 0, zucker: 0, ballaststoffe: 0, salz: 0 };
    const stillNotIncluded = [];
    const newSuccessfulReformulations = {};
    const newIngredientDetails = [];
    let newFoundCount = 0;

    // Process regular (non-link) not-included ingredients
    for (let i = 0; i < regularItems.length; i++) {
      if (abortController.signal.aborted) break;

      const item = regularItems[i];
      const { ingredient } = item;
      const effectiveIngredient = reformulations[ingredient]?.text || ingredient;
      setCalcProgress({ done: i, total: totalToProcess, current: effectiveIngredient });

      try {
        const result = await calculateNutrition({ ingredients: [effectiveIngredient], portionen: 1 });
        const { naehrwerte: n, details } = result.data;
        const detail = details && details[0];
        if (detail && detail.found) {
          Object.keys(newTotals).forEach(key => { newTotals[key] += n[key] || 0; });
          newFoundCount++;
          newIngredientDetails.push({
            ingredient,
            naehrwerte: n,
            searchTerm: detail.searchTerm || null,
            aiEstimated: detail.aiEstimated || false,
          });
          if (reformulations[ingredient]) {
            newSuccessfulReformulations[ingredient] = reformulations[ingredient];
          }
        } else {
          const reform = reformulations[ingredient];
          stillNotIncluded.push({
            ingredient,
            error: detail?.error || 'Nicht gefunden',
            ...(reform && { reformulation: reform.text, changeLog: reform.changeLog }),
          });
        }
      } catch (err) {
        console.error(`Recalculation failed for "${ingredient}":`, err);
        const reform = reformulations[ingredient];
        stillNotIncluded.push({
          ingredient,
          error: mapNutritionCalcError(err),
          ...(reform && { reformulation: reform.text, changeLog: reform.changeLog }),
        });
      }
    }

    // Process recipe-link not-included ingredients
    for (let i = 0; i < recipeLinkNotIncluded.length; i++) {
      if (abortController.signal.aborted) break;

      const { ingredient } = recipeLinkNotIncluded[i];
      const link = decodeRecipeLink(ingredient);
      setCalcProgress({ done: regularItems.length + i, total: totalToProcess, current: link?.recipeName || ingredient });

      const linkedRecipe = allRecipes.find(r => r.id === link?.recipeId);
      if (linkedRecipe && linkedRecipe.naehrwerte) {
        const linkedPortionen = linkedRecipe.portionen || 1;
        const parsedQuantity = extractQuantityFromPrefix(link.quantityPrefix);
        if (parsedQuantity === null && link.quantityPrefix) {
          console.warn(`Could not parse quantity prefix "${link.quantityPrefix}" for linked recipe "${link.recipeName}". Defaulting to 1.`);
        }
        const quantity = parsedQuantity || 1;
        const multiplier = quantity / linkedPortionen;
        const linkNaehrwerte = {};
        Object.keys(newTotals).forEach(key => {
          const val = (linkedRecipe.naehrwerte[key] || 0) * multiplier;
          linkNaehrwerte[key] = val;
          newTotals[key] += val;
        });
        newIngredientDetails.push({ ingredient, naehrwerte: linkNaehrwerte, searchTerm: null, aiEstimated: false });
        newFoundCount++;
      } else {
        stillNotIncluded.push({
          ingredient,
          error: linkedRecipe
            ? `Verlinktes Rezept "${link.recipeName}" hat keine gespeicherten Nährwerte. Bitte berechnen Sie zuerst die Nährwerte für dieses Rezept.`
            : `Verlinktes Rezept "${link?.recipeName || ingredient}" nicht gefunden. Möglicherweise wurde das Rezept gelöscht.`,
          isRecipeLink: true,
        });
      }
    }

    // Add newly calculated values to existing totals
    const combinedTotals = {};
    Object.keys(newTotals).forEach(key => {
      combinedTotals[key] = (existingTotals[key] || 0) + newTotals[key];
    });

    // Update form fields with combined per-portion values
    const combinedPerPortion = naehrwertePerPortion(combinedTotals, portionen);
    setKalorien(combinedPerPortion.kalorien != null ? String(combinedPerPortion.kalorien) : '');
    setProtein(combinedPerPortion.protein != null ? String(combinedPerPortion.protein) : '');
    setFett(combinedPerPortion.fett != null ? String(combinedPerPortion.fett) : '');
    setKohlenhydrate(combinedPerPortion.kohlenhydrate != null ? String(combinedPerPortion.kohlenhydrate) : '');
    setZucker(combinedPerPortion.zucker != null ? String(combinedPerPortion.zucker) : '');
    setBallaststoffe(combinedPerPortion.ballaststoffe != null ? String(combinedPerPortion.ballaststoffe) : '');
    setSalz(combinedPerPortion.salz != null ? String(combinedPerPortion.salz) : '');

    abortControllerRef.current = null;
    setCalcProgress(null);
    setAutoCalcLoading(false);

    if (abortController.signal.aborted) return;

    const prevFoundCount = autoCalcResult?.foundCount || 0;
    const prevTotalCount = autoCalcResult?.totalCount || 0;
    const mergedReformulations = {
      ...(autoCalcResult?.calcReformulations || {}),
      ...newSuccessfulReformulations,
    };
    const mergedIngredientDetails = [
      ...(autoCalcResult?.ingredientDetails || []),
      ...newIngredientDetails,
    ];

    const updatedResult = {
      foundCount: prevFoundCount + newFoundCount,
      totalCount: prevTotalCount,
      notIncluded: stillNotIncluded,
      ...(Object.keys(mergedReformulations).length > 0 && { calcReformulations: mergedReformulations }),
      ...(mergedIngredientDetails.length > 0 && { ingredientDetails: mergedIngredientDetails }),
    };
    setAutoCalcResult(updatedResult);
    saveStoredCalcResult(recipe?.id, updatedResult);

    // Persist combined totals and updated per-ingredient errors to Firestore
    const finalNaehrwerte = {
      ...combinedTotals,
      calcPending: false,
      calcCompletedAt: Date.now(),
      calcError: null,
      calcNotIncluded: stillNotIncluded.length > 0 ? stillNotIncluded : null,
      calcFoundCount: prevFoundCount + newFoundCount,
      calcTotalCount: prevTotalCount,
      calcReformulations: Object.keys(mergedReformulations).length > 0 ? mergedReformulations : null,
      calcIngredientDetails: mergedIngredientDetails.length > 0 ? mergedIngredientDetails : null,
    };
    try {
      await onSave(finalNaehrwerte);
    } catch (saveErr) {
      console.error('Could not auto-save nutrition data after recalc:', saveErr);
      setAutoCalcResult(prev => prev ? { ...prev, saveError: true } : null);
    }
  };

  const hasValues =
    kalorien !== '' || protein !== '' || fett !== '' || kohlenhydrate !== '' ||
    zucker !== '' || ballaststoffe !== '' || salz !== '';
  const compositionRows = useMemo(() => buildNutritionCompositionRows(
    recipe,
    autoCalcResult,
    reformulations,
    acceptedIngredients
  ), [recipe, autoCalcResult, reformulations, acceptedIngredients]);

  return (
    <div className="nutrition-modal-overlay" onClick={onClose}>
      <div
        className="nutrition-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Nährwerte"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="nutrition-modal-header">
          <h2 className="nutrition-modal-title">Nährwerte</h2>
          <button
            ref={closeButtonRef}
            className="nutrition-modal-close"
            onClick={onClose}
            aria-label="Nährwerte schließen"
          >
            ×
          </button>
        </div>

        <div className="nutrition-modal-body">
          {isStale && (
            <div className="nutrition-stale-warning">
              ⚠️ Die Nährwertetabelle wurde seit der letzten Berechnung aktualisiert. Bitte Nährwerte neu berechnen.
            </div>
          )}
          <p className="nutrition-modal-hint">
            Nährwerte pro Portion ({recipe.portionen || 1}{' '}
            {(recipe.portionen || 1) === 1 ? 'Portion' : 'Portionen'})
          </p>
          {compositionRows.length > 0 && (
            <div className="nutrition-composition-section">
              <button
                type="button"
                className="nutrition-composition-toggle"
                onClick={() => setShowCompositionTable(prev => !prev)}
              >
                {showCompositionTable ? 'Zusammensetzung ausblenden' : 'Zusammensetzung anzeigen'}
              </button>
              {showCompositionTable && (
                <div className="nutrition-composition-table-wrap">
                  <table className="nutrition-composition-table">
                    <thead>
                      <tr>
                        <th>Zutat</th>
                        <th>Quelle</th>
                        <th className="nutrition-composition-num">kcal</th>
                        <th className="nutrition-composition-num">Protein</th>
                        <th className="nutrition-composition-num">Fett</th>
                        <th className="nutrition-composition-num">KH</th>
                        <th>Status</th>
                        <th>Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {compositionRows.map((row, index) => (
                        <tr
                         key={`${row.ingredient}-${index}`}
                         className={row.aiEstimated ? 'nutrition-composition-row--ai-estimated' : ''}
                        >
                         <td>{row.ingredient}</td>
                         <td>
                           {row.source}
                           {row.aiEstimated && <span className="nutrition-ai-estimated-badge"> 🤖 KI-Schätzung</span>}
                         </td>
                         <td className="nutrition-composition-num">{formatNutritionValue(row.naehrwerte, 'kalorien', 0)}</td>
                         <td className="nutrition-composition-num">{formatNutritionValue(row.naehrwerte, 'protein')}</td>
                         <td className="nutrition-composition-num">{formatNutritionValue(row.naehrwerte, 'fett')}</td>
                         <td className="nutrition-composition-num">{formatNutritionValue(row.naehrwerte, 'kohlenhydrate')}</td>
                          <td>{row.status}</td>
                          <td>{row.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="nutrition-field-grid">
            <div className="nutrition-field">
              <label htmlFor="nutrition-kalorien">Kalorien (kcal)</label>
              <input
                id="nutrition-kalorien"
                type="number"
                min="0"
                step="1"
                value={kalorien}
                onChange={(e) => setKalorien(e.target.value)}
                placeholder="z.B. 350"
                className="nutrition-input"
              />
            </div>

            <div className="nutrition-field">
              <label htmlFor="nutrition-protein">Protein (g)</label>
              <input
                id="nutrition-protein"
                type="number"
                min="0"
                step="0.1"
                value={protein}
                onChange={(e) => setProtein(e.target.value)}
                placeholder="z.B. 25"
                className="nutrition-input"
              />
            </div>

            <div className="nutrition-field">
              <label htmlFor="nutrition-fett">Fett (g)</label>
              <input
                id="nutrition-fett"
                type="number"
                min="0"
                step="0.1"
                value={fett}
                onChange={(e) => setFett(e.target.value)}
                placeholder="z.B. 12"
                className="nutrition-input"
              />
            </div>

            <div className="nutrition-field">
              <label htmlFor="nutrition-kohlenhydrate">Kohlenhydrate (g)</label>
              <input
                id="nutrition-kohlenhydrate"
                type="number"
                min="0"
                step="0.1"
                value={kohlenhydrate}
                onChange={(e) => setKohlenhydrate(e.target.value)}
                placeholder="z.B. 40"
                className="nutrition-input"
              />
            </div>

            <div className="nutrition-field nutrition-field--indented">
              <label htmlFor="nutrition-zucker">davon Zucker (g)</label>
              <input
                id="nutrition-zucker"
                type="number"
                min="0"
                step="0.1"
                value={zucker}
                onChange={(e) => setZucker(e.target.value)}
                placeholder="z.B. 5"
                className="nutrition-input"
              />
            </div>

            <div className="nutrition-field">
              <label htmlFor="nutrition-ballaststoffe">Ballaststoffe (g)</label>
              <input
                id="nutrition-ballaststoffe"
                type="number"
                min="0"
                step="0.1"
                value={ballaststoffe}
                onChange={(e) => setBallaststoffe(e.target.value)}
                placeholder="z.B. 3"
                className="nutrition-input"
              />
            </div>

            <div className="nutrition-field">
              <label htmlFor="nutrition-salz">Salz (g)</label>
              <input
                id="nutrition-salz"
                type="number"
                min="0"
                step="0.01"
                value={salz}
                onChange={(e) => setSalz(e.target.value)}
                placeholder="z.B. 0.8"
                className="nutrition-input"
              />
            </div>
          </div>

          <div className="nutrition-autocalc">
            <button
              className="nutrition-autocalc-button"
              onClick={handleAutoCalculate}
              disabled={autoCalcLoading}
              title="Nährwerte automatisch aus OpenFoodFacts berechnen"
            >
              {autoCalcLoading ? 'Berechne…' : 'Automatisch berechnen (OpenFoodFacts)'}
            </button>
            {!autoCalcLoading && recipe.naehrwerte?.calcPending && (
              <div className="nutrition-calc-progress">
                <span>Hintergrundberechnung läuft…</span>
              </div>
            )}
            {!autoCalcLoading && !autoCalcResult && recipe.naehrwerte?.calcError && (
              <div className="nutrition-autocalc-error-box">
                <p className="nutrition-autocalc-error">{recipe.naehrwerte.calcError}</p>
                <button
                  className="nutrition-autocalc-retry-button"
                  onClick={handleAutoCalculate}
                  disabled={autoCalcLoading}
                >
                  Erneut versuchen
                </button>
              </div>
            )}
            {autoCalcLoading && calcProgress && (
              <div className="nutrition-calc-progress">
                <div className="nutrition-calc-progress-header">
                  <span>{calcProgress.done} von {calcProgress.total} Zutaten überprüft</span>
                </div>
                <div className="nutrition-calc-progress-bar-track">
                  <div
                    className="nutrition-calc-progress-bar-fill"
                    style={{ width: `${calcProgress.total > 0 ? (calcProgress.done / calcProgress.total) * 100 : 0}%` }}
                  />
                </div>
                {calcProgress.current && (
                  <p className="nutrition-calc-current">Überprüfe: {calcProgress.current}</p>
                )}
              </div>
            )}
            {autoCalcResult && autoCalcResult.info && (
              <p className="nutrition-autocalc-info">{autoCalcResult.info}</p>
            )}
            {autoCalcResult && !autoCalcResult.error && !autoCalcResult.info && (
              <>
                <p className="nutrition-autocalc-info">
                  {autoCalcResult.foundCount} von {autoCalcResult.totalCount} Zutaten gefunden.
                  {autoCalcResult.foundCount < autoCalcResult.totalCount &&
                    ' Fehlende Werte bitte manuell ergänzen.'}
                </p>
                {(() => {
                  const aiEstimatedCount = (autoCalcResult.ingredientDetails || []).filter(item => item.aiEstimated).length;
                  if (aiEstimatedCount <= 0) return null;
                  return (
                    <p className="nutrition-autocalc-info nutrition-autocalc-info-ai">
                      ℹ️ Für {aiEstimatedCount} Zutaten wurden Nährwerte durch KI geschätzt. Diese werden bei der nächsten Berechnung erneut bei OpenFoodFacts abgefragt.
                    </p>
                  );
                })()}
                {autoCalcResult.notIncluded && autoCalcResult.notIncluded.length > 0 && (
                  <div className="nutrition-not-included">
                    <p className="nutrition-not-included-title">Nicht einkalkulierte Zutaten:</p>
                    <ul className="nutrition-not-included-list">
                      {autoCalcResult.notIncluded.map((item, i) => (
                        <li key={i} className="nutrition-not-included-item">
                          {editingIngredient === item.ingredient ? (
                            <div className="nutrition-reformulation-edit">
                              <input
                                type="text"
                                className="nutrition-reformulation-input"
                                value={editingText}
                                autoFocus
                                onChange={(e) => setEditingText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveReformulation(item.ingredient, editingText);
                                  if (e.key === 'Escape') setEditingIngredient(null);
                                }}
                              />
                              <button
                                className="nutrition-reformulation-confirm-btn"
                                onClick={() => handleSaveReformulation(item.ingredient, editingText)}
                                title="Umformulierung speichern"
                              >✓</button>
                              <button
                                className="nutrition-reformulation-cancel-btn"
                                onClick={() => setEditingIngredient(null)}
                                title="Abbrechen"
                              >×</button>                            </div>
                          ) : (
                            <>
                              <div className="nutrition-not-included-row">
                                <span className="nutrition-not-included-name">
                                  {reformulations[item.ingredient]?.text || item.ingredient}
                                  {reformulations[item.ingredient] && (
                                    <span className="nutrition-reformulation-badge"> (umformuliert)</span>
                                  )}
                                </span>
                                {item.error && (
                                  <span className="nutrition-not-included-reason">: {item.error}</span>
                                )}
                                <button
                                  className="nutrition-reformulation-edit-btn"
                                  onClick={() => {
                                    setEditingIngredient(item.ingredient);
                                    setEditingText(reformulations[item.ingredient]?.text || item.ingredient);
                                  }}
                                  title="Zutat umformulieren"
                                >Edit</button>
                                <button
                                  className="nutrition-accept-ingredient-btn"
                                  onClick={() => handleAcceptIngredient(item.ingredient)}
                                  title="Als gefunden markieren (von der Neuberechnung ausschließen)"
                                >✔</button>
                              </div>
                              {(item.changeLog || reformulations[item.ingredient]?.changeLog)?.length > 0 && (
                                <details className="nutrition-change-log">
                                  <summary>Änderungsprotokoll</summary>
                                  <ul className="nutrition-change-log-list">
                                    {(item.changeLog || reformulations[item.ingredient]?.changeLog).map((entry, j) => (
                                      <li key={j}>
                                        {new Date(entry.timestamp).toLocaleString('de-DE')}:{' '}
                                        „{entry.from}" → „{entry.to}"
                                      </li>
                                    ))}
                                  </ul>
                                </details>
                              )}
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                    {(Object.keys(reformulations).length > 0 || acceptedIngredients.size > 0) && (
                      <button
                        className="nutrition-recalc-reformulated-button"
                        onClick={handleRecalcReformulated}
                        disabled={autoCalcLoading}
                        title="Nährwerte mit den umformulierten Zutaten neu berechnen"
                      >
                        Mit Umformulierungen neu berechnen
                      </button>
                    )}
                  </div>
                )}
                {autoCalcResult.saveError && (
                  <p className="nutrition-autocalc-error">
                    Speichern fehlgeschlagen. Bitte manuell speichern.
                  </p>
                )}
              </>
            )}
            {autoCalcResult && autoCalcResult.error && (
              <div className="nutrition-autocalc-error-box">
                <p className="nutrition-autocalc-error">{autoCalcResult.error}</p>
                <button
                  className="nutrition-autocalc-retry-button"
                  onClick={handleAutoCalculate}
                  disabled={autoCalcLoading}
                >
                  Erneut versuchen
                </button>
              </div>
            )}
            <p className="nutrition-autocalc-source">
              Quelle:{' '}
              <a
                href="https://world.openfoodfacts.org"
                target="_blank"
                rel="noopener noreferrer"
              >
                OpenFoodFacts
              </a>{' '}
              (Open Database License)
            </p>
          </div>
        </div>

        <div className="nutrition-modal-footer">
          <button className="nutrition-cancel-button" onClick={onClose}>
            Abbrechen
          </button>
          <button
            className="nutrition-save-button"
            onClick={handleSave}
            disabled={saving || !hasValues}
          >
            {saving ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default NutritionModal;

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { functions, db } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import { mapNutritionCalcError, naehrwertePerPortion, naehrwerteToTotals, extractQuantityFromPrefix } from '../utils/nutritionUtils';
import { decodeRecipeLink } from '../utils/recipeLinks';
import {
  resolveIngredientNutritionByStatus,
  computeIngredientAmountG,
} from '../utils/nutritionStatusResolver';
import { NUTRITION_REFERENCE_APPROVED_STATUS } from '../utils/nutritionReferenceUtils';
import { isBase64Image } from '../utils/imageUtils';
import { normalizeNutritionEmptyIcon, normalizeNutritionSaveManualAmountIcon } from '../utils/nutritionIconUtils';
import './NutritionModal.css';

const CALC_RESULT_STORAGE_KEY_PREFIX = 'nutrition_calc_result_';
const AMOUNT_G_DECIMALS = 1;
const NUTRITION_FIELDS = ['kalorien', 'protein', 'fett', 'kohlenhydrate', 'zucker', 'ballaststoffe', 'salz'];
const DEFAULT_YIELD_SUGGESTION_FACTOR = 0.95;

export function parseManualAmountG(value) {
  if (value == null) return null;
  const normalized = String(value).trim().replace(',', '.');
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export function scaleNutritionByAmountG(naehrwerte, amountG) {
  if (!naehrwerte || amountG == null) return null;
  const factor = amountG / 100;
  const scaled = {};
  NUTRITION_FIELDS.forEach((field) => {
    scaled[field] = (naehrwerte[field] || 0) * factor;
  });
  return scaled;
}

export function sumNutritionFromIngredientDetails(ingredientDetails = [], manualAmountsInput = {}) {
  const totals = { kalorien: 0, protein: 0, fett: 0, kohlenhydrate: 0, zucker: 0, ballaststoffe: 0, salz: 0 };
  const normalizedManualAmounts = {};
  let hasValues = false;
  let totalAmountG = 0;
  let hasIncompleteAmountG = false;

  ingredientDetails.forEach((detail) => {
    if (!detail?.naehrwerte) return;

    if (detail.noAmountG) {
      const manualAmountG = parseManualAmountG(manualAmountsInput?.[detail.ingredient]);
      if (manualAmountG == null) return;
      normalizedManualAmounts[detail.ingredient] = manualAmountG;
      const scaled = scaleNutritionByAmountG(detail.naehrwerte, manualAmountG);
      if (!scaled) return;
      NUTRITION_FIELDS.forEach((field) => {
        totals[field] += scaled[field] || 0;
      });
      totalAmountG += manualAmountG;
      hasValues = true;
      return;
    }

    NUTRITION_FIELDS.forEach((field) => {
      totals[field] += detail.naehrwerte[field] || 0;
    });
    if (typeof detail.amountG === 'number' && detail.amountG > 0) {
      totalAmountG += detail.amountG;
    } else {
      hasIncompleteAmountG = true;
    }
    hasValues = true;
  });

  return {
    totals: hasValues ? totals : null,
    normalizedManualAmounts,
    totalAmountG: !hasIncompleteAmountG && totalAmountG > 0 ? totalAmountG : null,
  };
}

function roundNutritionValue(key, value) {
  if (value == null) return null;
  if (key === 'kalorien') return Math.round(value);
  if (key === 'salz') return Math.round(value * 100) / 100;
  return Math.round(value * 10) / 10;
}

function normalizeHashToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function getIngredientText(item) {
  if (typeof item === 'string') return item;
  return item?.text || '';
}

export function findLinkedRecipeSelfWeightG(linkedRecipe, linkedRecipeName) {
  const rawIngredients = linkedRecipe?.zutaten || linkedRecipe?.ingredients || [];
  const nameTokens = [linkedRecipeName, linkedRecipe?.title]
    .map(normalizeHashToken)
    .filter(Boolean);
  if (nameTokens.length === 0) return null;

  for (const rawItem of rawIngredients) {
    const ingredientText = getIngredientText(rawItem);
    if (!ingredientText) continue;

    const hashTokens = ingredientText.match(/#[^\s#]+/g) || [];
    const hasSelfTag = hashTokens.some((token) => nameTokens.includes(normalizeHashToken(token.slice(1))));
    if (!hasSelfTag) continue;

    const amountG = computeIngredientAmountG(ingredientText);
    if (amountG != null) return amountG;
  }

  return null;
}

export function deriveLinkedRecipePer100g(naehrwerte = {}) {
  if (!naehrwerte || typeof naehrwerte !== 'object') return null;
  const directPer100g = naehrwerte.calcPer100g;
  if (directPer100g && typeof directPer100g === 'object') {
    return directPer100g;
  }

  const finalWeightGrams = parseManualAmountG(naehrwerte.calcFinalWeightGrams ?? naehrwerte.calcYieldGrams);
  if (finalWeightGrams == null) return null;

  const per100g = {};
  NUTRITION_FIELDS.forEach((field) => {
    const value = naehrwerte[field];
    if (value == null) return;
    per100g[field] = (value / finalWeightGrams) * 100;
  });

  return Object.keys(per100g).length > 0 ? per100g : null;
}

function formatRoundedValue(value, decimals = 1) {
  if (value == null) return '—';
  const factor = Math.pow(10, decimals);
  const rounded = Math.round(value * factor) / factor;
  return String(rounded).replace('.', ',');
}

function buildLinkedRecipeDetail({ link, amountG, amountEstimated, naehrwerte }) {
  if (!naehrwerte) return null;

  const quantityLabel = link?.quantityPrefix || '1 Portion';
  const amountLabel = amountG != null
    ? ` (≈${formatRoundedValue(amountG, AMOUNT_G_DECIMALS)} g${amountEstimated ? ', geschätzt' : ''})`
    : '';
  return `${quantityLabel}${amountLabel} — Nährwerte: ${roundNutritionValue('kalorien', naehrwerte.kalorien || 0)} kcal, ${formatRoundedValue(roundNutritionValue('fett', naehrwerte.fett || 0))} g Fett, ${formatRoundedValue(roundNutritionValue('kohlenhydrate', naehrwerte.kohlenhydrate || 0))} g KH, ${formatRoundedValue(roundNutritionValue('protein', naehrwerte.protein || 0))} g Protein`;
}

async function estimateAmountG(parseIngredientAmountG, ingredientText) {
  if (typeof parseIngredientAmountG !== 'function') return null;
  try {
    const result = await parseIngredientAmountG(ingredientText);
    const amountG = parseManualAmountG(result?.data?.amountG ?? result?.amountG);
    return amountG;
  } catch {
    return null;
  }
}

function extractUnitFromPrefix(prefix) {
  if (!prefix) return null;
  const match = prefix.match(/^(?:\d+\/\d+|\d+(?:[.,]\d+)?)\s+(\S+)/);
  if (match) return match[1].trim();
  return null;
}

function portionUnitMatches(unit, portionUnitId, portionUnits = []) {
  if (!unit || !portionUnitId) return false;
  const normalizedUnit = unit.toLowerCase();
  const portionUnit = portionUnits.find((u) => u.id === portionUnitId);
  if (portionUnit) {
    return (
      normalizedUnit === (portionUnit.singular || '').toLowerCase() ||
      normalizedUnit === (portionUnit.plural || '').toLowerCase()
    );
  }
  return normalizedUnit === portionUnitId.toLowerCase();
}

async function resolveLinkedRecipeAmountG({ link, linkedRecipe, parseIngredientAmountG, portionUnits = [] } = {}) {
  const quantityPrefix = String(link?.quantityPrefix || '').trim();
  const linkedRecipeName = linkedRecipe?.title || link?.recipeName || '';

  // Priority 1a: Direct gram amount in prefix (e.g. "100 g")
  const directAmountG = computeIngredientAmountG(quantityPrefix);
  if (directAmountG != null) {
    return { amountG: directAmountG, amountEstimated: false };
  }

  // Priority 1b: Explicit self-weight tag in linked recipe (e.g. "100 g #Trüffelpaste")
  const explicitSelfWeightG = findLinkedRecipeSelfWeightG(linkedRecipe, link?.recipeName);
  if (explicitSelfWeightG != null) {
    const linkedPortionen = Number(linkedRecipe?.portionen) > 0 ? Number(linkedRecipe.portionen) : 1;
    const quantity = extractQuantityFromPrefix(quantityPrefix) ?? 1;
    return { amountG: (quantity / linkedPortionen) * explicitSelfWeightG, amountEstimated: false };
  }

  // Get stored total weight for unit matching and proportion fallback
  const fallbackRecipeWeightG = parseManualAmountG(
    linkedRecipe?.naehrwerte?.calcFinalWeightGrams ?? linkedRecipe?.naehrwerte?.calcYieldGrams
  );

  // Priority 2 (NEW): Unit matching — if the prefix unit matches the portionUnit of the linked
  // recipe, derive the weight via ratio (quantity / (portionen * yieldFactor)) * totalWeight.
  if (fallbackRecipeWeightG != null) {
    const unitWord = extractUnitFromPrefix(quantityPrefix);
    const portionUnitId = linkedRecipe?.portionUnitId;
    if (unitWord && portionUnitId && portionUnitMatches(unitWord, portionUnitId, portionUnits)) {
      const quantity = extractQuantityFromPrefix(quantityPrefix) ?? 1;
      const linkedPortionen = Number(linkedRecipe?.portionen) > 0 ? Number(linkedRecipe.portionen) : 1;
      const yieldFactor = parseManualAmountG(linkedRecipe?.naehrwerte?.calcYieldFactor) ?? 1;
      return { amountG: (quantity / (linkedPortionen * yieldFactor)) * fallbackRecipeWeightG, amountEstimated: false };
    }
  }

  // Priority 3: Gemini estimation (fallback)
  const geminiText = quantityPrefix
    ? `${quantityPrefix} ${linkedRecipeName}`.trim()
    : `1 Portion ${linkedRecipeName}`.trim();
  const fallbackEstimate = await estimateAmountG(parseIngredientAmountG, geminiText);
  if (fallbackEstimate != null) {
    return { amountG: fallbackEstimate, amountEstimated: true };
  }

  // Last resort: stored total weight with simple proportion (no unit-match required)
  if (fallbackRecipeWeightG != null) {
    const linkedPortionen = Number(linkedRecipe?.portionen) > 0 ? Number(linkedRecipe.portionen) : 1;
    const quantity = extractQuantityFromPrefix(quantityPrefix) ?? 1;
    return { amountG: (quantity / linkedPortionen) * fallbackRecipeWeightG, amountEstimated: false };
  }

  return { amountG: null, amountEstimated: false };
}

export async function resolveLinkedRecipeNutrition({ link, linkedRecipe, parseIngredientAmountG, portionUnits = [] } = {}) {
  if (!linkedRecipe || !linkedRecipe.naehrwerte) {
    return { found: false, error: linkedRecipe ? 'Nährwerte je 100 g fehlen für das verlinkte Rezept.' : 'Verlinktes Rezept nicht gefunden.' };
  }

  const per100g = deriveLinkedRecipePer100g(linkedRecipe.naehrwerte);
  if (!per100g) {
    return { found: false, error: 'Nährwerte je 100 g fehlen für das verlinkte Rezept.' };
  }

  const { amountG, amountEstimated } = await resolveLinkedRecipeAmountG({
    link,
    linkedRecipe,
    parseIngredientAmountG,
    portionUnits,
  });
  if (amountG == null) {
    return { found: true, noAmountG: true, naehrwerte: per100g, amountG: null };
  }

  const naehrwerte = scaleNutritionByAmountG(per100g, amountG);
  if (!naehrwerte) {
    return { found: false, error: 'Nährwerte des verlinkten Rezepts konnten nicht umgerechnet werden.' };
  }

  return { found: true, naehrwerte, amountG, amountEstimated };
}

function resolveFinalWeightGrams({ sumIngredientAmountsG, calcYieldGrams, calcYieldFactor, storedFinalWeightGrams } = {}) {
  const normalizedYieldGrams = parseManualAmountG(calcYieldGrams);
  if (normalizedYieldGrams != null) return normalizedYieldGrams;

  const normalizedIngredientAmountSum = parseManualAmountG(sumIngredientAmountsG);
  const normalizedYieldFactor = parseManualAmountG(calcYieldFactor);
  if (normalizedIngredientAmountSum != null && normalizedYieldFactor != null) {
    return Math.round(normalizedIngredientAmountSum * normalizedYieldFactor * 10) / 10;
  }

  if (normalizedIngredientAmountSum != null) return normalizedIngredientAmountSum;
  return parseManualAmountG(storedFinalWeightGrams);
}

function buildPer100gNutrition(totals, finalWeightGrams) {
  const weight = parseManualAmountG(finalWeightGrams);
  if (!totals || weight == null) return null;

  const per100g = {};
  NUTRITION_FIELDS.forEach((field) => {
    const value = totals[field];
    if (value == null) return;
    per100g[field] = roundNutritionValue(field, (value / weight) * 100);
  });
  return per100g;
}

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
      return {
        ...parsed,
        notIncluded: filterNotIncludedIngredients(parsed.notIncluded),
      };
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

function filterNotIncludedIngredients(items) {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => !item?.isRecipeLink && !decodeRecipeLink(item?.ingredient || ''));
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
    notIncluded: filterNotIncludedIngredients(recipe?.naehrwerte?.calcNotIncluded),
    ...(recipe?.naehrwerte?.calcReformulations && { calcReformulations: recipe.naehrwerte.calcReformulations }),
    ...(recipe?.naehrwerte?.calcAcceptedIngredients && { acceptedIngredients: recipe.naehrwerte.calcAcceptedIngredients }),
    ...(recipe?.naehrwerte?.calcYieldGrams != null && { calcYieldGrams: recipe.naehrwerte.calcYieldGrams }),
    ...(recipe?.naehrwerte?.calcFinalWeightGrams != null && { calcFinalWeightGrams: recipe.naehrwerte.calcFinalWeightGrams }),
    ...(recipe?.naehrwerte?.calcPer100g && { calcPer100g: recipe.naehrwerte.calcPer100g }),
    ...(ingredientDetails && { ingredientDetails }),
  };
}

const NUTRITION_SOURCE_DISPLAY_LABELS = {
  openfoodfacts: 'OpenFoodFacts',
  'ai-generiert': 'KI-Schätzung',
  manual: 'Manuell',
};

function normalizeIngredientItem(item) {
  if (typeof item === 'string') return { text: item, ingredientID: null };
  return { text: item.text || '', ingredientID: item.ingredientID || null };
}

function resolveNonLinkSource(refRow, ingredientDetail) {
  const refLabel = NUTRITION_SOURCE_DISPLAY_LABELS[refRow?.source];
  if (refLabel) return refLabel;
  return ingredientDetail?.aiEstimated ? 'KI-Schätzung' : '';
}

export function buildNutritionCompositionRows(recipe, calcResult, reformulationMap = {}, acceptedIngredientsInput = [], manualAmountsInput = {}, nutritionReferenceRows = [], linkedRecipeCalcCompletedAtMap = {}) {
  const rawIngredients = recipe?.zutaten || recipe?.ingredients || [];
  const ingredientItems = rawIngredients
    .filter(item => typeof item === 'string' || (item && typeof item === 'object' && item.type !== 'heading'))
    .map(normalizeIngredientItem)
    .filter(item => Boolean(item.text));
  const notIncluded = filterNotIncludedIngredients(calcResult?.notIncluded || recipe?.naehrwerte?.calcNotIncluded);
  const notIncludedByIngredient = new Map(notIncluded.map(item => [item.ingredient, item]));
  const ingredientDetails = calcResult?.ingredientDetails || recipe?.naehrwerte?.calcIngredientDetails || [];
  const detailsByIngredient = new Map(ingredientDetails.map(d => [d.ingredient, d]));
  const refByIngredientID = new Map(
    (nutritionReferenceRows || [])
      .map(row => [String(row?.ingredientID || '').trim(), row])
      .filter(([id]) => Boolean(id))
  );
  const mainCalcCompletedAt = recipe?.naehrwerte?.calcCompletedAt ?? null;

  return ingredientItems.map(({ text: ingredient, ingredientID }) => {
    const link = decodeRecipeLink(ingredient);
    const notIncludedItem = notIncludedByIngredient.get(ingredient);
    const reformulation = reformulationMap?.[ingredient]?.text || notIncludedItem?.reformulation || null;
    const ingredientDetail = detailsByIngredient.get(ingredient);
    const searchTerm = ingredientDetail?.searchTerm || null;
    const noAmountG = ingredientDetail?.noAmountG === true;
    const hasNaehrwerte = Boolean(ingredientDetail?.naehrwerte);
    const manualAmountG = parseManualAmountG(manualAmountsInput?.[ingredient]);
    const manualAmountApplied = noAmountG && hasNaehrwerte && manualAmountG != null;
    const convertedNaehrwerte = manualAmountApplied ? scaleNutritionByAmountG(ingredientDetail.naehrwerte, manualAmountG) : null;

    let source;
    let status;
    let isNotNutritionRelevant = false;
    if (link) {
      source = 'Rezept';
      const linkedCalcCompletedAt = linkedRecipeCalcCompletedAtMap?.[link.recipeId] ?? null;
      if (mainCalcCompletedAt != null && linkedCalcCompletedAt != null) {
        status = linkedCalcCompletedAt <= mainCalcCompletedAt ? 'Aktuell' : 'Veraltet';
      } else {
        status = 'Ungeprüft';
      }
    } else {
      const refRow = ingredientID ? refByIngredientID.get(String(ingredientID).trim()) : null;
      if (refRow?.nutritionRelevant === false) {
        isNotNutritionRelevant = true;
        source = '—';
        status = 'Nicht nährwertrelevant';
      } else {
        source = resolveNonLinkSource(refRow, ingredientDetail);
        status = refRow?.status === NUTRITION_REFERENCE_APPROVED_STATUS ? 'Geprüft' : 'Ungeprüft';
      }
    }

    if (isNotNutritionRelevant) {
      return {
        ingredient,
        source,
        status,
        amountG: null,
        detail: 'Nicht nährwertrelevant',
        naehrwerte: null,
        searchTerm: null,
        aiEstimated: false,
        requiresManualAmount: false,
      };
    }

    const amountForDisplay = ingredientDetail?.amountG ?? (manualAmountApplied ? manualAmountG : null);
    const calculatedNaehrwerte = convertedNaehrwerte || ingredientDetail?.naehrwerte || null;
    const linkDetail = link && !notIncludedItem && calculatedNaehrwerte && (!noAmountG || manualAmountApplied)
      ? buildLinkedRecipeDetail({
        link,
        amountG: amountForDisplay,
        amountEstimated: ingredientDetail?.amountEstimated === true,
        naehrwerte: calculatedNaehrwerte,
      })
      : null;
    const isNotIncluded = Boolean(notIncludedItem);
    return {
      ingredient,
      source,
      status,
      amountG: amountForDisplay,
      detail: notIncludedItem?.error ||
        linkDetail ||
        (reformulation
          ? `Umformulierung: ${reformulation}`
          : (noAmountG
            ? (manualAmountApplied
            ? 'Aus Referenzwert je 100 g umgerechnet'
            : (hasNaehrwerte
              ? 'Referenzwert je 100 g vorhanden – Menge eingeben'
              : 'Referenzquelle vorhanden, Menge nicht berechenbar'))
            : (searchTerm
            ? `Suchbegriff: ${searchTerm}`
            : (!hasNaehrwerte && !isNotIncluded ? 'Neu berechnen' : '—')))),
      naehrwerte: calculatedNaehrwerte,
      searchTerm,
      aiEstimated: ingredientDetail?.aiEstimated || false,
      requiresManualAmount: noAmountG && hasNaehrwerte,
    };
  });
}

export { computeIngredientAmountG, resolveIngredientNutritionByStatus };

function NutritionModal({ recipe, onClose, onSave, allRecipes = [], currentUser, isStale = false, onEnsureIngredientIDs, nutritionReferenceRows = [], onReloadNutritionReferences = null, retryAutoCalculateToken = 0, onOpenLinkedRecipe = null, autoCalcIcon = null, manualSaveIcon = null, portionUnits = [] }) {
  const resolvedAutoCalcIcon = normalizeNutritionEmptyIcon(autoCalcIcon);
  const resolvedManualSaveIcon = normalizeNutritionSaveManualAmountIcon(manualSaveIcon);
  const [kalorien, setKalorien] = useState('');
  const [protein, setProtein] = useState('');
  const [fett, setFett] = useState('');
  const [kohlenhydrate, setKohlenhydrate] = useState('');
  const [zucker, setZucker] = useState('');
  const [ballaststoffe, setBallaststoffe] = useState('');
  const [salz, setSalz] = useState('');
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
    const notIncluded = filterNotIncludedIngredients(recipe?.naehrwerte?.calcNotIncluded || stored?.notIncluded);
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
  const handleAutoCalculateRef = useRef(null);
  const [showCompositionTable, setShowCompositionTable] = useState(false);
  const [manualAmounts, setManualAmounts] = useState(() => {
    const stored = loadStoredCalcResult(recipe?.id);
    return {
      ...(stored?.manualAmountsG || {}),
      ...(recipe?.naehrwerte?.calcManualAmountsG || {}),
    };
  });
  const [savedManualAmounts, setSavedManualAmounts] = useState(() => {
    const persisted = recipe?.naehrwerte?.calcManualAmountsG || {};
    return Object.keys(persisted).reduce((acc, ingredient) => {
      if (parseManualAmountG(persisted[ingredient]) !== null) {
        acc[ingredient] = true;
      }
      return acc;
    }, {});
  });
  const [manualAmountErrors, setManualAmountErrors] = useState({});
  const [yieldGramsInput, setYieldGramsInput] = useState(() => {
    const stored = loadStoredCalcResult(recipe?.id);
    const persistedYieldGrams = stored?.calcYieldGrams ?? recipe?.naehrwerte?.calcYieldGrams;
    return persistedYieldGrams != null ? String(persistedYieldGrams) : '';
  });
  const [yieldGramsError, setYieldGramsError] = useState('');
  const lastRetryAutoCalculateTokenRef = useRef(retryAutoCalculateToken);

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
    setYieldGramsInput(recipe?.naehrwerte?.calcYieldGrams != null ? String(recipe.naehrwerte.calcYieldGrams) : '');
    setYieldGramsError('');
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

  // Lock body scroll while modal is open (iOS Safari safe)
  useEffect(() => {
    const scrollY = window.scrollY;
    const prevOverflow = document.body.style.overflow;
    const prevPosition = document.body.style.position;
    const prevTop = document.body.style.top;
    const prevWidth = document.body.style.width;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.position = prevPosition;
      document.body.style.top = prevTop;
      document.body.style.width = prevWidth;
      window.scrollTo(0, scrollY);
    };
  }, []);

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

  const formatAmountG = (amountG) => {
    if (amountG == null) return '—';
    const factor = Math.pow(10, AMOUNT_G_DECIMALS);
    const rounded = Math.round(amountG * factor) / factor;
    return `${rounded} g`;
  };

  const formatLabelValue = (value, unit) => {
    if (value === '' || value == null) return '—';
    return `${String(value).replace('.', ',')} ${unit}`;
  };

  const calculatedNutritionState = useMemo(() => {
    const ingredientSummary = Array.isArray(autoCalcResult?.ingredientDetails) && autoCalcResult.ingredientDetails.length > 0
      ? sumNutritionFromIngredientDetails(autoCalcResult.ingredientDetails, manualAmounts)
      : null;
    const recipeTotals = recipe?.naehrwerte
      ? NUTRITION_FIELDS.reduce((acc, field) => {
        if (recipe.naehrwerte[field] != null) {
          acc[field] = recipe.naehrwerte[field];
        }
        return acc;
      }, {})
      : null;
    const totals = ingredientSummary?.totals || (recipeTotals && Object.keys(recipeTotals).length > 0 ? recipeTotals : null);
    const normalizedManualAmounts = ingredientSummary?.normalizedManualAmounts || {};
    const finalWeightGrams = resolveFinalWeightGrams({
      sumIngredientAmountsG: ingredientSummary?.totalAmountG,
      calcYieldGrams: yieldGramsInput,
      calcYieldFactor: recipe?.naehrwerte?.calcYieldFactor ?? autoCalcResult?.calcYieldFactor ?? null,
      storedFinalWeightGrams: autoCalcResult?.calcFinalWeightGrams ?? recipe?.naehrwerte?.calcFinalWeightGrams ?? null,
    });
    return {
      totals,
      normalizedManualAmounts,
      totalAmountG: ingredientSummary?.totalAmountG ?? null,
      finalWeightGrams,
      per100g: buildPer100gNutrition(totals, finalWeightGrams) ||
        autoCalcResult?.calcPer100g ||
        recipe?.naehrwerte?.calcPer100g ||
        null,
    };
  }, [autoCalcResult, manualAmounts, recipe, yieldGramsInput]);

  const suggestedYieldGrams = useMemo(() => {
    if (calculatedNutritionState.totalAmountG == null) return null;
    return Math.round(calculatedNutritionState.totalAmountG * DEFAULT_YIELD_SUGGESTION_FACTOR * 10) / 10;
  }, [calculatedNutritionState.totalAmountG]);

  const buildCalculatedNutritionPayload = ({
    totals = calculatedNutritionState.totals,
    notIncluded = autoCalcResult?.notIncluded ?? recipe?.naehrwerte?.calcNotIncluded ?? null,
    foundCount = autoCalcResult?.foundCount ?? recipe?.naehrwerte?.calcFoundCount ?? null,
    totalCount = autoCalcResult?.totalCount ?? recipe?.naehrwerte?.calcTotalCount ?? null,
    ingredientDetails = autoCalcResult?.ingredientDetails ?? recipe?.naehrwerte?.calcIngredientDetails ?? null,
    acceptedIngredientsInput = autoCalcResult?.acceptedIngredients ?? recipe?.naehrwerte?.calcAcceptedIngredients ?? null,
    reformulationsInput = autoCalcResult?.calcReformulations ?? recipe?.naehrwerte?.calcReformulations ?? null,
    manualAmountsInput = calculatedNutritionState.normalizedManualAmounts,
    calcYieldGramsInput = yieldGramsInput,
    calcPending = recipe?.naehrwerte?.calcPending ?? false,
    calcCompletedAt = recipe?.naehrwerte?.calcCompletedAt ?? null,
    calcError = recipe?.naehrwerte?.calcError ?? null,
  } = {}) => {
    const ingredientSummary = ingredientDetails && Array.isArray(ingredientDetails)
      ? sumNutritionFromIngredientDetails(ingredientDetails, manualAmountsInput)
      : null;
    const normalizedManualAmounts = ingredientSummary?.normalizedManualAmounts || {};
    const normalizedYieldGrams = parseManualAmountG(calcYieldGramsInput);
    const finalWeightGrams = resolveFinalWeightGrams({
      sumIngredientAmountsG: ingredientSummary?.totalAmountG ?? calculatedNutritionState.totalAmountG,
      calcYieldGrams: normalizedYieldGrams,
      calcYieldFactor: normalizedYieldGrams != null ? null : (recipe?.naehrwerte?.calcYieldFactor ?? autoCalcResult?.calcYieldFactor ?? null),
      storedFinalWeightGrams: recipe?.naehrwerte?.calcFinalWeightGrams ?? autoCalcResult?.calcFinalWeightGrams ?? null,
    });
    const calcPer100g = buildPer100gNutrition(totals, finalWeightGrams);
    return {
      ...(recipe?.naehrwerte || {}),
      ...(totals || {}),
      calcPending,
      calcCompletedAt,
      calcError,
      calcNotIncluded: notIncluded && notIncluded.length > 0 ? notIncluded : null,
      calcFoundCount: foundCount,
      calcTotalCount: totalCount,
      calcReformulations: reformulationsInput && Object.keys(reformulationsInput).length > 0 ? reformulationsInput : null,
      calcAcceptedIngredients: acceptedIngredientsInput && acceptedIngredientsInput.length > 0 ? acceptedIngredientsInput : null,
      calcIngredientDetails: ingredientDetails && ingredientDetails.length > 0 ? ingredientDetails : null,
      calcManualAmountsG: Object.keys(normalizedManualAmounts).length > 0 ? normalizedManualAmounts : null,
      calcYieldGrams: normalizedYieldGrams,
      calcYieldFactor: normalizedYieldGrams != null ? null : (recipe?.naehrwerte?.calcYieldFactor ?? autoCalcResult?.calcYieldFactor ?? null),
      calcFinalWeightGrams: finalWeightGrams ?? null,
      calcPer100g: calcPer100g ?? null,
    };
  };

  const handleYieldGramsChange = (value) => {
    setYieldGramsInput(value);
    const parsed = parseManualAmountG(value);
    if (String(value).trim() && parsed == null) {
      setYieldGramsError('Bitte ein gültiges Endgewicht in Gramm > 0 eingeben.');
    } else {
      setYieldGramsError('');
    }
    if (autoCalcResult) {
      saveStoredCalcResult(recipe?.id, {
        ...autoCalcResult,
        calcYieldGrams: String(value).trim() ? value : null,
      });
    }
  };

  const handleYieldGramsBlur = async () => {
    const trimmedValue = String(yieldGramsInput || '').trim();
    const normalizedYieldGrams = parseManualAmountG(trimmedValue);
    if (trimmedValue && normalizedYieldGrams == null) {
      setYieldGramsError('Bitte ein gültiges Endgewicht in Gramm > 0 eingeben.');
      return;
    }

    const currentYieldGrams = parseManualAmountG(recipe?.naehrwerte?.calcYieldGrams);
    if ((normalizedYieldGrams ?? null) === (currentYieldGrams ?? null)) {
      return;
    }

    const payload = buildCalculatedNutritionPayload({ calcYieldGramsInput: normalizedYieldGrams });
    try {
      await onSave(payload);
      if (autoCalcResult) {
        const updatedResult = {
          ...autoCalcResult,
          calcYieldGrams: normalizedYieldGrams,
          calcFinalWeightGrams: payload.calcFinalWeightGrams,
          calcPer100g: payload.calcPer100g,
        };
        setAutoCalcResult(updatedResult);
        saveStoredCalcResult(recipe?.id, { ...updatedResult, manualAmountsG: manualAmounts });
      }
    } catch (err) {
      console.error('Could not save nutrition yield data:', err);
    }
  };

  const handleManualAmountChange = (ingredient, value) => {
    setManualAmounts((prev) => {
      const next = { ...prev };
      if (String(value).trim()) {
        next[ingredient] = value;
      } else {
        delete next[ingredient];
      }
      if (autoCalcResult) {
        saveStoredCalcResult(recipe?.id, { ...autoCalcResult, manualAmountsG: next });
      }
      return next;
    });
    setSavedManualAmounts((prev) => {
      if (!prev[ingredient]) return prev;
      const next = { ...prev };
      delete next[ingredient];
      return next;
    });

    const parsed = parseManualAmountG(value);
    setManualAmountErrors((prev) => {
      const next = { ...prev };
      if (String(value).trim() && parsed == null) {
        next[ingredient] = 'Bitte eine gültige Grammzahl > 0 eingeben.';
      } else {
        delete next[ingredient];
      }
      return next;
    });
  };

  const handleSaveManualAmount = async (ingredient) => {
    const rawValue = manualAmounts[ingredient];
    const parsed = parseManualAmountG(rawValue);

    if (parsed === null) {
      setManualAmountErrors((prev) => ({
        ...prev,
        [ingredient]: 'Bitte eine gültige Grammzahl > 0 eingeben.',
      }));
      return;
    }

    const manualAmountsToSave = { ...manualAmounts, [ingredient]: parsed };
    const payload = buildCalculatedNutritionPayload({ manualAmountsInput: manualAmountsToSave });

    try {
      await onSave(payload);
      setManualAmounts(manualAmountsToSave);
      setSavedManualAmounts((prev) => ({ ...prev, [ingredient]: true }));
      setManualAmountErrors((prev) => {
        const next = { ...prev };
        delete next[ingredient];
        return next;
      });
      if (autoCalcResult) {
        // Increment foundCount on first save of this ingredient (no double-counting on re-save)
        const wasAlreadySaved = Boolean(savedManualAmounts[ingredient]);
        const updatedResult = {
          ...autoCalcResult,
          calcFinalWeightGrams: payload.calcFinalWeightGrams,
          calcPer100g: payload.calcPer100g,
          ...(!wasAlreadySaved && autoCalcResult.foundCount != null && {
            foundCount: autoCalcResult.foundCount + 1,
          }),
        };
        setAutoCalcResult(updatedResult);
        saveStoredCalcResult(recipe?.id, { ...updatedResult, manualAmountsG: manualAmountsToSave });
      }
    } catch (err) {
      console.error('Could not save manual amount:', err);
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

  const handleResetAdjustments = async () => {
    setReformulations({});
    setAcceptedIngredients(new Set());

    if (autoCalcResult) {
      const cleanedNotIncluded = (autoCalcResult.notIncluded || []).map(item => {
        const cleaned = { ...item };
        delete cleaned.reformulation;
        delete cleaned.changeLog;
        return cleaned;
      });
      const updatedResult = { ...autoCalcResult, notIncluded: cleanedNotIncluded };
      delete updatedResult.calcReformulations;
      delete updatedResult.acceptedIngredients;
      setAutoCalcResult(updatedResult);
      saveStoredCalcResult(recipe?.id, updatedResult);
    } else {
      clearStoredCalcResult(recipe?.id);
    }

    try {
      await onSave({
        ...(recipe?.naehrwerte || {}),
        calcReformulations: null,
        calcAcceptedIngredients: null,
      });
    } catch (err) {
      console.error('Could not reset adjustments in Firebase:', err);
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
    ).filter((item) => item.ignoreNutritionCalculation !== true);

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

    // Capture currently saved manual amounts before reset so they can be re-applied after recalculation
    const prevManualAmounts = { ...manualAmounts };
    const prevSavedIngredients = new Set(Object.keys(savedManualAmounts).filter(k => savedManualAmounts[k]));

    setAutoCalcLoading(true);
    setAutoCalcResult(null);
    setManualAmounts({});
    setSavedManualAmounts({});
    setManualAmountErrors({});
    clearStoredCalcResult(recipe?.id);
    setCalcProgress({ done: 0, total: ingredients.length + recipeLinkItems.length, current: ingredients[0]?.text || (recipeLinkItems[0]?.link.recipeName) || '' });

    // Persist calcPending so the loading indicator survives navigation away from this modal
    try {
      await onSave({ ...(recipe?.naehrwerte || {}), calcPending: true, calcPendingAt: Date.now(), calcError: null });
    } catch (err) {
      console.error('Could not set calcPending:', err);
    }

    const nutritionReferenceByIngredientID = new Map(
      (nutritionReferenceRows || [])
        .map((row) => [String(row?.ingredientID || '').trim(), row])
        .filter(([id]) => Boolean(id))
    );
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
    let skippedCount = 0;
    let anyWritebackHappened = false;
    const writebackErrors = [];
    const parseIngredientAmountGCallable = httpsCallable(functions, 'parseIngredientAmountG');
    const parseLinkedRecipeAmountG = async (ingredientText) => {
      if (typeof parseIngredientAmountGCallable !== 'function') return null;
      return parseIngredientAmountGCallable({ ingredientText });
    };

    // Process regular ingredients
    for (let i = 0; i < ingredients.length; i++) {
      if (abortController.signal.aborted) {
        break;
      }
      const ingredientItem = ingredients[i];
      const ingredient = ingredientItem.text;
      const ingredientID = String(ingredientItem.ingredientID || '').trim();
      const existingRow = ingredientID
        ? nutritionReferenceByIngredientID.get(ingredientID)
        : null;

      // Skip accepted ingredients – but NOT AI-estimated ones (re-check against OpenFoodFacts)
      if (acceptedIngredients.has(ingredient) && !aiEstimatedIngredients.has(ingredient)) {
        setCalcProgress({ done: i, total: ingredients.length + recipeLinkItems.length, current: ingredient });
        foundCount++;
        continue;
      }

      setCalcProgress({ done: i, total: ingredients.length + recipeLinkItems.length, current: ingredient });

      try {
        const resolved = await resolveIngredientNutritionByStatus(ingredientItem, existingRow, { httpsCallable, functions, db });
        if (resolved.skipped) {
          skippedCount++;
          continue;
        }
        if (resolved.wroteBackReference) anyWritebackHappened = true;
        if (resolved.writebackError) writebackErrors.push(resolved.writebackError);
        if (resolved.found) {
          const { naehrwerte: n, fromReference, source, searchTerm, aiEstimated } = resolved;
          Object.keys(totals).forEach(key => {
            totals[key] += n[key] || 0;
          });
          foundCount++;
          ingredientDetails.push({
            ingredient,
            naehrwerte: n,
            amountG: resolved.amountG ?? null,
            searchTerm: searchTerm || null,
            aiEstimated: Boolean(aiEstimated),
            fromReference,
            source,
          });
          if (reformulations[ingredient]) {
            successfulReformulations[ingredient] = reformulations[ingredient];
          }
          continue;
        }
        if (resolved.noAmountG && resolved.naehrwerte) {
          ingredientDetails.push({
            ingredient,
            naehrwerte: resolved.naehrwerte,
            amountG: null,
            noAmountG: true,
            searchTerm: resolved.searchTerm || null,
            aiEstimated: Boolean(resolved.aiEstimated),
            fromReference: resolved.fromReference,
            source: resolved.source,
          });
          continue;
        }
        const reform = reformulations[ingredient];
        notIncluded.push({
          ingredient,
          error: resolved.error || 'Nicht gefunden',
          ...(reform && { reformulation: reform.text, changeLog: reform.changeLog }),
        });
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
      if (linkedRecipe) {
        const resolvedLink = await resolveLinkedRecipeNutrition({
          link,
          linkedRecipe,
          parseIngredientAmountG: parseLinkedRecipeAmountG,
          portionUnits,
        });
        if (resolvedLink.found) {
          if (resolvedLink.noAmountG) {
            ingredientDetails.push({
              ingredient,
              naehrwerte: resolvedLink.naehrwerte,
              amountG: null,
              noAmountG: true,
              searchTerm: null,
              aiEstimated: false,
            });
            continue;
          }
          Object.keys(totals).forEach((key) => {
            totals[key] += resolvedLink.naehrwerte[key] || 0;
          });
          ingredientDetails.push({
            ingredient,
            naehrwerte: resolvedLink.naehrwerte,
            amountG: resolvedLink.amountG,
            amountEstimated: resolvedLink.amountEstimated,
            searchTerm: null,
            aiEstimated: false,
          });
          foundCount++;
          continue;
        }
        notIncluded.push({
          ingredient,
          error: resolvedLink.error || `Verlinktes Rezept "${link.recipeName}" konnte nicht umgerechnet werden.`,
          isRecipeLink: true,
        });
      } else {
        notIncluded.push({
          ingredient,
          error: `Verlinktes Rezept "${link.recipeName}" nicht gefunden. Möglicherweise wurde das Rezept gelöscht.`,
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

    const totalCount = ingredients.length + recipeLinkItems.length - skippedCount;
    const acceptedArray = acceptedIngredients.size > 0 ? [...acceptedIngredients] : undefined;
    const mergedReformulations = {
      ...(recipe?.naehrwerte?.calcReformulations || {}),
      ...(autoCalcResult?.calcReformulations || {}),
      ...successfulReformulations,
    };
    const filteredNotIncluded = filterNotIncludedIngredients(notIncluded);

    // Re-apply previously saved manual amounts for noAmountG ingredients that are still present
    const survivingManualAmountsG = {};
    const survivingSavedAmounts = {};
    let foundCountBonus = 0;
    if (prevSavedIngredients.size > 0) {
      for (const ingredient of prevSavedIngredients) {
        const detail = ingredientDetails.find(d => d.ingredient === ingredient && d.noAmountG);
        if (detail) {
          const savedValue = prevManualAmounts[ingredient];
          if (parseManualAmountG(savedValue) !== null) {
            survivingManualAmountsG[ingredient] = savedValue;
            survivingSavedAmounts[ingredient] = true;
            foundCountBonus++;
          }
        }
      }
    }

    const adjustedFoundCount = foundCount + foundCountBonus;
    const finalNaehrwerte = buildCalculatedNutritionPayload({
      totals,
      notIncluded: filteredNotIncluded,
      foundCount: adjustedFoundCount,
      totalCount,
      ingredientDetails,
      acceptedIngredientsInput: acceptedArray,
      reformulationsInput: mergedReformulations,
      manualAmountsInput: survivingManualAmountsG,
      calcPending: false,
      calcCompletedAt: Date.now(),
      calcError: null,
    });
    const result = {
      foundCount: adjustedFoundCount,
      totalCount,
      notIncluded: filteredNotIncluded,
      ...(acceptedArray && { acceptedIngredients: acceptedArray }),
      ...(Object.keys(mergedReformulations).length > 0 && { calcReformulations: mergedReformulations }),
      ...(ingredientDetails.length > 0 && { ingredientDetails }),
      ...(finalNaehrwerte.calcYieldGrams != null && { calcYieldGrams: finalNaehrwerte.calcYieldGrams }),
      ...(finalNaehrwerte.calcFinalWeightGrams != null && { calcFinalWeightGrams: finalNaehrwerte.calcFinalWeightGrams }),
      ...(finalNaehrwerte.calcPer100g && { calcPer100g: finalNaehrwerte.calcPer100g }),
      ...(writebackErrors.length > 0 && {
        writebackError: writebackErrors[0]?.message || 'Nährwertreferenz-Aktualisierung fehlgeschlagen',
      }),
    };
    setAutoCalcResult(result);
    if (foundCountBonus > 0) {
      setManualAmounts(survivingManualAmountsG);
      setSavedManualAmounts(survivingSavedAmounts);
    }
    saveStoredCalcResult(recipe?.id, { ...result, manualAmountsG: survivingManualAmountsG });

    // Reload the NutritionReferenceContext when at least one reference was written back,
    // so the table "Nährwerte je 100 g" reflects the updated values immediately.
    if (anyWritebackHappened && typeof onReloadNutritionReferences === 'function') {
      onReloadNutritionReferences();
    }

    // Persist totals and per-ingredient errors to Firestore automatically
    try {
      await onSave(finalNaehrwerte);
    } catch (saveErr) {
      console.error('Could not auto-save nutrition data:', saveErr);
      setAutoCalcResult(prev => prev ? { ...prev, saveError: true } : null);
    }
  };

  handleAutoCalculateRef.current = handleAutoCalculate;

  useEffect(() => {
    if (!retryAutoCalculateToken || retryAutoCalculateToken === lastRetryAutoCalculateTokenRef.current) return;
    lastRetryAutoCalculateTokenRef.current = retryAutoCalculateToken;
    handleAutoCalculateRef.current?.();
  }, [retryAutoCalculateToken]);

  const handleRecalcReformulated = async () => {
    const notIncludedItems = filterNotIncludedIngredients(autoCalcResult?.notIncluded);
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
    const parseIngredientAmountGCallable = httpsCallable(functions, 'parseIngredientAmountG');
    const parseLinkedRecipeAmountG = async (ingredientText) => {
      if (typeof parseIngredientAmountGCallable !== 'function') return null;
      return parseIngredientAmountGCallable({ ingredientText });
    };
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
      if (!linkedRecipe) {
        stillNotIncluded.push({
          ingredient,
          error: `Verlinktes Rezept "${link?.recipeName || ingredient}" nicht gefunden. Möglicherweise wurde das Rezept gelöscht.`,
          isRecipeLink: true,
        });
        continue;
      }
      const resolvedLink = await resolveLinkedRecipeNutrition({
        link,
        linkedRecipe,
        parseIngredientAmountG: parseLinkedRecipeAmountG,
        portionUnits,
      });
      if (resolvedLink.found) {
        Object.keys(newTotals).forEach((key) => {
          newTotals[key] += resolvedLink.naehrwerte[key] || 0;
        });
        newIngredientDetails.push({
          ingredient,
          naehrwerte: resolvedLink.naehrwerte,
          amountG: resolvedLink.amountG,
          amountEstimated: resolvedLink.amountEstimated,
          searchTerm: null,
          aiEstimated: false,
        });
        newFoundCount++;
      } else {
        stillNotIncluded.push({
          ingredient,
          error: resolvedLink.error || `Verlinktes Rezept "${link?.recipeName || ingredient}" konnte nicht umgerechnet werden.`,
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

    const filteredStillNotIncluded = filterNotIncludedIngredients(stillNotIncluded);
    const finalNaehrwerte = buildCalculatedNutritionPayload({
      totals: combinedTotals,
      notIncluded: filteredStillNotIncluded,
      foundCount: prevFoundCount + newFoundCount,
      totalCount: prevTotalCount,
      ingredientDetails: mergedIngredientDetails,
      reformulationsInput: mergedReformulations,
      manualAmountsInput: manualAmounts,
      calcPending: false,
      calcCompletedAt: Date.now(),
      calcError: null,
    });
    const updatedResult = {
      foundCount: prevFoundCount + newFoundCount,
      totalCount: prevTotalCount,
      notIncluded: filteredStillNotIncluded,
      ...(Object.keys(mergedReformulations).length > 0 && { calcReformulations: mergedReformulations }),
      ...(mergedIngredientDetails.length > 0 && { ingredientDetails: mergedIngredientDetails }),
      ...(finalNaehrwerte.calcYieldGrams != null && { calcYieldGrams: finalNaehrwerte.calcYieldGrams }),
      ...(finalNaehrwerte.calcFinalWeightGrams != null && { calcFinalWeightGrams: finalNaehrwerte.calcFinalWeightGrams }),
      ...(finalNaehrwerte.calcPer100g && { calcPer100g: finalNaehrwerte.calcPer100g }),
    };
    setAutoCalcResult(updatedResult);
    saveStoredCalcResult(recipe?.id, { ...updatedResult, manualAmountsG: manualAmounts });

    // Persist combined totals and updated per-ingredient errors to Firestore
    try {
      await onSave(finalNaehrwerte);
    } catch (saveErr) {
      console.error('Could not auto-save nutrition data after recalc:', saveErr);
      setAutoCalcResult(prev => prev ? { ...prev, saveError: true } : null);
    }
  };

  const linkedRecipeCalcCompletedAtMap = useMemo(() => {
    const map = {};
    for (const r of allRecipes) {
      if (r.id != null && r.naehrwerte?.calcCompletedAt != null) {
        map[r.id] = r.naehrwerte.calcCompletedAt;
      }
    }
    return map;
  }, [allRecipes]);

  const compositionRows = useMemo(() => buildNutritionCompositionRows(
    recipe,
    autoCalcResult,
    reformulations,
    acceptedIngredients,
    manualAmounts,
    nutritionReferenceRows,
    linkedRecipeCalcCompletedAtMap
  ), [recipe, autoCalcResult, reformulations, acceptedIngredients, manualAmounts, nutritionReferenceRows, linkedRecipeCalcCompletedAtMap]);

  const ungeprüftCount = useMemo(() => {
    const rawIngredients = recipe?.zutaten || recipe?.ingredients || [];
    const refByID = new Map(
      (nutritionReferenceRows || [])
        .map(row => [String(row?.ingredientID || '').trim(), row])
        .filter(([id]) => Boolean(id))
    );
    let count = 0;
    for (const item of rawIngredients) {
      if (typeof item === 'string' || !item || item.type === 'heading') continue;
      const id = String(item.ingredientID || '').trim();
      if (!id) continue;
      const row = refByID.get(id);
      if (row && row.status !== 'Freigegeben') count++;
    }
    return count;
  }, [recipe, nutritionReferenceRows]);

  const renderCompositionIngredient = (ingredientText) => {
    const recipeLink = decodeRecipeLink(ingredientText);
    if (!recipeLink) return ingredientText;

    const linkedRecipe = allRecipes.find((item) => item.id === recipeLink.recipeId);
    const displayName = linkedRecipe?.title || recipeLink.recipeName || ingredientText;

    return (
      <>
        {recipeLink.quantityPrefix ? `${recipeLink.quantityPrefix} ` : ''}
        <button
          type="button"
          className="nutrition-composition-recipe-link"
          onClick={() => onOpenLinkedRecipe?.(recipeLink.recipeId)}
          title={`Öffne Rezept: ${displayName}`}
        >
          {displayName}
        </button>
      </>
    );
  };

  useEffect(() => {
    if (!Array.isArray(autoCalcResult?.ingredientDetails) || autoCalcResult.ingredientDetails.length === 0) return;
    const { totals } = sumNutritionFromIngredientDetails(autoCalcResult.ingredientDetails, manualAmounts);
    if (!totals) return;
    const perPortion = naehrwertePerPortion(totals, recipe.portionen || 1);
    setKalorien(perPortion.kalorien != null ? String(perPortion.kalorien) : '');
    setProtein(perPortion.protein != null ? String(perPortion.protein) : '');
    setFett(perPortion.fett != null ? String(perPortion.fett) : '');
    setKohlenhydrate(perPortion.kohlenhydrate != null ? String(perPortion.kohlenhydrate) : '');
    setZucker(perPortion.zucker != null ? String(perPortion.zucker) : '');
    setBallaststoffe(perPortion.ballaststoffe != null ? String(perPortion.ballaststoffe) : '');
    setSalz(perPortion.salz != null ? String(perPortion.salz) : '');
  }, [autoCalcResult, manualAmounts, recipe.portionen]);

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
          <div className="nutrition-modal-header-actions">
            <button
              className="nutrition-autocalc-header-btn"
              onClick={handleAutoCalculate}
              disabled={autoCalcLoading}
              title="Nährwerte automatisch aus OpenFoodFacts berechnen"
              aria-label="Nährwerte automatisch berechnen"
            >
              {isBase64Image(resolvedAutoCalcIcon) ? (
                <img src={resolvedAutoCalcIcon} alt="Nährwerte berechnen" />
              ) : (
                resolvedAutoCalcIcon
              )}
            </button>
            <button
              ref={closeButtonRef}
              className="nutrition-modal-close"
              onClick={onClose}
              aria-label="Nährwerte schließen"
            >
              ×
            </button>
          </div>
        </div>

        <div className="nutrition-modal-body">
          {isStale && (
            <div className="nutrition-stale-warning">
              ⚠️ Die Nährwertetabelle wurde seit der letzten Berechnung aktualisiert. Bitte Nährwerte neu berechnen.
            </div>
          )}
          <table className="nutrition-values-table">
            <colgroup>
              <col className="nutrition-values-table__col nutrition-values-table__col--label" />
              <col className="nutrition-values-table__col nutrition-values-table__col--portion" />
              <col className="nutrition-values-table__col nutrition-values-table__col--per100g" />
            </colgroup>
            <thead>
              <tr>
                <th className="nutrition-values-table__amount-col nutrition-values-table__amount-col--merged" colSpan={2}>Nährwerte pro Portion</th>
                <th className="nutrition-values-table__amount-col nutrition-values-table__amount-col--per100g">pro 100 g</th>
              </tr>
            </thead>
            <tbody>
              <tr className="nutrition-values-table__row">
                <td className="nutrition-values-table__label">Kalorien</td>
                <td className="nutrition-values-table__amount nutrition-values-table__amount--portion">{formatLabelValue(kalorien, 'kcal')}</td>
                <td className="nutrition-values-table__amount nutrition-values-table__amount--per100g">{calculatedNutritionState.per100g ? formatLabelValue(calculatedNutritionState.per100g.kalorien, 'kcal') : '—'}</td>
              </tr>
              <tr className="nutrition-values-table__row">
                <td className="nutrition-values-table__label">Fett</td>
                <td className="nutrition-values-table__amount nutrition-values-table__amount--portion">{formatLabelValue(fett, 'g')}</td>
                <td className="nutrition-values-table__amount nutrition-values-table__amount--per100g">{calculatedNutritionState.per100g ? formatLabelValue(calculatedNutritionState.per100g.fett, 'g') : '—'}</td>
              </tr>
              <tr className="nutrition-values-table__row">
                <td className="nutrition-values-table__label">Kohlenhydrate</td>
                <td className="nutrition-values-table__amount nutrition-values-table__amount--portion">{formatLabelValue(kohlenhydrate, 'g')}</td>
                <td className="nutrition-values-table__amount nutrition-values-table__amount--per100g">{calculatedNutritionState.per100g ? formatLabelValue(calculatedNutritionState.per100g.kohlenhydrate, 'g') : '—'}</td>
              </tr>
              <tr className="nutrition-values-table__row nutrition-values-table__row--indented">
                <td className="nutrition-values-table__label">davon Zucker</td>
                <td className="nutrition-values-table__amount nutrition-values-table__amount--portion">{formatLabelValue(zucker, 'g')}</td>
                <td className="nutrition-values-table__amount nutrition-values-table__amount--per100g">{calculatedNutritionState.per100g ? formatLabelValue(calculatedNutritionState.per100g.zucker, 'g') : '—'}</td>
              </tr>
              <tr className="nutrition-values-table__row">
                <td className="nutrition-values-table__label">Protein</td>
                <td className="nutrition-values-table__amount nutrition-values-table__amount--portion">{formatLabelValue(protein, 'g')}</td>
                <td className="nutrition-values-table__amount nutrition-values-table__amount--per100g">{calculatedNutritionState.per100g ? formatLabelValue(calculatedNutritionState.per100g.protein, 'g') : '—'}</td>
              </tr>
              <tr className="nutrition-values-table__row">
                <td className="nutrition-values-table__label">Salz</td>
                <td className="nutrition-values-table__amount nutrition-values-table__amount--portion">{formatLabelValue(salz, 'g')}</td>
                <td className="nutrition-values-table__amount nutrition-values-table__amount--per100g">{calculatedNutritionState.per100g ? formatLabelValue(calculatedNutritionState.per100g.salz, 'g') : '—'}</td>
              </tr>
              <tr className="nutrition-values-table__row">
                <td className="nutrition-values-table__label">Ballaststoffe</td>
                <td className="nutrition-values-table__amount nutrition-values-table__amount--portion">{formatLabelValue(ballaststoffe, 'g')}</td>
                <td className="nutrition-values-table__amount nutrition-values-table__amount--per100g">{calculatedNutritionState.per100g ? formatLabelValue(calculatedNutritionState.per100g.ballaststoffe, 'g') : '—'}</td>
              </tr>
            </tbody>
          </table>

          <hr className="nutrition-section-divider" />

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
                        <th className="nutrition-composition-num">Menge</th>
                        <th>Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {compositionRows.map((row, index) => (
                        <tr
                         key={`${row.ingredient}-${index}`}
                         className={row.aiEstimated ? 'nutrition-composition-row--ai-estimated' : ''}
                        >
                         <td>{renderCompositionIngredient(row.ingredient)}</td>
                         <td>
                           {row.source}
                         </td>
                         <td className="nutrition-composition-num">{formatNutritionValue(row.naehrwerte, 'kalorien', 0)}</td>
                         <td className="nutrition-composition-num">{formatNutritionValue(row.naehrwerte, 'protein')}</td>
                         <td className="nutrition-composition-num">{formatNutritionValue(row.naehrwerte, 'fett')}</td>
                         <td className="nutrition-composition-num">{formatNutritionValue(row.naehrwerte, 'kohlenhydrate')}</td>
                          <td>{row.status}</td>
                          <td className="nutrition-composition-num">
                            {row.requiresManualAmount && !savedManualAmounts[row.ingredient] ? (
                              <div className="nutrition-composition-manual-amount">
                                <div className="nutrition-composition-manual-amount-controls">
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    className="nutrition-composition-manual-amount-input"
                                    value={manualAmounts[row.ingredient] ?? ''}
                                    onChange={(e) => handleManualAmountChange(row.ingredient, e.target.value)}
                                    placeholder="g"
                                    aria-label={`Menge in Gramm für ${row.ingredient}`}
                                  />
                                  <button
                                    type="button"
                                    className="nutrition-composition-manual-amount-save"
                                    onClick={() => handleSaveManualAmount(row.ingredient)}
                                    aria-label={`Menge für ${row.ingredient} speichern`}
                                  >
                                    {isBase64Image(resolvedManualSaveIcon) ? (
                                      <img className="nutrition-composition-manual-amount-save-img" src={resolvedManualSaveIcon} alt="Speichern" />
                                    ) : (
                                      resolvedManualSaveIcon
                                    )}
                                  </button>
                                </div>
                                {manualAmountErrors[row.ingredient] && (
                                  <div className="nutrition-composition-manual-amount-error">
                                    {manualAmountErrors[row.ingredient]}
                                  </div>
                                )}
                              </div>
                            ) : formatAmountG(row.amountG)}
                          </td>
                          <td>{row.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="nutrition-autocalc">
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
                </p>
                {(() => {
                  const aiEstimatedCount = (autoCalcResult.ingredientDetails || []).filter(item => item.aiEstimated).length;
                  const parts = [];
                  if (ungeprüftCount > 0) {
                    parts.push(`${ungeprüftCount} ${ungeprüftCount === 1 ? 'Zutat ist' : 'Zutaten sind'} noch nicht geprüft.`);
                  }
                  if (aiEstimatedCount > 0) {
                    parts.push(`Für ${aiEstimatedCount} ${aiEstimatedCount === 1 ? 'Zutat wurde' : 'Zutaten wurden'} Nährwerte über KI geschätzt.`);
                  }
                  if (parts.length === 0) return null;
                  return (
                    <p className="nutrition-autocalc-info nutrition-autocalc-info-ai">
                      {parts.join(' ')}
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
                {autoCalcResult.writebackError && (
                  <p className="nutrition-autocalc-error">
                    Nährwertreferenz konnte nicht aktualisiert werden: {autoCalcResult.writebackError}
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
            {(Object.keys(reformulations).length > 0 || acceptedIngredients.size > 0) && (
              <button
                className="nutrition-reset-adjustments-button"
                onClick={handleResetAdjustments}
                disabled={autoCalcLoading}
                title="Umformulierungen und ausgeschlossene Zutaten zurücksetzen"
              >
                Anpassungen zurücksetzen
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default NutritionModal;

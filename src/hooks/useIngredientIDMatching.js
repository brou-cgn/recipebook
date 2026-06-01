import { useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { buildPendingNutritionReferenceDraft, getIngredientIdSuggestions } from '../utils/ingredientIdMatching';
import { NUTRITION_REFERENCE_PENDING_STATUS, normalizeNutritionReferenceId } from '../utils/nutritionReferenceUtils';

function defaultGetNutritionIngredientSource(recipe) {
  if (!recipe) return { fieldName: 'ingredients', rawIngredients: [] };
  if (Array.isArray(recipe.zutaten)) {
    return { fieldName: 'zutaten', rawIngredients: recipe.zutaten };
  }
  return { fieldName: 'ingredients', rawIngredients: recipe.ingredients || [] };
}

export function useIngredientIDMatching({
  recipe,
  nutritionReferenceRows = [],
  currentUserId = null,
  persistIngredientIDs: persistIngredientIDsCallback,
  ingredientMatchFromModalRef = null,
} = {}) {
  const [ingredientMatchDialog, setIngredientMatchDialog] = useState(null);

  const getNutritionIngredientSource = (targetRecipe = recipe) => defaultGetNutritionIngredientSource(targetRecipe);

  const persistIngredientIDs = async (fieldName, updatedIngredients, targetRecipe = recipe) => {
    if (!fieldName || typeof persistIngredientIDsCallback !== 'function') return;
    await persistIngredientIDsCallback({
      recipe: targetRecipe,
      fieldName,
      updatedIngredients,
    });
  };

  const ensureIngredientIDsForNutrition = async (targetRecipe = recipe) => {
    if (!targetRecipe) return null;

    const { fieldName, rawIngredients } = getNutritionIngredientSource(targetRecipe);
    const updatedIngredients = [...rawIngredients];
    const unresolvedIngredients = [];
    const matchingLog = [];
    const createdReferenceDrafts = new Map();
    const referencesToCreate = [];
    let autoAssigned = 0;

    rawIngredients.forEach((item, index) => {
      const ingredientItem = typeof item === 'string' ? { type: 'ingredient', text: item } : item;
      if (!ingredientItem || ingredientItem.type === 'heading' || typeof ingredientItem.text !== 'string') return;

      const existingIngredientID = String(ingredientItem.ingredientID || '').trim();
      if (existingIngredientID) {
        const idStillValid = nutritionReferenceRows.some(
          (row) => String(row?.ingredientID || '').trim() === existingIngredientID
        );
        if (idStillValid) return;
      }

      const suggestions = getIngredientIdSuggestions(ingredientItem.text, nutritionReferenceRows);
      const top = suggestions[0];
      const hasUniqueTop = Boolean(top) && suggestions.filter((entry) => entry.confidencePercent === top.confidencePercent).length === 1;

      if (top && top.confidencePercent === 100 && hasUniqueTop) {
        const nextItem = typeof item === 'string'
          ? { type: 'ingredient', text: item, ingredientID: top.ingredientID }
          : { ...item, ingredientID: top.ingredientID };
        updatedIngredients[index] = nextItem;
        autoAssigned += 1;
        matchingLog.push({
          ingredient: ingredientItem.text,
          status: 'auto',
          selectedIngredientID: top.ingredientID,
          confidencePercent: top.confidencePercent,
          ...(existingIngredientID ? { previousIngredientID: existingIngredientID } : {}),
        });
        return;
      }

      if (suggestions.length === 0) {
        const draftKey = buildPendingNutritionReferenceDraft(ingredientItem.text, nutritionReferenceRows);
        const createdDraft = draftKey?.canonicalKey
          ? createdReferenceDrafts.get(draftKey.canonicalKey)
          : null;
        const nextDraft = createdDraft || buildPendingNutritionReferenceDraft(
          ingredientItem.text,
          [...nutritionReferenceRows, ...Array.from(createdReferenceDrafts.values())]
        );

        if (nextDraft) {
          if (!createdDraft) {
            createdReferenceDrafts.set(nextDraft.canonicalKey, nextDraft);
            referencesToCreate.push(nextDraft);
          }

          const nextItem = typeof item === 'string'
            ? { type: 'ingredient', text: item, ingredientID: nextDraft.ingredientID }
            : { ...item, ingredientID: nextDraft.ingredientID };
          updatedIngredients[index] = nextItem;
          autoAssigned += 1;
          matchingLog.push({
            ingredient: ingredientItem.text,
            status: 'created',
            selectedIngredientID: nextDraft.ingredientID,
            createdReference: true,
            ...(existingIngredientID ? { previousIngredientID: existingIngredientID } : {}),
          });
          return;
        }
      }

      unresolvedIngredients.push({
        index,
        ingredient: ingredientItem.text,
        suggestions,
      });
      matchingLog.push({
        ingredient: ingredientItem.text,
        status: suggestions.length > 0 ? 'ambiguous' : 'unmatched',
        suggestions: suggestions.map((entry) => ({ ingredientID: entry.ingredientID, confidencePercent: entry.confidencePercent })),
        ...(existingIngredientID ? { previousIngredientID: existingIngredientID } : {}),
      });
    });

    if (unresolvedIngredients.length > 0) {
      const selections = unresolvedIngredients.reduce((acc, entry) => {
        acc[entry.index] = '';
        return acc;
      }, {});
      setIngredientMatchDialog({
        recipe: targetRecipe,
        recipeId: targetRecipe.id,
        fieldName,
        updatedIngredients,
        unresolved: unresolvedIngredients,
        matchingLog,
        selections,
        errorMessage: '',
      });
      return null;
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
              status: NUTRITION_REFERENCE_PENDING_STATUS,
              source: 'auto-created',
              updatedAt: serverTimestamp(),
              updatedBy: currentUserId,
            },
            { merge: true }
          );
        } catch (err) {
          console.error('Could not create pending nutrition reference:', err);
        }
      }));
    }

    if (autoAssigned > 0) {
      await persistIngredientIDs(fieldName, updatedIngredients, targetRecipe);
    }

    return { recipe: targetRecipe, fieldName, updatedIngredients, matchingLog };
  };

  const handleEnsureIngredientIDsForModal = async (targetRecipe = recipe) => {
    if (ingredientMatchFromModalRef) {
      ingredientMatchFromModalRef.current = true;
    }
    const result = await ensureIngredientIDsForNutrition(targetRecipe);
    if (result !== null && ingredientMatchFromModalRef) {
      ingredientMatchFromModalRef.current = false;
    }
    return result;
  };

  return {
    ingredientMatchDialog,
    setIngredientMatchDialog,
    getNutritionIngredientSource,
    persistIngredientIDs,
    ensureIngredientIDsForNutrition,
    handleEnsureIngredientIDsForModal,
  };
}

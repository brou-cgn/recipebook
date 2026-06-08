import { useState } from 'react';
import { getIngredientIdSuggestions } from '../utils/ingredientIdMatching';
import { decodeRecipeLink } from '../utils/recipeLinks';

export const INGREDIENT_MATCH_CREATE_NEW_OPTION = '__ingredient_match_create_new__';
export const INGREDIENT_MATCH_IGNORE_OPTION = '__ingredient_match_ignore__';

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
    let autoAssigned = 0;

    rawIngredients.forEach((item, index) => {
      const ingredientItem = typeof item === 'string' ? { type: 'ingredient', text: item } : item;
      if (!ingredientItem || ingredientItem.type === 'heading' || typeof ingredientItem.text !== 'string') return;
      if (ingredientItem.ignoreNutritionCalculation === true) {
        matchingLog.push({
          ingredient: ingredientItem.text,
          status: 'ignored',
        });
        return;
      }
      if (decodeRecipeLink(ingredientItem.text)) {
        matchingLog.push({
          ingredient: ingredientItem.text,
          status: 'recipe-link',
        });
        return;
      }

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
      const learnSynonyms = unresolvedIngredients.reduce((acc, entry) => {
        acc[entry.index] = true;
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
        learnSynonyms,
        errorMessage: '',
      });
      return null;
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

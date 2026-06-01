import { getIngredientIdSuggestions, parseIngredientNameAndUnit } from './ingredientIdMatching';
import {
  parseNutritionReferencePossibleUnits,
  parseNutritionReferenceSynonyms,
} from './nutritionReferenceUtils';

describe('ingredientIdMatching', () => {
  test('parses ingredient name and unit for matching', () => {
    expect(parseIngredientNameAndUnit('200 g Tomaten')).toEqual({ quantity: 200, name: 'Tomaten', unit: 'g' });
    expect(parseIngredientNameAndUnit('2 Eier')).toEqual({ quantity: 2, name: 'Eier', unit: null });
    expect(parseIngredientNameAndUnit('1 Liter Kokosmilch')).toEqual({ quantity: 1, name: 'Kokosmilch', unit: 'Liter' });
    expect(parseIngredientNameAndUnit('1 Esslöffel Fish Sauce')).toEqual({ quantity: 1, name: 'Fish Sauce', unit: 'Esslöffel' });
    expect(parseIngredientNameAndUnit('1 Teelöffel Salz')).toEqual({ quantity: 1, name: 'Salz', unit: 'Teelöffel' });
  });

  test('returns 100% confidence for exact synonym match', () => {
    const suggestions = getIngredientIdSuggestions('250 g Tomaten', [
      { ingredientID: 'tomate', synonyms: ['Tomaten'] },
      { ingredientID: 'kartoffel', synonyms: ['Kartoffeln'] },
    ]);

    expect(suggestions[0]).toMatchObject({ ingredientID: 'tomate', displayName: 'Tomaten', confidencePercent: 100 });
  });

  test('returns 100% confidence for exact synonym match with long-form unit', () => {
    const suggestions = getIngredientIdSuggestions('1 Liter Kokosmilch', [
      { ingredientID: 'kokosmilch', synonyms: ['Kokosmilch'] },
    ]);

    expect(suggestions[0]).toMatchObject({ ingredientID: 'kokosmilch', confidencePercent: 100 });
  });

  test('returns 100% confidence for exact synonym match parsed from semicolon-separated reference data', () => {
    const suggestions = getIngredientIdSuggestions('2 Karotten', [
      {
        ingredientID: 'karotte',
        synonyms: parseNutritionReferenceSynonyms({ synonyms: 'karotte;möhren;mohren;karotten' }),
        possibleUnits: parseNutritionReferencePossibleUnits({ possibleUnits: 'g;kg;stück;bund' }),
      },
    ]);

    expect(suggestions[0]).toMatchObject({ ingredientID: 'karotte', displayName: 'karotte', confidencePercent: 100 });
  });

  test('returns 100% confidence for exact synonym match from malformed semicolon array data', () => {
    const suggestions = getIngredientIdSuggestions('200 g Spaghetti', [
      {
        ingredientID: 'nudel_getrocknet',
        synonyms: parseNutritionReferenceSynonyms({
          synonyms: ['schupfnudeln;nudeln;pasta;tagliatelle;spaghetti;nudel_getrocknet'],
        }),
        possibleUnits: parseNutritionReferencePossibleUnits({ possibleUnits: 'g;kg;el;tl;stück' }),
      },
    ]);

    expect(suggestions[0]).toMatchObject({ ingredientID: 'nudel_getrocknet', displayName: 'schupfnudeln', confidencePercent: 100 });
  });

  test('ignores optional markers and parenthetical text for ingredient ID matching', () => {
    expect(getIngredientIdSuggestions('Zucker (optional)', [
      { ingredientID: 'zucker', synonyms: ['Zucker'] },
    ])[0]).toMatchObject({ ingredientID: 'zucker', confidencePercent: 100 });

    expect(getIngredientIdSuggestions('Salz (ggf.)', [
      { ingredientID: 'salz', synonyms: ['Salz'] },
    ])[0]).toMatchObject({ ingredientID: 'salz', confidencePercent: 100 });

    expect(getIngredientIdSuggestions('ggf. Zucker', [
      { ingredientID: 'zucker', synonyms: ['Zucker'] },
    ])[0]).toMatchObject({ ingredientID: 'zucker', confidencePercent: 100 });

    expect(getIngredientIdSuggestions('Pfeffer (schwarz – optional)', [
      { ingredientID: 'pfeffer', synonyms: ['Pfeffer'] },
    ])[0]).toMatchObject({ ingredientID: 'pfeffer', confidencePercent: 100 });

    expect(getIngredientIdSuggestions('gegebenenfalls Zucker', [
      { ingredientID: 'zucker', synonyms: ['Zucker'] },
    ])[0]).toMatchObject({ ingredientID: 'zucker', confidencePercent: 100 });
  });

  test('applies unit match as tie breaker for close candidates', () => {
    const suggestions = getIngredientIdSuggestions('1 Bund Petersilie', [
      { ingredientID: 'petersilie', synonyms: ['Petersilie'], possibleUnits: ['Bund'] },
      { ingredientID: 'petersilienwurzel', synonyms: ['Petersilienwurzel'], possibleUnits: ['g'] },
    ]);

    expect(suggestions[0]).toMatchObject({ ingredientID: 'petersilie', confidencePercent: 100 });
    expect(suggestions[1].confidencePercent).toBeLessThan(100);
  });

  test('returns empty list for unmatched ingredient', () => {
    const suggestions = getIngredientIdSuggestions('Etwas Fantasiezutat', [
      { ingredientID: 'tomate', synonyms: ['Tomate'] },
    ]);
    expect(suggestions).toEqual([]);
  });
});

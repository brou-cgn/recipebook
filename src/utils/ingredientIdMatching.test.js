import { getIngredientIdSuggestions, parseIngredientNameAndUnit } from './ingredientIdMatching';

describe('ingredientIdMatching', () => {
  test('parses ingredient name and unit for matching', () => {
    expect(parseIngredientNameAndUnit('200 g Tomaten')).toEqual({ quantity: 200, name: 'Tomaten', unit: 'g' });
    expect(parseIngredientNameAndUnit('2 Eier')).toEqual({ quantity: 2, name: 'Eier', unit: null });
  });

  test('returns 100% confidence for exact synonym match', () => {
    const suggestions = getIngredientIdSuggestions('250 g Tomaten', [
      { ingredientID: 'tomate', synonyms: ['Tomaten'] },
      { ingredientID: 'kartoffel', synonyms: ['Kartoffeln'] },
    ]);

    expect(suggestions[0]).toMatchObject({ ingredientID: 'tomate', confidencePercent: 100 });
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

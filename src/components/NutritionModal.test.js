import { getRecipeCalcResult, buildNutritionCompositionRows } from './NutritionModal';

jest.mock('../firebase', () => ({
  functions: {},
}));

describe('getRecipeCalcResult', () => {
  it('returns null when calc counters are missing', () => {
    expect(getRecipeCalcResult({ naehrwerte: { calcNotIncluded: [{ ingredient: 'x' }] } })).toBeNull();
  });

  it('returns persisted calc payload including reformulations and accepted ingredients', () => {
    const recipe = {
      naehrwerte: {
        calcFoundCount: 2,
        calcTotalCount: 3,
        calcNotIncluded: [{ ingredient: 'Milch', error: 'Nicht gefunden' }],
        calcReformulations: { Milch: { text: 'Vollmilch' } },
        calcAcceptedIngredients: ['Salz'],
      },
    };

    expect(getRecipeCalcResult(recipe)).toEqual({
      foundCount: 2,
      totalCount: 3,
      notIncluded: [{ ingredient: 'Milch', error: 'Nicht gefunden' }],
      calcReformulations: { Milch: { text: 'Vollmilch' } },
      acceptedIngredients: ['Salz'],
    });
  });

  it('includes calcIngredientDetails from recipe naehrwerte', () => {
    const details = [
      { ingredient: 'Linsen', naehrwerte: { kalorien: 220, protein: 18, fett: 1, kohlenhydrate: 30, zucker: 1, ballaststoffe: 5, salz: 0.1 } },
    ];
    const recipe = {
      naehrwerte: {
        calcFoundCount: 1,
        calcTotalCount: 1,
        calcNotIncluded: [],
        calcIngredientDetails: details,
      },
    };

    expect(getRecipeCalcResult(recipe)).toEqual(expect.objectContaining({
      ingredientDetails: details,
    }));
  });

  it('omits ingredientDetails when not present in recipe naehrwerte', () => {
    const recipe = {
      naehrwerte: {
        calcFoundCount: 1,
        calcTotalCount: 1,
        calcNotIncluded: [],
      },
    };

    const result = getRecipeCalcResult(recipe);
    expect(result).not.toHaveProperty('ingredientDetails');
  });

  describe('buildNutritionCompositionRows', () => {
    it('builds composition rows with calculated, not included and accepted statuses', () => {
      const recipe = {
        ingredients: ['200 g Reis', '1 Teil #recipe:abc:Linsen', 'Salz'],
        naehrwerte: {
          calcNotIncluded: [{ ingredient: '200 g Reis', error: 'Nicht gefunden' }],
        },
      };

      const rows = buildNutritionCompositionRows(
        recipe,
        {
          notIncluded: [{ ingredient: '200 g Reis', error: 'Nicht gefunden' }],
        },
        {},
        ['Salz']
      );

      expect(rows).toEqual([
        expect.objectContaining({ ingredient: '200 g Reis', status: 'Nicht enthalten', source: 'Zutat' }),
        expect.objectContaining({ ingredient: '1 Teil #recipe:abc:Linsen', status: 'Berechnet', source: expect.stringContaining('Rezeptlink') }),
        expect.objectContaining({ ingredient: 'Salz', status: 'Akzeptiert', source: 'Zutat' }),
      ]);
    });

    it('includes naehrwerte values for calculated ingredients from ingredientDetails', () => {
      const ingredientNaehrwerte = { kalorien: 220, protein: 18, fett: 1, kohlenhydrate: 30, zucker: 1, ballaststoffe: 5, salz: 0.1 };
      const recipe = {
        ingredients: ['Linsen', 'Salz'],
        naehrwerte: {},
      };

      const rows = buildNutritionCompositionRows(
        recipe,
        {
          notIncluded: [],
          ingredientDetails: [{ ingredient: 'Linsen', naehrwerte: ingredientNaehrwerte }],
        },
        {},
        ['Salz']
      );

      expect(rows[0]).toEqual(expect.objectContaining({
        ingredient: 'Linsen',
        status: 'Berechnet',
        naehrwerte: ingredientNaehrwerte,
      }));
      expect(rows[1]).toEqual(expect.objectContaining({
        ingredient: 'Salz',
        status: 'Akzeptiert',
        naehrwerte: null,
      }));
    });

    it('sets naehrwerte to null for not-included ingredients', () => {
      const recipe = {
        ingredients: ['200 g Reis'],
        naehrwerte: {},
      };

      const rows = buildNutritionCompositionRows(
        recipe,
        {
          notIncluded: [{ ingredient: '200 g Reis', error: 'Nicht gefunden' }],
          ingredientDetails: [],
        },
        {},
        []
      );

      expect(rows[0]).toEqual(expect.objectContaining({
        ingredient: '200 g Reis',
        status: 'Nicht enthalten',
        naehrwerte: null,
      }));
    });

    it('reads ingredientDetails from recipe naehrwerte when not provided in calcResult', () => {
      const ingredientNaehrwerte = { kalorien: 100, protein: 5, fett: 2, kohlenhydrate: 15, zucker: 2, ballaststoffe: 1, salz: 0.2 };
      const recipe = {
        ingredients: ['Kartoffeln'],
        naehrwerte: {
          calcIngredientDetails: [{ ingredient: 'Kartoffeln', naehrwerte: ingredientNaehrwerte }],
        },
      };

      const rows = buildNutritionCompositionRows(recipe, null, {}, []);

      expect(rows[0]).toEqual(expect.objectContaining({
        ingredient: 'Kartoffeln',
        naehrwerte: ingredientNaehrwerte,
      }));
    });

    it('includes naehrwerte for recipe-link ingredients', () => {
      const linkNaehrwerte = { kalorien: 50, protein: 3, fett: 0.5, kohlenhydrate: 8, zucker: 0.5, ballaststoffe: 1, salz: 0.05 };
      const recipe = {
        ingredients: ['1 Teil #recipe:abc:Linsen'],
        naehrwerte: {},
      };

      const rows = buildNutritionCompositionRows(
        recipe,
        {
          notIncluded: [],
          ingredientDetails: [{ ingredient: '1 Teil #recipe:abc:Linsen', naehrwerte: linkNaehrwerte }],
        },
        {},
        []
      );

      expect(rows[0]).toEqual(expect.objectContaining({
        ingredient: '1 Teil #recipe:abc:Linsen',
        status: 'Berechnet',
        source: expect.stringContaining('Rezeptlink'),
        naehrwerte: linkNaehrwerte,
      }));
    });
  });
});

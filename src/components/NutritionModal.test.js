import { getRecipeCalcResult, buildNutritionCompositionRows, resolveIngredientNutritionFromReference, computeIngredientAmountG } from './NutritionModal';

jest.mock('../firebase', () => ({
  functions: {},
  db: {},
}));

jest.mock('firebase/firestore', () => ({
  setDoc: jest.fn(),
  doc: jest.fn(),
  serverTimestamp: jest.fn(),
}));

describe('getRecipeCalcResult', () => {
  it('returns null when calc counters and ingredient details are missing', () => {
    expect(getRecipeCalcResult({ naehrwerte: { calcNotIncluded: [{ ingredient: 'x' }] } })).toBeNull();
  });

  it('returns fallback payload when calc counters are missing but ingredient details exist', () => {
    const details = [
      { ingredient: 'Linsen', naehrwerte: { kalorien: 220 } },
      { ingredient: 'Salz', naehrwerte: { kalorien: 0 } },
    ];
    expect(getRecipeCalcResult({ naehrwerte: { calcIngredientDetails: details } })).toEqual(
      expect.objectContaining({
        foundCount: 0,
        totalCount: 2,
        ingredientDetails: details,
      })
    );
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
          ingredientDetails: [{ ingredient: 'Linsen', naehrwerte: ingredientNaehrwerte, searchTerm: 'lentils', aiEstimated: true }],
        },
        {},
        ['Salz']
      );

      expect(rows[0]).toEqual(expect.objectContaining({
        ingredient: 'Linsen',
        status: 'Berechnet',
        naehrwerte: ingredientNaehrwerte,
        searchTerm: 'lentils',
        aiEstimated: true,
        detail: 'Suchbegriff: lentils',
      }));
      expect(rows[1]).toEqual(expect.objectContaining({
        ingredient: 'Salz',
        status: 'Akzeptiert',
        naehrwerte: null,
        aiEstimated: false,
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

    it('shows recalculation hint for calculated rows without naehrwerte', () => {
      const recipe = {
        ingredients: ['Kartoffeln'],
        naehrwerte: {},
      };

      const rows = buildNutritionCompositionRows(
        recipe,
        { notIncluded: [], ingredientDetails: [{ ingredient: 'Kartoffeln' }] },
        {},
        []
      );

      expect(rows[0]).toEqual(expect.objectContaining({
        ingredient: 'Kartoffeln',
        status: 'Berechnet',
        detail: 'Neu berechnen',
        naehrwerte: null,
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

describe('computeIngredientAmountG', () => {
  const rowWith = (defaultAmountG) => ({ ingredientID: 'X', defaultAmountG });

  it('returns quantity in grams for unit g', () => {
    expect(computeIngredientAmountG('250 g Tomaten', rowWith(null))).toBe(250);
  });

  it('converts kg to grams', () => {
    expect(computeIngredientAmountG('1,5 kg Kartoffeln', rowWith(null))).toBeCloseTo(1500);
  });

  it('uses defaultAmountG multiplied by quantity for other units', () => {
    expect(computeIngredientAmountG('2 EL Öl', rowWith(15))).toBe(30);
  });

  it('uses defaultAmountG with multiplier 1 when no quantity given', () => {
    expect(computeIngredientAmountG('Salz', rowWith(5))).toBe(5);
  });

  it('returns null when unit is not g/kg and no defaultAmountG in row', () => {
    expect(computeIngredientAmountG('3 Stück Eier', rowWith(null))).toBeNull();
  });

  it('returns null when no quantity and no defaultAmountG', () => {
    expect(computeIngredientAmountG('Salz', null)).toBeNull();
  });
});

describe('resolveIngredientNutritionFromReference', () => {
  const referenceRow = {
    ingredientID: 'tomate',
    source: 'openfoodfacts',
    defaultAmountG: null,
    kalorien: 20,
    protein: 1,
    fett: 0.2,
    kohlenhydrate: 4,
    zucker: 2,
    ballaststoffe: 1,
    salz: 0.01,
  };

  const manualRow = { ...referenceRow, ingredientID: 'mehl', source: 'manual' };
  const aiRow = { ...referenceRow, ingredientID: 'ei', source: 'ai-generiert', defaultAmountG: 50 };

  const rows = [referenceRow, manualRow, aiRow];

  it('returns scaled nutrition when source is openfoodfacts', () => {
    const ingredient = { text: '500 g Tomaten', ingredientID: 'tomate' };
    const result = resolveIngredientNutritionFromReference(ingredient, rows);
    expect(result).not.toBeNull();
    expect(result.fromReference).toBe(true);
    expect(result.source).toBe('openfoodfacts');
    // 500g at 20 kcal/100g = 100 kcal
    expect(result.naehrwerte.kalorien).toBeCloseTo(100);
    expect(result.naehrwerte.protein).toBeCloseTo(5);
  });

  it('returns scaled nutrition when source is manual', () => {
    const ingredient = { text: '200 g Mehl', ingredientID: 'mehl' };
    const result = resolveIngredientNutritionFromReference(ingredient, rows);
    expect(result).not.toBeNull();
    expect(result.source).toBe('manual');
    expect(result.naehrwerte.kalorien).toBeCloseTo(40);
  });

  it('returns null when source is ai-generiert', () => {
    const ingredient = { text: '2 Stück Eier', ingredientID: 'ei' };
    // ai-generiert source → should NOT use reference
    expect(resolveIngredientNutritionFromReference(ingredient, rows)).toBeNull();
  });

  it('returns null when ingredient has no ingredientID', () => {
    const ingredient = { text: '250 g Tomaten' };
    expect(resolveIngredientNutritionFromReference(ingredient, rows)).toBeNull();
  });

  it('returns null when no matching row exists in reference', () => {
    const ingredient = { text: '100 g Unbekannt', ingredientID: 'unknown-ingredient' };
    expect(resolveIngredientNutritionFromReference(ingredient, rows)).toBeNull();
  });

  it('uses defaultAmountG when unit is not g/kg', () => {
    const row = { ...referenceRow, ingredientID: 'oel', source: 'manual', defaultAmountG: 15, kalorien: 900 };
    const ingredient = { text: '2 EL Öl', ingredientID: 'oel' };
    const result = resolveIngredientNutritionFromReference(ingredient, [row]);
    expect(result).not.toBeNull();
    // 2 EL × 15g = 30g → 900/100*30 = 270 kcal
    expect(result.naehrwerte.kalorien).toBeCloseTo(270);
  });

  it('returns null when amount in grams cannot be determined', () => {
    // no unit=g, no defaultAmountG
    const row = { ...referenceRow, ingredientID: 'ei2', source: 'manual', defaultAmountG: undefined };
    const ingredient = { text: '3 Stück Eier', ingredientID: 'ei2' };
    expect(resolveIngredientNutritionFromReference(ingredient, [row])).toBeNull();
  });
});

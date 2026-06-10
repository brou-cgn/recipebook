import {
  getRecipeCalcResult,
  buildNutritionCompositionRows,
  resolveIngredientNutritionByStatus,
  computeIngredientAmountG,
  parseManualAmountG,
  scaleNutritionByAmountG,
  sumNutritionFromIngredientDetails,
} from './NutritionModal';
import { hasMeaningfulGeneratedNutrition } from '../utils/nutritionStatusResolver';

jest.mock('../firebase', () => ({
  functions: {},
  db: {},
}));

jest.mock('firebase/firestore', () => ({
  setDoc: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
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
          ingredientDetails: [{ ingredient: 'Linsen', naehrwerte: ingredientNaehrwerte, amountG: 150, searchTerm: 'lentil', aiEstimated: true }],
        },
        {},
        ['Salz']
      );

      expect(rows[0]).toEqual(expect.objectContaining({
        ingredient: 'Linsen',
        status: 'Berechnet',
        naehrwerte: ingredientNaehrwerte,
        amountG: 150,
        searchTerm: 'lentil',
        aiEstimated: true,
        detail: 'Suchbegriff: lentil',
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

    it('passes calculated amount in grams through to composition rows', () => {
      const recipe = {
        ingredients: ['10 ml Cointreau'],
        naehrwerte: {},
      };
      const rows = buildNutritionCompositionRows(
        recipe,
        {
          notIncluded: [],
          ingredientDetails: [{ ingredient: '10 ml Cointreau', amountG: 10 }],
        },
        {},
        []
      );

      expect(rows[0]).toEqual(expect.objectContaining({
        ingredient: '10 ml Cointreau',
        amountG: 10,
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

    it('shows reference hint when preferred source exists but amount cannot be determined', () => {
      const recipe = {
        ingredients: ['3 Stück Eier'],
        naehrwerte: {},
      };

      const rows = buildNutritionCompositionRows(
        recipe,
        { notIncluded: [], ingredientDetails: [{ ingredient: '3 Stück Eier', noAmountG: true, fromReference: true, source: 'manual' }] },
        {},
        []
      );

      expect(rows[0]).toEqual(expect.objectContaining({
        ingredient: '3 Stück Eier',
        status: 'Berechnet',
        detail: 'Referenzquelle vorhanden, Menge nicht berechenbar',
        naehrwerte: null,
      }));
    });

    it('converts per-100g values for noAmount ingredients when manual grams are provided', () => {
      const recipe = {
        ingredients: ['Eier'],
        naehrwerte: {},
      };
      const rows = buildNutritionCompositionRows(
        recipe,
        {
          notIncluded: [],
          ingredientDetails: [{
            ingredient: 'Eier',
            noAmountG: true,
            naehrwerte: { kalorien: 150, protein: 12, fett: 10, kohlenhydrate: 1, zucker: 1, ballaststoffe: 0, salz: 0.2 },
          }],
        },
        {},
        [],
        { Eier: '75' }
      );

      expect(rows[0]).toEqual(expect.objectContaining({
        ingredient: 'Eier',
        requiresManualAmount: true,
        amountG: 75,
        detail: 'Aus Referenzwert je 100 g umgerechnet',
      }));
      expect(rows[0].naehrwerte.kalorien).toBeCloseTo(112.5);
      expect(rows[0].naehrwerte.protein).toBeCloseTo(9);
    });

    it('shows manual amount hint for noAmount ingredients with available reference values', () => {
      const recipe = {
        ingredients: ['Eier'],
        naehrwerte: {},
      };
      const rows = buildNutritionCompositionRows(
        recipe,
        {
          notIncluded: [],
          ingredientDetails: [{
            ingredient: 'Eier',
            noAmountG: true,
            naehrwerte: { kalorien: 150, protein: 12, fett: 10, kohlenhydrate: 1, zucker: 1, ballaststoffe: 0, salz: 0.2 },
          }],
        },
        {},
        [],
        {}
      );

      expect(rows[0]).toEqual(expect.objectContaining({
        ingredient: 'Eier',
        requiresManualAmount: true,
        detail: 'Referenzwert je 100 g vorhanden – Menge eingeben',
      }));
      expect(rows[0].naehrwerte.kalorien).toBeCloseTo(150);
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

    describe('manual amount conversion helpers', () => {
      it('parses positive manual gram values and rejects invalid input', () => {
        expect(parseManualAmountG('75')).toBe(75);
        expect(parseManualAmountG('75,5')).toBe(75.5);
        expect(parseManualAmountG('0')).toBeNull();
        expect(parseManualAmountG('-5')).toBeNull();
        expect(parseManualAmountG('abc')).toBeNull();
      });

      it('scales per-100g nutrition values to a given amount', () => {
        const scaled = scaleNutritionByAmountG({ kalorien: 200, protein: 10, fett: 5, kohlenhydrate: 20, zucker: 4, ballaststoffe: 3, salz: 0.5 }, 50);
        expect(scaled).toEqual({
          kalorien: 100,
          protein: 5,
          fett: 2.5,
          kohlenhydrate: 10,
          zucker: 2,
          ballaststoffe: 1.5,
          salz: 0.25,
        });
      });

      it('sums normal ingredient details and converted noAmountG details', () => {
        const result = sumNutritionFromIngredientDetails(
          [
            { ingredient: 'Tomaten', naehrwerte: { kalorien: 40, protein: 2, fett: 0.2, kohlenhydrate: 8, zucker: 4, ballaststoffe: 2, salz: 0.02 } },
            { ingredient: 'Eier', noAmountG: true, naehrwerte: { kalorien: 150, protein: 12, fett: 10, kohlenhydrate: 1, zucker: 1, ballaststoffe: 0, salz: 0.2 } },
          ],
          { Eier: '50' }
        );

        expect(result.normalizedManualAmounts).toEqual({ Eier: 50 });
        expect(result.totals.kalorien).toBeCloseTo(115);
        expect(result.totals.protein).toBeCloseTo(8);
        expect(result.totals.fett).toBeCloseTo(5.2);
        expect(result.totals.kohlenhydrate).toBeCloseTo(8.5);
      });
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

  it('returns null when unit is not g/kg and no defaultAmountG in row', () => {
    expect(computeIngredientAmountG('3 Stück Eier', rowWith(null))).toBeNull();
  });

  it('returns null when no quantity and no defaultAmountG', () => {
    expect(computeIngredientAmountG('Salz', null)).toBeNull();
  });

  it('returns null for non-gram units so conversion can be resolved via parseIngredientAmountG', () => {
    expect(computeIngredientAmountG('2 EL Öl', rowWith(15))).toBeNull();
  });
});

describe('resolveIngredientNutritionByStatus', () => {
  const referenceRow = {
    ingredientID: 'tomate',
    source: 'openfoodfacts',
    status: 'Freigegeben',
    defaultAmountG: null,
    kalorien: 20,
    protein: 1,
    fett: 0.2,
    kohlenhydrate: 4,
    zucker: 2,
    ballaststoffe: 1,
    salz: 0.01,
  };

  const mockParseAmountCallable = jest.fn();
  const mockGenerateNutritionCallable = jest.fn();
  const mockHttpsCallable = (_, name) => {
    if (name === 'parseIngredientAmountG') return mockParseAmountCallable;
    if (name === 'generateNutritionFromReference') return mockGenerateNutritionCallable;
    return jest.fn();
  };
  const mockDoc = jest.fn();
  const mockGetDoc = jest.fn();
  const mockSetDoc = jest.fn();
  const deps = {
    httpsCallable: mockHttpsCallable,
    functions: {},
    db: {},
    doc: mockDoc,
    getDoc: mockGetDoc,
    setDoc: mockSetDoc,
  };

  beforeEach(() => {
    mockParseAmountCallable.mockReset().mockResolvedValue({ data: { amountG: null } });
    mockGenerateNutritionCallable.mockReset().mockResolvedValue({ data: {} });
    mockDoc.mockReset().mockReturnValue('doc-ref');
    mockGetDoc.mockReset().mockResolvedValue({ exists: () => false });
    mockSetDoc.mockReset().mockResolvedValue(undefined);
  });

  it('returns scaled nutrition for status Freigegeben', async () => {
    const ingredient = { text: '500 g Tomaten', ingredientID: 'tomate' };
    const result = await resolveIngredientNutritionByStatus(ingredient, referenceRow, deps);
    expect(result).not.toBeNull();
    expect(result.found).toBe(true);
    expect(result.fromReference).toBe(true);
    expect(result.source).toBe('openfoodfacts');
    expect(result.naehrwerte.kalorien).toBeCloseTo(100);
    expect(result.naehrwerte.protein).toBeCloseTo(5);
    expect(mockGenerateNutritionCallable).not.toHaveBeenCalled();
  });

  it('uses direct reference data for status Prüfung ausstehend with source manual', async () => {
    const manualRow = { ...referenceRow, ingredientID: 'mehl', source: 'manual', status: 'Prüfung ausstehend' };
    const ingredient = { text: '200 g Mehl', ingredientID: 'mehl' };
    const result = await resolveIngredientNutritionByStatus(ingredient, manualRow, deps);
    expect(result).not.toBeNull();
    expect(result.source).toBe('manual');
    expect(result.naehrwerte.kalorien).toBeCloseTo(40);
    expect(mockGenerateNutritionCallable).not.toHaveBeenCalled();
  });

  it('prefers source-specific fields that match the reference source', async () => {
    const ingredient = { text: '100 g Tomaten', ingredientID: 'tomate' };
    const row = {
      ...referenceRow,
      kalorien: 10,
      protein: 0.5,
      kalorien_openfoodfacts: 20,
      protein_openfoodfacts: 1,
      kalorien_ai: 80,
      protein_ai: 8,
      kalorien_manual: 50,
      protein_manual: 5,
    };
    const result = await resolveIngredientNutritionByStatus(ingredient, row, deps);

    expect(result.found).toBe(true);
    expect(result.naehrwerte.kalorien).toBeCloseTo(20);
    expect(result.naehrwerte.protein).toBeCloseTo(1);
  });

  it('falls back to flat fields when no matching source-specific values exist', async () => {
    const ingredient = { text: '100 g Mehl', ingredientID: 'mehl' };
    const manualRow = {
      ...referenceRow,
      ingredientID: 'mehl',
      source: 'manual',
      kalorien: 340,
      protein: 10,
    };
    const result = await resolveIngredientNutritionByStatus(ingredient, manualRow, deps);

    expect(result.found).toBe(true);
    expect(result.naehrwerte.kalorien).toBeCloseTo(340);
    expect(result.naehrwerte.protein).toBeCloseTo(10);
  });

  it('converts non-gram units via parseIngredientAmountG and does not multiply defaultAmountG', async () => {
    mockParseAmountCallable.mockResolvedValue({ data: { amountG: 30 } });
    const row = { ...referenceRow, ingredientID: 'oel', source: 'manual', defaultAmountG: 20 };
    const ingredient = { text: '2 EL Öl', ingredientID: 'oel' };
    const result = await resolveIngredientNutritionByStatus(ingredient, row, deps);
    expect(result).not.toBeNull();
    expect(result.naehrwerte.kalorien).toBeCloseTo(6);
    expect(result.amountG).toBe(30);
    expect(mockParseAmountCallable).toHaveBeenCalledWith({ ingredientText: '2 EL Öl' });
  });

  it('converts 10 ml Cointreau to ~10 g and calculates ~33 kcal despite defaultAmountG', async () => {
    mockParseAmountCallable.mockResolvedValue({ data: { amountG: 10 } });
    const row = { ...referenceRow, ingredientID: 'cointreau', source: 'manual', defaultAmountG: 20, kalorien: 330 };
    const ingredient = { text: '10 ml Cointreau', ingredientID: 'cointreau' };
    const result = await resolveIngredientNutritionByStatus(ingredient, row, deps);

    expect(result.found).toBe(true);
    expect(result.amountG).toBe(10);
    expect(result.naehrwerte.kalorien).toBeCloseTo(33);
  });

  it('uses defaultAmountG only when no quantity is provided', async () => {
    const row = { ...referenceRow, ingredientID: 'cointreau-ohne-menge', source: 'manual', defaultAmountG: 20, kalorien: 330 };
    const ingredient = { text: 'Cointreau', ingredientID: 'cointreau-ohne-menge' };
    const result = await resolveIngredientNutritionByStatus(ingredient, row, deps);

    expect(result.found).toBe(true);
    expect(result.amountG).toBe(20);
    expect(result.naehrwerte.kalorien).toBeCloseTo(66);
    expect(mockParseAmountCallable).not.toHaveBeenCalled();
  });

  it('calls generateNutritionFromReference for status Prüfung ausstehend with ai source and uses refreshed row', async () => {
    mockParseAmountCallable.mockResolvedValue({ data: { amountG: 100 } });
    const aiRow = { ...referenceRow, ingredientID: 'ei', source: 'ai-generiert', status: 'Prüfung ausstehend', defaultAmountG: 50 };
    const refreshed = {
      source: 'openfoodfacts',
      kalorien: 150,
      protein: 12,
      fett: 10,
      kohlenhydrate: 1,
      zucker: 1,
      ballaststoffe: 0,
      salz: 0.2,
    };
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => refreshed,
    });

    const result = await resolveIngredientNutritionByStatus({ text: '2 Stück Eier', ingredientID: 'ei' }, aiRow, deps);

    expect(mockGenerateNutritionCallable).toHaveBeenCalledWith({
      ingredientID: 'ei',
      nutritionFamily: '',
      category: '',
    });
    expect(mockDoc).toHaveBeenCalledWith(deps.db, 'nutritionReferences', 'ei');
    expect(result.found).toBe(true);
    expect(result.source).toBe('openfoodfacts');
    expect(result.naehrwerte.kalorien).toBeCloseTo(150);
  });

  it('writes generated nutrition data back to Firestore and uses result.data.values without Firestore read', async () => {
    const aiRow = {
      ...referenceRow,
      ingredientID: 'lachs',
      source: 'ai-generiert',
      status: 'Datenerfassung ausstehend',
      defaultAmountG: 100,
    };
    const returnedValues = {
      kalorien: 200,
      protein: 20,
      fett: 12,
      kohlenhydrate: 0,
      zucker: 0,
      ballaststoffe: 0,
      salz: 0.3,
    };
    mockGenerateNutritionCallable.mockResolvedValue({ data: { values: returnedValues, searchTerm: 'Lachs', source: 'ai-generiert' } });

    const result = await resolveIngredientNutritionByStatus({ text: '100 g Lachs', ingredientID: 'lachs' }, aiRow, deps);

    expect(mockGenerateNutritionCallable).toHaveBeenCalledWith({
      ingredientID: 'lachs',
      nutritionFamily: '',
      category: '',
    });
    expect(mockSetDoc).toHaveBeenCalledWith(
      'doc-ref',
      {
        source: 'ai-generiert',
        status: 'Prüfung ausstehend',
        searchTerm: 'Lachs',
        ...returnedValues,
        kalorien_ai: 200,
        protein_ai: 20,
        fett_ai: 12,
        kohlenhydrate_ai: 0,
        zucker_ai: 0,
        ballaststoffe_ai: 0,
        salz_ai: 0.3,
        nutritionSetActual: [{
          source: 'ai-generiert',
          kalorien: 200,
          protein: 20,
          fett: 12,
          kohlenhydrate: 0,
          zucker: 0,
          ballaststoffe: 0,
          salz: 0.3,
        }],
        nutritionSetOutdated: [],
        recalc: false,
      },
      { merge: true }
    );
    expect(mockGetDoc).not.toHaveBeenCalled();
    expect(result.found).toBe(true);
    expect(result.source).toBe('ai-generiert');
    expect(result.searchTerm).toBe('Lachs');
    expect(result.naehrwerte.kalorien).toBeCloseTo(200);
    expect(result.naehrwerte.protein).toBeCloseTo(20);
    expect(result.wroteBackReference).toBe(true);
    expect(result.writebackError).toBeNull();
  });

  it('returns generated nutrition even when Firestore writeback fails', async () => {
    const aiRow = {
      ...referenceRow,
      ingredientID: 'tofu',
      source: 'ai-generiert',
      status: 'Datenerfassung ausstehend',
      defaultAmountG: 100,
    };
    const returnedValues = {
      kalorien: 120,
      protein: 13,
      fett: 7,
      kohlenhydrate: 2,
      zucker: 0.5,
      ballaststoffe: 1,
      salz: 0.1,
    };
    mockGenerateNutritionCallable.mockResolvedValue({ data: { values: returnedValues, searchTerm: 'Tofu', source: 'openfoodfacts' } });
    const writebackErr = new Error('permission denied');
    mockSetDoc.mockRejectedValue(writebackErr);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const result = await resolveIngredientNutritionByStatus({ text: '100 g Tofu', ingredientID: 'tofu' }, aiRow, deps);
      expect(mockSetDoc).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('"tofu"'),
        expect.any(Error)
      );
      expect(result.found).toBe(true);
      expect(result.source).toBe('openfoodfacts');
      expect(result.searchTerm).toBe('Tofu');
      expect(result.naehrwerte.kalorien).toBeCloseTo(120);
      // Writeback error is surfaced in the result instead of being silently swallowed
      expect(result.wroteBackReference).toBe(false);
      expect(result.writebackError).toBe(writebackErr);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('returns not found when generated values only contain zeros and refreshed data is also empty', async () => {
    const aiRow = {
      ...referenceRow,
      ingredientID: 'miracle_whip',
      source: 'ai-generiert',
      status: 'Datenerfassung ausstehend',
      defaultAmountG: 100,
    };
    mockGenerateNutritionCallable.mockResolvedValue({
      data: {
        values: {
          kalorien: 0,
          protein: 0,
          fett: 0,
          kohlenhydrate: 0,
          zucker: 0,
          ballaststoffe: 0,
          salz: 0,
        },
        searchTerm: 'Miracle Whip',
        source: 'ai-generiert',
      },
    });
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ source: 'ai-generiert' }),
    });

    const result = await resolveIngredientNutritionByStatus(
      { text: '100 g Miracle Whip', ingredientID: 'miracle_whip' },
      aiRow,
      deps
    );

    expect(mockDoc).toHaveBeenCalledWith(deps.db, 'nutritionReferences', 'miracle_whip');
    expect(result).toEqual({
      found: false,
      error: 'Nährwerte konnten nicht ermittelt werden (Datenerfassung ausstehend)',
    });
  });

  it('returns not found when ingredientID is missing', async () => {
    const result = await resolveIngredientNutritionByStatus({ text: '250 g Tomaten' }, null, deps);
    expect(result).toEqual({ found: false, error: 'Keine ingredientID zugeordnet' });
  });

  it('returns reference nutrition with noAmountG flag when grams cannot be determined', async () => {
    const row = { ...referenceRow, ingredientID: 'ei2', source: 'manual', defaultAmountG: undefined };
    const ingredient = { text: '3 Stück Eier', ingredientID: 'ei2' };
    const result = await resolveIngredientNutritionByStatus(ingredient, row, deps);
    expect(result).toEqual(expect.objectContaining({
      found: false,
      noAmountG: true,
      source: 'manual',
      fromReference: true,
      error: 'Mengenangabe konnte nicht ermittelt werden',
    }));
    expect(result.naehrwerte.kalorien).toBeCloseTo(20);
  });

  it('sets wroteBackReference false and writebackError null when no generation is triggered', async () => {
    const ingredient = { text: '500 g Tomaten', ingredientID: 'tomate' };
    const result = await resolveIngredientNutritionByStatus(ingredient, referenceRow, deps);
    expect(result.found).toBe(true);
    expect(result.wroteBackReference).toBe(false);
    expect(result.writebackError).toBeNull();
  });
});

describe('hasMeaningfulGeneratedNutrition', () => {
  it('returns true when at least one macronutrient field is positive', () => {
    expect(hasMeaningfulGeneratedNutrition({ kalorien: 100, protein: 0, fett: 0, kohlenhydrate: 0 })).toBe(true);
    expect(hasMeaningfulGeneratedNutrition({ kalorien: 0, protein: 5, fett: 0, kohlenhydrate: 0 })).toBe(true);
    expect(hasMeaningfulGeneratedNutrition({ kalorien: 0, protein: 0, fett: 3, kohlenhydrate: 0 })).toBe(true);
    expect(hasMeaningfulGeneratedNutrition({ kalorien: 0, protein: 0, fett: 0, kohlenhydrate: 10 })).toBe(true);
  });

  it('returns false when all macronutrient fields are zero or missing', () => {
    expect(hasMeaningfulGeneratedNutrition({ kalorien: 0, protein: 0, fett: 0, kohlenhydrate: 0 })).toBe(false);
    expect(hasMeaningfulGeneratedNutrition({})).toBe(false);
    expect(hasMeaningfulGeneratedNutrition(null)).toBe(false);
    expect(hasMeaningfulGeneratedNutrition(undefined)).toBe(false);
  });
});

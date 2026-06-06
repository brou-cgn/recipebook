jest.mock('../firebase', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({
  doc: jest.fn((...args) => ({ path: args.slice(1).join('/') })),
  getDoc: jest.fn(async () => ({
    exists: () => false,
    data: () => ({}),
  })),
}));

import {
  getIngredientIdSuggestions,
  parseIngredientNameAndUnit,
  getAutoAssignedIngredients,
  hasMissingIngredientIDs,
  normalizeIngredientNameForIdMatching,
  classifyIngredientWords,
  setCustomIngredientMatchingTerms,
  initializeCommonAdjectivesFromFirebase,
  initializeIgnoredMarkersFromFirebase,
} from './ingredientIdMatching';
import {
  parseNutritionReferencePossibleUnits,
  parseNutritionReferenceSynonyms,
} from './nutritionReferenceUtils';
import { getDoc } from 'firebase/firestore';

const defaultCommonAdjectivesDoc = {
  exists: () => false,
  data: () => ({}),
};

beforeEach(async () => {
  setCustomIngredientMatchingTerms();
  getDoc.mockResolvedValue(defaultCommonAdjectivesDoc);
  await initializeCommonAdjectivesFromFirebase({ forceReload: true });
  await initializeIgnoredMarkersFromFirebase({ forceReload: true });
});

describe('ingredientIdMatching', () => {
  afterEach(() => {
    setCustomIngredientMatchingTerms();
  });

  test('parses ingredient name and unit for matching', () => {
    expect(parseIngredientNameAndUnit('200 g Tomaten')).toEqual({ quantity: 200, name: 'Tomaten', unit: 'g' });
    expect(parseIngredientNameAndUnit('2 Eier')).toEqual({ quantity: 2, name: 'Eier', unit: 'Eier' });
    expect(parseIngredientNameAndUnit('1 Liter Kokosmilch')).toEqual({ quantity: 1, name: 'Kokosmilch', unit: 'Liter' });
    expect(parseIngredientNameAndUnit('1 Esslöffel Fish Sauce')).toEqual({ quantity: 1, name: 'Fish Sauce', unit: 'Esslöffel' });
    expect(parseIngredientNameAndUnit('1 Teelöffel Salz')).toEqual({ quantity: 1, name: 'Salz', unit: 'Teelöffel' });
    expect(parseIngredientNameAndUnit('1 Glas Miracle Whip')).toEqual({ quantity: 1, name: 'Miracle Whip', unit: 'Glas' });
    expect(parseIngredientNameAndUnit('1 Dose Tomaten')).toEqual({ quantity: 1, name: 'Tomaten', unit: 'Dose' });
    // newly recognised units
    expect(parseIngredientNameAndUnit('5 cm Ingwer')).toEqual({ quantity: 5, name: 'Ingwer', unit: 'cm' });
    expect(parseIngredientNameAndUnit('4 Portionen Ramen Nudeln')).toEqual({ quantity: 4, name: 'Ramen Nudeln', unit: 'Portionen' });
    expect(parseIngredientNameAndUnit('1 Beutel Vanillezucker')).toEqual({ quantity: 1, name: 'Vanillezucker', unit: 'Beutel' });
    expect(parseIngredientNameAndUnit('1 Msp Salz')).toEqual({ quantity: 1, name: 'Salz', unit: 'Msp' });
    // ingredient without a recognised unit still has unit: null
    expect(parseIngredientNameAndUnit('Petersilie')).toEqual({ quantity: null, name: 'Petersilie', unit: null });
  });

  test('parses ingredient with adjective between quantity and unit', () => {
    // single adjective before unit (custom adjective)
    setCustomIngredientMatchingTerms({ adjectives: ['gestrichener', 'gehäufte'] });
    expect(parseIngredientNameAndUnit('1 gestrichener Esslöffel Zucker')).toEqual({
      quantity: 1, name: 'Zucker', unit: 'Esslöffel',
    });
    expect(parseIngredientNameAndUnit('2 gehäufte TL Salz')).toEqual({
      quantity: 2, name: 'Salz', unit: 'TL',
    });
    setCustomIngredientMatchingTerms();

    // single adjective before unit (default adjective)
    expect(parseIngredientNameAndUnit('½ großer Teelöffel Zimt')).toEqual({
      quantity: 0.5, name: 'Zimt', unit: 'Teelöffel',
    });

    // multiple adjectives, no unit → name excludes adjectives
    expect(parseIngredientNameAndUnit('3 kleine frische Tomaten')).toEqual({
      quantity: 3, name: 'Tomaten', unit: null,
    });
  });

  test('parses Unicode vulgar fractions as quantity', () => {
    expect(parseIngredientNameAndUnit('½ Teelöffel Koriandersamen')).toEqual({
      quantity: 0.5, name: 'Koriandersamen', unit: 'Teelöffel',
    });
    expect(parseIngredientNameAndUnit('¼ TL Salz')).toEqual({
      quantity: 0.25, name: 'Salz', unit: 'TL',
    });
    expect(parseIngredientNameAndUnit('¾ Tasse Mehl')).toEqual({
      quantity: 0.75, name: 'Mehl', unit: 'Tasse',
    });
    expect(parseIngredientNameAndUnit('⅓ Liter Milch')).toEqual({
      quantity: 1 / 3, name: 'Milch', unit: 'Liter',
    });
  });

  test('handles Unicode fraction directly attached to digit or unit', () => {
    expect(parseIngredientNameAndUnit('1½ TL Salz')).toEqual({
      quantity: 1.5, name: 'Salz', unit: 'TL',
    });
    expect(parseIngredientNameAndUnit('½TL Salz')).toEqual({
      quantity: 0.5, name: 'Salz', unit: 'TL',
    });
  });

  test('returns 100% confidence for exact synonym match', () => {
    const suggestions = getIngredientIdSuggestions('250 g Tomaten', [
      { ingredientID: 'tomate', synonyms: ['Tomaten'] },
      { ingredientID: 'kartoffel', synonyms: ['Kartoffeln'] },
    ]);

    expect(suggestions[0]).toMatchObject({ ingredientID: 'tomate', displayName: 'Tomaten', confidencePercent: 100 });
  });

  test('returns 100% confidence for ingredient with Unicode vulgar fraction', () => {
    const suggestions = getIngredientIdSuggestions('½ Teelöffel Koriandersamen', [
      {
        ingredientID: 'koriandersamen',
        synonyms: ['koriandersamen'],
        possibleUnits: ['tl', 'el', 'g', 'prise', 'Teelöffel'],
      },
    ]);

    expect(suggestions[0]).toMatchObject({
      ingredientID: 'koriandersamen', confidencePercent: 100,
    });
  });

  test('returns 100% confidence for ingredient with ASCII fraction (ensures existing behavior unchanged)', () => {
    const suggestions = getIngredientIdSuggestions('1/2 Teelöffel Koriandersamen', [
      {
        ingredientID: 'koriandersamen',
        synonyms: ['koriandersamen'],
        possibleUnits: ['tl', 'el', 'g', 'prise', 'Teelöffel'],
      },
    ]);

    expect(suggestions[0]).toMatchObject({
      ingredientID: 'koriandersamen', confidencePercent: 100,
    });
  });

  test('returns 100% confidence for exact synonym match with long-form unit', () => {
    const suggestions = getIngredientIdSuggestions('1 Liter Kokosmilch', [
      { ingredientID: 'kokosmilch', synonyms: ['Kokosmilch'] },
    ]);

    expect(suggestions[0]).toMatchObject({ ingredientID: 'kokosmilch', confidencePercent: 100 });
  });

  test('returns 100% confidence for exact synonym match with Glas unit', () => {
    const suggestions = getIngredientIdSuggestions('1 Glas Miracle Whip', [
      { ingredientID: 'miracle_whip', synonyms: ['miracle whip'] },
    ]);

    expect(suggestions[0]).toMatchObject({ ingredientID: 'miracle_whip', confidencePercent: 100 });
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

  test('returns 100% confidence for umlaut ingredient and unit names when normalized synonyms use ae/oe/ue/ss', () => {
    const suggestions = getIngredientIdSuggestions('2 Esslöffel Öl', [
      {
        ingredientID: 'oel',
        synonyms: parseNutritionReferenceSynonyms({ synonyms: 'oel;Öl' }),
        possibleUnits: parseNutritionReferencePossibleUnits({ possibleUnits: 'essloeffel;Esslöffel' }),
      },
    ]);

    expect(suggestions[0]).toMatchObject({ ingredientID: 'oel', confidencePercent: 100 });
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

  test('loads ignored markers from Firebase normalized field', async () => {
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        terms: ['custom', 'ignored'],
        normalizedTerms: ['custom', 'ignored'],
      }),
    });
    await initializeIgnoredMarkersFromFirebase({ forceReload: true });

    expect(normalizeIngredientNameForIdMatching('custom Zwiebel')).toBe('Zwiebel');
    expect(normalizeIngredientNameForIdMatching('ignored Tomaten')).toBe('Tomaten');
  });

  test('applies unit match as tie breaker for close candidates', () => {
    const suggestions = getIngredientIdSuggestions('1 Bund Petersilie', [
      { ingredientID: 'petersilie', synonyms: ['Petersilie'], possibleUnits: ['Bund'] },
      { ingredientID: 'petersilienwurzel', synonyms: ['Petersilienwurzel'], possibleUnits: ['g'] },
    ]);

    expect(suggestions[0]).toMatchObject({ ingredientID: 'petersilie', confidencePercent: 100 });
    expect(suggestions[1].confidencePercent).toBeLessThan(100);
  });

  test('recognizes custom unit from settings', () => {
    setCustomIngredientMatchingTerms({ units: ['Päckchen'] });
    expect(parseIngredientNameAndUnit('1 Päckchen Backpulver')).toEqual({
      quantity: 1,
      name: 'Backpulver',
      unit: 'Päckchen',
    });
  });

  test('returns empty list for unmatched ingredient', () => {
    const suggestions = getIngredientIdSuggestions('Etwas Fantasiezutat', [
      { ingredientID: 'tomate', synonyms: ['Tomate'] },
    ]);
    expect(suggestions).toEqual([]);
  });
});

describe('getAutoAssignedIngredients', () => {
  const referenceRows = [
    { ingredientID: 'tomate', synonyms: ['Tomaten', 'Tomate'] },
    { ingredientID: 'zwiebel', synonyms: ['Zwiebeln', 'Zwiebel'] },
    { ingredientID: 'salz', synonyms: ['Salz'] },
  ];

  test('assigns ingredientID for 100% unique matches', () => {
    const ingredients = [
      { type: 'ingredient', text: '200 g Tomaten' },
      { type: 'ingredient', text: '1 Zwiebel' },
    ];
    const { updatedIngredients, autoAssigned } = getAutoAssignedIngredients(ingredients, referenceRows);
    expect(autoAssigned).toBe(2);
    expect(updatedIngredients[0].ingredientID).toBe('tomate');
    expect(updatedIngredients[1].ingredientID).toBe('zwiebel');
  });

  test('leaves unmatched ingredients unchanged', () => {
    const ingredients = [{ type: 'ingredient', text: '100 g Fantasiezutat' }];
    const { updatedIngredients, autoAssigned } = getAutoAssignedIngredients(ingredients, referenceRows);
    expect(autoAssigned).toBe(0);
    expect(updatedIngredients[0].ingredientID).toBeUndefined();
  });

  test('skips headings', () => {
    const ingredients = [
      { type: 'heading', text: 'Für die Soße' },
      { type: 'ingredient', text: '200 g Tomaten' },
    ];
    const { updatedIngredients, autoAssigned } = getAutoAssignedIngredients(ingredients, referenceRows);
    expect(autoAssigned).toBe(1);
    expect(updatedIngredients[0].type).toBe('heading');
    expect(updatedIngredients[0].ingredientID).toBeUndefined();
  });

  test('skips ingredients with ignoreNutritionCalculation', () => {
    const ingredients = [
      { type: 'ingredient', text: '200 g Tomaten', ignoreNutritionCalculation: true },
    ];
    const { updatedIngredients, autoAssigned } = getAutoAssignedIngredients(ingredients, referenceRows);
    expect(autoAssigned).toBe(0);
    expect(updatedIngredients[0].ingredientID).toBeUndefined();
  });

  test('ignores linked recipe ingredients during auto-assignment', () => {
    const referenceRows = [
      { ingredientID: 'tomate', synonyms: ['Tomaten'] },
    ];
    const ingredients = [
      { type: 'ingredient', text: '#recipe:linked123:Tomatensoße' },
      { type: 'ingredient', text: '200 g Tomaten' },
    ];
    const { updatedIngredients, autoAssigned } = getAutoAssignedIngredients(ingredients, referenceRows);
    expect(autoAssigned).toBe(1);
    expect(updatedIngredients[0]).toEqual({ type: 'ingredient', text: '#recipe:linked123:Tomatensoße' });
    expect(updatedIngredients[1]).toEqual({ type: 'ingredient', text: '200 g Tomaten', ingredientID: 'tomate' });
  });

  test('skips ingredients that already have a valid ingredientID', () => {
    const ingredients = [
      { type: 'ingredient', text: '200 g Tomaten', ingredientID: 'tomate' },
    ];
    const { updatedIngredients, autoAssigned } = getAutoAssignedIngredients(ingredients, referenceRows);
    expect(autoAssigned).toBe(0);
    expect(updatedIngredients[0].ingredientID).toBe('tomate');
  });

  test('returns empty result for empty ingredient list', () => {
    const { updatedIngredients, autoAssigned } = getAutoAssignedIngredients([], referenceRows);
    expect(autoAssigned).toBe(0);
    expect(updatedIngredients).toEqual([]);
  });

  test('handles string ingredients', () => {
    const ingredients = ['200 g Tomaten', '1 Zwiebel'];
    const { updatedIngredients, autoAssigned } = getAutoAssignedIngredients(ingredients, referenceRows);
    expect(autoAssigned).toBe(2);
    expect(updatedIngredients[0]).toEqual({ type: 'ingredient', text: '200 g Tomaten', ingredientID: 'tomate' });
    expect(updatedIngredients[1]).toEqual({ type: 'ingredient', text: '1 Zwiebel', ingredientID: 'zwiebel' });
  });
});

describe('hasMissingIngredientIDs', () => {
  test('returns true when any ingredient lacks an ingredientID', () => {
    const recipe = {
      ingredients: [
        { type: 'ingredient', text: '200 g Tomaten', ingredientID: 'tomate' },
        { type: 'ingredient', text: '1 Zwiebel' },
      ],
    };
    expect(hasMissingIngredientIDs(recipe)).toBe(true);
  });

  test('returns false when all ingredients have ingredientIDs', () => {
    const recipe = {
      ingredients: [
        { type: 'ingredient', text: '200 g Tomaten', ingredientID: 'tomate' },
        { type: 'ingredient', text: '1 Zwiebel', ingredientID: 'zwiebel' },
      ],
    };
    expect(hasMissingIngredientIDs(recipe)).toBe(false);
  });

  test('ignores headings', () => {
    const recipe = {
      ingredients: [
        { type: 'heading', text: 'Für die Soße' },
        { type: 'ingredient', text: '200 g Tomaten', ingredientID: 'tomate' },
      ],
    };
    expect(hasMissingIngredientIDs(recipe)).toBe(false);
  });

  test('ignores ingredients with ignoreNutritionCalculation', () => {
    const recipe = {
      ingredients: [
        { type: 'ingredient', text: '200 g Tomaten', ignoreNutritionCalculation: true },
        { type: 'ingredient', text: '1 Zwiebel', ingredientID: 'zwiebel' },
      ],
    };
    expect(hasMissingIngredientIDs(recipe)).toBe(false);
  });

  test('ignores linked recipe ingredients without ingredientID', () => {
    const recipe = {
      ingredients: [
        { type: 'ingredient', text: '#recipe:linked123:Tomatensoße' },
        { type: 'ingredient', text: '1 Zwiebel', ingredientID: 'zwiebel' },
      ],
    };
    expect(hasMissingIngredientIDs(recipe)).toBe(false);
  });

  test('handles string ingredients without IDs', () => {
    const recipe = { ingredients: ['200 g Tomaten', '1 Zwiebel'] };
    expect(hasMissingIngredientIDs(recipe)).toBe(true);
  });

  test('uses zutaten field when present', () => {
    const recipe = {
      zutaten: [{ type: 'ingredient', text: 'Salz' }],
      ingredients: [{ type: 'ingredient', text: '200 g Tomaten', ingredientID: 'tomate' }],
    };
    expect(hasMissingIngredientIDs(recipe)).toBe(true);
  });

  test('returns false for recipe with no ingredients', () => {
    expect(hasMissingIngredientIDs({ ingredients: [] })).toBe(false);
    expect(hasMissingIngredientIDs({})).toBe(false);
    expect(hasMissingIngredientIDs(null)).toBe(false);
  });
});

describe('normalizeIngredientNameForIdMatching with adjectives', () => {
  afterEach(() => {
    setCustomIngredientMatchingTerms();
  });

  test('removes temperature adjectives', () => {
    expect(normalizeIngredientNameForIdMatching('warme Milch')).toBe('Milch');
    expect(normalizeIngredientNameForIdMatching('kaltes Wasser')).toBe('Wasser');
  });

  test('removes ripeness adjectives', () => {
    expect(normalizeIngredientNameForIdMatching('reife Bananen')).toBe('Bananen');
    expect(normalizeIngredientNameForIdMatching('frische Tomaten')).toBe('Tomaten');
  });

  test('removes size adjectives', () => {
    expect(normalizeIngredientNameForIdMatching('große Zwiebel')).toBe('Zwiebel');
    expect(normalizeIngredientNameForIdMatching('kleine Kartoffeln')).toBe('Kartoffeln');
  });

  test('adjective filtering improves confidence for ingredient ID matching', () => {
    expect(getIngredientIdSuggestions('2 reife Bananen', [
      { ingredientID: 'banane', synonyms: ['Banane', 'Bananen'] },
    ])[0]).toMatchObject({ ingredientID: 'banane', confidencePercent: 100 });

    expect(getIngredientIdSuggestions('200 ml warme Milch', [
      { ingredientID: 'milch', synonyms: ['Milch'] },
    ])[0]).toMatchObject({ ingredientID: 'milch', confidencePercent: 100 });
  });

  test('keeps white adjective variants for ingredient matching', () => {
    expect(normalizeIngredientNameForIdMatching('weißer Reis')).toBe('weißer Reis');
    expect(normalizeIngredientNameForIdMatching('weißes Brot')).toBe('weißes Brot');

    expect(getIngredientIdSuggestions('weißer Reis', [
      { ingredientID: 'weisser_reis', synonyms: ['weißer Reis'] },
    ])[0]).toMatchObject({ ingredientID: 'weisser_reis', confidencePercent: 100 });
  });

  test('does not remove white adjective variants even when configured as custom adjectives', () => {
    setCustomIngredientMatchingTerms({ adjectives: ['weiß', 'weiße', 'weißes', 'weißer'] });
    expect(normalizeIngredientNameForIdMatching('weißer Reis')).toBe('weißer Reis');
    expect(normalizeIngredientNameForIdMatching('weißes Brot')).toBe('weißes Brot');
  });

  test('removes configured custom adjectives', () => {
    setCustomIngredientMatchingTerms({ adjectives: ['gehackte'] });
    expect(normalizeIngredientNameForIdMatching('gehackte Zwiebel')).toBe('Zwiebel');
  });

  test('removes leading and trailing commas after normalization', () => {
    expect(normalizeIngredientNameForIdMatching(',Tomaten')).toBe('Tomaten');
    expect(normalizeIngredientNameForIdMatching('Tomaten,')).toBe('Tomaten');
    expect(normalizeIngredientNameForIdMatching(',Tomaten,')).toBe('Tomaten');
  });

  test('loads adjective base forms from Firebase normalized fields and expands declensions', async () => {
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        normalizedTemperature: ['kalt'],
        normalizedState: ['frisch'],
        normalizedSizing: ['mittel'],
        normalizedProtected: ['weiss'],
      }),
    });
    await initializeCommonAdjectivesFromFirebase({ forceReload: true });

    expect(normalizeIngredientNameForIdMatching('kaltem Wasser')).toBe('Wasser');
    expect(normalizeIngredientNameForIdMatching('frischen Kräutern')).toBe('Kräutern');
    expect(normalizeIngredientNameForIdMatching('mittleren Zwiebeln')).toBe('Zwiebeln');
    expect(normalizeIngredientNameForIdMatching('weißem Reis')).toBe('weißem Reis');
  });

  test('removes former protected adjective when not in normalizedProtected', async () => {
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        normalizedTemperature: [],
        normalizedState: ['weiss'],
        normalizedSizing: [],
        normalizedProtected: [],
      }),
    });
    await initializeCommonAdjectivesFromFirebase({ forceReload: true });

    expect(normalizeIngredientNameForIdMatching('weißem Reis')).toBe('Reis');
  });

  describe('classifyIngredientWords', () => {
    test('classifies basic ingredient with amount, unit and name', () => {
      expect(classifyIngredientWords('200 g Mehl')).toEqual({
        amount: '200',
        unit: 'g',
        ingredientWords: ['Mehl'],
        ignoredWords: [],
      });
    });

    test('classifies ingredient without unit', () => {
      expect(classifyIngredientWords('3 Eier')).toEqual({
        amount: '3',
        unit: 'Eier',
        ingredientWords: ['Eier'],
        ignoredWords: [],
      });
    });

    test('classifies ingredient without amount or unit', () => {
      expect(classifyIngredientWords('Salz')).toEqual({
        amount: null,
        unit: null,
        ingredientWords: ['Salz'],
        ignoredWords: [],
      });
    });

    test('moves adjective words to ignoredWords', () => {
      const result = classifyIngredientWords('2 frische Tomaten');
      expect(result.amount).toBe('2');
      expect(result.unit).toBeNull();
      expect(result.ingredientWords).toContain('Tomaten');
      expect(result.ignoredWords).toContain('frische');
    });

    test('moves IGNORED_INGREDIENT_MARKERS to ignoredWords', () => {
      const result = classifyIngredientWords('3 Tomaten optional');
      expect(result.ingredientWords).toContain('Tomaten');
      expect(result.ignoredWords).toContain('optional');
    });

    test('strips commas from classified ingredient words', () => {
      setCustomIngredientMatchingTerms({ adjectives: ['gewürfelt'] });
      const result = classifyIngredientWords('0.5 rote Zwiebel, gewürfelt');
      expect(result.ingredientWords).toContain('Zwiebel');
      expect(result.ingredientWords).not.toContain('Zwiebel,');
      expect(result.ignoredWords).toContain('gewürfelt');
    });

    test('moves parenthesised segments to ignoredWords', () => {
      const result = classifyIngredientWords('3 Tomaten (gewürfelt)');
      expect(result.ingredientWords).toContain('Tomaten');
      expect(result.ignoredWords).toContain('(gewürfelt)');
      expect(result.ignoredWords).not.toContain('gewürfelt');
    });

    test('handles vulgar fraction amounts', () => {
      const result = classifyIngredientWords('½ TL Salz');
      expect(result.amount).toBe('½');
      expect(result.unit).toBe('TL');
      expect(result.ingredientWords).toContain('Salz');
    });

    test('returns null amount for ingredient without quantity', () => {
      const result = classifyIngredientWords('Petersilie');
      expect(result.amount).toBeNull();
    });

    test('handles empty input', () => {
      expect(classifyIngredientWords('')).toEqual({
        amount: null,
        unit: null,
        ingredientWords: [],
        ignoredWords: [],
      });
      expect(classifyIngredientWords(null)).toEqual({
        amount: null,
        unit: null,
        ingredientWords: [],
        ignoredWords: [],
      });
    });
  });
});

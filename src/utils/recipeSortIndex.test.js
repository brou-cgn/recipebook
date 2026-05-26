import {
  calculateRecipeSortIndex,
  calculateRecipeSortIndexBreakdown,
  getKochabstandsBonus,
  getIngredientSeasonStatus,
  matchIngredientToEntry,
  calculateSaisonBonus,
  SAISON_STATUS,
  SAISON_STATUS_BONUS,
} from './recipeSortIndex';

const NOW = new Date('2026-05-15T12:00:00Z').getTime(); // May = month 5
const CURRENT_MONTH = 5; // May

// --- getKochabstandsBonus ---

describe('getKochabstandsBonus', () => {
  test('returns +10 when never cooked (null)', () => {
    expect(getKochabstandsBonus(null, NOW)).toBe(10);
  });

  test('returns +10 when never cooked (undefined)', () => {
    expect(getKochabstandsBonus(undefined, NOW)).toBe(10);
  });

  test('returns -50 for 0 days (just cooked today)', () => {
    expect(getKochabstandsBonus(NOW, NOW)).toBe(-50);
  });

  test('returns -50 for 3 days ago', () => {
    const threeDaysAgo = NOW - 3 * 24 * 60 * 60 * 1000;
    expect(getKochabstandsBonus(threeDaysAgo, NOW)).toBe(-50);
  });

  test('returns -50 for exactly 7 days ago', () => {
    const sevenDaysAgo = NOW - 7 * 24 * 60 * 60 * 1000;
    expect(getKochabstandsBonus(sevenDaysAgo, NOW)).toBe(-50);
  });

  test('returns -30 for 8 days ago', () => {
    const eightDaysAgo = NOW - 8 * 24 * 60 * 60 * 1000;
    expect(getKochabstandsBonus(eightDaysAgo, NOW)).toBe(-30);
  });

  test('returns -30 for exactly 30 days ago', () => {
    const thirtyDaysAgo = NOW - 30 * 24 * 60 * 60 * 1000;
    expect(getKochabstandsBonus(thirtyDaysAgo, NOW)).toBe(-30);
  });

  test('returns 0 for 31 days ago', () => {
    const thirtyOneDaysAgo = NOW - 31 * 24 * 60 * 60 * 1000;
    expect(getKochabstandsBonus(thirtyOneDaysAgo, NOW)).toBe(0);
  });

  test('returns 0 for exactly 90 days ago', () => {
    const ninetyDaysAgo = NOW - 90 * 24 * 60 * 60 * 1000;
    expect(getKochabstandsBonus(ninetyDaysAgo, NOW)).toBe(0);
  });

  test('returns +10 for 91 days ago', () => {
    const ninetyOneDaysAgo = NOW - 91 * 24 * 60 * 60 * 1000;
    expect(getKochabstandsBonus(ninetyOneDaysAgo, NOW)).toBe(10);
  });

  test('returns +10 for exactly 180 days ago', () => {
    const oneEightyDaysAgo = NOW - 180 * 24 * 60 * 60 * 1000;
    expect(getKochabstandsBonus(oneEightyDaysAgo, NOW)).toBe(10);
  });

  test('returns +20 for 181 days ago', () => {
    const oneEightyOneDaysAgo = NOW - 181 * 24 * 60 * 60 * 1000;
    expect(getKochabstandsBonus(oneEightyOneDaysAgo, NOW)).toBe(20);
  });

  test('returns +20 for very old cook date', () => {
    const veryOld = NOW - 365 * 24 * 60 * 60 * 1000;
    expect(getKochabstandsBonus(veryOld, NOW)).toBe(20);
  });
});

// --- getIngredientSeasonStatus ---

describe('getIngredientSeasonStatus', () => {
  const spargelEntry = {
    id: 'spargel',
    name: 'Spargel',
    mainSeasonMonths: [4, 5, 6],
    secondarySeasonMonths: [3, 7],
    seasonScore: 90,
    isActive: true,
  };

  test('returns HAUPTSAISON when current month is in mainSeasonMonths', () => {
    expect(getIngredientSeasonStatus(spargelEntry, 5)).toBe(SAISON_STATUS.HAUPTSAISON);
  });

  test('returns NEBENSAISON when current month is in secondarySeasonMonths', () => {
    expect(getIngredientSeasonStatus(spargelEntry, 7)).toBe(SAISON_STATUS.NEBENSAISON);
  });

  test('returns BALD when Hauptsaison starts next month', () => {
    // March: Nebensaison, but April is next month and is Hauptsaison
    // Wait, March is actually secondarySeasonMonth. Let's use February instead.
    const entry = { ...spargelEntry, secondarySeasonMonths: [] };
    expect(getIngredientSeasonStatus(entry, 3)).toBe(SAISON_STATUS.BALD); // April is 1 month away
  });

  test('returns BALD when Hauptsaison starts in 2 months', () => {
    const entry = { ...spargelEntry, secondarySeasonMonths: [] };
    expect(getIngredientSeasonStatus(entry, 2)).toBe(SAISON_STATUS.BALD); // April is 2 months away
  });

  test('returns AUSSERHALB when not in any season and not soon', () => {
    expect(getIngredientSeasonStatus(spargelEntry, 11)).toBe(SAISON_STATUS.AUSSERHALB);
  });

  test('handles year wrap-around for BALD check (December → January)', () => {
    const entry = {
      id: 'erdbeer',
      name: 'Erdbeere',
      mainSeasonMonths: [1, 2],
      secondarySeasonMonths: [],
      seasonScore: 80,
      isActive: true,
    };
    expect(getIngredientSeasonStatus(entry, 12)).toBe(SAISON_STATUS.BALD);
  });

  test('handles year wrap-around for BALD check (November → January)', () => {
    const entry = {
      id: 'erdbeer',
      name: 'Erdbeere',
      mainSeasonMonths: [1],
      secondarySeasonMonths: [],
      seasonScore: 80,
      isActive: true,
    };
    expect(getIngredientSeasonStatus(entry, 11)).toBe(SAISON_STATUS.BALD);
  });

  test('returns AUSSERHALB when mainSeasonMonths is empty', () => {
    const entry = { id: 'x', name: 'X', mainSeasonMonths: [], secondarySeasonMonths: [], seasonScore: 50, isActive: true };
    expect(getIngredientSeasonStatus(entry, 5)).toBe(SAISON_STATUS.AUSSERHALB);
  });
});

// --- matchIngredientToEntry ---

describe('matchIngredientToEntry', () => {
  const entry = {
    id: 'kartoffel',
    name: 'Kartoffel',
    synonyms: ['Erdapfel', 'Potato'],
    seasonScore: 70,
    isActive: true,
  };

  test('matches by entry name (case-insensitive)', () => {
    expect(matchIngredientToEntry('500g Kartoffeln', entry)).toBe(true);
  });

  test('matches by entry name (lowercase in text)', () => {
    expect(matchIngredientToEntry('kartoffeln, gewürfelt', entry)).toBe(true);
  });

  test('matches by entry id', () => {
    expect(matchIngredientToEntry('1kg kartoffel', entry)).toBe(true);
  });

  test('matches by synonym', () => {
    expect(matchIngredientToEntry('2 Erdäpfel', entry)).toBe(false); // "Erdapfel" != "Erdäpfel"
    expect(matchIngredientToEntry('2 Erdapfel', entry)).toBe(true);
  });

  test('matches by another synonym', () => {
    expect(matchIngredientToEntry('100g Potato', entry)).toBe(true);
  });

  test('returns false for non-matching ingredient', () => {
    expect(matchIngredientToEntry('200g Karotte', entry)).toBe(false);
  });

  test('returns false for empty ingredient text', () => {
    expect(matchIngredientToEntry('', entry)).toBe(false);
  });

  test('returns false for null ingredient text', () => {
    expect(matchIngredientToEntry(null, entry)).toBe(false);
  });
});

// --- calculateSaisonBonus ---

describe('calculateSaisonBonus', () => {
  const spargelEntry = {
    id: 'spargel',
    name: 'Spargel',
    mainSeasonMonths: [4, 5, 6],
    secondarySeasonMonths: [3, 7],
    seasonScore: 90,
    isActive: true,
  };

  const kartoffelEntry = {
    id: 'kartoffel',
    name: 'Kartoffel',
    mainSeasonMonths: [9, 10, 11],
    secondarySeasonMonths: [8, 12],
    seasonScore: 70,
    isActive: true,
  };

  test('returns 0 when no seasonMatrixEntries provided', () => {
    const recipe = { ingredients: [{ type: 'ingredient', text: '500g Spargel' }] };
    expect(calculateSaisonBonus(recipe, [], CURRENT_MONTH)).toBe(0);
  });

  test('returns 0 when recipe has no ingredients', () => {
    const recipe = { ingredients: [] };
    expect(calculateSaisonBonus(recipe, [spargelEntry], CURRENT_MONTH)).toBe(0);
  });

  test('returns 0 when no ingredients match the matrix', () => {
    const recipe = { ingredients: [{ type: 'ingredient', text: '200g Mehl' }] };
    expect(calculateSaisonBonus(recipe, [spargelEntry], CURRENT_MONTH)).toBe(0);
  });

  test('returns correct bonus for single ingredient in Hauptsaison', () => {
    // May (month 5): Spargel is in Hauptsaison (months 4,5,6)
    // SaisonScore = 90, SaisonStatusBonus = 30
    // SaisonBonus = 30 * (90/100) = 27
    const recipe = { ingredients: [{ type: 'ingredient', text: '500g Spargel' }] };
    expect(calculateSaisonBonus(recipe, [spargelEntry], 5)).toBeCloseTo(27, 5);
  });

  test('returns correct bonus for single ingredient in Nebensaison', () => {
    // July (month 7): Spargel is in Nebensaison
    // SaisonScore = 90, SaisonStatusBonus = 15
    // SaisonBonus = 15 * (90/100) = 13.5
    const recipe = { ingredients: [{ type: 'ingredient', text: '500g Spargel' }] };
    expect(calculateSaisonBonus(recipe, [spargelEntry], 7)).toBeCloseTo(13.5, 5);
  });

  test('returns 0 for ingredient Außerhalb Saison', () => {
    // January (month 1): Spargel is outside season
    // SaisonBonus = 0 * ... = 0
    const recipe = { ingredients: [{ type: 'ingredient', text: '500g Spargel' }] };
    expect(calculateSaisonBonus(recipe, [spargelEntry], 1)).toBe(0);
  });

  test('uses best status when recipe has multiple matched ingredients', () => {
    // May: Spargel=Hauptsaison (30), Kartoffel=Außerhalb (0)
    // Best status = Hauptsaison (30)
    // SaisonScore = (90 + 70) / 2 = 80
    // SaisonBonus = 30 * (80/100) = 24
    const recipe = {
      ingredients: [
        { type: 'ingredient', text: '500g Spargel' },
        { type: 'ingredient', text: '200g Kartoffel' },
      ],
    };
    expect(calculateSaisonBonus(recipe, [spargelEntry, kartoffelEntry], 5)).toBeCloseTo(24, 5);
  });

  test('skips heading items in ingredient list', () => {
    const recipe = {
      ingredients: [
        { type: 'heading', text: 'Für den Salat' },
        { type: 'ingredient', text: '500g Spargel' },
      ],
    };
    expect(calculateSaisonBonus(recipe, [spargelEntry], 5)).toBeCloseTo(27, 5);
  });

  test('handles string ingredients (legacy format)', () => {
    const recipe = { ingredients: ['500g Spargel', '200g Kartoffel'] };
    expect(calculateSaisonBonus(recipe, [spargelEntry, kartoffelEntry], 5)).toBeCloseTo(24, 5);
  });

  test('skips inactive season matrix entries', () => {
    const inactiveEntry = { ...spargelEntry, isActive: false };
    const recipe = { ingredients: [{ type: 'ingredient', text: '500g Spargel' }] };
    expect(calculateSaisonBonus(recipe, [inactiveEntry], 5)).toBe(0);
  });

  test('handles recipe with zutaten field instead of ingredients', () => {
    const recipe = { zutaten: [{ type: 'ingredient', text: '500g Spargel' }] };
    expect(calculateSaisonBonus(recipe, [spargelEntry], 5)).toBeCloseTo(27, 5);
  });

  test('returns BALD bonus when ingredient will be in season next month', () => {
    // March (month 3): Spargel Hauptsaison starts in April (1 month away)
    // But secondarySeasonMonths includes 3, so it would be NEBENSAISON. Use a different entry.
    const entry = { ...spargelEntry, secondarySeasonMonths: [] };
    // Month 3: Not in main (4,5,6) or secondary (). Next month 4 is in main → BALD
    // SaisonStatusBonus = 8, SaisonScore = 90
    // SaisonBonus = 8 * (90/100) = 7.2
    const recipe = { ingredients: [{ type: 'ingredient', text: '500g Spargel' }] };
    expect(calculateSaisonBonus(recipe, [entry], 3)).toBeCloseTo(7.2, 5);
  });
});

// --- calculateRecipeSortIndex ---

describe('calculateRecipeSortIndex', () => {
  const spargelEntry = {
    id: 'spargel',
    name: 'Spargel',
    mainSeasonMonths: [4, 5, 6],
    secondarySeasonMonths: [],
    seasonScore: 100,
    isActive: true,
  };

  const recipe = {
    id: 'r1',
    title: 'Spargelrisotto',
    ingredients: [{ type: 'ingredient', text: '500g Spargel' }],
  };

  test('returns base value of 60 for non-favorite, never cooked, no season data', () => {
    // Base(50) + KochabstandsBonus(nie gekocht=10) + Favorit(0) + Saison(0) = 60
    expect(calculateRecipeSortIndex({ isFavorite: false, lastCookDateMs: null, seasonMatrixEntries: [], recipe: {}, currentMonth: 5, nowMs: NOW })).toBe(60);
  });

  test('returns 85 for favorite, never cooked, no season data', () => {
    // Base(50) + Favorit(25) + Kochabstand(10) + Saison(0) = 85
    expect(calculateRecipeSortIndex({ isFavorite: true, lastCookDateMs: null, seasonMatrixEntries: [], recipe: {}, currentMonth: 5, nowMs: NOW })).toBe(85);
  });

  test('returns correct value with all components', () => {
    // May (month 5): Spargel is Hauptsaison
    // Base(50) + Favorit(25) + Kochabstand(nie=10) + SaisonBonus(30 * 100/100 = 30) = 115
    expect(
      calculateRecipeSortIndex({
        isFavorite: true,
        lastCookDateMs: null,
        seasonMatrixEntries: [spargelEntry],
        recipe,
        currentMonth: 5,
        nowMs: NOW,
      })
    ).toBeCloseTo(115, 5);
  });

  test('applies cook distance penalty', () => {
    // Cooked 3 days ago: KochabstandsBonus = -50
    // Base(50) + Favorit(0) + Kochabstand(-50) + Saison(0) = 0
    const threeDaysAgo = NOW - 3 * 24 * 60 * 60 * 1000;
    expect(
      calculateRecipeSortIndex({ isFavorite: false, lastCookDateMs: threeDaysAgo, seasonMatrixEntries: [], recipe: {}, currentMonth: 5, nowMs: NOW })
    ).toBe(0);
  });

  test('uses defaults when called with no arguments', () => {
    const result = calculateRecipeSortIndex();
    expect(typeof result).toBe('number');
    expect(result).toBeGreaterThanOrEqual(0);
  });

  test('uses current month by default', () => {
    const result = calculateRecipeSortIndex({ isFavorite: false });
    expect(typeof result).toBe('number');
  });

  test('SAISON_STATUS_BONUS values match specification', () => {
    expect(SAISON_STATUS_BONUS.HAUPTSAISON).toBe(30);
    expect(SAISON_STATUS_BONUS.NEBENSAISON).toBe(15);
    expect(SAISON_STATUS_BONUS.BALD).toBe(8);
    expect(SAISON_STATUS_BONUS.AUSSERHALB).toBe(0);
  });
});

describe('calculateRecipeSortIndexBreakdown', () => {
  test('returns transparent breakdown with total index', () => {
    const result = calculateRecipeSortIndexBreakdown({
      isFavorite: true,
      lastCookDateMs: null,
      seasonMatrixEntries: [],
      recipe: {},
      currentMonth: CURRENT_MONTH,
      nowMs: NOW,
    });

    expect(result).toEqual({
      baseValue: 50,
      favoritenBonus: 25,
      kochabstandsBonus: 10,
      saisonBonus: 0,
      saisonBonusIngredient: null,
      totalIndex: 85,
    });
  });

  test('includes season bonus ingredient used for status calculation', () => {
    const spargelEntry = {
      id: 'spargel',
      name: 'Spargel',
      mainSeasonMonths: [4, 5, 6],
      secondarySeasonMonths: [],
      seasonScore: 90,
      isActive: true,
    };
    const kartoffelEntry = {
      id: 'kartoffel',
      name: 'Kartoffel',
      mainSeasonMonths: [9],
      secondarySeasonMonths: [],
      seasonScore: 70,
      isActive: true,
    };
    const recipe = {
      ingredients: [
        { type: 'ingredient', text: '500g Spargel' },
        { type: 'ingredient', text: '200g Kartoffel' },
      ],
    };

    const result = calculateRecipeSortIndexBreakdown({
      isFavorite: false,
      lastCookDateMs: null,
      seasonMatrixEntries: [spargelEntry, kartoffelEntry],
      recipe,
      currentMonth: 5,
      nowMs: NOW,
    });

    expect(result.saisonBonus).toBeCloseTo(24, 5);
    expect(result.saisonBonusIngredient).toBe('Spargel');
  });
});

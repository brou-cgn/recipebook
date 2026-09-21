import {
  LOW_CARB_TAG,
  LOW_CARB_MAX_ENERGY_PERCENT,
  LOW_CARB_MAX_CARBS_PER_PORTION_G,
  LOW_CARB_SKIP_REASON,
  isLowCarb,
  applyLowCarbTag,
  evaluateLowCarbTag,
} from './lowCarb';

/**
 * Builds a recipe whose stored nutrition holds totals for the whole recipe,
 * which is the convention the UI follows.
 */
const recipeWithTotals = (naehrwerte, portionen = 1) => ({
  portionen,
  naehrwerte,
});

describe('isLowCarb - thresholds', () => {
  it('treats the energy share as an exclusive bound', () => {
    // 32.5 g x 4 kcal / 500 kcal = exactly 26 %
    const atBound = isLowCarb(recipeWithTotals({ kalorien: 500, kohlenhydrate: 32.5 }));
    expect(atBound.energyPercent).toBeCloseTo(LOW_CARB_MAX_ENERGY_PERCENT, 10);
    expect(atBound.qualifies).toBe(false);
    expect(atBound.skipped).toBe(false);

    const justUnder = isLowCarb(recipeWithTotals({ kalorien: 500, kohlenhydrate: 32.4 }));
    expect(justUnder.energyPercent).toBeLessThan(LOW_CARB_MAX_ENERGY_PERCENT);
    expect(justUnder.qualifies).toBe(true);
  });

  it('treats the carbohydrate cap as an inclusive bound', () => {
    // 16 % energy share, so only the cap can decide.
    const atCap = isLowCarb(recipeWithTotals({ kalorien: 1000, kohlenhydrate: 40 }));
    expect(atCap.carbsPerPortionG).toBe(LOW_CARB_MAX_CARBS_PER_PORTION_G);
    expect(atCap.qualifies).toBe(true);

    const justOver = isLowCarb(recipeWithTotals({ kalorien: 1000, kohlenhydrate: 40.1 }));
    expect(justOver.carbsPerPortionG).toBeGreaterThan(LOW_CARB_MAX_CARBS_PER_PORTION_G);
    expect(justOver.qualifies).toBe(false);
  });

  it('applies the cap per portion, not per recipe', () => {
    // 120 g across 4 portions is 30 g each - under the cap.
    const perPortion = isLowCarb(recipeWithTotals({ kalorien: 3000, kohlenhydrate: 120 }, 4));
    expect(perPortion.carbsPerPortionG).toBe(30);
    expect(perPortion.qualifies).toBe(true);

    // The very same totals served as one portion blow the cap.
    const single = isLowCarb(recipeWithTotals({ kalorien: 3000, kohlenhydrate: 120 }, 1));
    expect(single.carbsPerPortionG).toBe(120);
    expect(single.qualifies).toBe(false);
  });
});

describe('isLowCarb - the cases that motivated the rules', () => {
  it('rejects the salad on its energy share (150 kcal, 20 g carbs)', () => {
    const result = isLowCarb(recipeWithTotals({ kalorien: 150, kohlenhydrate: 20 }));
    expect(result.energyPercent).toBeCloseTo(53.33, 2);
    expect(result.carbsPerPortionG).toBeLessThanOrEqual(LOW_CARB_MAX_CARBS_PER_PORTION_G);
    expect(result.qualifies).toBe(false);
  });

  it('rejects the fat-rich dish on the 40 g cap (1500 kcal, 70 g carbs)', () => {
    const result = isLowCarb(recipeWithTotals({ kalorien: 1500, kohlenhydrate: 70 }));
    expect(result.energyPercent).toBeCloseTo(18.67, 2);
    expect(result.energyPercent).toBeLessThan(LOW_CARB_MAX_ENERGY_PERCENT);
    expect(result.carbsPerPortionG).toBeGreaterThan(LOW_CARB_MAX_CARBS_PER_PORTION_G);
    expect(result.qualifies).toBe(false);
  });
});

describe('isLowCarb - incomplete nutrition', () => {
  const expectSkipped = (recipe) => {
    const result = isLowCarb(recipe);
    expect(result.skipped).toBe(true);
    expect(result.qualifies).toBe(false);
    expect(result.reason).toBe(LOW_CARB_SKIP_REASON);
    return result;
  };

  it('skips a recipe without calories', () => {
    expectSkipped(recipeWithTotals({ kohlenhydrate: 10 }));
  });

  it('skips a recipe without carbohydrates', () => {
    expectSkipped(recipeWithTotals({ kalorien: 500 }));
  });

  it('skips a recipe with zero calories instead of dividing by it', () => {
    const result = expectSkipped(recipeWithTotals({ kalorien: 0, kohlenhydrate: 10 }));
    expect(result.energyPercent).toBeNull();
  });

  it('skips a recipe with no nutrition record at all', () => {
    expectSkipped({ portionen: 4 });
    expectSkipped({});
    expectSkipped(null);
  });

  it('does not mistake a zero carbohydrate value for a missing one', () => {
    const result = isLowCarb(recipeWithTotals({ kalorien: 500, kohlenhydrate: 0 }));
    expect(result.skipped).toBe(false);
    expect(result.qualifies).toBe(true);
  });
});

describe('isLowCarb - choice of basis', () => {
  it('prefers calcPer100g over the ambiguous top-level fields', () => {
    const result = isLowCarb({
      portionen: 4,
      naehrwerte: {
        // Deliberately contradictory, to prove which pair is read.
        kalorien: 99999,
        kohlenhydrate: 99999,
        calcFinalWeightGrams: 800,
        calcPer100g: { kalorien: 200, kohlenhydrate: 5 },
      },
    });
    expect(result.basisSource).toBe('per100g');
    expect(result.energyPercent).toBeCloseTo(10, 10);
    // 5 g/100 g over 800 g is 40 g total, so 10 g per portion.
    expect(result.carbsPerPortionG).toBeCloseTo(10, 10);
    expect(result.qualifies).toBe(true);
  });

  it('falls back to calcYieldGrams when no final weight was computed', () => {
    const result = isLowCarb({
      portionen: 2,
      naehrwerte: {
        calcYieldGrams: 500,
        calcPer100g: { kalorien: 200, kohlenhydrate: 4 },
      },
    });
    expect(result.basisSource).toBe('per100g');
    expect(result.carbsPerPortionG).toBeCloseTo(10, 10);
  });

  it('falls back to the totals when calcPer100g has no weight to scale by', () => {
    const result = isLowCarb({
      portionen: 1,
      naehrwerte: {
        kalorien: 1000,
        kohlenhydrate: 30,
        calcPer100g: { kalorien: 200, kohlenhydrate: 5 },
      },
    });
    expect(result.basisSource).toBe('total');
    expect(result.carbsPerPortionG).toBe(30);
  });

  it('defaults a missing or unusable portion count to one', () => {
    expect(isLowCarb(recipeWithTotals({ kalorien: 1000, kohlenhydrate: 30 }, 0)).portionen).toBe(1);
    expect(isLowCarb({ naehrwerte: { kalorien: 1000, kohlenhydrate: 30 } }).portionen).toBe(1);
  });
});

describe('applyLowCarbTag', () => {
  it('adds the tag and leaves every other cuisine type alone', () => {
    const result = applyLowCarbTag(['Italienische Küche', 'Vegetarisch'], true);
    expect(result.kulinarik).toEqual(['Italienische Küche', 'Vegetarisch', LOW_CARB_TAG]);
    expect(result.action).toBe('added');
    expect(result.changed).toBe(true);
  });

  it('is idempotent - a second run adds no duplicate', () => {
    const once = applyLowCarbTag(['Vegetarisch'], true);
    const twice = applyLowCarbTag(once.kulinarik, true);
    expect(twice.kulinarik).toEqual(once.kulinarik);
    expect(twice.changed).toBe(false);
    expect(twice.action).toBe('unchanged');
  });

  it('removes the tag from a recipe that no longer qualifies', () => {
    const result = applyLowCarbTag(['Vegetarisch', LOW_CARB_TAG], false);
    expect(result.kulinarik).toEqual(['Vegetarisch']);
    expect(result.action).toBe('removed');
    expect(result.changed).toBe(true);
  });

  it('reports no change for an untagged recipe that does not qualify', () => {
    const result = applyLowCarbTag(['Vegetarisch'], false);
    expect(result.changed).toBe(false);
    expect(result.action).toBe('unchanged');
  });

  it('handles the legacy single-string field', () => {
    const result = applyLowCarbTag('Italienische Küche', true);
    expect(result.kulinarik).toEqual(['Italienische Küche', LOW_CARB_TAG]);
  });

  it('handles a missing field', () => {
    expect(applyLowCarbTag(undefined, true).kulinarik).toEqual([LOW_CARB_TAG]);
    expect(applyLowCarbTag(null, false).changed).toBe(false);
  });

  it('collapses a pre-existing duplicate down to one tag', () => {
    const result = applyLowCarbTag([LOW_CARB_TAG, 'Vegetarisch', 'low carb'], true);
    expect(result.kulinarik).toEqual(['Vegetarisch', LOW_CARB_TAG]);
    expect(result.changed).toBe(true);
  });
});

describe('evaluateLowCarbTag', () => {
  it('reports "added" with the tag list to write', () => {
    const result = evaluateLowCarbTag({
      portionen: 1,
      kulinarik: ['Deutsche Küche'],
      naehrwerte: { kalorien: 1000, kohlenhydrate: 30 },
    });
    expect(result.action).toBe('added');
    expect(result.changed).toBe(true);
    expect(result.kulinarik).toEqual(['Deutsche Küche', LOW_CARB_TAG]);
  });

  it('reports "removed" once a recipe stops qualifying', () => {
    const result = evaluateLowCarbTag({
      portionen: 1,
      kulinarik: ['Deutsche Küche', LOW_CARB_TAG],
      naehrwerte: { kalorien: 150, kohlenhydrate: 20 },
    });
    expect(result.action).toBe('removed');
    expect(result.kulinarik).toEqual(['Deutsche Küche']);
  });

  it('reports "skipped" and no tag list for incomplete nutrition', () => {
    const result = evaluateLowCarbTag({
      portionen: 1,
      kulinarik: ['Deutsche Küche'],
      naehrwerte: { kalorien: 0, kohlenhydrate: 5 },
    });
    expect(result.action).toBe('skipped');
    expect(result.changed).toBe(false);
    expect(result.kulinarik).toBeNull();
  });

  it('leaves a tagged recipe tagged when its nutrition became unreadable', () => {
    const result = evaluateLowCarbTag({
      portionen: 1,
      kulinarik: [LOW_CARB_TAG],
      naehrwerte: { calcError: 'boom' },
    });
    expect(result.action).toBe('skipped');
    expect(result.changed).toBe(false);
  });
});

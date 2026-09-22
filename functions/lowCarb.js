/**
 * Low-carb classification for recipes.
 *
 * Three rules decide, all of them have to hold:
 *   1. the share of energy coming from carbohydrates stays below
 *      LOW_CARB_MAX_ENERGY_PERCENT,
 *   2. a single portion carries at most LOW_CARB_MAX_CARBS_PER_PORTION_G, and
 *   3. the recipe is not a sweet - see the sugar rule below.
 *
 * Rule 1 is a ratio and therefore immune to the question of whether the
 * stored values mean "whole recipe", "per portion" or "per 100 g". Rule 2 is
 * not, which is why resolveNutritionBasis below goes to some length to put
 * both numbers on one defined footing before anything is compared.
 *
 * Rule 3 exists because rules 1 and 2 are blind to a fat-heavy dessert. Cream
 * inflates the energy denominator and pushes the carbohydrate share down, so a
 * sweet clears rule 1 with room to spare while carrying almost nothing but
 * sugar, and clears rule 2 because its carbohydrates are low in absolute terms
 * as well. No threshold on those two catches it; only looking at the sugar
 * does.
 *
 * Mirrored - deliberately - in src/utils/lowCarb.js. The functions/ directory
 * is deployed on its own (see firebase.json), so a require() across into src/
 * would break the deploy. Keep the two files in step; the thresholds and the
 * formula are all they contain.
 */

/** Cuisine tag written to recipes that qualify. */
const LOW_CARB_TAG = 'Low Carb';

/** Upper bound (exclusive) for the share of energy supplied by carbohydrates. */
const LOW_CARB_MAX_ENERGY_PERCENT = 26;

/** Upper bound (inclusive) for carbohydrates in a single portion, in grams. */
const LOW_CARB_MAX_CARBS_PER_PORTION_G = 40;

/**
 * Which carbohydrate figure the rules are measured against.
 * 'brutto' - total carbohydrates as stored (the current setting).
 * 'netto'  - total carbohydrates minus fibre.
 */
const LOW_CARB_CARB_BASIS = 'brutto';

/**
 * Sugar in a single portion, in grams, from which on the share below can
 * disqualify a recipe. Below this amount the share is not consulted at all:
 * a tomato topping carrying two grams of carbohydrate, nearly all of it
 * sugar, is not a sweet.
 */
const LOW_CARB_MAX_SUGAR_PER_PORTION_G = 10;

/**
 * Upper bound (inclusive) for sugar as a share of total carbohydrates, in
 * percent. Measured against the carbohydrates as stored, never against the
 * figure LOW_CARB_CARB_BASIS produces - subtracting fibre from the divisor
 * while leaving the sugar whole would invent shares above 100 %.
 */
const LOW_CARB_MAX_SUGAR_SHARE_PERCENT = 75;

/** Physiological fuel value of one gram of carbohydrate, in kcal. */
const KCAL_PER_CARB_GRAM = 4;

/** Reason logged for recipes that cannot be judged at all. */
const LOW_CARB_SKIP_REASON = 'unvollständige Nährwerte';

/**
 * @param {*} value - Raw field value.
 * @return {number|null} The finite number it represents, or null.
 */
function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'number' ?
    value :
    Number(String(value).replace(',', '.'));
  return Number.isFinite(num) ? num : null;
}

/**
 * @param {*} value - Raw field value.
 * @return {number|null} The number it represents when it is greater than zero.
 */
function toPositiveNumber(value) {
  const num = toFiniteNumber(value);
  return num != null && num > 0 ? num : null;
}

/**
 * Applies LOW_CARB_CARB_BASIS to a pair of carbohydrate and fibre values.
 *
 * @param {number} carbs - Carbohydrates, any consistent unit.
 * @param {*} fibre - Fibre in the same unit, may be missing.
 * @return {number} The carbohydrate figure the rules are measured against.
 */
function applyCarbBasis(carbs, fibre) {
  if (LOW_CARB_CARB_BASIS !== 'netto') return carbs;
  const fibreValue = toFiniteNumber(fibre);
  if (fibreValue == null) return carbs;
  return Math.max(0, carbs - fibreValue);
}

/**
 * Puts calories and carbohydrates on one defined footing.
 *
 * Preferred source is calcPer100g together with a resolvable final weight:
 * that pair is unambiguous, because neither value depends on how the portion
 * count was interpreted when the record was written. Where it is missing the
 * stored top-level fields are used, which by the convention the UI follows
 * (see naehrwertePerPortion in src/utils/nutritionUtils.js) hold totals for
 * the whole recipe.
 *
 * @param {Object|null} naehrwerte - The recipe's stored nutrition record.
 * @return {Object} `{source, kalorien, kohlenhydrate, kohlenhydrateBrutto,
 *   zucker, totalCarbsG, totalSugarG}` - where source is 'per100g' or 'total',
 *   kalorien, kohlenhydrate, kohlenhydrateBrutto and zucker share one unit and
 *   are null when missing, and the two total* figures cover the whole recipe.
 *   kohlenhydrateBrutto is the carbohydrate value before LOW_CARB_CARB_BASIS
 *   is applied; zucker never has fibre subtracted from it.
 */
function resolveNutritionBasis(naehrwerte) {
  const record = naehrwerte && typeof naehrwerte === 'object' ? naehrwerte : {};

  const per100g = record.calcPer100g && typeof record.calcPer100g === 'object' ?
    record.calcPer100g :
    null;
  const finalWeightGrams = toPositiveNumber(
      record.calcFinalWeightGrams != null ?
        record.calcFinalWeightGrams :
        record.calcYieldGrams,
  );

  if (per100g && finalWeightGrams != null) {
    const kcalPer100g = toFiniteNumber(per100g.kalorien);
    const rawCarbsPer100g = toFiniteNumber(per100g.kohlenhydrate);
    if (kcalPer100g != null && rawCarbsPer100g != null) {
      const carbsPer100g = applyCarbBasis(rawCarbsPer100g, per100g.ballaststoffe);
      const sugarPer100g = toFiniteNumber(per100g.zucker);
      return {
        source: 'per100g',
        kalorien: kcalPer100g,
        kohlenhydrate: carbsPer100g,
        kohlenhydrateBrutto: rawCarbsPer100g,
        zucker: sugarPer100g,
        totalCarbsG: (carbsPer100g * finalWeightGrams) / 100,
        totalSugarG: sugarPer100g == null ?
          null :
          (sugarPer100g * finalWeightGrams) / 100,
      };
    }
  }

  const kalorien = toFiniteNumber(record.kalorien);
  const rawCarbs = toFiniteNumber(record.kohlenhydrate);
  const kohlenhydrate = rawCarbs == null ?
    null :
    applyCarbBasis(rawCarbs, record.ballaststoffe);

  const zucker = toFiniteNumber(record.zucker);

  return {
    source: 'total',
    kalorien,
    kohlenhydrate,
    kohlenhydrateBrutto: rawCarbs,
    zucker,
    totalCarbsG: kohlenhydrate,
    totalSugarG: zucker,
  };
}

/**
 * @param {Object|null} recipe - The recipe.
 * @return {number} Portion count, defaulting to 1 as everywhere else.
 */
function resolvePortionen(recipe) {
  return toPositiveNumber(recipe && recipe.portionen) || 1;
}

/**
 * Judges a single recipe against the low-carb rules. Pure - it reads nothing
 * but the object handed to it and writes nothing at all.
 *
 * @param {Object|null} recipe - Recipe document data.
 * @return {Object} `{qualifies, skipped, reason, energyPercent,
 *   carbsPerPortionG, sugarPerPortionG, sugarSharePercent, sugarDisqualifies,
 *   basisSource, portionen}` - the verdict, with the numbers it was reached on
 *   so callers can log them. `skipped` marks a recipe whose nutrition could
 *   not be read at all; the sugar figures are null where no sugar is stored.
 */
function isLowCarb(recipe) {
  const basis = resolveNutritionBasis(recipe && recipe.naehrwerte);
  const portionen = resolvePortionen(recipe);

  const incomplete = {
    qualifies: false,
    skipped: true,
    reason: LOW_CARB_SKIP_REASON,
    energyPercent: null,
    carbsPerPortionG: null,
    sugarPerPortionG: null,
    sugarSharePercent: null,
    sugarDisqualifies: false,
    basisSource: basis.source,
    portionen,
  };

  // No calories, no carbohydrates, or a calorie value of zero leaves nothing
  // to divide by and nothing to judge. Such a recipe is skipped outright - it
  // neither gains nor loses the tag.
  if (basis.kalorien == null || basis.kohlenhydrate == null) return incomplete;
  if (basis.kalorien <= 0) return incomplete;

  const energyPercent =
    ((basis.kohlenhydrate * KCAL_PER_CARB_GRAM) / basis.kalorien) * 100;
  const carbsPerPortionG = basis.totalCarbsG / portionen;

  const sugarPerPortionG =
    basis.totalSugarG == null ? null : basis.totalSugarG / portionen;
  const sugarSharePercent =
    basis.zucker == null ||
    basis.kohlenhydrateBrutto == null ||
    basis.kohlenhydrateBrutto <= 0 ?
      null :
      (basis.zucker / basis.kohlenhydrateBrutto) * 100;

  // A dish whose carbohydrates are essentially sugar, in an amount that
  // matters, is a sweet. Both halves are needed: the share on its own would
  // condemn the tomato topping mentioned above, and the amount on its own
  // would condemn a fruit-bearing salad whose sugar sits inside an otherwise
  // ordinary carbohydrate load. Where no sugar figure is stored the rule
  // simply does not apply - the recipe is then judged on rules 1 and 2, as it
  // was before this rule existed, rather than guessed at.
  const sugarDisqualifies =
    sugarPerPortionG != null &&
    sugarSharePercent != null &&
    sugarPerPortionG > LOW_CARB_MAX_SUGAR_PER_PORTION_G &&
    sugarSharePercent > LOW_CARB_MAX_SUGAR_SHARE_PERCENT;

  const qualifies =
    energyPercent < LOW_CARB_MAX_ENERGY_PERCENT &&
    carbsPerPortionG <= LOW_CARB_MAX_CARBS_PER_PORTION_G &&
    !sugarDisqualifies;

  return {
    qualifies,
    skipped: false,
    reason: null,
    energyPercent,
    carbsPerPortionG,
    sugarPerPortionG,
    sugarSharePercent,
    sugarDisqualifies,
    basisSource: basis.source,
    portionen,
  };
}

/**
 * Normalises the kulinarik field, which is an array of free-text strings but
 * is still a plain string on older recipes.
 *
 * @param {*} kulinarik - Raw field value.
 * @return {string[]} The tags it holds.
 */
function normalizeKulinarik(kulinarik) {
  if (Array.isArray(kulinarik)) {
    return kulinarik
        .filter((entry) => entry !== null && entry !== undefined)
        .map((entry) => String(entry))
        .filter((entry) => entry.trim() !== '');
  }
  if (typeof kulinarik === 'string' && kulinarik.trim() !== '') {
    return [kulinarik];
  }
  return [];
}

/**
 * @param {string} entry - A kulinarik tag.
 * @return {boolean} Whether it is the low-carb tag.
 */
function isLowCarbTag(entry) {
  return entry.trim().toLowerCase() === LOW_CARB_TAG.toLowerCase();
}

/**
 * Adds or removes the low-carb tag, leaving every other tag alone.
 *
 * @param {*} kulinarik - The recipe's current kulinarik field.
 * @param {boolean} qualifies - Whether the recipe meets the rules.
 * @return {{kulinarik: string[], changed: boolean, action: string}} The tag
 *   list as it should be, and whether that differs from what came in.
 */
function applyLowCarbTag(kulinarik, qualifies) {
  const current = normalizeKulinarik(kulinarik);
  const tagCount = current.filter(isLowCarbTag).length;

  if (qualifies) {
    // Already tagged - adding again would be the duplicate entry we must not
    // produce, so nothing happens and nothing gets written.
    if (tagCount === 1) {
      return {kulinarik: current, changed: false, action: 'unchanged'};
    }
    if (tagCount > 1) {
      const deduped = current.filter((entry) => !isLowCarbTag(entry));
      deduped.push(LOW_CARB_TAG);
      return {kulinarik: deduped, changed: true, action: 'unchanged'};
    }
    return {
      kulinarik: [...current, LOW_CARB_TAG],
      changed: true,
      action: 'added',
    };
  }

  if (tagCount === 0) {
    return {kulinarik: current, changed: false, action: 'unchanged'};
  }
  return {
    kulinarik: current.filter((entry) => !isLowCarbTag(entry)),
    changed: true,
    action: 'removed',
  };
}

/**
 * The single entry point recalc and the migration script share: judge the
 * recipe, then work out what its kulinarik field should look like.
 *
 * @param {Object|null} recipe - Recipe document data.
 * @return {Object} Everything isLowCarb returns, plus `action` ('added',
 *   'removed', 'unchanged' or 'skipped'), `changed` and `kulinarik` - the tag
 *   list to write. `changed` is false whenever nothing needs writing, which is
 *   what makes repeated runs idempotent.
 */
function evaluateLowCarbTag(recipe) {
  const evaluation = isLowCarb(recipe);

  if (evaluation.skipped) {
    return {
      ...evaluation,
      action: 'skipped',
      changed: false,
      kulinarik: null,
    };
  }

  const applied = applyLowCarbTag(recipe && recipe.kulinarik, evaluation.qualifies);
  return {
    ...evaluation,
    action: applied.action,
    changed: applied.changed,
    kulinarik: applied.kulinarik,
  };
}

module.exports = {
  LOW_CARB_TAG,
  LOW_CARB_MAX_ENERGY_PERCENT,
  LOW_CARB_MAX_CARBS_PER_PORTION_G,
  LOW_CARB_MAX_SUGAR_PER_PORTION_G,
  LOW_CARB_MAX_SUGAR_SHARE_PERCENT,
  LOW_CARB_CARB_BASIS,
  LOW_CARB_SKIP_REASON,
  KCAL_PER_CARB_GRAM,
  isLowCarb,
  applyLowCarbTag,
  evaluateLowCarbTag,
  normalizeKulinarik,
};

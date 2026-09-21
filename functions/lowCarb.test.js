/* eslint-disable require-jsdoc */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  LOW_CARB_TAG,
  LOW_CARB_MAX_ENERGY_PERCENT,
  LOW_CARB_MAX_CARBS_PER_PORTION_G,
  LOW_CARB_SKIP_REASON,
  isLowCarb,
  applyLowCarbTag,
  evaluateLowCarbTag,
} = require('./lowCarb');

const withTotals = (naehrwerte, portionen = 1) => ({portionen, naehrwerte});

test('energy share is an exclusive bound', () => {
  // 32.5 g x 4 kcal / 500 kcal = exactly 26 %
  const atBound = isLowCarb(withTotals({kalorien: 500, kohlenhydrate: 32.5}));
  assert.equal(Math.round(atBound.energyPercent * 1e9) / 1e9, LOW_CARB_MAX_ENERGY_PERCENT);
  assert.equal(atBound.qualifies, false);
  assert.equal(atBound.skipped, false);

  assert.equal(isLowCarb(withTotals({kalorien: 500, kohlenhydrate: 32.4})).qualifies, true);
});

test('carbohydrate cap is an inclusive bound', () => {
  const atCap = isLowCarb(withTotals({kalorien: 1000, kohlenhydrate: 40}));
  assert.equal(atCap.carbsPerPortionG, LOW_CARB_MAX_CARBS_PER_PORTION_G);
  assert.equal(atCap.qualifies, true);

  assert.equal(isLowCarb(withTotals({kalorien: 1000, kohlenhydrate: 40.1})).qualifies, false);
});

test('the cap applies per portion', () => {
  const result = isLowCarb(withTotals({kalorien: 3000, kohlenhydrate: 120}, 4));
  assert.equal(result.carbsPerPortionG, 30);
  assert.equal(result.qualifies, true);

  assert.equal(isLowCarb(withTotals({kalorien: 3000, kohlenhydrate: 120}, 1)).qualifies, false);
});

test('salad case: 150 kcal, 20 g carbs is not low carb', () => {
  const result = isLowCarb(withTotals({kalorien: 150, kohlenhydrate: 20}));
  assert.ok(result.energyPercent > LOW_CARB_MAX_ENERGY_PERCENT);
  assert.ok(result.carbsPerPortionG <= LOW_CARB_MAX_CARBS_PER_PORTION_G);
  assert.equal(result.qualifies, false);
});

test('fat-rich case: 1500 kcal, 70 g carbs fails on the 40 g cap', () => {
  const result = isLowCarb(withTotals({kalorien: 1500, kohlenhydrate: 70}));
  assert.ok(result.energyPercent < LOW_CARB_MAX_ENERGY_PERCENT);
  assert.ok(result.carbsPerPortionG > LOW_CARB_MAX_CARBS_PER_PORTION_G);
  assert.equal(result.qualifies, false);
});

test('incomplete nutrition is skipped, never guessed at', () => {
  for (const naehrwerte of [
    {kohlenhydrate: 10},
    {kalorien: 500},
    {kalorien: 0, kohlenhydrate: 10},
    {},
    null,
  ]) {
    const result = isLowCarb(withTotals(naehrwerte));
    assert.equal(result.skipped, true, JSON.stringify(naehrwerte));
    assert.equal(result.qualifies, false);
    assert.equal(result.reason, LOW_CARB_SKIP_REASON);
  }
  assert.equal(isLowCarb(null).skipped, true);
});

test('a zero carbohydrate value is a value, not a gap', () => {
  const result = isLowCarb(withTotals({kalorien: 500, kohlenhydrate: 0}));
  assert.equal(result.skipped, false);
  assert.equal(result.qualifies, true);
});

test('calcPer100g wins over the ambiguous top-level fields', () => {
  const result = isLowCarb({
    portionen: 4,
    naehrwerte: {
      kalorien: 99999,
      kohlenhydrate: 99999,
      calcFinalWeightGrams: 800,
      calcPer100g: {kalorien: 200, kohlenhydrate: 5},
    },
  });
  assert.equal(result.basisSource, 'per100g');
  assert.equal(Math.round(result.energyPercent * 1e9) / 1e9, 10);
  assert.equal(Math.round(result.carbsPerPortionG * 1e9) / 1e9, 10);
  assert.equal(result.qualifies, true);
});

test('without a weight to scale by, the totals are used', () => {
  const result = isLowCarb({
    portionen: 1,
    naehrwerte: {
      kalorien: 1000,
      kohlenhydrate: 30,
      calcPer100g: {kalorien: 200, kohlenhydrate: 5},
    },
  });
  assert.equal(result.basisSource, 'total');
  assert.equal(result.carbsPerPortionG, 30);
});

test('tagging adds once, removes once and leaves other types alone', () => {
  const added = applyLowCarbTag(['Italienische Küche', 'Vegetarisch'], true);
  assert.deepEqual(added.kulinarik, ['Italienische Küche', 'Vegetarisch', LOW_CARB_TAG]);
  assert.equal(added.action, 'added');

  const again = applyLowCarbTag(added.kulinarik, true);
  assert.equal(again.changed, false);
  assert.deepEqual(again.kulinarik, added.kulinarik);

  const removed = applyLowCarbTag(added.kulinarik, false);
  assert.deepEqual(removed.kulinarik, ['Italienische Küche', 'Vegetarisch']);
  assert.equal(removed.action, 'removed');
});

test('the legacy single-string kulinarik field is handled', () => {
  assert.deepEqual(
      applyLowCarbTag('Italienische Küche', true).kulinarik,
      ['Italienische Küche', LOW_CARB_TAG],
  );
  assert.equal(applyLowCarbTag('Italienische Küche', false).changed, false);
});

test('evaluateLowCarbTag reports the action the migration log needs', () => {
  assert.equal(evaluateLowCarbTag({
    portionen: 1,
    kulinarik: ['Deutsche Küche'],
    naehrwerte: {kalorien: 1000, kohlenhydrate: 30},
  }).action, 'added');

  assert.equal(evaluateLowCarbTag({
    portionen: 1,
    kulinarik: ['Deutsche Küche', LOW_CARB_TAG],
    naehrwerte: {kalorien: 150, kohlenhydrate: 20},
  }).action, 'removed');

  const skipped = evaluateLowCarbTag({
    portionen: 1,
    kulinarik: [LOW_CARB_TAG],
    naehrwerte: {calcError: 'boom'},
  });
  assert.equal(skipped.action, 'skipped');
  assert.equal(skipped.changed, false);
  assert.equal(skipped.kulinarik, null);
});

// The client cannot import from functions/ (separate deploy unit), so the
// module exists twice on purpose. This guards the one thing that duplication
// costs: the two copies quietly drifting apart.
test('src/utils/lowCarb.js is the same module, module syntax aside', () => {
  const stripExports = (source) => source
      .replace(/^export /gm, '')
      .replace(/module\.exports = \{[\s\S]*?\};\n/, '')
      .replace(/^ \* Mirrored - deliberately -.*$/gm, '')
      .replace(/^ \* (is deployed on its own|would break the deploy|formula are all).*$/gm, '')
      .trim();

  const here = fs.readFileSync(path.join(__dirname, 'lowCarb.js'), 'utf8');
  const there = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'utils', 'lowCarb.js'),
      'utf8',
  );

  assert.equal(
      stripExports(there),
      stripExports(here),
      'functions/lowCarb.js and src/utils/lowCarb.js have drifted apart - ' +
      'change both or neither.',
  );
});

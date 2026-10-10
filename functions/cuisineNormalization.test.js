/* eslint-disable require-jsdoc */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  cuisineKey, matchCuisineType, normalizeCuisines, suggestNewCuisines,
} = require('./cuisineNormalization');

const TYPES = [
  'Deutsche Küche', 'Französische Küche', 'Italienische Küche', 'Österreichische Küche',
  'Schweizer Küche', 'Türkische Küche', 'Chinesische Küche', 'Indische Küche',
  'Japanische Küche', 'Orientalische Küche', 'Thailändische Küche', 'Mexikanische Küche',
  'US-Amerikanische Küche', 'Vegetarisch', 'Vegan', 'Weihnachtliche Küche',
];

test('cuisineKey reduces names to a comparable stem', () => {
  assert.equal(cuisineKey('Deutsche Küche'), 'deutsch');
  assert.equal(cuisineKey('Deutsch'), 'deutsch');
  assert.equal(cuisineKey('US-Amerikanische Küche'), 'usamerikanisch');
  assert.equal(cuisineKey('Weihnachtliche Küche'), 'weihnachtlich');
  assert.equal(cuisineKey('Italian'), 'italienisch');
});

test('short adjective forms map onto the configured "… Küche" type', () => {
  assert.equal(matchCuisineType('Deutsch', TYPES), 'Deutsche Küche');
  assert.equal(matchCuisineType('Italienisch', TYPES), 'Italienische Küche');
  assert.equal(matchCuisineType('italienische', TYPES), 'Italienische Küche');
  assert.equal(matchCuisineType('Französisch', TYPES), 'Französische Küche');
  assert.equal(matchCuisineType('Schweizerisch', TYPES), 'Schweizer Küche');
});

test('English names and partial forms are mapped', () => {
  assert.equal(matchCuisineType('German', TYPES), 'Deutsche Küche');
  assert.equal(matchCuisineType('Thai', TYPES), 'Thailändische Küche');
  assert.equal(matchCuisineType('Amerikanisch', TYPES), 'US-Amerikanische Küche');
  assert.equal(matchCuisineType('American', TYPES), 'US-Amerikanische Küche');
  assert.equal(matchCuisineType('vegetarian', TYPES), 'Vegetarisch');
});

test('exact matches keep the configured spelling', () => {
  assert.equal(matchCuisineType('vegan', TYPES), 'Vegan');
  assert.equal(matchCuisineType('Deutsche Küche', TYPES), 'Deutsche Küche');
});

test('values without a configured counterpart are not matched', () => {
  assert.equal(matchCuisineType('Asiatisch', TYPES), null);
  assert.equal(matchCuisineType('Griechisch', TYPES), null);
  assert.equal(matchCuisineType('', TYPES), null);
  // "Asiatisch" exists only if configured
  assert.equal(matchCuisineType('Asian', [...TYPES, 'Asiatische Küche']), 'Asiatische Küche');
});

test('normalizeCuisines splits, maps, dedupes and drops unknowns', () => {
  assert.deepEqual(
      normalizeCuisines('Italienisch, Vegetarisch', TYPES),
      ['Italienische Küche', 'Vegetarisch'],
  );
  assert.deepEqual(
      normalizeCuisines(['Deutsch', 'Deutsche Küche', 'Asiatisch', ['Vegan']], TYPES),
      ['Deutsche Küche', 'Vegan'],
  );
  assert.deepEqual(normalizeCuisines('Asiatisch', TYPES), []);
  assert.deepEqual(normalizeCuisines(null, TYPES), []);
  assert.deepEqual(normalizeCuisines('Deutsch', []), []);
});

test('suggestNewCuisines offers dropped values in the list style', () => {
  assert.deepEqual(suggestNewCuisines('Griechisch', TYPES), ['Griechische Küche']);
  assert.deepEqual(
      suggestNewCuisines('Italienisch, asiatisch, Asiatische Küche', TYPES),
      ['Asiatische Küche'],
  );
  assert.deepEqual(suggestNewCuisines('Deutsch', TYPES), []);
  assert.deepEqual(suggestNewCuisines(null, TYPES), []);
  // Short-form list: no "Küche" appended
  assert.deepEqual(suggestNewCuisines('Griechisch', ['Italienisch', 'Deutsch']), ['Griechisch']);
});

test('suggestNewCuisines turns "Deutsch" into the long form, but not nouns', () => {
  const longForm = ['Italienische Küche', 'Französische Küche'];
  assert.deepEqual(suggestNewCuisines('Deutsch', longForm), ['Deutsche Küche']);
  assert.deepEqual(suggestNewCuisines('Fisch', longForm), ['Fisch']);
});

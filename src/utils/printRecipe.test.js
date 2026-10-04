import {
  getRecipeImages, formatRecipeDate, buildAuthorDateText, getCuisineList, buildMetadataItems,
  getServingMultiplier, buildIngredientLines, buildStepLines,
} from './printRecipe';

describe('getRecipeImages', () => {
  test('returns [] without recipe or images', () => {
    expect(getRecipeImages(undefined)).toEqual([]);
    expect(getRecipeImages({})).toEqual([]);
  });
  test('falls back to the single image string', () => {
    expect(getRecipeImages({ image: 'a.jpg' })).toEqual([{ url: 'a.jpg', isDefault: true }]);
  });
  test('puts the default image first and keeps the remaining order', () => {
    const urls = getRecipeImages({ images: [{ url: 'a' }, { url: 'b', isDefault: true }, { url: 'c' }] }).map((i) => i.url);
    expect(urls).toEqual(['b', 'a', 'c']);
  });
  test('accepts plain strings and drops entries without url', () => {
    expect(getRecipeImages({ images: ['x.jpg', null, { url: '' }, { url: 'y.jpg' }] }).map((i) => i.url)).toEqual(['x.jpg', 'y.jpg']);
  });
  test('empty images array uses recipe.image', () => {
    expect(getRecipeImages({ images: [], image: 'z.jpg' })).toHaveLength(1);
  });
});

describe('formatRecipeDate / buildAuthorDateText', () => {
  test('handles Firestore timestamps, ISO strings and Dates', () => {
    expect(formatRecipeDate({ toDate: () => new Date(2025, 1, 3) })).toBe('3.2.2025');
    expect(formatRecipeDate('2025-02-03T12:00:00Z')).toMatch(/^3\.2\.2025$/);
    expect(formatRecipeDate(new Date(2025, 11, 24))).toBe('24.12.2025');
  });
  test('invalid values give null', () => {
    expect(formatRecipeDate(null)).toBeNull();
    expect(formatRecipeDate('nope')).toBeNull();
    expect(formatRecipeDate({})).toBeNull();
  });
  test('uses the wording of the detail view', () => {
    const d = new Date(2025, 0, 2);
    expect(buildAuthorDateText('Anna', d)).toBe('Von Anna erstellt am 2.1.2025');
    expect(buildAuthorDateText(null, d)).toBe('Erstellt am 2.1.2025');
    expect(buildAuthorDateText('Anna', null)).toBe('Von Anna');
    expect(buildAuthorDateText(null, null)).toBe('');
  });
});

describe('buildMetadataItems', () => {
  test('cuisine (string or array), time, servings and stars in order', () => {
    const items = buildMetadataItems(
      { kulinarik: ['Italienisch', 'Pasta'], kochdauer: 30, schwierigkeit: 2 },
      { servings: 4, portionLabel: 'Portionen' },
    );
    expect(items.map((i) => i.key)).toEqual(['cuisine', 'time', 'servings', 'difficulty']);
    expect(items[0].text).toBe('Italienisch, Pasta');
    expect(items[1].text).toBe('30 Min.');
    expect(items[2].text).toBe('4 Portionen');
    expect(items[3].text).toBe('★★☆☆☆');
    expect(getCuisineList({ kulinarik: 'Thai' })).toEqual(['Thai']);
  });
  test('omits missing values and clamps stars', () => {
    expect(buildMetadataItems({}, {})).toEqual([]);
    expect(buildMetadataItems({ schwierigkeit: 9 }, {})[0].text).toBe('★★★★★');
    expect(buildMetadataItems({ kochzeit: 15 }, {})[0].text).toBe('15 Min.');
  });
  test('portion label defaults to Portionen', () => {
    expect(buildMetadataItems({}, { servings: 2 })[0].text).toBe('2 Portionen');
  });
});

describe('ingredient and step lines', () => {
  test('multiplier', () => {
    expect(getServingMultiplier({ portionen: 2 }, 4)).toBe(2);
    expect(getServingMultiplier({}, 8)).toBe(2); // default base is 4
    expect(getServingMultiplier({ portionen: 2 }, undefined)).toBe(1);
  });
  test('scales amounts, converts decimals to fractions, keeps headings', () => {
    const lines = buildIngredientLines({
      ingredients: [
        { type: 'heading', text: 'Teig' },
        { type: 'ingredient', text: '200 g Mehl' },
        '1 Ei',
      ],
    }, 2);
    expect(lines).toEqual([
      { type: 'heading', text: 'Teig' },
      { type: 'ingredient', text: '400 g Mehl' },
      { type: 'ingredient', text: '2 Ei' },
    ]);
  });
  test('recipe links print the recipe name with the scaled quantity', () => {
    const lines = buildIngredientLines({ ingredients: ['1 Teil #recipe:abc:Tomatensauce'] }, 2);
    expect(lines[0].text).toBe('2 Teil Tomatensauce');
    expect(buildIngredientLines({ ingredients: ['#recipe:abc:Sauce'] }, 2)[0].text).toBe('Sauce');
  });
  test('missing ingredients/steps give empty lists', () => {
    expect(buildIngredientLines({}, 1)).toEqual([]);
    expect(buildStepLines({})).toEqual([]);
  });
  test('steps are numbered without counting headings', () => {
    expect(buildStepLines({ steps: ['Eins', { type: 'heading', text: 'Soße' }, { type: 'step', text: 'Zwei' }] })).toEqual([
      { type: 'step', text: 'Eins', number: 1 },
      { type: 'heading', text: 'Soße' },
      { type: 'step', text: 'Zwei', number: 2 },
    ]);
  });
});

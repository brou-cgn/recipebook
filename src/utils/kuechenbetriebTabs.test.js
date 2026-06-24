import { getKuechenbetriebFabConfig, KUECHENBETRIEB_TABS } from './kuechenbetriebTabs';

describe('getKuechenbetriebFabConfig', () => {
  test('does not flag present-but-invalid ingredient IDs when nutrition reference rows are empty', () => {
    const config = getKuechenbetriebFabConfig({
      recipes: [
        {
          id: 'recipe-1',
          ingredients: [{ type: 'ingredient', text: '1 Zutat', ingredientID: 'not-in-reference' }],
        },
      ],
      nutritionReferenceRows: [],
      cuisineProposals: [],
    });

    expect(config.hasMissingIngredientIds).toBe(false);
    expect(config.visibleTabs).not.toContain(KUECHENBETRIEB_TABS.MISSING_INGREDIENT_IDS);
  });

  test('flags present-but-invalid ingredient IDs when nutrition reference rows are loaded', () => {
    const config = getKuechenbetriebFabConfig({
      recipes: [
        {
          id: 'recipe-1',
          ingredients: [{ type: 'ingredient', text: '1 Zutat', ingredientID: 'not-in-reference' }],
        },
      ],
      nutritionReferenceRows: [{ ingredientID: 'valid-id' }],
      cuisineProposals: [],
    });

    expect(config.hasMissingIngredientIds).toBe(true);
    expect(config.visibleTabs).toContain(KUECHENBETRIEB_TABS.MISSING_INGREDIENT_IDS);
  });

  test('flags completely empty ingredient IDs regardless of nutrition reference loading state', () => {
    const baseInput = {
      recipes: [
        {
          id: 'recipe-1',
          ingredients: [{ type: 'ingredient', text: '1 Zutat ohne ID' }],
        },
      ],
      cuisineProposals: [],
    };

    const configWithoutReferenceRows = getKuechenbetriebFabConfig({
      ...baseInput,
      nutritionReferenceRows: [],
    });
    const configWithReferenceRows = getKuechenbetriebFabConfig({
      ...baseInput,
      nutritionReferenceRows: [{ ingredientID: 'valid-id' }],
    });

    expect(configWithoutReferenceRows.hasMissingIngredientIds).toBe(true);
    expect(configWithReferenceRows.hasMissingIngredientIds).toBe(true);
  });
});

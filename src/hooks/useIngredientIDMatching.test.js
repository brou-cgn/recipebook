import React, { useEffect } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { setDoc } from 'firebase/firestore';
import { useIngredientIDMatching } from './useIngredientIDMatching';

jest.mock('../firebase', () => ({
  db: { __mock: true },
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn((...parts) => ({ path: parts.join('/') })),
  serverTimestamp: jest.fn(() => 'mock-server-timestamp'),
  setDoc: jest.fn(() => Promise.resolve()),
}));

function HookHarness({ hookArgs, onReady }) {
  const hookValue = useIngredientIDMatching(hookArgs);

  useEffect(() => {
    onReady(hookValue);
  }, [hookValue, onReady]);

  return null;
}

describe('useIngredientIDMatching', () => {
  let hookApi;

  const renderHookHarness = async (hookArgs) => {
    render(
      <HookHarness
        hookArgs={hookArgs}
        onReady={(value) => {
          hookApi = value;
        }}
      />
    );

    await waitFor(() => {
      expect(hookApi).toBeTruthy();
    });
  };

  beforeEach(() => {
    hookApi = null;
    jest.clearAllMocks();
  });

  test('skips recipe links during ingredient ID matching', async () => {
    const persistIngredientIDs = jest.fn(() => Promise.resolve());
    const recipe = {
      id: 'r1',
      ingredients: [
        { type: 'ingredient', text: '#recipe:linked123:Tomatensoße' },
        { type: 'ingredient', text: '200 g Tomaten' },
      ],
    };
    const nutritionReferenceRows = [
      { ingredientID: 'tomate', synonyms: ['Tomaten'] },
    ];

    await renderHookHarness({
      recipe,
      nutritionReferenceRows,
      persistIngredientIDs,
    });

    let result;
    await act(async () => {
      result = await hookApi.ensureIngredientIDsForNutrition();
    });

    expect(result).toBeTruthy();
    expect(result.updatedIngredients[0]).toEqual({ type: 'ingredient', text: '#recipe:linked123:Tomatensoße' });
    expect(result.updatedIngredients[1]).toEqual({ type: 'ingredient', text: '200 g Tomaten', ingredientID: 'tomate' });
    expect(result.matchingLog).toEqual(expect.arrayContaining([
      expect.objectContaining({ ingredient: '#recipe:linked123:Tomatensoße', status: 'recipe-link' }),
    ]));
    expect(hookApi.ingredientMatchDialog).toBeNull();
    expect(persistIngredientIDs).toHaveBeenCalledTimes(1);
  });

  test('does not create nutrition references for recipe-link ingredients', async () => {
    const recipe = {
      id: 'r2',
      ingredients: [
        { type: 'ingredient', text: '#recipe:linked123:Tomatensoße' },
      ],
    };

    await renderHookHarness({
      recipe,
      nutritionReferenceRows: [],
      persistIngredientIDs: jest.fn(() => Promise.resolve()),
    });

    let result;
    await act(async () => {
      result = await hookApi.ensureIngredientIDsForNutrition();
    });

    expect(result).toBeTruthy();
    expect(result.matchingLog).toEqual(expect.arrayContaining([
      expect.objectContaining({ ingredient: '#recipe:linked123:Tomatensoße', status: 'recipe-link' }),
    ]));
    expect(setDoc).not.toHaveBeenCalled();
  });
});

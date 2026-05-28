import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { httpsCallable } from 'firebase/functions';
import NutritionModal, { getRecipeCalcResult, buildNutritionCompositionRows } from './NutritionModal';

jest.mock('firebase/functions', () => ({
  httpsCallable: jest.fn(),
}));

jest.mock('../firebase', () => ({
  functions: {},
}));

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
});

describe('getRecipeCalcResult', () => {
  it('returns null when calc counters are missing', () => {
    expect(getRecipeCalcResult({ naehrwerte: { calcNotIncluded: [{ ingredient: 'x' }] } })).toBeNull();
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
          ingredientDetails: [{ ingredient: 'Linsen', naehrwerte: ingredientNaehrwerte }],
        },
        {},
        ['Salz']
      );

      expect(rows[0]).toEqual(expect.objectContaining({
        ingredient: 'Linsen',
        status: 'Berechnet',
        naehrwerte: ingredientNaehrwerte,
      }));
      expect(rows[1]).toEqual(expect.objectContaining({
        ingredient: 'Salz',
        status: 'Akzeptiert',
        naehrwerte: null,
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
  });
});

describe('NutritionModal auto-calc composition table', () => {
  const COLUMN_INGREDIENT = 0;
  const COLUMN_CALORIES = 2;
  const COLUMN_PROTEIN = 3;
  const COLUMN_STATUS = 6;

  it('captures and persists per-ingredient nutrition values and renders them in composition rows', async () => {
    const recipe = {
      id: 'recipe-1',
      portionen: 1,
      ingredients: ['200 g Reis', 'Salz'],
      naehrwerte: {},
    };
    const onSave = jest.fn().mockResolvedValue(undefined);
    const mockCallable = jest.fn()
      .mockResolvedValueOnce({
        data: {
          naehrwerte: { kalorien: 260, protein: 5.4, fett: 0.6, kohlenhydrate: 56, zucker: 0.2, ballaststoffe: 0.8, salz: 0.01 },
          details: [{ found: true }],
        },
      })
      .mockResolvedValueOnce({
        data: {
          naehrwerte: { kalorien: 0, protein: 0, fett: 0, kohlenhydrate: 0, zucker: 0, ballaststoffe: 0, salz: 0.2 },
          details: [{ found: true }],
        },
      });
    httpsCallable.mockReturnValue(mockCallable);

    render(
      <NutritionModal
        recipe={recipe}
        onClose={jest.fn()}
        onSave={onSave}
        allRecipes={[]}
        currentUser={{ uid: 'u1' }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Automatisch berechnen/i }));

    await waitFor(() => expect(mockCallable).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));

    const finalPayload = onSave.mock.calls[1][0];
    expect(finalPayload.calcIngredientDetails).toEqual([
      { ingredient: '200 g Reis', naehrwerte: { kalorien: 260, protein: 5.4, fett: 0.6, kohlenhydrate: 56, zucker: 0.2, ballaststoffe: 0.8, salz: 0.01 } },
      { ingredient: 'Salz', naehrwerte: { kalorien: 0, protein: 0, fett: 0, kohlenhydrate: 0, zucker: 0, ballaststoffe: 0, salz: 0.2 } },
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Zusammensetzung anzeigen' }));
    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row');

    const reisCells = within(rows[1]).getAllByRole('cell');
    expect(reisCells[COLUMN_INGREDIENT]).toHaveTextContent('200 g Reis');
    expect(reisCells[COLUMN_CALORIES]).toHaveTextContent('260');
    expect(reisCells[COLUMN_PROTEIN]).toHaveTextContent('5.4');
    expect(reisCells[COLUMN_STATUS]).toHaveTextContent('Berechnet');

    const salzCells = within(rows[2]).getAllByRole('cell');
    expect(salzCells[COLUMN_INGREDIENT]).toHaveTextContent('Salz');
    expect(salzCells[COLUMN_CALORIES]).toHaveTextContent('0');
    expect(salzCells[COLUMN_STATUS]).toHaveTextContent('Berechnet');
  });

  it('renders persisted per-ingredient values after reopening and keeps recipe-link rows traceable', () => {
    const recipe = {
      id: 'recipe-2',
      portionen: 1,
      ingredients: ['1 Teil #recipe:abc:Linsen', 'Pfeffer'],
      naehrwerte: {
        calcFoundCount: 1,
        calcTotalCount: 2,
        calcNotIncluded: [{ ingredient: 'Pfeffer', error: 'Nicht gefunden' }],
        calcIngredientDetails: [
          { ingredient: '1 Teil #recipe:abc:Linsen', naehrwerte: { kalorien: 120, protein: 9, fett: 0.8, kohlenhydrate: 18, zucker: 1, ballaststoffe: 4, salz: 0.05 } },
        ],
      },
    };

    render(
      <NutritionModal
        recipe={recipe}
        onClose={jest.fn()}
        onSave={jest.fn().mockResolvedValue(undefined)}
        allRecipes={[]}
        currentUser={{ uid: 'u1' }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Zusammensetzung anzeigen' }));

    const rows = within(screen.getByRole('table')).getAllByRole('row');
    const linkCells = within(rows[1]).getAllByRole('cell');
    expect(linkCells[COLUMN_INGREDIENT]).toHaveTextContent('1 Teil #recipe:abc:Linsen');
    expect(linkCells[1]).toHaveTextContent('Rezeptlink: Linsen');
    expect(linkCells[COLUMN_CALORIES]).toHaveTextContent('120');
    expect(linkCells[COLUMN_STATUS]).toHaveTextContent('Berechnet');

    const missingCells = within(rows[2]).getAllByRole('cell');
    expect(missingCells[COLUMN_INGREDIENT]).toHaveTextContent('Pfeffer');
    expect(missingCells[COLUMN_CALORIES]).toHaveTextContent('—');
    expect(missingCells[COLUMN_STATUS]).toHaveTextContent('Nicht enthalten');
  });
});

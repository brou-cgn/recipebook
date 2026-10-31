import { getRecentlyCookedRecipeIds } from './recipeCookDates';
import { getDocs, limit, orderBy, where } from 'firebase/firestore';

jest.mock('../firebase', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  getDocs: jest.fn(),
  addDoc: jest.fn(),
  onSnapshot: jest.fn(),
  Timestamp: { fromDate: jest.fn() },
  doc: jest.fn(),
  deleteDoc: jest.fn(),
}));

const snapshotOf = (recipeIds) => ({
  docs: recipeIds.map((recipeId) => ({ data: () => ({ recipeId }) })),
});

describe('getRecentlyCookedRecipeIds', () => {
  test('reads a limited, newest-first slice of the user’s cook dates and returns each recipe once', async () => {
    getDocs.mockResolvedValue(snapshotOf(['rotkohl', 'kloesse', 'rotkohl', undefined, 'rouladen']));

    await expect(getRecentlyCookedRecipeIds('user-1')).resolves.toEqual(['rotkohl', 'kloesse', 'rouladen']);
    expect(where).toHaveBeenCalledWith('userId', '==', 'user-1');
    expect(orderBy).toHaveBeenCalledWith('date', 'desc');
    expect(limit).toHaveBeenCalledWith(20);
  });

  test('reads nothing without a user', async () => {
    await expect(getRecentlyCookedRecipeIds(null)).resolves.toEqual([]);
    expect(getDocs).not.toHaveBeenCalled();
  });

  test('returns an empty list when the query fails (e.g. while the index is still building)', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    getDocs.mockRejectedValue(new Error('failed-precondition'));

    await expect(getRecentlyCookedRecipeIds('user-1')).resolves.toEqual([]);
    consoleError.mockRestore();
  });
});

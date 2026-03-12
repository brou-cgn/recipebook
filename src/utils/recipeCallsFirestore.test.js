/**
 * Tests for Recipe Calls Firestore Utilities
 */

// Mock Firebase
jest.mock('../firebase', () => ({
  db: {}
}));

// Mock Firestore functions
const mockAddDoc = jest.fn();
const mockGetDocs = jest.fn();
const mockQuery = jest.fn((...args) => args);
const mockOrderBy = jest.fn((...args) => args);
const mockWhere = jest.fn((...args) => args);
const mockServerTimestamp = jest.fn(() => 'mock-timestamp');

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  addDoc: (...args) => mockAddDoc(...args),
  getDocs: (...args) => mockGetDocs(...args),
  query: (...args) => mockQuery(...args),
  orderBy: (...args) => mockOrderBy(...args),
  where: (...args) => mockWhere(...args),
  serverTimestamp: () => mockServerTimestamp(),
  Timestamp: { fromDate: (date) => ({ toDate: () => date, _isMock: true }) }
}));

import { logRecipeCall, getRecipeCalls, getRecentRecipeCalls } from './recipeCallsFirestore';

const { collection: mockCollection } = jest.requireMock('firebase/firestore');

beforeEach(() => {
  jest.clearAllMocks();
  mockCollection.mockReturnValue('mock-collection-ref');
});

describe('logRecipeCall', () => {
  it('does nothing if user is null', async () => {
    await logRecipeCall(null, { id: 'recipe-1', title: 'Test' });
    expect(mockAddDoc).not.toHaveBeenCalled();
  });

  it('does nothing if user has no id', async () => {
    await logRecipeCall({ vorname: 'Max' }, { id: 'recipe-1', title: 'Test' });
    expect(mockAddDoc).not.toHaveBeenCalled();
  });

  it('does nothing if recipe is null', async () => {
    await logRecipeCall({ id: 'user-1' }, null);
    expect(mockAddDoc).not.toHaveBeenCalled();
  });

  it('does nothing if recipe has no id', async () => {
    await logRecipeCall({ id: 'user-1' }, { title: 'No ID' });
    expect(mockAddDoc).not.toHaveBeenCalled();
  });

  it('logs a recipe call for a registered user', async () => {
    mockAddDoc.mockResolvedValue({ id: 'new-call-id' });
    const user = { id: 'user-1', vorname: 'Max', nachname: 'Mustermann', email: 'max@example.com', isGuest: false };
    const recipe = { id: 'recipe-1', title: 'Spaghetti Bolognese' };

    await logRecipeCall(user, recipe);

    expect(mockAddDoc).toHaveBeenCalledWith(
      'mock-collection-ref',
      expect.objectContaining({
        recipeId: 'recipe-1',
        recipeTitle: 'Spaghetti Bolognese',
        userId: 'user-1',
        userVorname: 'Max',
        userNachname: 'Mustermann',
        userEmail: 'max@example.com',
        isGuest: false
      })
    );
  });

  it('marks guest users correctly', async () => {
    mockAddDoc.mockResolvedValue({ id: 'new-call-id' });
    const user = { id: 'guest-1', vorname: '', nachname: '', email: '', isGuest: true };
    const recipe = { id: 'recipe-2', title: 'Gulasch' };

    await logRecipeCall(user, recipe);

    expect(mockAddDoc).toHaveBeenCalledWith(
      'mock-collection-ref',
      expect.objectContaining({ isGuest: true })
    );
  });

  it('uses empty strings for missing user fields', async () => {
    mockAddDoc.mockResolvedValue({ id: 'new-call-id' });
    const user = { id: 'user-2' };
    const recipe = { id: 'recipe-3', title: 'Kuchen' };

    await logRecipeCall(user, recipe);

    expect(mockAddDoc).toHaveBeenCalledWith(
      'mock-collection-ref',
      expect.objectContaining({
        userVorname: '',
        userNachname: '',
        userEmail: '',
        isGuest: false
      })
    );
  });

  it('uses empty string for missing recipe title', async () => {
    mockAddDoc.mockResolvedValue({ id: 'new-call-id' });
    const user = { id: 'user-3', vorname: 'Anna' };
    const recipe = { id: 'recipe-4' };

    await logRecipeCall(user, recipe);

    expect(mockAddDoc).toHaveBeenCalledWith(
      'mock-collection-ref',
      expect.objectContaining({ recipeTitle: '' })
    );
  });

  it('does not throw if addDoc fails', async () => {
    mockAddDoc.mockRejectedValue(new Error('Firestore error'));
    const user = { id: 'user-1', vorname: 'Max' };
    const recipe = { id: 'recipe-1', title: 'Test' };

    await expect(logRecipeCall(user, recipe)).resolves.toBeUndefined();
  });
});

describe('getRecipeCalls', () => {
  it('returns recipe calls ordered by timestamp', async () => {
    const mockDocs = [
      { id: 'call-1', data: () => ({ recipeId: 'r1', recipeTitle: 'Rezept A', timestamp: 'ts1' }) },
      { id: 'call-2', data: () => ({ recipeId: 'r2', recipeTitle: 'Rezept B', timestamp: 'ts2' }) }
    ];
    mockGetDocs.mockResolvedValue({ docs: mockDocs });

    const result = await getRecipeCalls();

    expect(mockOrderBy).toHaveBeenCalledWith('timestamp', 'desc');
    expect(mockGetDocs).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      { id: 'call-1', recipeId: 'r1', recipeTitle: 'Rezept A', timestamp: 'ts1' },
      { id: 'call-2', recipeId: 'r2', recipeTitle: 'Rezept B', timestamp: 'ts2' }
    ]);
  });

  it('returns an empty array if getDocs fails', async () => {
    mockGetDocs.mockRejectedValue(new Error('Firestore error'));

    const result = await getRecipeCalls();

    expect(result).toEqual([]);
  });

  it('returns an empty array when there are no recipe calls', async () => {
    mockGetDocs.mockResolvedValue({ docs: [] });

    const result = await getRecipeCalls();

    expect(result).toEqual([]);
  });
});

describe('getRecentRecipeCalls', () => {
  it('queries with a where timestamp filter', async () => {
    const mockDocs = [
      { id: 'call-1', data: () => ({ recipeId: 'r1', recipeTitle: 'Rezept A', timestamp: 'ts1' }) }
    ];
    mockGetDocs.mockResolvedValue({ docs: mockDocs });

    const result = await getRecentRecipeCalls(7);

    expect(mockWhere).toHaveBeenCalledWith('timestamp', '>=', expect.anything());
    expect(mockOrderBy).toHaveBeenCalledWith('timestamp', 'desc');
    expect(result).toEqual([
      { id: 'call-1', recipeId: 'r1', recipeTitle: 'Rezept A', timestamp: 'ts1' }
    ]);
  });

  it('returns empty array if getDocs fails', async () => {
    mockGetDocs.mockRejectedValue(new Error('Firestore error'));

    const result = await getRecentRecipeCalls(30);

    expect(result).toEqual([]);
  });

  it('returns empty array when no calls in the time window', async () => {
    mockGetDocs.mockResolvedValue({ docs: [] });

    const result = await getRecentRecipeCalls(30);

    expect(result).toEqual([]);
  });
});

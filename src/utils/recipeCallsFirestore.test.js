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
const mockLimit = jest.fn((...args) => args);
const mockServerTimestamp = jest.fn(() => 'mock-timestamp');

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  addDoc: (...args) => mockAddDoc(...args),
  getDocs: (...args) => mockGetDocs(...args),
  query: (...args) => mockQuery(...args),
  orderBy: (...args) => mockOrderBy(...args),
  where: (...args) => mockWhere(...args),
  limit: (...args) => mockLimit(...args),
  serverTimestamp: () => mockServerTimestamp(),
  Timestamp: { fromDate: (date) => ({ toDate: () => date, _isMock: true }) }
}));

import {
  logRecipeCall,
  getRecipeCalls,
  getRecentRecipeCalls,
  getRecentRecipeViewCounts,
  getRecipeCallDays,
  getRecipeCallAggregates,
  RECIPE_CALLS_LIMIT,
  RECIPE_CALL_DAYS_LIMIT,
  RECIPE_CALL_AGGREGATES_LIMIT
} from './recipeCallsFirestore';

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
        isGuest: false
      })
    );
  });

  it('does not store the e-mail address (recipeCalls is readable by all members)', async () => {
    mockAddDoc.mockResolvedValue({ id: 'new-call-id' });
    const user = { id: 'user-1', vorname: 'Max', email: 'max@example.com' };

    await logRecipeCall(user, { id: 'recipe-1', title: 'Spaghetti Bolognese' });

    expect(mockAddDoc.mock.calls[0][1]).not.toHaveProperty('userEmail');
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
  it('returns recipe calls ordered by timestamp, with an upper bound', async () => {
    const mockDocs = [
      { id: 'call-1', data: () => ({ recipeId: 'r1', recipeTitle: 'Rezept A', timestamp: 'ts1' }) },
      { id: 'call-2', data: () => ({ recipeId: 'r2', recipeTitle: 'Rezept B', timestamp: 'ts2' }) }
    ];
    mockGetDocs.mockResolvedValue({ docs: mockDocs });

    const result = await getRecipeCalls();

    expect(mockCollection).toHaveBeenCalledWith({}, 'recipeCalls');
    expect(mockOrderBy).toHaveBeenCalledWith('timestamp', 'desc');
    expect(mockLimit).toHaveBeenCalledWith(RECIPE_CALLS_LIMIT);
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

describe('getRecipeCallAggregates', () => {
  it('reads the consolidated calls, newest period first, with an upper bound', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [{ id: '2025_u1', data: () => ({ period: '2025', count: 12, recipeCounts: { r1: 12 } }) }]
    });

    const result = await getRecipeCallAggregates();

    expect(mockCollection).toHaveBeenCalledWith({}, 'recipeCallAggregates');
    expect(mockOrderBy).toHaveBeenCalledWith('period', 'desc');
    expect(mockLimit).toHaveBeenCalledWith(RECIPE_CALL_AGGREGATES_LIMIT);
    expect(result).toEqual([{ id: '2025_u1', period: '2025', count: 12, recipeCounts: { r1: 12 } }]);
  });

  it('returns an empty array if getDocs fails', async () => {
    mockGetDocs.mockRejectedValue(new Error('permission-denied'));

    await expect(getRecipeCallAggregates()).resolves.toEqual([]);
  });
});

describe('getRecipeCallDays', () => {
  it('reads the day documents, newest day first, with an upper bound', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [{ id: '2026-11-03', data: () => ({ day: '2026-11-03', count: 1 }) }]
    });

    const result = await getRecipeCallDays();

    expect(mockCollection).toHaveBeenCalledWith({}, 'recipeCallDays');
    expect(mockOrderBy).toHaveBeenCalledWith('day', 'desc');
    expect(mockLimit).toHaveBeenCalledWith(RECIPE_CALL_DAYS_LIMIT);
    expect(result).toEqual([{ id: '2026-11-03', day: '2026-11-03', count: 1 }]);
  });
});

describe('getRecentRecipeViewCounts („Im Trend“)', () => {
  const berlinDay = (date) => date.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-11-17T10:00:00Z') });
    // resetMocks (jest.config.js) entfernt die Implementierung aus der Mock-Fabrik.
    mockQuery.mockImplementation((...args) => args);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('counts raw calls of the window plus the day documents of its older days', async () => {
    mockCollection.mockImplementation((_db, name) => name);
    mockGetDocs.mockImplementation((q) => Promise.resolve(q[0] === 'recipeCalls'
      ? {
        docs: [
          { id: 'c1', data: () => ({ recipeId: 'r1' }) },
          { id: 'c2', data: () => ({ recipeId: 'r1' }) },
          { id: 'c3', data: () => ({ recipeId: 'r2' }) },
          { id: 'c4', data: () => ({}) },
        ]
      }
      : {
        docs: [
          {
            id: '2026-11-01',
            data: () => ({
              day: '2026-11-01',
              users: {
                anna: { count: 3, recipeCounts: { r1: 2, r3: 1 } },
                gaeste: { count: 2, recipeCounts: { r2: 2, kaputt: -1 } },
              },
            }),
          },
          { id: '2026-10-20', data: () => ({ day: '2026-10-20', users: { ben: { count: 1, recipeCounts: { r3: 1 } } } }) },
        ]
      }));

    const counts = await getRecentRecipeViewCounts(30);

    expect(counts).toEqual(new Map([['r1', 4], ['r2', 3], ['r3', 2]]));
    const cutoff = new Date('2026-11-17T10:00:00Z');
    cutoff.setDate(cutoff.getDate() - 30);
    expect(mockWhere).toHaveBeenCalledWith('timestamp', '>=', expect.objectContaining({ _isMock: true }));
    expect(mockWhere).toHaveBeenCalledWith('day', '>=', berlinDay(cutoff));
    expect(mockWhere).toHaveBeenCalledWith('day', '>=', '2026-10-18');
    expect(mockLimit).toHaveBeenCalledWith(RECIPE_CALL_DAYS_LIMIT);
  });

  it('falls back to the raw calls if the day documents cannot be read', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockCollection.mockImplementation((_db, name) => name);
    mockGetDocs.mockImplementation((q) => (q[0] === 'recipeCalls'
      ? Promise.resolve({ docs: [{ id: 'c1', data: () => ({ recipeId: 'r1' }) }] })
      : Promise.reject(new Error('permission-denied'))));

    await expect(getRecentRecipeViewCounts(30)).resolves.toEqual(new Map([['r1', 1]]));
    error.mockRestore();
  });
});

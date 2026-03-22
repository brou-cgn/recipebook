/**
 * Tests for Recipe Swipe Flags Firestore Utilities
 */

// Mock Firebase
jest.mock('../firebase', () => ({
  db: {}
}));

// Mock Firestore functions
const mockSetDoc = jest.fn();
const mockDoc = jest.fn();
const mockTimestampNow = jest.fn();
const mockTimestampFromMillis = jest.fn((ms) => ({ _ms: ms, _isMock: true }));

jest.mock('firebase/firestore', () => ({
  doc: (...args) => mockDoc(...args),
  setDoc: (...args) => mockSetDoc(...args),
  Timestamp: {
    now: () => mockTimestampNow(),
    fromMillis: (ms) => mockTimestampFromMillis(ms),
  },
}));

import { setRecipeSwipeFlag } from './recipeSwipeFlags';

beforeEach(() => {
  jest.clearAllMocks();
  mockDoc.mockReturnValue('mock-doc-ref');
  mockTimestampNow.mockReturnValue('mock-now');
  mockSetDoc.mockResolvedValue(undefined);
});

describe('setRecipeSwipeFlag', () => {
  it('returns false when userId is missing', async () => {
    const result = await setRecipeSwipeFlag('', 'list-1', 'recipe-1', 'geparkt');
    expect(result).toBe(false);
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('returns false when listId is missing', async () => {
    const result = await setRecipeSwipeFlag('user-1', '', 'recipe-1', 'geparkt');
    expect(result).toBe(false);
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('returns false when recipeId is missing', async () => {
    const result = await setRecipeSwipeFlag('user-1', 'list-1', '', 'geparkt');
    expect(result).toBe(false);
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('returns false when flag is missing', async () => {
    const result = await setRecipeSwipeFlag('user-1', 'list-1', 'recipe-1', '');
    expect(result).toBe(false);
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('returns false for an invalid flag value', async () => {
    const result = await setRecipeSwipeFlag('user-1', 'list-1', 'recipe-1', 'invalid');
    expect(result).toBe(false);
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('sets geparkt flag with 30-day expiry', async () => {
    const before = Date.now();
    const result = await setRecipeSwipeFlag('user-1', 'list-1', 'recipe-1', 'geparkt');
    const after = Date.now();

    expect(result).toBe(true);
    expect(mockDoc).toHaveBeenCalledWith(
      {},
      'recipeSwipeFlags',
      'user-1_list-1_recipe-1'
    );

    const [, data] = mockSetDoc.mock.calls[0];
    expect(data.flag).toBe('geparkt');
    expect(data.userId).toBe('user-1');
    expect(data.listId).toBe('list-1');
    expect(data.recipeId).toBe('recipe-1');
    expect(data.createdAt).toBe('mock-now');

    // expiresAt should be ~30 days from now
    const expiresMs = mockTimestampFromMillis.mock.calls[0][0];
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    expect(expiresMs).toBeGreaterThanOrEqual(before + thirtyDays);
    expect(expiresMs).toBeLessThanOrEqual(after + thirtyDays);
  });

  it('sets archiv flag with no expiry (null)', async () => {
    const result = await setRecipeSwipeFlag('user-1', 'list-1', 'recipe-1', 'archiv');

    expect(result).toBe(true);
    const [, data] = mockSetDoc.mock.calls[0];
    expect(data.flag).toBe('archiv');
    expect(data.expiresAt).toBeNull();
  });

  it('sets kandidat flag with 7-day expiry', async () => {
    const before = Date.now();
    const result = await setRecipeSwipeFlag('user-1', 'list-1', 'recipe-1', 'kandidat');
    const after = Date.now();

    expect(result).toBe(true);
    const [, data] = mockSetDoc.mock.calls[0];
    expect(data.flag).toBe('kandidat');

    const expiresMs = mockTimestampFromMillis.mock.calls[0][0];
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    expect(expiresMs).toBeGreaterThanOrEqual(before + sevenDays);
    expect(expiresMs).toBeLessThanOrEqual(after + sevenDays);
  });

  it('uses a deterministic composite document ID (userId_listId_recipeId)', async () => {
    await setRecipeSwipeFlag('user-42', 'list-7', 'recipe-99', 'archiv');

    expect(mockDoc).toHaveBeenCalledWith(
      {},
      'recipeSwipeFlags',
      'user-42_list-7_recipe-99'
    );
  });

  it('overwrites an existing flag by calling setDoc (not addDoc)', async () => {
    await setRecipeSwipeFlag('user-1', 'list-1', 'recipe-1', 'geparkt');
    await setRecipeSwipeFlag('user-1', 'list-1', 'recipe-1', 'archiv');

    // Both calls should target the same document ID
    const firstDocId = mockDoc.mock.calls[0][2];
    const secondDocId = mockDoc.mock.calls[1][2];
    expect(firstDocId).toBe(secondDocId);
    expect(mockSetDoc).toHaveBeenCalledTimes(2);
  });

  it('returns false and does not throw when setDoc fails', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockSetDoc.mockRejectedValue(new Error('Firestore error'));

    const result = await setRecipeSwipeFlag('user-1', 'list-1', 'recipe-1', 'geparkt');

    expect(result).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      'Error setting recipe swipe flag:',
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });
});

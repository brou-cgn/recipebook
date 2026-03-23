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
const mockGetDocs = jest.fn();
const mockCollection = jest.fn();
const mockQuery = jest.fn();
const mockWhere = jest.fn();
const mockTimestampNow = jest.fn();
const mockTimestampFromMillis = jest.fn((ms) => ({ _ms: ms, _isMock: true }));

jest.mock('firebase/firestore', () => ({
  doc: (...args) => mockDoc(...args),
  setDoc: (...args) => mockSetDoc(...args),
  getDocs: (...args) => mockGetDocs(...args),
  collection: (...args) => mockCollection(...args),
  query: (...args) => mockQuery(...args),
  where: (...args) => mockWhere(...args),
  Timestamp: {
    now: () => mockTimestampNow(),
    fromMillis: (ms) => mockTimestampFromMillis(ms),
  },
}));

import { setRecipeSwipeFlag, getActiveSwipeFlags, getAllMembersSwipeFlags, computeGroupRecipeStatus } from './recipeSwipeFlags';

beforeEach(() => {
  jest.clearAllMocks();
  mockDoc.mockReturnValue('mock-doc-ref');
  mockTimestampNow.mockReturnValue('mock-now');
  mockSetDoc.mockResolvedValue(undefined);
  mockGetDocs.mockResolvedValue({ forEach: jest.fn() });
  mockCollection.mockReturnValue('mock-collection-ref');
  mockQuery.mockReturnValue('mock-query-ref');
  mockWhere.mockReturnValue('mock-where-ref');
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

  it('sets geparkt flag with custom validity days', async () => {
    const before = Date.now();
    const result = await setRecipeSwipeFlag('user-1', 'list-1', 'recipe-1', 'geparkt', 14);
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

    // expiresAt should be ~14 days from now
    const expiresMs = mockTimestampFromMillis.mock.calls[0][0];
    const fourteenDays = 14 * 24 * 60 * 60 * 1000;
    expect(expiresMs).toBeGreaterThanOrEqual(before + fourteenDays);
    expect(expiresMs).toBeLessThanOrEqual(after + fourteenDays);
  });

  it('sets geparkt flag with no expiry when validityDays is null', async () => {
    const result = await setRecipeSwipeFlag('user-1', 'list-1', 'recipe-1', 'geparkt', null);

    expect(result).toBe(true);
    const [, data] = mockSetDoc.mock.calls[0];
    expect(data.flag).toBe('geparkt');
    expect(data.expiresAt).toBeNull();
  });

  it('sets geparkt flag with no expiry when validityDays is omitted', async () => {
    const result = await setRecipeSwipeFlag('user-1', 'list-1', 'recipe-1', 'geparkt');

    expect(result).toBe(true);
    const [, data] = mockSetDoc.mock.calls[0];
    expect(data.flag).toBe('geparkt');
    expect(data.expiresAt).toBeNull();
  });

  it('sets archiv flag with no expiry (null) by default', async () => {
    const result = await setRecipeSwipeFlag('user-1', 'list-1', 'recipe-1', 'archiv');

    expect(result).toBe(true);
    const [, data] = mockSetDoc.mock.calls[0];
    expect(data.flag).toBe('archiv');
    expect(data.expiresAt).toBeNull();
  });

  it('sets archiv flag with expiry when validityDays is provided', async () => {
    const before = Date.now();
    const result = await setRecipeSwipeFlag('user-1', 'list-1', 'recipe-1', 'archiv', 30);
    const after = Date.now();

    expect(result).toBe(true);
    const [, data] = mockSetDoc.mock.calls[0];
    expect(data.flag).toBe('archiv');

    const expiresMs = mockTimestampFromMillis.mock.calls[0][0];
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    expect(expiresMs).toBeGreaterThanOrEqual(before + thirtyDays);
    expect(expiresMs).toBeLessThanOrEqual(after + thirtyDays);
  });

  it('sets kandidat flag with custom validity days', async () => {
    const before = Date.now();
    const result = await setRecipeSwipeFlag('user-1', 'list-1', 'recipe-1', 'kandidat', 3);
    const after = Date.now();

    expect(result).toBe(true);
    const [, data] = mockSetDoc.mock.calls[0];
    expect(data.flag).toBe('kandidat');

    const expiresMs = mockTimestampFromMillis.mock.calls[0][0];
    const threeDays = 3 * 24 * 60 * 60 * 1000;
    expect(expiresMs).toBeGreaterThanOrEqual(before + threeDays);
    expect(expiresMs).toBeLessThanOrEqual(after + threeDays);
  });

  it('sets kandidat flag with no expiry when validityDays is null', async () => {
    const result = await setRecipeSwipeFlag('user-1', 'list-1', 'recipe-1', 'kandidat', null);

    expect(result).toBe(true);
    const [, data] = mockSetDoc.mock.calls[0];
    expect(data.flag).toBe('kandidat');
    expect(data.expiresAt).toBeNull();
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
    await setRecipeSwipeFlag('user-1', 'list-1', 'recipe-1', 'geparkt', 14);
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

    const result = await setRecipeSwipeFlag('user-1', 'list-1', 'recipe-1', 'geparkt', 14);

    expect(result).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      'Error setting recipe swipe flag:',
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });
});

describe('getActiveSwipeFlags', () => {
  it('returns empty object when userId is missing', async () => {
    const result = await getActiveSwipeFlags('', 'list-1');
    expect(result).toEqual({});
    expect(mockGetDocs).not.toHaveBeenCalled();
  });

  it('returns empty object when listId is missing', async () => {
    const result = await getActiveSwipeFlags('user-1', '');
    expect(result).toEqual({});
    expect(mockGetDocs).not.toHaveBeenCalled();
  });

  it('returns flags without expiry (permanent) as active', async () => {
    mockGetDocs.mockResolvedValue({
      forEach: (cb) => {
        cb({ data: () => ({ userId: 'user-1', listId: 'list-1', recipeId: 'recipe-1', flag: 'archiv', expiresAt: null }) });
      },
    });

    const result = await getActiveSwipeFlags('user-1', 'list-1');
    expect(result).toEqual({ 'recipe-1': 'archiv' });
  });

  it('returns flags with future expiresAt as active', async () => {
    const futureMs = Date.now() + 7 * 24 * 60 * 60 * 1000;
    mockGetDocs.mockResolvedValue({
      forEach: (cb) => {
        cb({ data: () => ({ userId: 'user-1', listId: 'list-1', recipeId: 'recipe-2', flag: 'kandidat', expiresAt: { toMillis: () => futureMs } }) });
      },
    });

    const result = await getActiveSwipeFlags('user-1', 'list-1');
    expect(result).toEqual({ 'recipe-2': 'kandidat' });
  });

  it('excludes flags with past expiresAt (expired)', async () => {
    const pastMs = Date.now() - 1000;
    mockGetDocs.mockResolvedValue({
      forEach: (cb) => {
        cb({ data: () => ({ userId: 'user-1', listId: 'list-1', recipeId: 'recipe-3', flag: 'geparkt', expiresAt: { toMillis: () => pastMs } }) });
      },
    });

    const result = await getActiveSwipeFlags('user-1', 'list-1');
    expect(result).toEqual({});
  });

  it('returns empty object and logs error when getDocs fails', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetDocs.mockRejectedValue(new Error('Firestore error'));

    const result = await getActiveSwipeFlags('user-1', 'list-1');
    expect(result).toEqual({});
    expect(consoleSpy).toHaveBeenCalledWith(
      'Error loading active swipe flags:',
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });
});

describe('getAllMembersSwipeFlags', () => {
  it('returns empty object when listId is missing', async () => {
    const result = await getAllMembersSwipeFlags('', ['user-1', 'user-2']);
    expect(result).toEqual({});
    expect(mockGetDocs).not.toHaveBeenCalled();
  });

  it('returns empty object when memberIds is empty', async () => {
    const result = await getAllMembersSwipeFlags('list-1', []);
    expect(result).toEqual({});
    expect(mockGetDocs).not.toHaveBeenCalled();
  });

  it('uses a single query by listId to fetch all members flags at once', async () => {
    mockGetDocs.mockResolvedValueOnce({ forEach: jest.fn() });
    await getAllMembersSwipeFlags('list-1', ['user-1', 'user-2']);
    expect(mockGetDocs).toHaveBeenCalledTimes(1);
  });

  it('returns flags per userId for all members', async () => {
    mockGetDocs.mockResolvedValueOnce({
      forEach: (cb) => {
        cb({ data: () => ({ userId: 'user-1', listId: 'list-1', recipeId: 'recipe-1', flag: 'kandidat', expiresAt: null }) });
        cb({ data: () => ({ userId: 'user-2', listId: 'list-1', recipeId: 'recipe-1', flag: 'archiv', expiresAt: null }) });
      },
    });

    const result = await getAllMembersSwipeFlags('list-1', ['user-1', 'user-2']);
    expect(result).toEqual({
      'user-1': { 'recipe-1': 'kandidat' },
      'user-2': { 'recipe-1': 'archiv' },
    });
  });

  it('returns empty flags map for a member with no swipes', async () => {
    mockGetDocs.mockResolvedValueOnce({ forEach: jest.fn() });

    const result = await getAllMembersSwipeFlags('list-1', ['user-1', 'user-2']);
    expect(result).toEqual({ 'user-1': {}, 'user-2': {} });
  });

  it('ignores flags from users not in the memberIds list', async () => {
    mockGetDocs.mockResolvedValueOnce({
      forEach: (cb) => {
        cb({ data: () => ({ userId: 'user-3', listId: 'list-1', recipeId: 'recipe-1', flag: 'kandidat', expiresAt: null }) });
      },
    });

    const result = await getAllMembersSwipeFlags('list-1', ['user-1', 'user-2']);
    expect(result).toEqual({ 'user-1': {}, 'user-2': {} });
  });

  it('excludes expired flags', async () => {
    const pastMs = Date.now() - 1000;
    mockGetDocs.mockResolvedValueOnce({
      forEach: (cb) => {
        cb({ data: () => ({ userId: 'user-1', listId: 'list-1', recipeId: 'recipe-1', flag: 'kandidat', expiresAt: { toMillis: () => pastMs } }) });
      },
    });

    const result = await getAllMembersSwipeFlags('list-1', ['user-1']);
    expect(result).toEqual({ 'user-1': {} });
  });

  it('returns empty object and logs error when getDocs fails', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetDocs.mockRejectedValue(new Error('Firestore error'));

    const result = await getAllMembersSwipeFlags('list-1', ['user-1', 'user-2']);
    expect(result).toEqual({});
    expect(consoleSpy).toHaveBeenCalledWith(
      'Error loading all members swipe flags:',
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });
});

describe('computeGroupRecipeStatus', () => {
  const defaultThresholds = {
    groupThresholdKandidatMinKandidat: 50,
    groupThresholdKandidatMaxArchiv: 50,
    groupThresholdArchivMinArchiv: 50,
    groupThresholdArchivMaxKandidat: 50,
  };

  it('returns null when memberIds is empty', () => {
    const result = computeGroupRecipeStatus([], {}, 'recipe-1', defaultThresholds);
    expect(result).toBeNull();
  });

  it('treats missing swipe as kandidat', () => {
    // Single member, no swipe → treated as kandidat → 100% kandidat, 0% archiv → Kandidat
    const result = computeGroupRecipeStatus(['user-1'], {}, 'recipe-1', defaultThresholds);
    expect(result).toBe('kandidat');
  });

  it('returns kandidat when all members voted kandidat', () => {
    const allMembersFlags = {
      'user-1': { 'recipe-1': 'kandidat' },
      'user-2': { 'recipe-1': 'kandidat' },
    };
    const result = computeGroupRecipeStatus(['user-1', 'user-2'], allMembersFlags, 'recipe-1', defaultThresholds);
    expect(result).toBe('kandidat');
  });

  it('returns archiv when all members voted archiv', () => {
    const allMembersFlags = {
      'user-1': { 'recipe-1': 'archiv' },
      'user-2': { 'recipe-1': 'archiv' },
    };
    const result = computeGroupRecipeStatus(['user-1', 'user-2'], allMembersFlags, 'recipe-1', defaultThresholds);
    expect(result).toBe('archiv');
  });

  it('returns null when votes are split equally (neither threshold met)', () => {
    // 50% kandidat, 50% archiv with max archiv for kandidat = 50%: borderline case, archiv% = 50 <= 50 AND kandidat% = 50 >= 50 → kandidat
    const allMembersFlags = {
      'user-1': { 'recipe-1': 'kandidat' },
      'user-2': { 'recipe-1': 'archiv' },
    };
    // With custom thresholds where max archiv for kandidat is 30%: 50% archiv > 30% → not kandidat, 50% archiv >= 50% AND 50% kandidat > 50% maxKandidat → not archiv
    const strictThresholds = {
      groupThresholdKandidatMinKandidat: 70,
      groupThresholdKandidatMaxArchiv: 30,
      groupThresholdArchivMinArchiv: 70,
      groupThresholdArchivMaxKandidat: 30,
    };
    const result = computeGroupRecipeStatus(['user-1', 'user-2'], allMembersFlags, 'recipe-1', strictThresholds);
    expect(result).toBeNull();
  });

  it('uses default thresholds when thresholds param is missing', () => {
    const allMembersFlags = {
      'user-1': { 'recipe-1': 'kandidat' },
    };
    // No thresholds passed – should fall back to defaults (50/50/50/50)
    const result = computeGroupRecipeStatus(['user-1'], allMembersFlags, 'recipe-1', null);
    expect(result).toBe('kandidat');
  });

  it('geparkt votes are neither kandidat nor archiv and reduce the effective pool', () => {
    // 1 kandidat, 1 geparkt, 1 archiv → 33% kandidat, 33% archiv
    // With default 50% thresholds: neither 33% >= 50% (kandidat min) nor 33% >= 50% (archiv min)
    const allMembersFlags = {
      'user-1': { 'recipe-1': 'kandidat' },
      'user-2': { 'recipe-1': 'geparkt' },
      'user-3': { 'recipe-1': 'archiv' },
    };
    const result = computeGroupRecipeStatus(
      ['user-1', 'user-2', 'user-3'],
      allMembersFlags,
      'recipe-1',
      defaultThresholds
    );
    expect(result).toBeNull();
  });
});

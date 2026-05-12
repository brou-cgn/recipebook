/**
 * Tests for Recipe Swipe Flags Firestore Utilities
 */

const RECIPE_SWIPE_FLAGS_COLLECTION = 'recipeSwipeFlags';

// Mock Firebase
jest.mock('../firebase', () => ({
  db: {}
}));

// Mock Firestore functions
const mockSetDoc = jest.fn();
const mockUpdateDoc = jest.fn();
const mockDoc = jest.fn();
const mockGetDoc = jest.fn();
const mockGetDocs = jest.fn();
const mockCollection = jest.fn();
const mockQuery = jest.fn();
const mockWhere = jest.fn();
const mockTimestampNow = jest.fn();
const mockTimestampFromMillis = jest.fn((ms) => ({ _ms: ms, _isMock: true }));

jest.mock('firebase/firestore', () => ({
  doc: (...args) => mockDoc(...args),
  setDoc: (...args) => mockSetDoc(...args),
  updateDoc: (...args) => mockUpdateDoc(...args),
  getDoc: (...args) => mockGetDoc(...args),
  getDocs: (...args) => mockGetDocs(...args),
  collection: (...args) => mockCollection(...args),
  query: (...args) => mockQuery(...args),
  where: (...args) => mockWhere(...args),
  Timestamp: {
    now: () => mockTimestampNow(),
    fromMillis: (ms) => mockTimestampFromMillis(ms),
  },
}));

import {
  setRecipeSwipeFlag,
  getActiveSwipeFlags,
  getAllMembersSwipeFlags,
  computeGroupRecipeStatus,
  computeCalculatedRecipeSwipeFlag,
  recalculateCalculatedFlagForRecipeInList,
  clearExpiryForArchivedRecipe,
  archiveRecipeForAllUsersInList,
  parkAllRecipeSwipeFlagsForRecipeInList,
} from './recipeSwipeFlags';

beforeEach(() => {
  jest.clearAllMocks();
  mockDoc.mockReturnValue('mock-doc-ref');
  mockTimestampNow.mockReturnValue('mock-now');
  mockSetDoc.mockResolvedValue(undefined);
  mockUpdateDoc.mockResolvedValue(undefined);
  mockGetDoc.mockResolvedValue({
    exists: () => false,
    data: () => ({}),
  });
  mockGetDocs.mockResolvedValue({ forEach: jest.fn() });
  mockCollection.mockReturnValue('mock-collection-ref');
  mockQuery.mockReturnValue('mock-query-ref');
  mockWhere.mockReturnValue('mock-where-ref');
  mockTimestampFromMillis.mockImplementation((ms) => ({ _ms: ms, _isMock: true }));
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
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ ownerId: 'user-1', memberIds: ['user-2'] }),
    });
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
    expect(data.calculatedFlag).toBe('kandidat');
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
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ ownerId: 'user-1', memberIds: ['user-2'] }),
    });
    const result = await setRecipeSwipeFlag('user-1', 'list-1', 'recipe-1', 'geparkt', null);

    expect(result).toBe(true);
    const [, data] = mockSetDoc.mock.calls[0];
    expect(data.flag).toBe('geparkt');
    expect(data.calculatedFlag).toBe('kandidat');
    expect(data.expiresAt).toBeNull();
  });

  it('sets geparkt flag with no expiry when validityDays is omitted', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ ownerId: 'user-1', memberIds: ['user-2'] }),
    });
    const result = await setRecipeSwipeFlag('user-1', 'list-1', 'recipe-1', 'geparkt');

    expect(result).toBe(true);
    const [, data] = mockSetDoc.mock.calls[0];
    expect(data.flag).toBe('geparkt');
    expect(data.calculatedFlag).toBe('kandidat');
    expect(data.expiresAt).toBeNull();
  });

  it('sets archiv flag with no expiry (null) by default', async () => {
    const result = await setRecipeSwipeFlag('user-1', 'list-1', 'recipe-1', 'archiv');

    expect(result).toBe(true);
    const [, data] = mockSetDoc.mock.calls[0];
    expect(data.flag).toBe('archiv');
    expect(data.calculatedFlag).toBe('archiv');
    expect(data.expiresAt).toBeNull();
  });

  it('sets archiv flag with expiry when validityDays is provided', async () => {
    const before = Date.now();
    const result = await setRecipeSwipeFlag('user-1', 'list-1', 'recipe-1', 'archiv', 30);
    const after = Date.now();

    expect(result).toBe(true);
    const [, data] = mockSetDoc.mock.calls[0];
    expect(data.flag).toBe('archiv');
    expect(data.calculatedFlag).toBe('archiv');

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
    expect(data.calculatedFlag).toBe('kandidat');

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
    expect(data.calculatedFlag).toBe('kandidat');
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
    const recipeSwipeDocCalls = mockDoc.mock.calls.filter((call) => call[1] === RECIPE_SWIPE_FLAGS_COLLECTION);
    const firstDocId = recipeSwipeDocCalls[0][2];
    const secondDocId = recipeSwipeDocCalls[1][2];
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

  it('returns true when setDoc succeeds but recalculation fails', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetDocs
      .mockResolvedValueOnce({ forEach: jest.fn() })
      .mockRejectedValueOnce(new Error('Recalculation failed'));

    const result = await setRecipeSwipeFlag('user-1', 'list-1', 'recipe-1', 'geparkt', 14);

    expect(result).toBe(true);
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to recalculate calculatedFlag after setting recipe swipe flag.'
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

  it('current user missing swipe (before swiping) is treated as archiv → returns archiv with 100% archiv', () => {
    // Single member (= current user), no swipe → treated as archiv → 100% archiv → Archiv
    const result = computeGroupRecipeStatus(['user-1'], {}, 'recipe-1', defaultThresholds, 'user-1');
    expect(result).toBe('archiv');
  });

  it('without currentUserId, missing swipe is ignored → returns null', () => {
    // No currentUserId provided: missing swipe of single member is ignored → 0 counted → null
    const result = computeGroupRecipeStatus(['user-1'], {}, 'recipe-1', defaultThresholds);
    expect(result).toBeNull();
  });

  it('returns kandidat when all members voted kandidat', () => {
    const allMembersFlags = {
      'user-1': { 'recipe-1': 'kandidat' },
      'user-2': { 'recipe-1': 'kandidat' },
    };
    const result = computeGroupRecipeStatus(['user-1', 'user-2'], allMembersFlags, 'recipe-1', defaultThresholds, 'user-1');
    expect(result).toBe('kandidat');
  });

  it('returns archiv when all members voted archiv', () => {
    const allMembersFlags = {
      'user-1': { 'recipe-1': 'archiv' },
      'user-2': { 'recipe-1': 'archiv' },
    };
    const result = computeGroupRecipeStatus(['user-1', 'user-2'], allMembersFlags, 'recipe-1', defaultThresholds, 'user-1');
    expect(result).toBe('archiv');
  });

  it('returns null when votes are split equally (neither threshold met)', () => {
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
    const result = computeGroupRecipeStatus(['user-1', 'user-2'], allMembersFlags, 'recipe-1', strictThresholds, 'user-1');
    expect(result).toBeNull();
  });

  it('uses default thresholds when thresholds param is missing', () => {
    const allMembersFlags = {
      'user-1': { 'recipe-1': 'kandidat' },
    };
    // No thresholds passed – should fall back to defaults (50/50/50/50)
    const result = computeGroupRecipeStatus(['user-1'], allMembersFlags, 'recipe-1', null, 'user-1');
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
      defaultThresholds,
      'user-1'
    );
    expect(result).toBeNull();
  });

  // --- New behavior tests for missing-swipe logic ---

  it('2 members, no swipes: current user missing → archiv, other missing → ignored → returns archiv', () => {
    // Before anyone swipes: current user's missing swipe = archiv, other's missing = ignored
    // archivCount=1, kandidatCount=0, total=2 → 50% archiv, 0% kandidat → archiv (50>=50, 0<=50)
    const result = computeGroupRecipeStatus(
      ['user-1', 'user-2'],
      {},
      'recipe-1',
      defaultThresholds,
      'user-1'
    );
    expect(result).toBe('archiv');
  });

  it('2 members, other swiped kandidat, current user not yet swiped: kandidat threshold not met', () => {
    // KANDIDAT_MIN=66, KANDIDAT_MAX_ARCHIV=10
    // current user: archiv (missing), other: kandidat → 50% kandidat, 50% archiv
    // → not kandidat (50 < 66) → archiv (50% archiv >= 50 min AND 50% kandidat <= 50 max)
    const allMembersFlags = { 'user-2': { 'recipe-1': 'kandidat' } };
    const strictThresholds = {
      groupThresholdKandidatMinKandidat: 66,
      groupThresholdKandidatMaxArchiv: 10,
      groupThresholdArchivMinArchiv: 50,
      groupThresholdArchivMaxKandidat: 50,
    };
    const result = computeGroupRecipeStatus(
      ['user-1', 'user-2'],
      allMembersFlags,
      'recipe-1',
      strictThresholds,
      'user-1'
    );
    expect(result).toBe('archiv');
  });

  it('2 members, current user swiped kandidat, other not yet swiped → other treated as kandidat → returns kandidat', () => {
    // After current user swipes: other missing = kandidat
    // kandidatCount=2, archivCount=0, total=2 → 100% kandidat → kandidat
    const allMembersFlags = { 'user-1': { 'recipe-1': 'kandidat' } };
    const result = computeGroupRecipeStatus(
      ['user-1', 'user-2'],
      allMembersFlags,
      'recipe-1',
      defaultThresholds,
      'user-1'
    );
    expect(result).toBe('kandidat');
  });

  it('3 members, 2 others swiped kandidat, current user not yet swiped: archiv blocks threshold', () => {
    // KANDIDAT_MIN=66, KANDIDAT_MAX_ARCHIV=10
    // current user: archiv (missing), user-2: kandidat, user-3: kandidat
    // kandidatCount=2, archivCount=1, total=3 → 66.67% kandidat, 33.33% archiv → 33.33 > 10 → not kandidat
    const allMembersFlags = {
      'user-2': { 'recipe-1': 'kandidat' },
      'user-3': { 'recipe-1': 'kandidat' },
    };
    const strictThresholds = {
      groupThresholdKandidatMinKandidat: 66,
      groupThresholdKandidatMaxArchiv: 10,
      groupThresholdArchivMinArchiv: 50,
      groupThresholdArchivMaxKandidat: 50,
    };
    const result = computeGroupRecipeStatus(
      ['user-1', 'user-2', 'user-3'],
      allMembersFlags,
      'recipe-1',
      strictThresholds,
      'user-1'
    );
    expect(result).toBeNull();
  });

  it('3 members, current user swiped geparkt, 2 others not yet swiped → others as kandidat → 66.67% kandidat', () => {
    // After current user swipes geparkt: other 2 missing = kandidat each
    // kandidatCount=2, archivCount=0, geparkt ignored, total=3 → 66.67% kandidat
    const allMembersFlags = { 'user-1': { 'recipe-1': 'geparkt' } };
    const strictThresholds = {
      groupThresholdKandidatMinKandidat: 66,
      groupThresholdKandidatMaxArchiv: 10,
      groupThresholdArchivMinArchiv: 50,
      groupThresholdArchivMaxKandidat: 50,
    };
    const result = computeGroupRecipeStatus(
      ['user-1', 'user-2', 'user-3'],
      allMembersFlags,
      'recipe-1',
      strictThresholds,
      'user-1'
    );
    expect(result).toBe('kandidat');
  });
});

describe('computeCalculatedRecipeSwipeFlag', () => {
  const defaultThresholds = {
    groupThresholdKandidatMinKandidat: 50,
    groupThresholdKandidatMaxArchiv: 50,
    groupThresholdArchivMinArchiv: 50,
    groupThresholdArchivMaxKandidat: 50,
  };
  const projectedThresholds = {
    groupThresholdKandidatMinKandidat: 66,
    groupThresholdKandidatMaxArchiv: 10,
    groupThresholdArchivMinArchiv: 66,
    groupThresholdArchivMaxKandidat: 10,
  };

  it('treats open swipes as kandidat and returns kandidat when thresholds are met', () => {
    const allMembersFlags = {
      'user-1': { 'recipe-1': 'kandidat' },
      'user-2': { 'recipe-1': 'archiv' },
    };
    const result = computeCalculatedRecipeSwipeFlag(
      ['user-1', 'user-2', 'user-3'],
      allMembersFlags,
      'recipe-1',
      defaultThresholds
    );
    expect(result).toBe('kandidat');
  });

  it('returns archiv when archiv thresholds are met', () => {
    const strictThresholds = {
      groupThresholdKandidatMinKandidat: 90,
      groupThresholdKandidatMaxArchiv: 10,
      groupThresholdArchivMinArchiv: 60,
      groupThresholdArchivMaxKandidat: 40,
    };
    const allMembersFlags = {
      'user-1': { 'recipe-1': 'archiv' },
      'user-2': { 'recipe-1': 'archiv' },
      'user-3': { 'recipe-1': 'kandidat' },
    };
    const result = computeCalculatedRecipeSwipeFlag(
      ['user-1', 'user-2', 'user-3'],
      allMembersFlags,
      'recipe-1',
      strictThresholds
    );
    expect(result).toBe('archiv');
  });

  it('returns geparkt when neither kandidat nor archiv thresholds are met', () => {
    const strictThresholds = {
      groupThresholdKandidatMinKandidat: 80,
      groupThresholdKandidatMaxArchiv: 20,
      groupThresholdArchivMinArchiv: 80,
      groupThresholdArchivMaxKandidat: 20,
    };
    const allMembersFlags = {
      'user-1': { 'recipe-1': 'kandidat' },
      'user-2': { 'recipe-1': 'archiv' },
      'user-3': { 'recipe-1': 'geparkt' },
    };
    const result = computeCalculatedRecipeSwipeFlag(
      ['user-1', 'user-2', 'user-3'],
      allMembersFlags,
      'recipe-1',
      strictThresholds
    );
    expect(result).toBe('geparkt');
  });

  it.each([
    [
      'kandidat with one open swipe returns kandidat',
      {
        'user-1': { 'recipe-1': 'kandidat' },
      },
      'kandidat',
    ],
    [
      'geparkt with one open swipe returns geparkt',
      {
        'user-1': { 'recipe-1': 'geparkt' },
      },
      'geparkt',
    ],
    [
      'archiv with one open swipe returns geparkt',
      {
        'user-1': { 'recipe-1': 'archiv' },
      },
      'geparkt',
    ],
  ])('2 members: %s', (_label, allMembersFlags, expected) => {
    const result = computeCalculatedRecipeSwipeFlag(
      ['user-1', 'user-2'],
      allMembersFlags,
      'recipe-1',
      projectedThresholds
    );
    expect(result).toBe(expected);
  });

  it.each([
    [
      'kandidat with two open swipes returns kandidat',
      {
        'user-1': { 'recipe-1': 'kandidat' },
      },
      'kandidat',
    ],
    [
      'one geparkt with two open swipes returns kandidat',
      {
        'user-1': { 'recipe-1': 'geparkt' },
      },
      'kandidat',
    ],
    [
      'archiv with two open swipes returns geparkt',
      {
        'user-1': { 'recipe-1': 'archiv' },
      },
      'geparkt',
    ],
    [
      'kandidat plus kandidat with one open swipe returns kandidat',
      {
        'user-1': { 'recipe-1': 'kandidat' },
        'user-2': { 'recipe-1': 'kandidat' },
      },
      'kandidat',
    ],
    [
      'geparkt plus kandidat with one open swipe returns kandidat',
      {
        'user-1': { 'recipe-1': 'geparkt' },
        'user-2': { 'recipe-1': 'kandidat' },
      },
      'kandidat',
    ],
    [
      'two geparkt with one open swipe returns geparkt',
      {
        'user-1': { 'recipe-1': 'geparkt' },
        'user-2': { 'recipe-1': 'geparkt' },
      },
      'geparkt',
    ],
    [
      'archiv plus kandidat with one open swipe returns geparkt',
      {
        'user-1': { 'recipe-1': 'archiv' },
        'user-2': { 'recipe-1': 'kandidat' },
      },
      'geparkt',
    ],
    [
      'archiv plus geparkt with one open swipe returns geparkt',
      {
        'user-1': { 'recipe-1': 'archiv' },
        'user-2': { 'recipe-1': 'geparkt' },
      },
      'geparkt',
    ],
  ])('3 members: %s', (_label, allMembersFlags, expected) => {
    const result = computeCalculatedRecipeSwipeFlag(
      ['user-1', 'user-2', 'user-3'],
      allMembersFlags,
      'recipe-1',
      projectedThresholds
    );
    expect(result).toBe(expected);
  });
});

describe('recalculateCalculatedFlagForRecipeInList', () => {
  it('updates calculatedFlag for all matching recipe swipe docs based on projected flag', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ ownerId: 'user-1', memberIds: ['user-2', 'user-3'] }),
    });
    mockGetDocs.mockResolvedValueOnce({
      forEach: (cb) => {
        cb({
          ref: 'ref-1',
          data: () => ({ userId: 'user-1', listId: 'list-1', recipeId: 'recipe-1', flag: 'kandidat' }),
        });
        cb({
          ref: 'ref-2',
          data: () => ({ userId: 'user-2', listId: 'list-1', recipeId: 'recipe-1', flag: 'archiv' }),
        });
      },
    });

    const result = await recalculateCalculatedFlagForRecipeInList('list-1', 'recipe-1');

    expect(result).toBe(true);
    expect(mockUpdateDoc).toHaveBeenCalledWith('ref-1', { calculatedFlag: 'kandidat' });
    expect(mockUpdateDoc).toHaveBeenCalledWith('ref-2', { calculatedFlag: 'kandidat' });
  });

  it('returns true without updates when all docs already have the calculatedFlag', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ ownerId: 'user-1', memberIds: ['user-2'] }),
    });
    mockGetDocs.mockResolvedValueOnce({
      forEach: (cb) => {
        cb({
          ref: 'ref-1',
          data: () => ({ userId: 'user-1', listId: 'list-1', recipeId: 'recipe-1', flag: 'kandidat', calculatedFlag: 'kandidat' }),
        });
        cb({
          ref: 'ref-2',
          data: () => ({ userId: 'user-2', listId: 'list-1', recipeId: 'recipe-1', flag: 'archiv', calculatedFlag: 'kandidat' }),
        });
      },
    });

    const result = await recalculateCalculatedFlagForRecipeInList('list-1', 'recipe-1');

    expect(result).toBe(true);
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });
});

describe('clearExpiryForArchivedRecipe', () => {
  it('returns false when listId is missing', async () => {
    const result = await clearExpiryForArchivedRecipe('', 'recipe-1');
    expect(result).toBe(false);
    expect(mockGetDocs).not.toHaveBeenCalled();
  });

  it('returns false when recipeId is missing', async () => {
    const result = await clearExpiryForArchivedRecipe('list-1', '');
    expect(result).toBe(false);
    expect(mockGetDocs).not.toHaveBeenCalled();
  });

  it('queries flags by listId and recipeId', async () => {
    mockGetDocs.mockResolvedValueOnce({ forEach: jest.fn() });
    await clearExpiryForArchivedRecipe('list-1', 'recipe-1');
    expect(mockGetDocs).toHaveBeenCalledTimes(1);
    expect(mockWhere).toHaveBeenCalledWith('listId', '==', 'list-1');
    expect(mockWhere).toHaveBeenCalledWith('recipeId', '==', 'recipe-1');
  });

  it('calls updateDoc with expiresAt: null for each matching document', async () => {
    const mockRef1 = 'mock-ref-1';
    const mockRef2 = 'mock-ref-2';
    mockGetDocs.mockResolvedValueOnce({
      forEach: (cb) => {
        cb({ ref: mockRef1 });
        cb({ ref: mockRef2 });
      },
    });

    const result = await clearExpiryForArchivedRecipe('list-1', 'recipe-1');

    expect(result).toBe(true);
    expect(mockUpdateDoc).toHaveBeenCalledTimes(2);
    expect(mockUpdateDoc).toHaveBeenCalledWith(mockRef1, { expiresAt: null });
    expect(mockUpdateDoc).toHaveBeenCalledWith(mockRef2, { expiresAt: null });
  });

  it('returns true when there are no matching documents (no-op)', async () => {
    mockGetDocs.mockResolvedValueOnce({ forEach: jest.fn() });
    const result = await clearExpiryForArchivedRecipe('list-1', 'recipe-1');
    expect(result).toBe(true);
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it('returns false and logs error when getDocs fails', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetDocs.mockRejectedValue(new Error('Firestore error'));

    const result = await clearExpiryForArchivedRecipe('list-1', 'recipe-1');

    expect(result).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      'Error clearing expiry for archived recipe:',
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });

  it('returns false and logs error when updateDoc fails', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetDocs.mockResolvedValueOnce({
      forEach: (cb) => {
        cb({ ref: 'mock-ref-1' });
      },
    });
    mockUpdateDoc.mockRejectedValue(new Error('Update error'));

    const result = await clearExpiryForArchivedRecipe('list-1', 'recipe-1');

    expect(result).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      'Error clearing expiry for archived recipe:',
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });
});

describe('archiveRecipeForAllUsersInList', () => {
  it('returns false when listId is missing', async () => {
    const result = await archiveRecipeForAllUsersInList('', 'recipe-1', 14);
    expect(result).toBe(false);
    expect(mockGetDocs).not.toHaveBeenCalled();
  });

  it('returns false when recipeId is missing', async () => {
    const result = await archiveRecipeForAllUsersInList('list-1', '', 14);
    expect(result).toBe(false);
    expect(mockGetDocs).not.toHaveBeenCalled();
  });

  it('updates all matching docs to archiv with configured expiry', async () => {
    const mockRef1 = 'mock-ref-1';
    const mockRef2 = 'mock-ref-2';
    mockGetDocs.mockResolvedValueOnce({
      forEach: (cb) => {
        cb({ ref: mockRef1 });
        cb({ ref: mockRef2 });
      },
    });

    const before = Date.now();
    const result = await archiveRecipeForAllUsersInList('list-1', 'recipe-1', 7);
    const after = Date.now();

    expect(result).toBe(true);
    expect(mockWhere).toHaveBeenCalledWith('listId', '==', 'list-1');
    expect(mockWhere).toHaveBeenCalledWith('recipeId', '==', 'recipe-1');
    expect(mockUpdateDoc).toHaveBeenCalledTimes(2);

    const expiresAt = mockUpdateDoc.mock.calls[0][1].expiresAt;
    expect(mockUpdateDoc).toHaveBeenCalledWith(mockRef1, { flag: 'archiv', expiresAt });
    expect(mockUpdateDoc).toHaveBeenCalledWith(mockRef2, { flag: 'archiv', expiresAt });

    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const expiresMs = mockTimestampFromMillis.mock.calls[0][0];
    expect(expiresMs).toBeGreaterThanOrEqual(before + sevenDays);
    expect(expiresMs).toBeLessThanOrEqual(after + sevenDays);
  });

  it('updates docs to permanent archiv when validityDays is null', async () => {
    mockGetDocs.mockResolvedValueOnce({
      forEach: (cb) => cb({ ref: 'mock-ref-1' }),
    });

    const result = await archiveRecipeForAllUsersInList('list-1', 'recipe-1', null);

    expect(result).toBe(true);
    expect(mockUpdateDoc).toHaveBeenCalledWith('mock-ref-1', { flag: 'archiv', expiresAt: null });
  });

  it('returns false when no matching documents exist', async () => {
    mockGetDocs.mockResolvedValueOnce({ forEach: jest.fn() });

    const result = await archiveRecipeForAllUsersInList('list-1', 'recipe-1', 7);

    expect(result).toBe(false);
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it('returns false and logs error when update fails', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetDocs.mockResolvedValueOnce({
      forEach: (cb) => cb({ ref: 'mock-ref-1' }),
    });
    mockUpdateDoc.mockRejectedValueOnce(new Error('Update failed'));

    const result = await archiveRecipeForAllUsersInList('list-1', 'recipe-1', 3);

    expect(result).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      'Error archiving recipe swipe flags for all users:',
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });

  it('returns true when archiving succeeds but calculatedFlag recalculation fails', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetDocs
      .mockResolvedValueOnce({ forEach: (cb) => cb({ ref: 'mock-ref-1' }) })
      .mockRejectedValueOnce(new Error('Recalculation failed'));

    const result = await archiveRecipeForAllUsersInList('list-1', 'recipe-1', 3);

    expect(result).toBe(true);
    expect(mockUpdateDoc).toHaveBeenCalledWith('mock-ref-1', expect.objectContaining({ flag: 'archiv' }));
    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to recalculate calculatedFlag after archiving recipe swipe flags.'
    );
    consoleSpy.mockRestore();
  });
});

describe('parkAllRecipeSwipeFlagsForRecipeInList', () => {
  it('returns false when listId is missing', async () => {
    const result = await parkAllRecipeSwipeFlagsForRecipeInList('', 'recipe-1', 7);
    expect(result).toBe(false);
    expect(mockGetDocs).not.toHaveBeenCalled();
  });

  it('returns false when recipeId is missing', async () => {
    const result = await parkAllRecipeSwipeFlagsForRecipeInList('list-1', '', 7);
    expect(result).toBe(false);
    expect(mockGetDocs).not.toHaveBeenCalled();
  });

  it('updates all matching docs to geparkt with configured expiry', async () => {
    const before = Date.now();
    mockGetDocs.mockResolvedValueOnce({
      forEach: (cb) => {
        cb({ ref: 'mock-ref-1' });
        cb({ ref: 'mock-ref-2' });
      },
    });

    const result = await parkAllRecipeSwipeFlagsForRecipeInList('list-1', 'recipe-1', 7);

    expect(result).toBe(true);
    expect(mockWhere).toHaveBeenCalledWith('listId', '==', 'list-1');
    expect(mockWhere).toHaveBeenCalledWith('recipeId', '==', 'recipe-1');
    expect(mockUpdateDoc).toHaveBeenCalledTimes(2);
    expect(mockUpdateDoc).toHaveBeenNthCalledWith(1, 'mock-ref-1', expect.objectContaining({ flag: 'geparkt' }));
    expect(mockUpdateDoc).toHaveBeenNthCalledWith(2, 'mock-ref-2', expect.objectContaining({ flag: 'geparkt' }));

    expect(mockTimestampFromMillis).toHaveBeenCalledTimes(1);
    const expiryTimestamp = mockTimestampFromMillis.mock.results[0].value;
    expect(expiryTimestamp).toEqual(expect.objectContaining({ _isMock: true }));
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      'mock-ref-1',
      { flag: 'geparkt', expiresAt: expiryTimestamp }
    );
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const after = Date.now();
    expect(expiryTimestamp._ms).toBeGreaterThanOrEqual(before + sevenDays);
    expect(expiryTimestamp._ms).toBeLessThanOrEqual(after + sevenDays);
  });

  it('updates all matching docs to geparkt without expiry when validity is null', async () => {
    mockGetDocs.mockResolvedValueOnce({
      forEach: (cb) => {
        cb({ ref: 'mock-ref-1' });
      },
    });

    const result = await parkAllRecipeSwipeFlagsForRecipeInList('list-1', 'recipe-1', null);

    expect(result).toBe(true);
    expect(mockUpdateDoc).toHaveBeenCalledWith('mock-ref-1', { flag: 'geparkt', expiresAt: null });
  });

  it('returns false and logs error when update fails', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetDocs.mockResolvedValueOnce({
      forEach: (cb) => {
        cb({ ref: 'mock-ref-1' });
      },
    });
    mockUpdateDoc.mockRejectedValueOnce(new Error('Update error'));

    const result = await parkAllRecipeSwipeFlagsForRecipeInList('list-1', 'recipe-1', 7);

    expect(result).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      'Error parking all recipe swipe flags for recipe in list:',
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });

  it('returns true when parking succeeds but calculatedFlag recalculation fails', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetDocs
      .mockResolvedValueOnce({
        forEach: (cb) => {
          cb({ ref: 'mock-ref-1' });
        },
      })
      .mockRejectedValueOnce(new Error('Recalculation failed'));

    const result = await parkAllRecipeSwipeFlagsForRecipeInList('list-1', 'recipe-1', 7);

    expect(result).toBe(true);
    expect(mockUpdateDoc).toHaveBeenCalledWith('mock-ref-1', expect.objectContaining({ flag: 'geparkt' }));
    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to recalculate calculatedFlag after parking recipe swipe flags.'
    );
    consoleSpy.mockRestore();
  });
});

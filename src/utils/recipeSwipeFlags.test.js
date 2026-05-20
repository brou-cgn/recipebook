/**
 * Tests for Recipe Swipe Flags utilities.
 */

jest.mock('../firebase', () => ({
  db: {}
}));

const mockGetDocs = jest.fn();
const mockCollection = jest.fn();
const mockQuery = jest.fn();
const mockWhere = jest.fn();
const mockDoc = jest.fn();
const mockSetDoc = jest.fn();
const mockDeleteDoc = jest.fn();
const mockTimestampNow = jest.fn();

jest.mock('firebase/firestore', () => ({
  getDocs: (...args) => mockGetDocs(...args),
  collection: (...args) => mockCollection(...args),
  query: (...args) => mockQuery(...args),
  where: (...args) => mockWhere(...args),
  doc: (...args) => mockDoc(...args),
  setDoc: (...args) => mockSetDoc(...args),
  deleteDoc: (...args) => mockDeleteDoc(...args),
  Timestamp: {
    now: (...args) => mockTimestampNow(...args),
  },
}));

import {
  setRecipeSwipeFlag,
  getActiveSwipeFlags,
  getSwipeFlagDocsByRecipeForUser,
  getAllMembersSwipeFlags,
  getAllMembersSwipeFlagDocsForList,
  computeGroupRecipeStatus,
  computeCalculatedRecipeSwipeFlag,
} from './recipeSwipeFlags';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('recipeSwipeFlags write operations', () => {
  it('stores required swipe flag fields and removes expired calculated flags first', async () => {
    const now = Date.now();
    const expiresAt = { toMillis: () => now + 1000 };
    const calculatedExpiresAt = { toMillis: () => now + 2000 };

    mockGetDocs.mockResolvedValueOnce({
      forEach: (cb) => {
        cb({
          ref: { id: 'expired-ref' },
          data: () => ({ listID: 'l', calculatedExpiresAt: { toMillis: () => now - 1000 } }),
        });
        cb({
          ref: { id: 'future-ref' },
          data: () => ({ listID: 'l', calculatedExpiresAt: { toMillis: () => now + 1000 } }),
        });
        cb({
          ref: { id: 'null-ref' },
          data: () => ({ listID: 'l', calculatedExpiresAt: null }),
        });
      },
    });
    mockDoc.mockReturnValueOnce('flag-doc-ref');
    mockSetDoc.mockResolvedValueOnce();
    mockDeleteDoc.mockResolvedValue();
    mockTimestampNow.mockReturnValue('created-ts');

    const result = await setRecipeSwipeFlag('u', 'l', 'r', 'archiv', {
      userName: 'Max Mustermann',
      recipeTitle: 'Kartoffelsuppe',
      expiresAt,
      calculatedFlag: 'archiv',
      calculatedExpiresAt,
    });

    expect(result).toBe(true);
    expect(mockWhere).toHaveBeenCalledWith('listID', '==', 'l');
    expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
    expect(mockDeleteDoc).toHaveBeenCalledWith({ id: 'expired-ref' });
    expect(mockDeleteDoc).not.toHaveBeenCalledWith({ id: 'future-ref' });
    expect(mockDeleteDoc).not.toHaveBeenCalledWith({ id: 'null-ref' });
    expect(mockDoc).toHaveBeenCalledWith({}, 'recipeSwipeFlags', 'u_l_r');
    expect(mockSetDoc).toHaveBeenCalledWith(
      'flag-doc-ref',
      expect.objectContaining({
        userID: 'u',
        userName: 'Max Mustermann',
        listID: 'l',
        recipeID: 'r',
        recipeTitle: 'Kartoffelsuppe',
        flag: 'archiv',
        createdAt: 'created-ts',
        expiresAt,
      })
    );
  });

});

describe('getActiveSwipeFlags', () => {
  it('returns empty object when required params are missing', async () => {
    expect(await getActiveSwipeFlags('', 'list-1')).toEqual({});
    expect(await getActiveSwipeFlags('user-1', '')).toEqual({});
    expect(mockGetDocs).not.toHaveBeenCalled();
  });

  it('returns only non-expired flags', async () => {
    const now = Date.now();
    mockGetDocs.mockResolvedValueOnce({
      forEach: (cb) => {
        cb({ data: () => ({ recipeId: 'a', flag: 'kandidat', expiresAt: null }) });
        cb({ data: () => ({ recipeId: 'b', flag: 'archiv', expiresAt: { toMillis: () => now - 1000 } }) });
        cb({ data: () => ({ recipeId: 'c', flag: 'geparkt', expiresAt: { toMillis: () => now + 1000 } }) });
      },
    });

    const result = await getActiveSwipeFlags('user-1', 'list-1');

    expect(result).toEqual({ a: 'kandidat', c: 'geparkt' });
    expect(mockWhere).toHaveBeenCalledWith('userId', '==', 'user-1');
    expect(mockWhere).toHaveBeenCalledWith('listId', '==', 'list-1');
  });
});

describe('getSwipeFlagDocsByRecipeForUser', () => {
  it('maps docs by recipe id including expiry metadata', async () => {
    const now = Date.now();
    mockGetDocs.mockResolvedValueOnce({
      forEach: (cb) => {
        cb({
          data: () => ({
            recipeId: 'r1',
            flag: 'archiv',
            calculatedFlag: 'archiv',
            expiresAt: { toMillis: () => now - 1000 },
          }),
        });
      },
    });

    const result = await getSwipeFlagDocsByRecipeForUser('user-1', 'list-1');

    expect(result.r1.flag).toBe('archiv');
    expect(result.r1.calculatedFlag).toBe('archiv');
    expect(result.r1.isExpired).toBe(true);
  });
});

describe('getAllMembersSwipeFlags', () => {
  it('returns active flags only for provided member ids', async () => {
    const now = Date.now();
    mockGetDocs.mockResolvedValueOnce({
      forEach: (cb) => {
        cb({ data: () => ({ userId: 'u1', recipeId: 'r1', flag: 'kandidat', expiresAt: null }) });
        cb({ data: () => ({ userId: 'u2', recipeId: 'r1', flag: 'archiv', expiresAt: { toMillis: () => now + 1000 } }) });
        cb({ data: () => ({ userId: 'u3', recipeId: 'r1', flag: 'geparkt', expiresAt: null }) });
      },
    });

    const result = await getAllMembersSwipeFlags('list-1', ['u1', 'u2']);

    expect(result).toEqual({
      u1: { r1: 'kandidat' },
      u2: { r1: 'archiv' },
    });
  });
});

describe('getAllMembersSwipeFlagDocsForList', () => {
  it('returns full docs including expired flags', async () => {
    const now = Date.now();
    const expired = now - 1000;
    mockGetDocs.mockResolvedValueOnce({
      forEach: (cb) => {
        cb({
          data: () => ({
            userId: 'u1',
            recipeId: 'r1',
            flag: 'geparkt',
            expiresAt: { toMillis: () => expired },
          }),
        });
      },
    });

    const result = await getAllMembersSwipeFlagDocsForList('list-1', ['u1']);

    expect(result.u1.r1).toEqual({
      flag: 'geparkt',
      expiresAt: expect.any(Object),
      expiresAtMillis: expired,
      isExpired: true,
    });
  });
});

describe('computeGroupRecipeStatus', () => {
  it('returns kandidat when kandidat threshold is met', () => {
    const status = computeGroupRecipeStatus(
      ['u1', 'u2'],
      { u1: { r1: 'kandidat' }, u2: { r1: 'kandidat' } },
      'r1',
      {
        groupThresholdKandidatMinKandidat: 50,
        groupThresholdKandidatMaxArchiv: 50,
        groupThresholdArchivMinArchiv: 50,
        groupThresholdArchivMaxKandidat: 50,
      },
      'u1'
    );

    expect(status).toBe('kandidat');
  });
});

describe('computeCalculatedRecipeSwipeFlag', () => {
  it('treats open votes as kandidat and returns geparkt when thresholds are not met', () => {
    const status = computeCalculatedRecipeSwipeFlag(
      ['u1', 'u2', 'u3'],
      {
        u1: { r1: 'archiv' },
        u2: { r1: 'kandidat' },
        u3: {},
      },
      'r1',
      {
        groupThresholdKandidatMinKandidat: 80,
        groupThresholdKandidatMaxArchiv: 10,
        groupThresholdArchivMinArchiv: 80,
        groupThresholdArchivMaxKandidat: 10,
      }
    );

    expect(status).toBe('geparkt');
  });
});

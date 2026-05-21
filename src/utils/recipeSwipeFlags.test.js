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
const mockUpdateDoc = jest.fn();
const mockDeleteDoc = jest.fn();
const mockTimestampNow = jest.fn();
const mockTimestampFromDate = jest.fn();
const mockGetStatusValiditySettings = jest.fn();

jest.mock('../utils/customLists', () => ({
  getStatusValiditySettings: (...args) => mockGetStatusValiditySettings(...args),
}));

jest.mock('firebase/firestore', () => ({
  getDocs: (...args) => mockGetDocs(...args),
  collection: (...args) => mockCollection(...args),
  query: (...args) => mockQuery(...args),
  where: (...args) => mockWhere(...args),
  doc: (...args) => mockDoc(...args),
  setDoc: (...args) => mockSetDoc(...args),
  updateDoc: (...args) => mockUpdateDoc(...args),
  deleteDoc: (...args) => mockDeleteDoc(...args),
  Timestamp: {
    now: (...args) => mockTimestampNow(...args),
    fromDate: (...args) => mockTimestampFromDate(...args),
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
  updateCalculatedSwipeFlagsForRecipe,
} from './recipeSwipeFlags';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetDocs.mockResolvedValue({ forEach: () => {} });
  mockGetStatusValiditySettings.mockResolvedValue({
    statusValidityDaysKandidat: null,
    statusValidityDaysGeparkt: null,
    statusValidityDaysArchiv: null,
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('recipeSwipeFlags write operations', () => {
  it('stores required swipe flag fields and removes expired calculated flags first', async () => {
    const now = Date.now();
    const expiresAt = { toMillis: () => now + 1000 };

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
    mockGetStatusValiditySettings.mockResolvedValue({
      statusValidityDaysKandidat: null,
      statusValidityDaysGeparkt: null,
      statusValidityDaysArchiv: 7,
    });
    mockTimestampFromDate.mockReturnValue(expiresAt);

    const result = await setRecipeSwipeFlag('u', 'l', 'r', 'archiv', {
      userName: 'Max Mustermann',
      recipeTitle: 'Kartoffelsuppe',
    });

    expect(result).toBe(true);
    expect(mockWhere).toHaveBeenCalledWith('listID', '==', 'l');
    expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
    expect(mockDeleteDoc).toHaveBeenCalledWith({ id: 'expired-ref' });
    expect(mockDeleteDoc).not.toHaveBeenCalledWith({ id: 'future-ref' });
    expect(mockDeleteDoc).not.toHaveBeenCalledWith({ id: 'null-ref' });
    expect(mockDoc).toHaveBeenCalledWith({}, 'recipeSwipeFlags', 'u_l_r');
    expect(mockTimestampFromDate).toHaveBeenCalledTimes(1);
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

  it('computes expiresAt from archiv validity days', async () => {
    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const archivExpiresAt = { id: 'archiv-expires-at' };

    try {
      mockGetDocs.mockResolvedValueOnce({ forEach: () => {} });
      mockDoc.mockReturnValueOnce('flag-doc-ref');
      mockSetDoc.mockResolvedValueOnce();
      mockDeleteDoc.mockResolvedValue();
      mockTimestampNow.mockReturnValue('created-ts');
      mockTimestampFromDate.mockReturnValueOnce(archivExpiresAt);
      mockGetStatusValiditySettings.mockResolvedValueOnce({
        statusValidityDaysKandidat: 3,
        statusValidityDaysGeparkt: 5,
        statusValidityDaysArchiv: 7,
      });

      await setRecipeSwipeFlag('u', 'l', 'r', 'archiv', { userName: 'U', recipeTitle: 'R' });

      expect(mockTimestampFromDate).toHaveBeenCalledWith(new Date(1_000_000 + 7 * 24 * 60 * 60 * 1000));
      expect(mockSetDoc).toHaveBeenCalledWith(
        'flag-doc-ref',
        expect.objectContaining({ expiresAt: archivExpiresAt })
      );
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  it('computes expiresAt from geparkt validity days', async () => {
    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(2_000_000);
    const geparktExpiresAt = { id: 'geparkt-expires-at' };

    try {
      mockGetDocs.mockResolvedValueOnce({ forEach: () => {} });
      mockDoc.mockReturnValueOnce('flag-doc-ref');
      mockSetDoc.mockResolvedValueOnce();
      mockDeleteDoc.mockResolvedValue();
      mockTimestampNow.mockReturnValue('created-ts');
      mockTimestampFromDate.mockReturnValueOnce(geparktExpiresAt);
      mockGetStatusValiditySettings.mockResolvedValueOnce({
        statusValidityDaysKandidat: 3,
        statusValidityDaysGeparkt: 2,
        statusValidityDaysArchiv: 7,
      });

      await setRecipeSwipeFlag('u', 'l', 'r', 'geparkt', { userName: 'U', recipeTitle: 'R' });

      expect(mockTimestampFromDate).toHaveBeenCalledWith(new Date(2_000_000 + 2 * 24 * 60 * 60 * 1000));
      expect(mockSetDoc).toHaveBeenCalledWith(
        'flag-doc-ref',
        expect.objectContaining({ expiresAt: geparktExpiresAt })
      );
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  it('computes expiresAt from kandidat validity days', async () => {
    const kandidatExpiresAt = { id: 'kandidat-expires-at' };
    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(3_000_000);

    try {
      mockGetDocs.mockResolvedValueOnce({ forEach: () => {} });
      mockDoc.mockReturnValueOnce('flag-doc-ref');
      mockSetDoc.mockResolvedValueOnce();
      mockDeleteDoc.mockResolvedValue();
      mockTimestampNow.mockReturnValue('created-ts');
      mockTimestampFromDate.mockReturnValueOnce(kandidatExpiresAt);
      mockGetStatusValiditySettings.mockResolvedValueOnce({
        statusValidityDaysKandidat: 4,
        statusValidityDaysGeparkt: 2,
        statusValidityDaysArchiv: 7,
      });

      await setRecipeSwipeFlag('u', 'l', 'r', 'kandidat', { userName: 'U', recipeTitle: 'R' });

      expect(mockTimestampFromDate).toHaveBeenCalledWith(new Date(3_000_000 + 4 * 24 * 60 * 60 * 1000));
      expect(mockSetDoc).toHaveBeenCalledWith(
        'flag-doc-ref',
        expect.objectContaining({ expiresAt: kandidatExpiresAt })
      );
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  it('sets expiresAt to null when kandidat validity days is empty', async () => {
    mockGetDocs.mockResolvedValueOnce({ forEach: () => {} });
    mockDoc.mockReturnValueOnce('flag-doc-ref');
    mockSetDoc.mockResolvedValueOnce();
    mockDeleteDoc.mockResolvedValue();
    mockTimestampNow.mockReturnValue('created-ts');
    mockGetStatusValiditySettings.mockResolvedValueOnce({
      statusValidityDaysKandidat: null,
      statusValidityDaysGeparkt: 2,
      statusValidityDaysArchiv: 7,
    });

    await setRecipeSwipeFlag('u', 'l', 'r', 'kandidat', { userName: 'U', recipeTitle: 'R' });

    expect(mockTimestampFromDate).not.toHaveBeenCalled();
    expect(mockSetDoc).toHaveBeenCalledWith(
      'flag-doc-ref',
      expect.objectContaining({ expiresAt: null })
    );
  });

  it('falls back to current user memberIds when metadata.memberIds is missing', async () => {
    mockGetDocs
      .mockResolvedValueOnce({ forEach: () => {} })
      .mockResolvedValueOnce({
        forEach: (cb) => {
          cb({ ref: 'ref-u1', data: () => ({ userID: 'u1', listID: 'l', recipeID: 'r', flag: 'geparkt' }) });
          cb({ ref: 'ref-u2', data: () => ({ userID: 'u2', listID: 'l', recipeID: 'r', flag: 'archiv' }) });
        },
      });
    mockDoc.mockReturnValueOnce('flag-doc-ref');
    mockSetDoc.mockResolvedValueOnce();
    mockUpdateDoc.mockResolvedValue();
    mockTimestampNow.mockReturnValue('created-ts');

    await setRecipeSwipeFlag('u1', 'l', 'r', 'kandidat', { userName: 'U', recipeTitle: 'R' });

    expect(mockUpdateDoc).toHaveBeenCalledWith('ref-u1', expect.objectContaining({ calculatedFlag: 'geparkt' }));
    expect(mockUpdateDoc).toHaveBeenCalledWith('ref-u2', expect.objectContaining({ calculatedFlag: 'geparkt' }));
  });

});

describe('updateCalculatedSwipeFlagsForRecipe', () => {
  it('computes kandidat with open swipes and updates matching recipe docs', async () => {
    mockGetDocs.mockResolvedValueOnce({
      forEach: (cb) => {
        cb({ ref: 'ref-u1', data: () => ({ userID: 'u1', listID: 'l1', recipeID: 'r1', flag: 'kandidat' }) });
        cb({ ref: 'ref-u2', data: () => ({ userID: 'u2', listID: 'l1', recipeID: 'r1', flag: 'geparkt' }) });
      },
    });
    mockUpdateDoc.mockResolvedValue();

    await updateCalculatedSwipeFlagsForRecipe(
      'l1',
      'r1',
      ['u1', 'u2', 'u3'],
      {
        groupThresholdKandidatMinKandidat: 66,
        groupThresholdKandidatMaxArchiv: 10,
        groupThresholdArchivMinArchiv: 66,
        groupThresholdArchivMaxKandidat: 10,
      }
    );

    expect(mockWhere).toHaveBeenCalledWith('listID', '==', 'l1');
    expect(mockWhere).toHaveBeenCalledWith('recipeID', '==', 'r1');
    expect(mockUpdateDoc).toHaveBeenCalledTimes(2);
    expect(mockUpdateDoc).toHaveBeenNthCalledWith(1, 'ref-u1', { calculatedFlag: 'kandidat', calculatedExpiresAt: null });
    expect(mockUpdateDoc).toHaveBeenNthCalledWith(2, 'ref-u2', { calculatedFlag: 'kandidat', calculatedExpiresAt: null });
  });

  it('computes geparkt for archiv prognosis scenario', async () => {
    mockGetDocs.mockResolvedValueOnce({
      forEach: (cb) => {
        cb({ ref: 'ref-u1', data: () => ({ userID: 'u1', listID: 'l1', recipeID: 'r1', flag: 'archiv' }) });
      },
    });
    mockUpdateDoc.mockResolvedValue();

    await updateCalculatedSwipeFlagsForRecipe(
      'l1',
      'r1',
      ['u1', 'u2', 'u3'],
      {
        groupThresholdKandidatMinKandidat: 66,
        groupThresholdKandidatMaxArchiv: 10,
        groupThresholdArchivMinArchiv: 66,
        groupThresholdArchivMaxKandidat: 10,
      }
    );

    expect(mockUpdateDoc).toHaveBeenCalledWith('ref-u1', { calculatedFlag: 'geparkt', calculatedExpiresAt: null });
  });

  it('sets calculatedExpiresAt based on calculatedFlag validity settings', async () => {
    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(4_000_000);
    const candidateCalculatedExpiresAt = { id: 'candidate-calculated-expires-at' };

    try {
      mockGetDocs.mockResolvedValueOnce({
        forEach: (cb) => {
          cb({ ref: 'ref-u1', data: () => ({ userID: 'u1', listID: 'l1', recipeID: 'r1', flag: 'kandidat' }) });
        },
      });
      mockGetStatusValiditySettings.mockResolvedValueOnce({
        statusValidityDaysKandidat: 9,
        statusValidityDaysGeparkt: 3,
        statusValidityDaysArchiv: 7,
      });
      mockTimestampFromDate.mockReturnValueOnce(candidateCalculatedExpiresAt);
      mockUpdateDoc.mockResolvedValue();

      await updateCalculatedSwipeFlagsForRecipe(
        'l1',
        'r1',
        ['u1', 'u2', 'u3'],
        {
          groupThresholdKandidatMinKandidat: 66,
          groupThresholdKandidatMaxArchiv: 10,
          groupThresholdArchivMinArchiv: 66,
          groupThresholdArchivMaxKandidat: 10,
        }
      );

      expect(mockTimestampFromDate).toHaveBeenCalledWith(new Date(4_000_000 + 9 * 24 * 60 * 60 * 1000));
      expect(mockUpdateDoc).toHaveBeenCalledWith('ref-u1', {
        calculatedFlag: 'kandidat',
        calculatedExpiresAt: candidateCalculatedExpiresAt,
      });
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  it('updates all matching recipe swipe documents', async () => {
    mockGetDocs.mockResolvedValueOnce({
      forEach: (cb) => {
        cb({ ref: 'ref-u1', data: () => ({ userID: 'u1', listID: 'l1', recipeID: 'r1', flag: 'kandidat' }) });
        cb({ ref: 'ref-u2', data: () => ({ userID: 'u2', listID: 'l1', recipeID: 'r1', flag: 'kandidat' }) });
        cb({ ref: 'ref-u3', data: () => ({ userID: 'u3', listID: 'l1', recipeID: 'r1', flag: 'archiv' }) });
      },
    });
    mockUpdateDoc.mockResolvedValue();

    await updateCalculatedSwipeFlagsForRecipe(
      'l1',
      'r1',
      ['u1', 'u2', 'u3'],
      {
        groupThresholdKandidatMinKandidat: 66,
        groupThresholdKandidatMaxArchiv: 10,
        groupThresholdArchivMinArchiv: 66,
        groupThresholdArchivMaxKandidat: 10,
      }
    );

    expect(mockUpdateDoc).toHaveBeenCalledTimes(3);
    expect(mockUpdateDoc).toHaveBeenCalledWith('ref-u1', expect.objectContaining({ calculatedFlag: 'geparkt' }));
    expect(mockUpdateDoc).toHaveBeenCalledWith('ref-u2', expect.objectContaining({ calculatedFlag: 'geparkt' }));
    expect(mockUpdateDoc).toHaveBeenCalledWith('ref-u3', expect.objectContaining({ calculatedFlag: 'geparkt' }));
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
        cb({ data: () => ({ recipeID: 'a', calculatedFlag: 'kandidat', calculatedExpiresAt: null }) });
        cb({ data: () => ({ recipeID: 'b', calculatedFlag: 'archiv', calculatedExpiresAt: { toMillis: () => now - 1000 } }) });
        cb({ data: () => ({ recipeID: 'c', calculatedFlag: 'geparkt', calculatedExpiresAt: { toMillis: () => now + 1000 } }) });
      },
    });

    const result = await getActiveSwipeFlags('user-1', 'list-1');

    expect(result).toEqual({ a: 'kandidat', c: 'geparkt' });
    expect(mockWhere).toHaveBeenCalledWith('userID', '==', 'user-1');
    expect(mockWhere).toHaveBeenCalledWith('listID', '==', 'list-1');
  });
});

describe('getSwipeFlagDocsByRecipeForUser', () => {
  it('maps docs by recipe id including expiry metadata', async () => {
    const now = Date.now();
    mockGetDocs.mockResolvedValueOnce({
      forEach: (cb) => {
        cb({
          data: () => ({
            recipeID: 'r1',
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
        cb({ data: () => ({ userID: 'u1', recipeID: 'r1', calculatedFlag: 'kandidat', calculatedExpiresAt: null }) });
        cb({ data: () => ({ userID: 'u2', recipeID: 'r1', calculatedFlag: 'archiv', calculatedExpiresAt: { toMillis: () => now + 1000 } }) });
        cb({ data: () => ({ userID: 'u3', recipeID: 'r1', calculatedFlag: 'geparkt', calculatedExpiresAt: null }) });
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
            userID: 'u1',
            recipeID: 'r1',
            calculatedFlag: 'geparkt',
            calculatedExpiresAt: { toMillis: () => expired },
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

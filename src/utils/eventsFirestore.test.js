/**
 * Tests for eventsFirestore utilities – custom drinks and guest profiles.
 */

jest.mock('../firebase', () => ({ db: {}, functions: {} }));

const mockAddDoc = jest.fn();
const mockSetDoc = jest.fn();
const mockDeleteDoc = jest.fn();
const mockOnSnapshot = jest.fn();
const mockGetDocs = jest.fn();
const mockServerTimestamp = jest.fn(() => 'mock-ts');
const mockOrderBy = jest.fn((...args) => args);
const mockQuery = jest.fn((...args) => args);
const mockCollection = jest.fn();
const mockCollectionGroup = jest.fn();
const mockDoc = jest.fn();
const mockHttpsCallable = jest.fn();
const mockGuestCallable = jest.fn();

jest.mock('firebase/firestore', () => ({
  collection: (...args) => mockCollection(...args),
  collectionGroup: (...args) => mockCollectionGroup(...args),
  doc: (...args) => mockDoc(...args),
  getDoc: jest.fn(),
  getDocs: (...args) => mockGetDocs(...args),
  addDoc: (...args) => mockAddDoc(...args),
  setDoc: (...args) => mockSetDoc(...args),
  deleteDoc: (...args) => mockDeleteDoc(...args),
  onSnapshot: (...args) => mockOnSnapshot(...args),
  query: (...args) => mockQuery(...args),
  orderBy: (...args) => mockOrderBy(...args),
  serverTimestamp: () => mockServerTimestamp(),
}));

jest.mock('firebase/functions', () => ({
  httpsCallable: (...args) => mockHttpsCallable(...args),
}));

import {
  subscribeToCustomDrinks,
  subscribeToAllCustomDrinks,
  getAllCustomDrinks,
  getCustomDrinks,
  saveCustomDrink,
  deleteCustomDrink,
  subscribeToGuestProfiles,
  saveGuestProfile,
  deleteGuestProfile,
} from './eventsFirestore';

const createSnapshot = (items) => ({
  forEach: (cb) =>
    items.forEach((item) => cb({
      id: item.id,
      data: () => { const { id, __ownerId, ...rest } = item; return rest; },
      ref: { parent: { parent: { id: item.__ownerId || 'owner' } } },
    })),
});

describe('subscribeToCustomDrinks', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls callback with loaded drinks', () => {
    const drinks = [{ id: 'd1', name: 'Craft-Bier', gebindeLiter: 0.33 }];
    mockOnSnapshot.mockImplementation((_ref, cb) => {
      cb(createSnapshot(drinks));
      return jest.fn();
    });

    const cb = jest.fn();
    subscribeToCustomDrinks('user1', cb);

    expect(cb).toHaveBeenCalledWith([{ id: 'd1', name: 'Craft-Bier', gebindeLiter: 0.33 }]);
  });

  it('does not wipe existing data on error, and retries the listener instead', () => {
    jest.useFakeTimers();
    let attempt = 0;
    mockOnSnapshot.mockImplementation((_ref, successCb, errorCb) => {
      attempt += 1;
      if (attempt === 1) {
        errorCb(new Error('firestore error'));
      } else {
        successCb(createSnapshot([{ id: 'd1', name: 'Craft-Bier' }]));
      }
      return jest.fn();
    });

    const cb = jest.fn();
    subscribeToCustomDrinks('user1', cb);
    expect(cb).not.toHaveBeenCalled();

    jest.runOnlyPendingTimers();
    expect(cb).toHaveBeenCalledWith([{ id: 'd1', name: 'Craft-Bier' }]);

    jest.useRealTimers();
  });

  it('filters out this user\'s own additional-units contributions to someone else\'s drink', () => {
    const drinks = [
      { id: 'd1', name: 'Craft-Bier', einheiten: [] },
      { id: 'd2', extendsOwnerId: 'other-user', einheiten: [{ einheitsgroesse: 0.2 }] },
    ];
    mockOnSnapshot.mockImplementation((_ref, cb) => {
      cb(createSnapshot(drinks));
      return jest.fn();
    });

    const cb = jest.fn();
    subscribeToCustomDrinks('user1', cb);

    expect(cb).toHaveBeenCalledWith([{ id: 'd1', name: 'Craft-Bier', einheiten: [] }]);
  });
});

describe('subscribeToAllCustomDrinks', () => {
  beforeEach(() => jest.clearAllMocks());

  it('merges another user\'s additional-units addition into the drink it extends', () => {
    const drinks = [
      { id: 'd1', __ownerId: 'u1', name: 'Papas Wein', einheiten: [{ einheitsgroesse: 0.75 }] },
      { id: 'd1', __ownerId: 'u2', extendsOwnerId: 'u1', einheiten: [{ einheitsgroesse: 0.2, einheit: 'Glas' }] },
    ];
    mockOnSnapshot.mockImplementation((_ref, cb) => {
      cb(createSnapshot(drinks));
      return jest.fn();
    });

    const cb = jest.fn();
    subscribeToAllCustomDrinks(cb);

    expect(cb).toHaveBeenCalledWith([
      {
        id: 'd1',
        name: 'Papas Wein',
        ownerId: 'u1',
        einheiten: [
          { einheitsgroesse: 0.75 },
          { einheitsgroesse: 0.2, einheit: 'Glas', addedByUserId: 'u2' },
        ],
      },
    ]);
  });

  it('does not wipe existing data on error, and retries the listener instead', () => {
    jest.useFakeTimers();
    let attempt = 0;
    mockOnSnapshot.mockImplementation((_ref, successCb, errorCb) => {
      attempt += 1;
      if (attempt === 1) {
        errorCb(new Error('firestore error'));
      } else {
        successCb(createSnapshot([{ id: 'd1', __ownerId: 'u1', name: 'Craft-Bier', einheiten: [] }]));
      }
      return jest.fn();
    });

    const cb = jest.fn();
    subscribeToAllCustomDrinks(cb);
    expect(cb).not.toHaveBeenCalled();

    jest.runOnlyPendingTimers();
    expect(cb).toHaveBeenCalledWith([{ id: 'd1', ownerId: 'u1', name: 'Craft-Bier', einheiten: [] }]);

    jest.useRealTimers();
  });

  it('does not order the collection-group query by name, since Firestore drops any document missing that field from the results – which would silently exclude every nameless additional-units doc', () => {
    const groupRef = { __marker: 'customDrinks-group' };
    mockCollectionGroup.mockReturnValue(groupRef);
    mockOnSnapshot.mockImplementation((_ref, cb) => {
      cb(createSnapshot([]));
      return jest.fn();
    });

    subscribeToAllCustomDrinks(jest.fn());

    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockOrderBy).not.toHaveBeenCalled();
    expect(mockOnSnapshot).toHaveBeenCalledWith(groupRef, expect.any(Function), expect.any(Function));
  });

  it('sorts the merged result by name client-side', () => {
    const drinks = [
      { id: 'd2', __ownerId: 'u1', name: 'Wasser', einheiten: [] },
      { id: 'd1', __ownerId: 'u1', name: 'Apfelsaft', einheiten: [] },
    ];
    mockOnSnapshot.mockImplementation((_ref, cb) => {
      cb(createSnapshot(drinks));
      return jest.fn();
    });

    const cb = jest.fn();
    subscribeToAllCustomDrinks(cb);

    expect(cb.mock.calls[0][0].map((d) => d.name)).toEqual(['Apfelsaft', 'Wasser']);
  });
});

describe('getAllCustomDrinks / getCustomDrinks', () => {
  beforeEach(() => jest.clearAllMocks());

  it('getAllCustomDrinks merges additional-units additions across owners', async () => {
    const drinks = [
      { id: 'd1', __ownerId: 'u1', name: 'Papas Wein', einheiten: [] },
      { id: 'd1', __ownerId: 'u2', extendsOwnerId: 'u1', einheiten: [{ einheitsgroesse: 0.33 }] },
    ];
    mockGetDocs.mockResolvedValue(createSnapshot(drinks));

    const result = await getAllCustomDrinks();

    expect(result).toEqual([
      {
        id: 'd1',
        name: 'Papas Wein',
        ownerId: 'u1',
        einheiten: [{ einheitsgroesse: 0.33, addedByUserId: 'u2' }],
      },
    ]);
  });

  it('getAllCustomDrinks does not order the collection-group query by name, since Firestore drops any document missing that field from the results – which would silently exclude every nameless additional-units doc', async () => {
    const groupRef = { __marker: 'customDrinks-group' };
    mockCollectionGroup.mockReturnValue(groupRef);
    mockGetDocs.mockResolvedValue(createSnapshot([]));

    await getAllCustomDrinks();

    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockOrderBy).not.toHaveBeenCalled();
    expect(mockGetDocs).toHaveBeenCalledWith(groupRef);
  });

  it('getCustomDrinks excludes this user\'s own additional-units contributions to someone else\'s drink', async () => {
    const drinks = [
      { id: 'd1', name: 'Eigenes Bier', einheiten: [] },
      { id: 'd2', extendsOwnerId: 'other-user', einheiten: [{ einheitsgroesse: 0.2 }] },
    ];
    mockGetDocs.mockResolvedValue(createSnapshot(drinks));

    const result = await getCustomDrinks('user1');

    expect(result).toEqual([{ id: 'd1', name: 'Eigenes Bier', einheiten: [] }]);
  });
});

describe('saveCustomDrink', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a new drink when no drinkId provided', async () => {
    mockAddDoc.mockResolvedValue({ id: 'new-drink-id' });

    const id = await saveCustomDrink('user1', { name: 'Limonade', gebindeLiter: 0.5 });

    expect(mockAddDoc).toHaveBeenCalledTimes(1);
    expect(mockSetDoc).not.toHaveBeenCalled();
    expect(id).toBe('new-drink-id');
  });

  it('updates an existing drink when drinkId provided', async () => {
    mockSetDoc.mockResolvedValue(undefined);

    const id = await saveCustomDrink('user1', { name: 'Limonade', gebindeLiter: 0.5 }, 'existing-id');

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    expect(mockAddDoc).not.toHaveBeenCalled();
    expect(id).toBe('existing-id');
  });
});

describe('deleteCustomDrink', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deletes the specified drink', async () => {
    mockDeleteDoc.mockResolvedValue(undefined);

    await deleteCustomDrink('user1', 'drink-123');

    expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
  });

  it('throws on Firestore error', async () => {
    mockDeleteDoc.mockRejectedValue(new Error('not found'));

    await expect(deleteCustomDrink('user1', 'drink-xyz')).rejects.toThrow('not found');
  });
});

describe('subscribeToGuestProfiles', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls callback with loaded profiles', () => {
    const profiles = [{ id: 'p1', name: 'Familie', adults: 4, children: 2 }];
    mockOnSnapshot.mockImplementation((_ref, cb) => {
      cb(createSnapshot(profiles));
      return jest.fn();
    });

    const cb = jest.fn();
    subscribeToGuestProfiles('user1', cb);

    expect(cb).toHaveBeenCalledWith([{ id: 'p1', name: 'Familie', adults: 4, children: 2 }]);
    expect(mockCollection).toHaveBeenCalledWith({}, 'guests', 'user1', 'profiles');
  });

  it('does not wipe existing data on error, and retries the listener instead', () => {
    jest.useFakeTimers();
    let attempt = 0;
    mockOnSnapshot.mockImplementation((_ref, successCb, errorCb) => {
      attempt += 1;
      if (attempt === 1) {
        errorCb(new Error('firestore error'));
      } else {
        successCb(createSnapshot([{ id: 'p1', name: 'Familie', adults: 4, children: 2 }]));
      }
      return jest.fn();
    });

    const cb = jest.fn();
    subscribeToGuestProfiles('user1', cb);
    expect(cb).not.toHaveBeenCalled();

    jest.runOnlyPendingTimers();
    expect(cb).toHaveBeenCalledWith([{ id: 'p1', name: 'Familie', adults: 4, children: 2 }]);

    jest.useRealTimers();
  });
});

describe('saveGuestProfile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHttpsCallable.mockReturnValue(mockGuestCallable);
  });

  it('creates a new profile when no profileId provided', async () => {
    mockGuestCallable.mockResolvedValue({ data: { id: 'new-profile-id' } });

    const id = await saveGuestProfile('user1', { name: 'Familie', adults: 4, children: 2 });

    expect(mockHttpsCallable).toHaveBeenCalledTimes(1);
    expect(mockHttpsCallable).toHaveBeenCalledWith({}, 'manageGuestProfile');
    expect(mockGuestCallable).toHaveBeenCalledWith({
      action: 'create',
      profileId: null,
      profile: { name: 'Familie', adults: 4, children: 2 },
    });
    expect(id).toBe('new-profile-id');
  });

  it('updates an existing profile when profileId provided', async () => {
    mockGuestCallable.mockResolvedValue({ data: { id: 'profile-abc' } });

    const id = await saveGuestProfile('user1', { name: 'Familie', adults: 4, children: 2 }, 'profile-abc');

    expect(mockGuestCallable).toHaveBeenCalledWith({
      action: 'update',
      profileId: 'profile-abc',
      profile: { name: 'Familie', adults: 4, children: 2 },
    });
    expect(id).toBe('profile-abc');
  });
});

describe('deleteGuestProfile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHttpsCallable.mockReturnValue(mockGuestCallable);
  });

  it('deletes the specified profile', async () => {
    mockGuestCallable.mockResolvedValue({ data: { id: 'profile-123' } });

    await deleteGuestProfile('user1', 'profile-123');

    expect(mockGuestCallable).toHaveBeenCalledWith({
      action: 'delete',
      profileId: 'profile-123',
    });
  });

  it('throws on Firestore error', async () => {
    mockGuestCallable.mockRejectedValue(new Error('not found'));

    await expect(deleteGuestProfile('user1', 'profile-xyz')).rejects.toThrow('not found');
  });
});

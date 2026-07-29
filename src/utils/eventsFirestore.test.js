/**
 * Tests for eventsFirestore utilities – custom drinks and guest profiles.
 */

jest.mock('../firebase', () => ({ db: {}, functions: {} }));

const mockAddDoc = jest.fn();
const mockSetDoc = jest.fn();
const mockDeleteDoc = jest.fn();
const mockOnSnapshot = jest.fn();
const mockServerTimestamp = jest.fn(() => 'mock-ts');
const mockOrderBy = jest.fn((...args) => args);
const mockQuery = jest.fn((...args) => args);
const mockCollection = jest.fn();
const mockDoc = jest.fn();
const mockHttpsCallable = jest.fn();
const mockGuestCallable = jest.fn();

jest.mock('firebase/firestore', () => ({
  collection: (...args) => mockCollection(...args),
  doc: (...args) => mockDoc(...args),
  getDoc: jest.fn(),
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
  saveCustomDrink,
  deleteCustomDrink,
  subscribeToGuestProfiles,
  saveGuestProfile,
  deleteGuestProfile,
} from './eventsFirestore';

const createSnapshot = (items) => ({
  forEach: (cb) =>
    items.forEach((item) => cb({ id: item.id, data: () => { const { id, ...rest } = item; return rest; } })),
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

  it('calls callback with empty array on error', () => {
    mockOnSnapshot.mockImplementation((_ref, _success, errorCb) => {
      errorCb(new Error('firestore error'));
      return jest.fn();
    });

    const cb = jest.fn();
    subscribeToCustomDrinks('user1', cb);

    expect(cb).toHaveBeenCalledWith([]);
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

  it('calls callback with empty array on error', () => {
    mockOnSnapshot.mockImplementation((_ref, _success, errorCb) => {
      errorCb(new Error('firestore error'));
      return jest.fn();
    });

    const cb = jest.fn();
    subscribeToGuestProfiles('user1', cb);

    expect(cb).toHaveBeenCalledWith([]);
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

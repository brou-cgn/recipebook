/**
 * Tests for Recipe Ratings Utilities
 */

// Polyfill crypto.randomUUID for jsdom test environment
if (!global.crypto) {
  global.crypto = {};
}
if (!global.crypto.randomUUID) {
  let counter = 0;
  global.crypto.randomUUID = () => `test-uuid-${++counter}`;
}

// Mock Firebase
jest.mock('../firebase', () => ({
  db: {}
}));

// Mocks for Firestore functions
const mockSetDoc = jest.fn();
const mockGetDoc = jest.fn();
const mockGetDocs = jest.fn();
const mockOnSnapshot = jest.fn();
const mockUpdateDoc = jest.fn();
const mockCollection = jest.fn();
const mockDoc = jest.fn();
const mockServerTimestamp = jest.fn(() => 'mock-timestamp');

jest.mock('firebase/firestore', () => ({
  doc: (...args) => mockDoc(...args),
  setDoc: (...args) => mockSetDoc(...args),
  getDoc: (...args) => mockGetDoc(...args),
  getDocs: (...args) => mockGetDocs(...args),
  onSnapshot: (...args) => mockOnSnapshot(...args),
  updateDoc: (...args) => mockUpdateDoc(...args),
  collection: (...args) => mockCollection(...args),
  serverTimestamp: () => mockServerTimestamp()
}));

import { getGuestId, getRaterKey, rateRecipe, getUserRating, subscribeToRatingSummary } from './recipeRatings';

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
});

describe('getGuestId', () => {
  it('creates and stores a guest ID on first call', () => {
    const id = getGuestId();
    expect(id).toMatch(/^guest_/);
    expect(localStorage.getItem('guestRaterId')).toBe(id);
  });

  it('returns the same guest ID on subsequent calls', () => {
    const id1 = getGuestId();
    const id2 = getGuestId();
    expect(id1).toBe(id2);
  });
});

describe('getRaterKey', () => {
  it('returns the user ID for authenticated users', () => {
    const user = { id: 'user123' };
    expect(getRaterKey(user)).toBe('user123');
  });

  it('returns a guest ID for null user', () => {
    const key = getRaterKey(null);
    expect(key).toMatch(/^guest_/);
  });

  it('returns a guest ID for undefined user', () => {
    const key = getRaterKey(undefined);
    expect(key).toMatch(/^guest_/);
  });
});

describe('getUserRating', () => {
  it('returns null when recipeId is missing', async () => {
    const result = await getUserRating(null, null);
    expect(result).toBeNull();
  });

  it('returns the rating when the document exists', async () => {
    mockDoc.mockReturnValue('rating-ref');
    mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ rating: 4 }) });

    const result = await getUserRating('recipe1', { id: 'user1' });
    expect(result).toBe(4);
  });

  it('returns null when no rating document exists', async () => {
    mockDoc.mockReturnValue('rating-ref');
    mockGetDoc.mockResolvedValue({ exists: () => false });

    const result = await getUserRating('recipe1', { id: 'user1' });
    expect(result).toBeNull();
  });

  it('returns null on Firestore error', async () => {
    mockDoc.mockReturnValue('rating-ref');
    mockGetDoc.mockRejectedValue(new Error('Firestore error'));

    const result = await getUserRating('recipe1', { id: 'user1' });
    expect(result).toBeNull();
  });
});

describe('subscribeToRatingSummary', () => {
  it('immediately calls callback with zeros when recipeId is falsy', () => {
    const callback = jest.fn();
    const unsubscribe = subscribeToRatingSummary(null, callback);
    expect(callback).toHaveBeenCalledWith({ avg: 0, count: 0 });
    expect(typeof unsubscribe).toBe('function');
  });

  it('calls callback with computed avg and count', () => {
    mockCollection.mockReturnValue('ratings-ref');
    const mockUnsub = jest.fn();
    mockOnSnapshot.mockImplementation((ref, onNext) => {
      const snapshot = {
        empty: false,
        size: 2,
        forEach: (cb) => {
          cb({ data: () => ({ rating: 4 }) });
          cb({ data: () => ({ rating: 2 }) });
        }
      };
      onNext(snapshot);
      return mockUnsub;
    });

    const callback = jest.fn();
    const unsubscribe = subscribeToRatingSummary('recipe1', callback);

    expect(callback).toHaveBeenCalledWith({ avg: 3, count: 2 });
    expect(unsubscribe).toBe(mockUnsub);
  });

  it('calls callback with zeros for an empty snapshot', () => {
    mockCollection.mockReturnValue('ratings-ref');
    mockOnSnapshot.mockImplementation((ref, onNext) => {
      onNext({ empty: true, size: 0, forEach: () => {} });
      return jest.fn();
    });

    const callback = jest.fn();
    subscribeToRatingSummary('recipe1', callback);
    expect(callback).toHaveBeenCalledWith({ avg: 0, count: 0 });
  });
});

describe('rateRecipe', () => {
  beforeEach(() => {
    mockDoc.mockReturnValue('ref');
    mockSetDoc.mockResolvedValue();
    mockUpdateDoc.mockResolvedValue();
    // getDocs returns an empty snapshot by default (for updateRatingSummary)
    mockGetDocs.mockResolvedValue({
      empty: false,
      size: 1,
      forEach: (cb) => cb({ data: () => ({ rating: 3 }) })
    });
    mockCollection.mockReturnValue('ratings-ref');
  });

  it('throws on invalid rating value', async () => {
    await expect(rateRecipe('recipe1', 0, null)).rejects.toThrow('Invalid rating parameters');
    await expect(rateRecipe('recipe1', 6, null)).rejects.toThrow('Invalid rating parameters');
  });

  it('throws when recipeId is missing', async () => {
    await expect(rateRecipe(null, 3, null)).rejects.toThrow('Invalid rating parameters');
  });

  it('calls setDoc with correct data for a guest user', async () => {
    await rateRecipe('recipe1', 3, null);

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const [, data] = mockSetDoc.mock.calls[0];
    expect(data.rating).toBe(3);
    expect(data.userType).toBe('guest');
    expect(data.userId).toBeNull();
  });

  it('calls setDoc with correct data for an authenticated user', async () => {
    await rateRecipe('recipe1', 5, { id: 'user1' });

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const [, data] = mockSetDoc.mock.calls[0];
    expect(data.rating).toBe(5);
    expect(data.userType).toBe('user');
    expect(data.userId).toBe('user1');
  });

  it('updates the rating summary on the recipe document', async () => {
    await rateRecipe('recipe1', 4, { id: 'user1' });
    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    const [, updates] = mockUpdateDoc.mock.calls[0];
    expect(updates.ratingAvg).toBeDefined();
    expect(updates.ratingCount).toBeDefined();
  });
});

import { isValidGridImage, getMenuByShareId } from './menuFirestore';

// Mock Firebase modules
var mockAuth = { currentUser: { uid: 'user-1' } };
var mockFunctions = {};
jest.mock('../firebase', () => ({
  db: {},
  get auth() {
    return mockAuth;
  },
  get functions() {
    return mockFunctions;
  }
}));

const mockGetDocs = jest.fn();
const mockHttpsCallable = jest.fn();

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  getDocs: (...args) => mockGetDocs(...args),
  addDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  onSnapshot: jest.fn(),
  serverTimestamp: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  deleteField: jest.fn()
}));

jest.mock('firebase/functions', () => ({
  httpsCallable: (...args) => mockHttpsCallable(...args)
}));

describe('menuFirestore - isValidGridImage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.currentUser = { uid: 'user-1' };
  });

  it('returns true for null', () => {
    expect(isValidGridImage(null)).toBe(true);
  });

  it('returns true for undefined', () => {
    expect(isValidGridImage(undefined)).toBe(true);
  });

  it('returns true for empty string', () => {
    expect(isValidGridImage('')).toBe(true);
  });

  it('returns true for a Firebase Storage URL', () => {
    const url = 'https://firebasestorage.googleapis.com/v0/b/project.appspot.com/o/recipes%2Fmenu-grid-123.jpg?alt=media';
    expect(isValidGridImage(url)).toBe(true);
  });

  it('returns false for a Base64 jpeg data-URL', () => {
    const base64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAASABIAAD';
    expect(isValidGridImage(base64)).toBe(false);
  });

  it('returns false for a Base64 png data-URL', () => {
    const base64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA';
    expect(isValidGridImage(base64)).toBe(false);
  });

  it('returns false for an unknown URL format', () => {
    expect(isValidGridImage('https://example.com/image.jpg')).toBe(false);
  });
});

describe('menuFirestore - getMenuByShareId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.currentUser = { uid: 'user-1' };
  });

  it('uses callable for anonymous users', async () => {
    mockAuth.currentUser = null;
    const callable = jest.fn().mockResolvedValue({
      data: { menu: { id: 'menu-callable', title: 'Shared Menu' } }
    });
    mockHttpsCallable.mockReturnValue(callable);

    const result = await getMenuByShareId('share-id-1');

    expect(mockHttpsCallable).toHaveBeenCalledWith(mockFunctions, 'getSharedMenuByShareId');
    expect(callable).toHaveBeenCalledWith({ shareId: 'share-id-1' });
    expect(result).toEqual({ id: 'menu-callable', title: 'Shared Menu' });
    expect(mockGetDocs).not.toHaveBeenCalled();
  });

  it('keeps direct Firestore query path for authenticated users', async () => {
    const mockMenuDoc = {
      id: 'menu-1',
      data: () => ({ title: 'Direct Menu', shareId: 'share-id-2' })
    };
    mockGetDocs.mockResolvedValue({ empty: false, docs: [mockMenuDoc] });

    const result = await getMenuByShareId('share-id-2');

    expect(result).toEqual({ id: 'menu-1', title: 'Direct Menu', shareId: 'share-id-2' });
    expect(mockHttpsCallable).not.toHaveBeenCalled();
  });

  it('returns null for callable not-found error', async () => {
    mockAuth.currentUser = null;
    const callable = jest.fn().mockRejectedValue({ code: 'functions/not-found' });
    mockHttpsCallable.mockReturnValue(callable);

    const result = await getMenuByShareId('missing-share-id');

    expect(result).toBeNull();
  });
});

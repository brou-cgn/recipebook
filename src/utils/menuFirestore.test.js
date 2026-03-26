import { isValidGridImage } from './menuFirestore';

// Mock Firebase modules
jest.mock('../firebase', () => ({
  db: {}
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  getDocs: jest.fn(),
  addDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  onSnapshot: jest.fn(),
  serverTimestamp: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  deleteField: jest.fn()
}));

describe('menuFirestore - isValidGridImage', () => {
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

/**
 * FAQ Firestore Utilities Tests
 */

// Mock Firebase
jest.mock('../firebase', () => ({
  db: {}
}));

// Mock Firestore functions
const mockAddDoc = jest.fn();
const mockUpdateDoc = jest.fn();
const mockDeleteDoc = jest.fn();
const mockGetDocs = jest.fn();
const mockOnSnapshot = jest.fn();
const mockQuery = jest.fn((...args) => args);
const mockOrderBy = jest.fn((...args) => args);

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  getDocs: (...args) => mockGetDocs(...args),
  addDoc: (...args) => mockAddDoc(...args),
  updateDoc: (...args) => mockUpdateDoc(...args),
  deleteDoc: (...args) => mockDeleteDoc(...args),
  onSnapshot: (...args) => mockOnSnapshot(...args),
  query: (...args) => mockQuery(...args),
  orderBy: (...args) => mockOrderBy(...args),
  serverTimestamp: jest.fn(() => 'mock-timestamp')
}));

// Mock Firestore Utils
jest.mock('./firestoreUtils', () => ({
  removeUndefinedFields: jest.fn((obj) => obj)
}));

import { importFaqsFromMarkdown } from './faqFirestore';

const { collection: mockCollection } = jest.requireMock('firebase/firestore');
const { removeUndefinedFields: mockRemoveUndefinedFields } = jest.requireMock('./firestoreUtils');

describe('importFaqsFromMarkdown', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCollection.mockReturnValue('mock-collection-ref');
    mockRemoveUndefinedFields.mockImplementation((obj) => obj);
    mockAddDoc.mockResolvedValue({ id: 'new-id' });
  });

  it('imports ### headings as level 1 entries', async () => {
    const md = `### Wie lege ich ein Rezept an?\n\nKlick auf das Plus.\n`;
    const count = await importFaqsFromMarkdown(md, 0);
    expect(count).toBe(1);
    expect(mockAddDoc).toHaveBeenCalledTimes(1);
    expect(mockAddDoc).toHaveBeenCalledWith(
      'mock-collection-ref',
      expect.objectContaining({ title: 'Wie lege ich ein Rezept an?', level: 1, order: 0 })
    );
  });

  it('imports ## headings as level 0 entries', async () => {
    const md = `## Überschrift\n\n### Frage\n\nAntwort\n`;
    const count = await importFaqsFromMarkdown(md, 0);
    expect(count).toBe(2);
    expect(mockAddDoc).toHaveBeenCalledTimes(2);
    expect(mockAddDoc).toHaveBeenCalledWith(
      'mock-collection-ref',
      expect.objectContaining({ title: 'Überschrift', level: 0, order: 0 })
    );
    expect(mockAddDoc).toHaveBeenCalledWith(
      'mock-collection-ref',
      expect.objectContaining({ title: 'Frage', level: 1, order: 1 })
    );
  });

  it('uses currentFaqCount as base order index', async () => {
    const md = `### Frage\n\nAntwort\n`;
    await importFaqsFromMarkdown(md, 5);
    expect(mockAddDoc).toHaveBeenCalledWith(
      'mock-collection-ref',
      expect.objectContaining({ order: 5 })
    );
  });

  it('ignores # top-level headings and --- dividers', async () => {
    const md = `# Titel\n\n---\n\n### Frage\n\nAntwort\n`;
    const count = await importFaqsFromMarkdown(md, 0);
    expect(count).toBe(1);
    expect(mockAddDoc).toHaveBeenCalledWith(
      'mock-collection-ref',
      expect.objectContaining({ title: 'Frage', level: 1 })
    );
  });

  it('trims description content', async () => {
    const md = `### Frage\n\nAntwort mit Leerzeichen\n`;
    await importFaqsFromMarkdown(md, 0);
    expect(mockAddDoc).toHaveBeenCalledWith(
      'mock-collection-ref',
      expect.objectContaining({ description: 'Antwort mit Leerzeichen' })
    );
  });

  it('imports multiple entries in order', async () => {
    const md = `## Abschnitt 1\n\n### Frage A\n\nAntwort A\n\n### Frage B\n\nAntwort B\n`;
    const count = await importFaqsFromMarkdown(md, 0);
    expect(count).toBe(3);
    expect(mockAddDoc).toHaveBeenNthCalledWith(
      1, 'mock-collection-ref', expect.objectContaining({ title: 'Abschnitt 1', level: 0, order: 0 })
    );
    expect(mockAddDoc).toHaveBeenNthCalledWith(
      2, 'mock-collection-ref', expect.objectContaining({ title: 'Frage A', level: 1, order: 1 })
    );
    expect(mockAddDoc).toHaveBeenNthCalledWith(
      3, 'mock-collection-ref', expect.objectContaining({ title: 'Frage B', level: 1, order: 2 })
    );
  });

  it('returns 0 for empty markdown', async () => {
    const count = await importFaqsFromMarkdown('', 0);
    expect(count).toBe(0);
    expect(mockAddDoc).not.toHaveBeenCalled();
  });
});

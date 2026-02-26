/**
 * FAQ Firestore Utilities Tests
 */

// Mock Firebase
jest.mock('../firebase', () => ({
  db: {}
}));

// Mock global crypto for UUID generation
global.crypto = { randomUUID: jest.fn(() => 'mock-uuid') };

// Mock Firestore functions
const mockAddDoc = jest.fn();
const mockUpdateDoc = jest.fn();
const mockDeleteDoc = jest.fn();
const mockGetDocs = jest.fn();
const mockOnSnapshot = jest.fn();
const mockDoc = jest.fn();
const mockQuery = jest.fn((...args) => args);
const mockOrderBy = jest.fn((...args) => args);

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: (...args) => mockDoc(...args),
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

import { addFaq, importFaqsFromMarkdown } from './faqFirestore';

const { collection: mockCollection } = jest.requireMock('firebase/firestore');
const { removeUndefinedFields: mockRemoveUndefinedFields } = jest.requireMock('./firestoreUtils');

describe('importFaqsFromMarkdown', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCollection.mockReturnValue('mock-collection-ref');
    mockDoc.mockImplementation((db, col, id) => `mock-doc-ref-${id}`);
    mockRemoveUndefinedFields.mockImplementation((obj) => obj);
    mockAddDoc.mockResolvedValue({ id: 'new-id' });
    mockUpdateDoc.mockResolvedValue(undefined);
  });

  it('imports ### headings as level 1 entries', async () => {
    const md = `### Wie lege ich ein Rezept an?\n\nKlick auf das Plus.\n`;
    const count = await importFaqsFromMarkdown(md, []);
    expect(count).toBe(1);
    expect(mockAddDoc).toHaveBeenCalledTimes(1);
    expect(mockAddDoc).toHaveBeenCalledWith(
      'mock-collection-ref',
      expect.objectContaining({ title: 'Wie lege ich ein Rezept an?', level: 1, order: 0 })
    );
  });

  it('imports ## headings as level 0 entries', async () => {
    const md = `## Überschrift\n\n### Frage\n\nAntwort\n`;
    const count = await importFaqsFromMarkdown(md, []);
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

  it('uses existingFaqs length as base order index for new entries', async () => {
    const md = `### Frage\n\nAntwort\n`;
    const existingFaqs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }];
    await importFaqsFromMarkdown(md, existingFaqs);
    expect(mockAddDoc).toHaveBeenCalledWith(
      'mock-collection-ref',
      expect.objectContaining({ order: 5 })
    );
  });

  it('ignores # top-level headings and --- dividers', async () => {
    const md = `# Titel\n\n---\n\n### Frage\n\nAntwort\n`;
    const count = await importFaqsFromMarkdown(md, []);
    expect(count).toBe(1);
    expect(mockAddDoc).toHaveBeenCalledWith(
      'mock-collection-ref',
      expect.objectContaining({ title: 'Frage', level: 1 })
    );
  });

  it('trims description content', async () => {
    const md = `### Frage\n\nAntwort mit Leerzeichen\n`;
    await importFaqsFromMarkdown(md, []);
    expect(mockAddDoc).toHaveBeenCalledWith(
      'mock-collection-ref',
      expect.objectContaining({ description: 'Antwort mit Leerzeichen' })
    );
  });

  it('imports multiple entries in order', async () => {
    const md = `## Abschnitt 1\n\n### Frage A\n\nAntwort A\n\n### Frage B\n\nAntwort B\n`;
    const count = await importFaqsFromMarkdown(md, []);
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
    const count = await importFaqsFromMarkdown('', []);
    expect(count).toBe(0);
    expect(mockAddDoc).not.toHaveBeenCalled();
  });

  it('stores sourceId when <!-- id: --> comment is present', async () => {
    const md = `### Frage\n<!-- id: faq-001 -->\n\nAntwort\n`;
    await importFaqsFromMarkdown(md, []);
    expect(mockAddDoc).toHaveBeenCalledWith(
      'mock-collection-ref',
      expect.objectContaining({ sourceId: 'faq-001' })
    );
  });

  it('updates existing entry when sourceId matches', async () => {
    const md = `### Frage aktualisiert\n<!-- id: faq-001 -->\n\nNeue Antwort\n`;
    const existingFaqs = [{ id: 'firestore-doc-id', sourceId: 'faq-001', title: 'Alter Titel', level: 1 }];
    const count = await importFaqsFromMarkdown(md, existingFaqs);
    expect(count).toBe(1);
    expect(mockAddDoc).not.toHaveBeenCalled();
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        title: 'Frage aktualisiert',
        description: 'Neue Antwort',
        sourceId: 'faq-001'
      })
    );
  });

  it('creates new entry when sourceId does not match any existing FAQ', async () => {
    const md = `### Neue Frage\n<!-- id: faq-new -->\n\nAntwort\n`;
    const existingFaqs = [{ id: 'x', sourceId: 'faq-001' }];
    const count = await importFaqsFromMarkdown(md, existingFaqs);
    expect(count).toBe(1);
    expect(mockUpdateDoc).not.toHaveBeenCalled();
    expect(mockAddDoc).toHaveBeenCalledWith(
      'mock-collection-ref',
      expect.objectContaining({ title: 'Neue Frage', sourceId: 'faq-new' })
    );
  });

  it('creates new entry (no update) when entry has no id comment (backward compatibility)', async () => {
    const md = `### Frage ohne ID\n\nAntwort\n`;
    const existingFaqs = [{ id: 'x', sourceId: 'faq-001' }];
    const count = await importFaqsFromMarkdown(md, existingFaqs);
    expect(count).toBe(1);
    expect(mockUpdateDoc).not.toHaveBeenCalled();
    expect(mockAddDoc).toHaveBeenCalledWith(
      'mock-collection-ref',
      expect.not.objectContaining({ sourceId: expect.anything() })
    );
  });

  it('handles mix of updates and creates in one import', async () => {
    const md = `### Bekannte Frage\n<!-- id: faq-001 -->\n\nAktualisiert\n\n### Neue Frage\n<!-- id: faq-999 -->\n\nNeu\n`;
    const existingFaqs = [{ id: 'doc-1', sourceId: 'faq-001', title: 'Alt', level: 1 }];
    const count = await importFaqsFromMarkdown(md, existingFaqs);
    expect(count).toBe(2);
    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    expect(mockAddDoc).toHaveBeenCalledTimes(1);
    expect(mockAddDoc).toHaveBeenCalledWith(
      'mock-collection-ref',
      expect.objectContaining({ title: 'Neue Frage', sourceId: 'faq-999', order: 1 })
    );
  });
});

describe('addFaq', () => {
  const { serverTimestamp: mockServerTimestamp } = jest.requireMock('firebase/firestore');

  beforeEach(() => {
    jest.clearAllMocks();
    mockCollection.mockReturnValue('mock-collection-ref');
    mockRemoveUndefinedFields.mockImplementation((obj) => obj);
    mockAddDoc.mockResolvedValue({ id: 'new-id' });
    mockServerTimestamp.mockReturnValue('mock-timestamp');
    global.crypto.randomUUID.mockReturnValue('mock-uuid');
  });

  it('auto-generates a sourceId when none is provided', async () => {
    const result = await addFaq({ title: 'Test', description: 'Desc', order: 0 });
    expect(mockAddDoc).toHaveBeenCalledWith(
      'mock-collection-ref',
      expect.objectContaining({ sourceId: expect.any(String) })
    );
    const calledData = mockAddDoc.mock.calls[0][1];
    expect(calledData.sourceId).toBeTruthy();
    expect(result.sourceId).toBeTruthy();
  });

  it('preserves a provided sourceId instead of generating a new one', async () => {
    await addFaq({ title: 'Test', description: 'Desc', order: 0, sourceId: 'my-custom-id' });
    const calledData = mockAddDoc.mock.calls[0][1];
    expect(calledData.sourceId).toBe('my-custom-id');
  });

  it('sets createdAt and updatedAt timestamps', async () => {
    await addFaq({ title: 'Test', order: 0 });
    const calledData = mockAddDoc.mock.calls[0][1];
    expect(calledData.createdAt).toBe('mock-timestamp');
    expect(calledData.updatedAt).toBe('mock-timestamp');
  });

  it('returns object with Firestore id and data', async () => {
    const result = await addFaq({ title: 'Test', order: 0 });
    expect(result.id).toBe('new-id');
    expect(result.title).toBe('Test');
  });
});

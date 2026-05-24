/**
 * Saisonmatrix Firestore Utilities Tests
 */

jest.mock('../firebase', () => ({
  db: {}
}));

const mockSetDoc = jest.fn();
const mockUpdateDoc = jest.fn();
const mockDeleteDoc = jest.fn();
const mockOnSnapshot = jest.fn();
const mockDoc = jest.fn();
const mockQuery = jest.fn((...args) => args);
const mockOrderBy = jest.fn((...args) => args);

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: (...args) => mockDoc(...args),
  setDoc: (...args) => mockSetDoc(...args),
  updateDoc: (...args) => mockUpdateDoc(...args),
  deleteDoc: (...args) => mockDeleteDoc(...args),
  onSnapshot: (...args) => mockOnSnapshot(...args),
  query: (...args) => mockQuery(...args),
  orderBy: (...args) => mockOrderBy(...args),
  serverTimestamp: jest.fn(() => 'mock-timestamp')
}));

jest.mock('./firestoreUtils', () => ({
  removeUndefinedFields: jest.fn((obj) => obj)
}));

import {
  subscribeToSeasonMatrix,
  addSeasonMatrixEntry,
  updateSeasonMatrixEntry,
  deleteSeasonMatrixEntry
} from './seasonMatrix';

const { collection: mockCollection } = jest.requireMock('firebase/firestore');
const { removeUndefinedFields: mockRemoveUndefinedFields } = jest.requireMock('./firestoreUtils');
const { serverTimestamp: mockServerTimestamp } = jest.requireMock('firebase/firestore');

describe('seasonMatrix utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCollection.mockReturnValue('mock-season-matrix-collection');
    mockServerTimestamp.mockReturnValue('mock-timestamp');
    mockRemoveUndefinedFields.mockImplementation((obj) => obj);
    mockDoc.mockImplementation((db, col, id) => `mock-doc-ref-${id}`);
    mockSetDoc.mockResolvedValue(undefined);
    mockUpdateDoc.mockResolvedValue(undefined);
    mockDeleteDoc.mockResolvedValue(undefined);
  });

  it('subscribes and maps snapshot docs to entry list', () => {
    const callback = jest.fn();
    const unsubscribe = jest.fn();
    mockOnSnapshot.mockImplementation((queryRef, onNext) => {
      onNext({
        forEach: (handler) => {
          handler({ id: 'kartoffel', data: () => ({ name: 'Kartoffel', isActive: true }) });
        }
      });
      return unsubscribe;
    });

    const result = subscribeToSeasonMatrix(callback);

    expect(result).toBe(unsubscribe);
    expect(callback).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'kartoffel', name: 'Kartoffel', isActive: true })
    ]);
  });

  it('adds an entry with server timestamp and updatedBy', async () => {
    await addSeasonMatrixEntry(
      {
        id: 'kartoffel',
        name: 'Kartoffel',
        mainSeasonMonths: [4, 5],
        seasonScore: 90,
        labelMode: 'jetzt_saison',
        isActive: true,
        region: 'DE'
      },
      'admin@example.com'
    );

    expect(mockSetDoc).toHaveBeenCalledWith(
      'mock-doc-ref-kartoffel',
      expect.objectContaining({
        id: 'kartoffel',
        updatedAt: 'mock-timestamp',
        updatedBy: 'admin@example.com'
      })
    );
  });

  it('updates an entry with server timestamp and updatedBy', async () => {
    await updateSeasonMatrixEntry(
      'kartoffel',
      { name: 'Kartoffel neu', seasonScore: 85 },
      'editor@example.com'
    );

    expect(mockUpdateDoc).toHaveBeenCalledWith(
      'mock-doc-ref-kartoffel',
      expect.objectContaining({
        name: 'Kartoffel neu',
        seasonScore: 85,
        updatedAt: 'mock-timestamp',
        updatedBy: 'editor@example.com'
      })
    );
  });

  it('deletes an entry by id', async () => {
    await deleteSeasonMatrixEntry('kartoffel');
    expect(mockDeleteDoc).toHaveBeenCalledWith('mock-doc-ref-kartoffel');
  });
});

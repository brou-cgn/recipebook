/**
 * Group Firestore Utilities Tests
 */

// Mock Firebase
jest.mock('../firebase', () => ({
  db: {}
}));

// Mock Firestore functions
const mockOnSnapshot = jest.fn();
const mockGetDocs = jest.fn();
const mockGetDoc = jest.fn();
const mockAddDoc = jest.fn();
const mockUpdateDoc = jest.fn();
const mockDeleteDoc = jest.fn();
const mockQuery = jest.fn((...args) => args);
const mockWhere = jest.fn((...args) => args);

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  getDoc: (...args) => mockGetDoc(...args),
  getDocs: (...args) => mockGetDocs(...args),
  addDoc: (...args) => mockAddDoc(...args),
  updateDoc: (...args) => mockUpdateDoc(...args),
  deleteDoc: (...args) => mockDeleteDoc(...args),
  onSnapshot: (...args) => mockOnSnapshot(...args),
  query: (...args) => mockQuery(...args),
  where: (...args) => mockWhere(...args),
  serverTimestamp: jest.fn(() => 'mock-timestamp')
}));

// Mock Firestore Utils
jest.mock('./firestoreUtils', () => ({
  removeUndefinedFields: jest.fn((obj) => obj)
}));

import {
  subscribeToGroups,
  getGroups,
  addGroup,
  updateGroup,
  deleteGroup,
  getGroup,
  ensurePublicGroup,
  PUBLIC_GROUP_NAME
} from './groupFirestore';

// References to mocked functions (set up implementations in beforeEach)
const { collection: mockCollection, doc: mockDoc } = jest.requireMock('firebase/firestore');
const { removeUndefinedFields: mockRemoveUndefinedFields } = jest.requireMock('./firestoreUtils');

const createMockSnapshot = (groups) => ({
  empty: groups.length === 0,
  docs: groups.map((g) => ({ id: g.id, data: () => { const { id, ...rest } = g; return rest; } })),
  forEach: (callback) => {
    groups.forEach((g) => {
      callback({ id: g.id, data: () => { const { id, ...rest } = g; return rest; } });
    });
  }
});

describe('groupFirestore - subscribeToGroups', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should include public groups regardless of user membership', (done) => {
    const groups = [
      { id: 'g1', type: 'public', name: PUBLIC_GROUP_NAME, ownerId: null, memberIds: [] },
      { id: 'g2', type: 'private', name: 'Team A', ownerId: 'user2', memberIds: ['user2'] }
    ];
    mockOnSnapshot.mockImplementation((_ref, successCallback) => {
      successCallback(createMockSnapshot(groups));
      return jest.fn();
    });

    subscribeToGroups('user1', (result) => {
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('g1');
      done();
    });
  });

  it('should include groups where user is owner', (done) => {
    const groups = [
      { id: 'g1', type: 'private', name: 'My Group', ownerId: 'user1', memberIds: ['user1'] },
      { id: 'g2', type: 'private', name: 'Other Group', ownerId: 'user2', memberIds: ['user2'] }
    ];
    mockOnSnapshot.mockImplementation((_ref, successCallback) => {
      successCallback(createMockSnapshot(groups));
      return jest.fn();
    });

    subscribeToGroups('user1', (result) => {
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('g1');
      done();
    });
  });

  it('should include groups where user is a member', (done) => {
    const groups = [
      { id: 'g1', type: 'private', name: 'Team', ownerId: 'user2', memberIds: ['user2', 'user1'] },
      { id: 'g2', type: 'private', name: 'Other', ownerId: 'user3', memberIds: ['user3'] }
    ];
    mockOnSnapshot.mockImplementation((_ref, successCallback) => {
      successCallback(createMockSnapshot(groups));
      return jest.fn();
    });

    subscribeToGroups('user1', (result) => {
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('g1');
      done();
    });
  });

  it('should call callback with empty array on error', (done) => {
    mockOnSnapshot.mockImplementation((_ref, _successCallback, errorCallback) => {
      errorCallback(new Error('Firestore error'));
      return jest.fn();
    });

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    subscribeToGroups('user1', (result) => {
      expect(result).toEqual([]);
      consoleSpy.mockRestore();
      done();
    });
  });
});

describe('groupFirestore - getGroups', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return public and user-relevant groups', async () => {
    const groups = [
      { id: 'g1', type: 'public', name: PUBLIC_GROUP_NAME, ownerId: null, memberIds: [] },
      { id: 'g2', type: 'private', name: 'My Group', ownerId: 'user1', memberIds: ['user1'] },
      { id: 'g3', type: 'private', name: 'Other', ownerId: 'user2', memberIds: ['user2'] }
    ];
    mockGetDocs.mockResolvedValue(createMockSnapshot(groups));

    const result = await getGroups('user1');
    expect(result).toHaveLength(2);
    expect(result.map((g) => g.id)).toEqual(['g1', 'g2']);
  });

  it('should return empty array on error', async () => {
    mockGetDocs.mockRejectedValue(new Error('Firestore error'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    const result = await getGroups('user1');
    expect(result).toEqual([]);
    consoleSpy.mockRestore();
  });
});

describe('groupFirestore - addGroup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCollection.mockReturnValue('mock-collection-ref');
    mockRemoveUndefinedFields.mockImplementation((obj) => obj);
    mockAddDoc.mockResolvedValue({ id: 'new-group-id' });
  });

  it('should always include ownerId in memberIds', async () => {
    // ownerId not in the provided list
    const groupData = { name: 'Test Group', memberIds: ['user2', 'user3'], memberRoles: {} };
    const result = await addGroup(groupData, 'user1');

    expect(mockAddDoc).toHaveBeenCalledWith(
      'mock-collection-ref',
      expect.objectContaining({
        type: 'private',
        name: 'Test Group',
        ownerId: 'user1',
        memberIds: ['user1', 'user2', 'user3']
      })
    );
    expect(result.id).toBe('new-group-id');
  });

  it('should default memberIds to [ownerId] when not provided', async () => {
    const groupData = { name: 'Solo Group' };
    await addGroup(groupData, 'user1');

    expect(mockAddDoc).toHaveBeenCalledWith(
      'mock-collection-ref',
      expect.objectContaining({ memberIds: ['user1'] })
    );
  });

  it('should throw on Firestore error', async () => {
    mockAddDoc.mockRejectedValue(new Error('Firestore error'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    await expect(addGroup({ name: 'Fail' }, 'user1')).rejects.toThrow('Firestore error');
    consoleSpy.mockRestore();
  });
});

describe('groupFirestore - updateGroup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDoc.mockImplementation((_db, ...path) => path.join('/'));
    mockRemoveUndefinedFields.mockImplementation((obj) => obj);
    mockUpdateDoc.mockResolvedValue(undefined);
    jest.requireMock('firebase/firestore').serverTimestamp.mockReturnValue('mock-timestamp');
  });

  it('should call updateDoc with updated fields', async () => {
    await updateGroup('g1', { name: 'Updated Name' });

    expect(mockUpdateDoc).toHaveBeenCalledWith(
      'groups/g1',
      expect.objectContaining({ name: 'Updated Name', updatedAt: 'mock-timestamp' })
    );
  });

  it('should throw on Firestore error', async () => {
    mockUpdateDoc.mockRejectedValue(new Error('Firestore error'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    await expect(updateGroup('g1', { name: 'Fail' })).rejects.toThrow('Firestore error');
    consoleSpy.mockRestore();
  });
});

describe('groupFirestore - deleteGroup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDoc.mockImplementation((_db, ...path) => path.join('/'));
    mockDeleteDoc.mockResolvedValue(undefined);
  });

  it('should call deleteDoc with the correct reference', async () => {
    await deleteGroup('g1');

    expect(mockDeleteDoc).toHaveBeenCalledWith('groups/g1');
  });

  it('should throw on Firestore error', async () => {
    mockDeleteDoc.mockRejectedValue(new Error('Firestore error'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    await expect(deleteGroup('g1')).rejects.toThrow('Firestore error');
    consoleSpy.mockRestore();
  });
});

describe('groupFirestore - getGroup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDoc.mockImplementation((_db, ...path) => path.join('/'));
  });

  it('should return the group when it exists', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      id: 'g1',
      data: () => ({ name: 'My Group', type: 'private', ownerId: 'user1', memberIds: ['user1'] })
    });

    const result = await getGroup('g1');
    expect(result).toEqual({ id: 'g1', name: 'My Group', type: 'private', ownerId: 'user1', memberIds: ['user1'] });
  });

  it('should return null when group does not exist', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false });

    const result = await getGroup('nonexistent');
    expect(result).toBeNull();
  });

  it('should return null on error', async () => {
    mockGetDoc.mockRejectedValue(new Error('Firestore error'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    const result = await getGroup('g1');
    expect(result).toBeNull();
    consoleSpy.mockRestore();
  });
});

describe('groupFirestore - ensurePublicGroup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCollection.mockReturnValue('mock-collection-ref');
    mockRemoveUndefinedFields.mockImplementation((obj) => obj);
    mockAddDoc.mockResolvedValue({ id: 'public-group-id' });
  });

  it('should return existing public group ID if one exists', async () => {
    mockGetDocs.mockResolvedValue({
      empty: false,
      docs: [{ id: 'existing-public-id' }]
    });

    const result = await ensurePublicGroup();
    expect(result).toBe('existing-public-id');
    expect(mockAddDoc).not.toHaveBeenCalled();
  });

  it('should create a new public group if none exists', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });

    const result = await ensurePublicGroup();
    expect(result).toBe('public-group-id');
    expect(mockAddDoc).toHaveBeenCalledWith(
      'mock-collection-ref',
      expect.objectContaining({ type: 'public', name: PUBLIC_GROUP_NAME })
    );
  });
});

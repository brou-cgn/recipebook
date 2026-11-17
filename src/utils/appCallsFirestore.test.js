/**
 * Tests for App Calls Firestore Utilities
 */

jest.mock('../firebase', () => ({
  db: {}
}));

const mockGetDocs = jest.fn();
const mockQuery = jest.fn((...args) => args);
const mockOrderBy = jest.fn((...args) => args);
const mockWhere = jest.fn((...args) => args);
const mockLimit = jest.fn((...args) => args);

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => 'mock-collection-ref'),
  addDoc: jest.fn(),
  getDocs: (...args) => mockGetDocs(...args),
  query: (...args) => mockQuery(...args),
  orderBy: (...args) => mockOrderBy(...args),
  where: (...args) => mockWhere(...args),
  limit: (...args) => mockLimit(...args),
  serverTimestamp: jest.fn(() => 'mock-timestamp'),
  Timestamp: { fromDate: (date) => ({ toDate: () => date, _isMock: true }) }
}));

import { getRecentAppCalls, RECENT_APP_CALLS_LIMIT } from './appCallsFirestore';

const { collection: mockCollection } = jest.requireMock('firebase/firestore');
const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getRecentAppCalls', () => {
  it('reads only the time window, newest first, with an upper bound', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [{ id: 'call-1', data: () => ({ userId: 'u1', timestamp: 'ts1' }) }]
    });

    const before = Date.now();
    const result = await getRecentAppCalls(7);

    expect(mockCollection).toHaveBeenCalledWith({}, 'appCalls');
    expect(mockWhere).toHaveBeenCalledWith('timestamp', '>=', expect.objectContaining({ _isMock: true }));
    const cutoff = mockWhere.mock.calls[0][2].toDate().getTime();
    // Sieben Tage zurück (mit Spielraum für die Laufzeit und Zeitumstellung).
    expect(before - cutoff).toBeGreaterThanOrEqual(7 * DAY_MS - 2 * 60 * 60 * 1000);
    expect(before - cutoff).toBeLessThanOrEqual(7 * DAY_MS + 2 * 60 * 60 * 1000);
    expect(mockOrderBy).toHaveBeenCalledWith('timestamp', 'desc');
    expect(mockLimit).toHaveBeenCalledWith(RECENT_APP_CALLS_LIMIT);
    expect(result).toEqual([{ id: 'call-1', userId: 'u1', timestamp: 'ts1' }]);
  });

  it('warns when the upper bound is reached', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const docs = Array.from({ length: RECENT_APP_CALLS_LIMIT }, (_, index) => ({
      id: `call-${index}`,
      data: () => ({ timestamp: index })
    }));
    mockGetDocs.mockResolvedValue({ docs });

    const result = await getRecentAppCalls(7);

    expect(result).toHaveLength(RECENT_APP_CALLS_LIMIT);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('limit of 2000 reached'));
    warn.mockRestore();
  });

  it('returns an empty array if getDocs fails', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetDocs.mockRejectedValue(new Error('Firestore error'));

    await expect(getRecentAppCalls(7)).resolves.toEqual([]);
    error.mockRestore();
  });
});

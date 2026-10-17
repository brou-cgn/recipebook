/**
 * Neuaufbau der Firestore-Verbindung (firestoreReconnect.js).
 */
import { reconnectFirestore } from './firestoreReconnect';

const mockCalls = [];
const mockDisableNetwork = jest.fn();
jest.mock('firebase/firestore', () => ({
  disableNetwork: (...args) => mockDisableNetwork(...args),
  enableNetwork: () => {
    mockCalls.push('enable');
    return Promise.resolve();
  },
}));
jest.mock('../firebase', () => ({ db: {} }));

beforeEach(() => {
  mockCalls.length = 0;
});

test('trennt und verbindet in dieser Reihenfolge', async () => {
  mockDisableNetwork.mockImplementation(() => {
    mockCalls.push('disable');
    return Promise.resolve();
  });

  await reconnectFirestore();

  expect(mockCalls).toEqual(['disable', 'enable']);
});

test('verbindet auch dann wieder, wenn das Trennen fehlschlägt', async () => {
  mockDisableNetwork.mockImplementation(() => Promise.reject(new Error('offline')));

  await expect(reconnectFirestore()).resolves.toBeUndefined();

  expect(mockCalls).toEqual(['enable']);
});

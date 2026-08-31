/**
 * Tests for the Firestore connection recovery used by the Events module's
 * listeners (see subscribeWithRetry in eventsFirestore.js).
 */

jest.mock('../firebase', () => ({ db: {} }));

const mockDisableNetwork = jest.fn(() => Promise.resolve());
const mockEnableNetwork = jest.fn(() => Promise.resolve());

jest.mock('firebase/firestore', () => ({
  disableNetwork: (...args) => mockDisableNetwork(...args),
  enableNetwork: (...args) => mockEnableNetwork(...args),
}));

import {
  reportCacheOnlySnapshot,
  reportServerSnapshot,
  hasCacheOnlyListeners,
  recoverFirestoreNetworkIfStuck,
  recoverFirestoreNetworkThrottled,
  __resetFirestoreConnectionState,
} from './firestoreConnection';

describe('firestoreConnection', () => {
  beforeEach(() => {
    __resetFirestoreConnectionState();
    mockDisableNetwork.mockImplementation(() => Promise.resolve());
    mockEnableNetwork.mockImplementation(() => Promise.resolve());
  });

  it('tracks which listeners are stuck on cache-only data', () => {
    expect(hasCacheOnlyListeners()).toBe(false);
    reportCacheOnlySnapshot('guests#1');
    expect(hasCacheOnlyListeners()).toBe(true);
    reportServerSnapshot('guests#1');
    expect(hasCacheOnlyListeners()).toBe(false);
  });

  it('does not touch the connection when nothing is stuck', async () => {
    await expect(recoverFirestoreNetworkIfStuck()).resolves.toBe(false);
    expect(mockDisableNetwork).not.toHaveBeenCalled();
  });

  it('forces the client to rebuild its streams when a listener is stuck', async () => {
    reportCacheOnlySnapshot('guests#1');
    await expect(recoverFirestoreNetworkIfStuck(1000)).resolves.toBe(true);
    expect(mockDisableNetwork).toHaveBeenCalledTimes(1);
    expect(mockEnableNetwork).toHaveBeenCalledTimes(1);
  });

  it('collapses the burst of listeners resuming together into a single recovery', async () => {
    reportCacheOnlySnapshot('guests#1');
    reportCacheOnlySnapshot('events#2');
    await recoverFirestoreNetworkIfStuck(1000);
    await recoverFirestoreNetworkIfStuck(2000);
    await recoverFirestoreNetworkIfStuck(5000);
    expect(mockDisableNetwork).toHaveBeenCalledTimes(1);
  });

  it('allows another attempt once the cooldown has elapsed', async () => {
    reportCacheOnlySnapshot('guests#1');
    await recoverFirestoreNetworkIfStuck(1000);
    await recoverFirestoreNetworkIfStuck(1000 + 10000);
    expect(mockDisableNetwork).toHaveBeenCalledTimes(2);
  });

  it('survives a client that cannot be recovered, so callers keep their own retry ladder', async () => {
    mockDisableNetwork.mockImplementation(() => Promise.reject(new Error('client terminated')));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(recoverFirestoreNetworkThrottled(1000)).resolves.toBe(true);
    expect(mockEnableNetwork).not.toHaveBeenCalled();
    console.error.mockRestore();
  });
});

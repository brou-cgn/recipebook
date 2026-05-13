/**
 * Push Notification Utilities Tests
 */

let mockMessagingPromise = Promise.resolve({});

// Mock firebase module
jest.mock('../firebase', () => ({
  firebaseConfig: {
    apiKey: 'test-api-key',
    projectId: 'test-project',
    messagingSenderId: '12345',
  },
  isMessagingSupported: jest.fn(),
  get messagingPromise() {
    return mockMessagingPromise;
  },
  functions: {},
}));

// Mock firebase/messaging
const mockGetToken = jest.fn();
const mockOnMessage = jest.fn();
jest.mock('firebase/messaging', () => ({
  getToken: (...args) => mockGetToken(...args),
  onMessage: (...args) => mockOnMessage(...args),
}));

// Mock firebase/functions
const mockHttpsCallable = jest.fn();
jest.mock('firebase/functions', () => ({
  httpsCallable: (...args) => mockHttpsCallable(...args),
}));

import {
  requestNotificationPermission,
  setupForegroundMessageListener,
  notifyPrivateListMembers,
} from './pushNotifications';

const { isMessagingSupported: mockIsSupported } = jest.requireMock('../firebase');

describe('pushNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMessagingPromise = Promise.resolve({});

    // Default: messaging is supported
    mockIsSupported.mockResolvedValue(true);

    // Default: onMessage returns a no-op unsubscribe function
    mockOnMessage.mockReturnValue(() => {});

    // Stub Notification API
    Object.defineProperty(global, 'Notification', {
      value: { requestPermission: jest.fn(), permission: 'default' },
      writable: true,
      configurable: true,
    });

    // Stub navigator.serviceWorker
    const mockShowNotification = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(global.navigator, 'serviceWorker', {
      value: {
        register: jest.fn().mockResolvedValue({
          active: { postMessage: jest.fn() },
          installing: null,
          waiting: null,
        }),
        ready: Promise.resolve({ active: { postMessage: jest.fn() }, showNotification: mockShowNotification }),
      },
      writable: true,
      configurable: true,
    });
    global.__mockShowNotification = mockShowNotification;

    // Default env var
    process.env.REACT_APP_FIREBASE_VAPID_KEY = 'test-vapid-key';
  });

  afterEach(() => {
    process.env.REACT_APP_FIREBASE_VAPID_KEY = 'test-vapid-key';
  });

  describe('requestNotificationPermission', () => {
    it('returns null when FCM is not supported', async () => {
      mockIsSupported.mockResolvedValue(false);
      const token = await requestNotificationPermission();
      expect(token).toBeNull();
    });

    it('returns null when VAPID key is missing', async () => {
      delete process.env.REACT_APP_FIREBASE_VAPID_KEY;
      const token = await requestNotificationPermission();
      expect(token).toBeNull();
    });

    it('returns null when permission is denied', async () => {
      global.Notification.requestPermission = jest.fn().mockResolvedValue('denied');
      const token = await requestNotificationPermission();
      expect(token).toBeNull();
    });

    it('returns null without calling requestPermission when permission is already denied', async () => {
      global.Notification.permission = 'denied';

      const token = await requestNotificationPermission();

      expect(token).toBeNull();
      expect(global.Notification.requestPermission).not.toHaveBeenCalled();
    });

    it('does not call requestPermission again when permission is already granted', async () => {
      global.Notification.permission = 'granted';
      mockGetToken.mockResolvedValue('granted-token');

      const token = await requestNotificationPermission();

      expect(token).toBe('granted-token');
      expect(global.Notification.requestPermission).not.toHaveBeenCalled();
    });

    it('returns the FCM token when getToken resolves', async () => {
      global.Notification.requestPermission = jest.fn().mockResolvedValue('granted');
      mockGetToken.mockResolvedValue('mock-fcm-token');

      const token = await requestNotificationPermission();
      expect(token).toBe('mock-fcm-token');
    });

    it('returns null and does not throw on getToken error', async () => {
      global.Notification.requestPermission = jest.fn().mockResolvedValue('granted');
      mockGetToken.mockRejectedValue(new Error('token error'));

      await expect(requestNotificationPermission()).resolves.toBeNull();
    });
  });

  describe('notifyPrivateListMembers', () => {
    it('does nothing when groupId is missing', async () => {
      await notifyPrivateListMembers(null, 'recipe1', 'actor1', 'added');
      expect(mockHttpsCallable).not.toHaveBeenCalled();
    });

    it('does nothing when recipeId is missing', async () => {
      await notifyPrivateListMembers('group1', null, 'actor1', 'added');
      expect(mockHttpsCallable).not.toHaveBeenCalled();
    });

    it('does nothing when actorId is missing', async () => {
      await notifyPrivateListMembers('group1', 'recipe1', null, 'added');
      expect(mockHttpsCallable).not.toHaveBeenCalled();
    });

    it('calls the cloud function with correct arguments', async () => {
      const mockFn = jest.fn().mockResolvedValue({ data: { success: true, sent: 2 } });
      mockHttpsCallable.mockReturnValue(mockFn);

      await notifyPrivateListMembers('group1', 'recipe1', 'actor1', 'added');

      expect(mockHttpsCallable).toHaveBeenCalledWith(
        expect.anything(),
        'notifyPrivateListMembers'
      );
      expect(mockFn).toHaveBeenCalledWith({
        groupId: 'group1',
        recipeId: 'recipe1',
        actorId: 'actor1',
        action: 'added',
      });
    });

    it('calls the cloud function for created action', async () => {
      const mockFn = jest.fn().mockResolvedValue({ data: { success: true, sent: 1 } });
      mockHttpsCallable.mockReturnValue(mockFn);

      await notifyPrivateListMembers('group1', 'recipe1', 'actor1', 'created');

      expect(mockFn).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'created' })
      );
    });

    it('does not throw when cloud function call fails', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('network error'));
      mockHttpsCallable.mockReturnValue(mockFn);

      await expect(
        notifyPrivateListMembers('group1', 'recipe1', 'actor1', 'added')
      ).resolves.toBeUndefined();
    });
  });

  describe('setupForegroundMessageListener', () => {
    beforeEach(() => {
      // Ensure Notification.permission is 'granted' for showNotification tests
      Object.defineProperty(global, 'Notification', {
        value: { permission: 'granted', requestPermission: jest.fn() },
        writable: true,
        configurable: true,
      });
      // Reset foreground handler flag
      delete window.__fcmForegroundHandlerActive;
    });

    afterEach(() => {
      delete window.__fcmForegroundHandlerActive;
    });

    it('calls reg.showNotification() with data.title/body when app is hidden', async () => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'hidden',
      });

      setupForegroundMessageListener();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockOnMessage).toHaveBeenCalledTimes(1);
      const onMessageHandler = mockOnMessage.mock.calls[0][1];
      await onMessageHandler({
        data: { title: 'Data Title', body: 'Data Body', notificationId: 'test-id-1' },
        notification: { title: 'Notification Title', body: 'Notification Body' },
      });

      expect(global.__mockShowNotification).toHaveBeenCalledWith('Data Title', expect.objectContaining({
        body: 'Data Body',
        icon: '/logo192.png',
        tag: 'test-id-1',
      }));
    });

    it('calls reg.showNotification() when app is visible but no in-app handler is active', async () => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'visible',
      });

      setupForegroundMessageListener();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockOnMessage).toHaveBeenCalledTimes(1);
      const onMessageHandler = mockOnMessage.mock.calls[0][1];
      await onMessageHandler({
        data: { title: 'Data Title', body: 'Data Body', notificationId: 'test-id-2' },
      });

      expect(global.__mockShowNotification).toHaveBeenCalledWith('Data Title', expect.objectContaining({
        body: 'Data Body',
        tag: 'test-id-2',
      }));
    });

    it('dispatches fcm-foreground-message CustomEvent when app is visible and handler is active', async () => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'visible',
      });
      window.__fcmForegroundHandlerActive = true;

      const receivedEvents = [];
      const handler = (e) => receivedEvents.push(e.detail);
      window.addEventListener('fcm-foreground-message', handler);

      try {
        setupForegroundMessageListener();
        await new Promise((resolve) => setTimeout(resolve, 0));

        const onMessageHandler = mockOnMessage.mock.calls[0][1];
        await onMessageHandler({
          data: { title: 'Toast Title', body: 'Toast Body', notificationId: 'toast-id-1' },
        });

        expect(receivedEvents).toHaveLength(1);
        expect(receivedEvents[0]).toMatchObject({ title: 'Toast Title', body: 'Toast Body' });
        // reg.showNotification() should NOT be called when CustomEvent is dispatched
        expect(global.__mockShowNotification).not.toHaveBeenCalled();
      } finally {
        window.removeEventListener('fcm-foreground-message', handler);
      }
    });

    it('de-duplicates notifications with the same notificationId', async () => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'hidden',
      });

      setupForegroundMessageListener();
      await new Promise((resolve) => setTimeout(resolve, 0));

      const onMessageHandler = mockOnMessage.mock.calls[0][1];
      const payload = { data: { title: 'T', body: 'B', notificationId: 'dedup-id' } };
      await onMessageHandler(payload);
      await onMessageHandler(payload);

      expect(global.__mockShowNotification).toHaveBeenCalledTimes(1);
    });

    it('returns a cleanup function that sets cancelled and unsubscribes', async () => {
      const mockUnsubscribe = jest.fn();
      mockOnMessage.mockReturnValue(mockUnsubscribe);

      const cleanup = setupForegroundMessageListener();
      await new Promise((resolve) => setTimeout(resolve, 0));

      cleanup();
      expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    });

    it('does not register a listener when cancelled before async setup completes', async () => {
      // Call and immediately clean up (simulates React Strict Mode double-invoke)
      const cleanup = setupForegroundMessageListener();
      cleanup(); // cancel immediately

      await new Promise((resolve) => setTimeout(resolve, 0));

      // onMessage should NOT have been called because cancelled = true
      expect(mockOnMessage).not.toHaveBeenCalled();
    });

    it('falls back to RecipeBook title when payload has no title', async () => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'hidden',
      });

      setupForegroundMessageListener();
      await new Promise((resolve) => setTimeout(resolve, 0));

      const onMessageHandler = mockOnMessage.mock.calls[0][1];
      await onMessageHandler({ data: {}, notification: {} });

      expect(global.__mockShowNotification).toHaveBeenCalledWith('RecipeBook', expect.any(Object));
    });
  });
});

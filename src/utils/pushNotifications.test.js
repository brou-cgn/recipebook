/**
 * Push Notification Utilities Tests
 */

let mockMessagingPromise = Promise.resolve({});
let mockShowNotification;

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
    mockShowNotification = jest.fn();

    // Default: messaging is supported
    mockIsSupported.mockResolvedValue(true);

    // Stub Notification API
    Object.defineProperty(global, 'Notification', {
      value: { requestPermission: jest.fn(), permission: 'default' },
      writable: true,
      configurable: true,
    });

    // Stub navigator.serviceWorker
    Object.defineProperty(global.navigator, 'serviceWorker', {
      value: {
        register: jest.fn().mockResolvedValue({
          active: { postMessage: jest.fn() },
          installing: null,
          waiting: null,
        }),
        ready: Promise.resolve({
          active: { postMessage: jest.fn() },
          showNotification: mockShowNotification,
        }),
      },
      writable: true,
      configurable: true,
    });

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
    it('prefers title and body from payload.data and always uses service worker notifications', async () => {
      const NotificationMock = jest.fn();
      NotificationMock.permission = 'granted';
      NotificationMock.requestPermission = jest.fn();
      global.Notification = NotificationMock;
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'visible',
      });

      setupForegroundMessageListener();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockOnMessage).toHaveBeenCalledTimes(1);
      const onMessageHandler = mockOnMessage.mock.calls[0][1];
      onMessageHandler({
        data: { title: 'Data Title', body: 'Data Body', notificationId: 'test-id-1' },
        notification: { title: 'Notification Title', body: 'Notification Body' },
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(NotificationMock).not.toHaveBeenCalled();
      expect(mockShowNotification).toHaveBeenCalledWith('Data Title', {
        body: 'Data Body',
        icon: '/logo192.png',
        tag: 'test-id-1',
        data: { title: 'Data Title', body: 'Data Body', notificationId: 'test-id-1' },
      });
    });

    it('uses service worker notifications when app is not visible', async () => {
      const NotificationMock = jest.fn();
      NotificationMock.permission = 'granted';
      NotificationMock.requestPermission = jest.fn();
      global.Notification = NotificationMock;
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'hidden',
      });

      setupForegroundMessageListener();
      await new Promise((resolve) => setTimeout(resolve, 0));

      const onMessageHandler = mockOnMessage.mock.calls[0][1];
      onMessageHandler({
        data: { title: 'Hidden Title', body: 'Hidden Body', notificationId: 'hidden-id' },
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(NotificationMock).not.toHaveBeenCalled();
      expect(mockShowNotification).toHaveBeenCalledWith('Hidden Title', {
        body: 'Hidden Body',
        icon: '/logo192.png',
        tag: 'hidden-id',
        data: { title: 'Hidden Title', body: 'Hidden Body', notificationId: 'hidden-id' },
      });
    });
  });
});

/**
 * Push Notification Utilities Tests
 */

let mockMessagingPromise = Promise.resolve({});
let mockShowNotification;
let mockUpdate;

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
  registerMessagingServiceWorker,
  getMessagingServiceWorkerVersion,
} from './pushNotifications';

const { isMessagingSupported: mockIsSupported } = jest.requireMock('../firebase');

describe('pushNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMessagingPromise = Promise.resolve({});
    mockShowNotification = jest.fn();
    mockUpdate = jest.fn().mockResolvedValue(undefined);

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
          update: mockUpdate,
        }),
        ready: Promise.resolve({
          active: { postMessage: jest.fn() },
          showNotification: mockShowNotification,
        }),
        // No messaging registration found: falls back to `ready`
        getRegistration: jest.fn().mockResolvedValue(undefined),
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

  describe('Mitteilungs-Worker aktuell halten', () => {
    // jsdom has no MessageChannel; port2 delivers straight to port1.
    beforeEach(() => {
      global.MessageChannel = class {
        constructor() {
          this.port1 = {};
          this.port2 = { postMessage: (data) => this.port1.onmessage?.({ data }) };
        }
      };
    });

    afterEach(() => {
      jest.useRealTimers();
      delete global.MessageChannel;
    });

    it('sucht bei jeder Registrierung nach einer neueren Fassung', async () => {
      await registerMessagingServiceWorker();

      expect(mockUpdate).toHaveBeenCalled();
    });

    it('meldet die Version des laufenden Workers', async () => {
      const worker = {
        postMessage: jest.fn((message, [port]) => {
          if (message.type === 'GET_MESSAGING_SW_VERSION') port.postMessage({ version: 'v2.23.25' });
        }),
      };
      global.navigator.serviceWorker.getRegistration.mockResolvedValue({ active: worker });

      await expect(getMessagingServiceWorkerVersion()).resolves.toBe('v2.23.25');
    });

    it('eine ältere Fassung antwortet nicht: null', async () => {
      jest.useFakeTimers();
      global.navigator.serviceWorker.getRegistration.mockResolvedValue({ active: { postMessage: jest.fn() } });

      const version = getMessagingServiceWorkerVersion();
      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(2000);

      await expect(version).resolves.toBeNull();
    });

    it('ohne Registrierung: none', async () => {
      await expect(getMessagingServiceWorkerVersion()).resolves.toBe('none');
    });
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
    it('shows the notification through the messaging service worker so a tap reaches its click handler', async () => {
      const NotificationMock = jest.fn();
      NotificationMock.permission = 'granted';
      global.Notification = NotificationMock;
      const messagingShowNotification = jest.fn();
      global.navigator.serviceWorker.getRegistration.mockResolvedValue({
        showNotification: messagingShowNotification,
      });

      setupForegroundMessageListener();
      await new Promise((resolve) => setTimeout(resolve, 0));

      const onMessageHandler = mockOnMessage.mock.calls[0][1];
      onMessageHandler({
        data: { type: 'import_ready', title: 'Rezept bereit zur Prüfung', recipeId: 'r1', notificationId: 'import-r1' },
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(global.navigator.serviceWorker.getRegistration).toHaveBeenCalledWith('/firebase-cloud-messaging-push-scope');
      expect(messagingShowNotification).toHaveBeenCalledWith('Rezept bereit zur Prüfung', expect.objectContaining({
        data: expect.objectContaining({ type: 'import_ready', recipeId: 'r1' }),
      }));
      expect(mockShowNotification).not.toHaveBeenCalled();
    });

    it('displays notification via service worker using payload.data', async () => {
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
        badge: '/favicon.ico',
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
        badge: '/favicon.ico',
        tag: 'hidden-id',
        data: { title: 'Hidden Title', body: 'Hidden Body', notificationId: 'hidden-id' },
      });
    });
  });
});

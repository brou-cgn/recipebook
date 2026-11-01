import {
  PUSH_FAILED,
  PUSH_NOT_ALLOWED,
  PUSH_SCHEDULED,
  cancelTimerPush,
  scheduleTimerPush,
  timerAlarmId,
} from './timerPush';
import { requestNotificationPermission } from './pushNotifications';
import { createTimerAlarm, deleteTimerAlarm, saveTimerPushToken } from './cookingTimerAlarmsFirestore';

jest.mock('./pushNotifications', () => ({ requestNotificationPermission: jest.fn() }));
jest.mock('./cookingTimerAlarmsFirestore', () => ({
  createTimerAlarm: jest.fn(),
  deleteTimerAlarm: jest.fn(),
  saveTimerPushToken: jest.fn(),
}));

// Der Token wird je Nutzer zwischengespeichert: jeder Test nutzt deshalb eine eigene uid.
const allowNotifications = (permission = 'granted') => {
  window.Notification = { permission };
};

afterEach(() => {
  delete window.Notification;
});

test('the alarm id begins with the uid and contains only safe characters', () => {
  expect(timerAlarmId('u1', 'r/1', 'step_0', 0, 1700000000000)).toBe('u1_r-1_step-0_0_1700000000000');
});

test('does nothing while notifications are not allowed', async () => {
  allowNotifications('default');
  await expect(scheduleTimerPush('u-default', 'u-default_a', { dueAt: 1, body: 'x' })).resolves.toBe(PUSH_NOT_ALLOWED);
  expect(requestNotificationPermission).not.toHaveBeenCalled();
  expect(createTimerAlarm).not.toHaveBeenCalled();
});

test('creates the alarm with this device\'s token, which is fetched and saved once', async () => {
  allowNotifications();
  requestNotificationPermission.mockResolvedValue('tok-1');
  saveTimerPushToken.mockResolvedValue();
  createTimerAlarm.mockResolvedValue();

  await expect(scheduleTimerPush('u-ok', 'u-ok_a', { dueAt: 123, body: 'Apfelrotkohl: 40 Minuten' }))
    .resolves.toBe(PUSH_SCHEDULED);
  await scheduleTimerPush('u-ok', 'u-ok_b', { dueAt: 456, body: 'x'.repeat(300) });

  expect(requestNotificationPermission).toHaveBeenCalledTimes(1);
  expect(saveTimerPushToken).toHaveBeenCalledTimes(1);
  expect(saveTimerPushToken).toHaveBeenCalledWith('u-ok', 'tok-1');
  expect(createTimerAlarm).toHaveBeenCalledWith('u-ok_a', {
    uid: 'u-ok', token: 'tok-1', dueAt: 123, body: 'Apfelrotkohl: 40 Minuten',
  });
  expect(createTimerAlarm.mock.calls[1][1].body).toHaveLength(200);
});

test('reports a failure without a token or when Firestore refuses, without throwing', async () => {
  allowNotifications();
  requestNotificationPermission.mockResolvedValue(null);
  await expect(scheduleTimerPush('u-notoken', 'u-notoken_a', { dueAt: 1, body: '' })).resolves.toBe(PUSH_FAILED);
  expect(createTimerAlarm).not.toHaveBeenCalled();

  requestNotificationPermission.mockResolvedValue('tok-2');
  saveTimerPushToken.mockResolvedValue();
  createTimerAlarm.mockRejectedValue(new Error('permission-denied'));
  await expect(scheduleTimerPush('u-denied', 'u-denied_a', { dueAt: 1, body: '' })).resolves.toBe(PUSH_FAILED);
});

test('cancelling waits until the alarm has been issued, so the delete comes after it', async () => {
  allowNotifications();
  let resolveToken;
  requestNotificationPermission.mockReturnValue(new Promise((resolve) => { resolveToken = resolve; }));
  saveTimerPushToken.mockResolvedValue();
  const order = [];
  createTimerAlarm.mockImplementation(async () => { order.push('create'); });
  deleteTimerAlarm.mockImplementation(async () => { order.push('delete'); });

  const scheduled = scheduleTimerPush('u-race', 'u-race_a', { dueAt: 1, body: '' });
  const cancelled = cancelTimerPush('u-race_a');
  resolveToken('tok-3');
  await Promise.all([scheduled, cancelled]);

  expect(order).toEqual(['create', 'delete']);
});

test('cancelling never throws', async () => {
  deleteTimerAlarm.mockRejectedValue(new Error('offline'));
  await expect(cancelTimerPush('u-x_a')).resolves.toBeUndefined();
});

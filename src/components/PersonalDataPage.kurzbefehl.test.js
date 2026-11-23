/**
 * Persönlicher Kurzbefehl-Schlüssel in den persönlichen Daten (Tech-Check S7): erzeugen, einmal anzeigen,
 * widerrufen mit Rückgängig.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PersonalDataPage from './PersonalDataPage';

const mockCreateShortcutToken = jest.fn();
const mockRevokeShortcutToken = jest.fn();

jest.mock('../utils/shortcutToken', () => ({
  createShortcutToken: (...args) => mockCreateShortcutToken(...args),
  revokeShortcutToken: (...args) => mockRevokeShortcutToken(...args),
}));

jest.mock('../utils/userManagement', () => ({
  updateUserProfile: jest.fn(),
  changePassword: jest.fn(),
  saveFcmToken: jest.fn(),
  setUserSprache: jest.fn(),
  setBackgroundUpdatesEnabled: jest.fn(),
}));

jest.mock('../utils/customLists', () => ({
  ALARM_SOUNDS: [{ key: 'radar', label: 'Radar' }],
  getAlarmSoundPreference: jest.fn(() => 'radar'),
  saveAlarmSoundPreference: jest.fn(),
  getDarkModeMode: jest.fn(() => 'auto'),
  saveDarkModePreference: jest.fn(),
  applyDarkModePreference: jest.fn(),
}));

jest.mock('../utils/alarmAudioUtils', () => ({ previewAlarmSound: jest.fn() }));

jest.mock('../utils/pushNotifications', () => ({
  requestNotificationPermission: jest.fn(),
  getMessagingServiceWorkerVersion: () => Promise.resolve(null),
}));

jest.mock('../utils/pushTapHandoff', () => ({
  readPushLog: () => Promise.resolve([]),
  clearPushLog: () => Promise.resolve(),
}));

const TOKEN = `rbk.user-1.${'A'.repeat(43)}`;
const nutzer = (extra = {}) => ({ id: 'user-1', vorname: 'John', nachname: 'Doe', email: 'john@example.com', ...extra });

beforeAll(() => {
  Object.defineProperty(window, 'scrollTo', { value: jest.fn(), writable: true });
});

beforeEach(() => {
  // resetMocks setzt die Implementierung vor jedem Test zurück (Tech-Check T6)
  mockCreateShortcutToken.mockImplementation(() => Promise.resolve(TOKEN));
  mockRevokeShortcutToken.mockImplementation(() => Promise.resolve());
});

afterEach(() => {
  jest.useRealTimers();
});

test('ohne Schlüssel: erzeugen zeigt ihn einmal an und meldet das Profil weiter', async () => {
  const onProfileUpdated = jest.fn();
  render(<PersonalDataPage currentUser={nutzer()} onBack={() => {}} onProfileUpdated={onProfileUpdated} />);

  expect(screen.getByText(/^Noch kein Schlüssel/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Schlüssel erzeugen' }));

  expect(await screen.findByText(TOKEN)).toBeInTheDocument();
  expect(screen.getByText(/Nur jetzt sichtbar/)).toBeInTheDocument();
  expect(screen.getByText(/^Schlüssel aktiv seit /)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Neuen Schlüssel erzeugen' })).toBeInTheDocument();
  expect(onProfileUpdated).toHaveBeenCalledWith(
    expect.objectContaining({ shortcutTokenEnabled: true }),
    expect.objectContaining({ schliessen: false }),
  );
});

test('Kopieren schreibt den Schlüssel in die Zwischenablage', async () => {
  const writeText = jest.fn(() => Promise.resolve());
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  render(<PersonalDataPage currentUser={nutzer()} onBack={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Schlüssel erzeugen' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Kopieren' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Kopiert' })).toBeInTheDocument());
  expect(writeText).toHaveBeenCalledWith(TOKEN);
});

test('mit Schlüssel: Widerrufen wirkt erst nach dem Rückgängig-Fenster', async () => {
  jest.useFakeTimers();
  render(<PersonalDataPage currentUser={nutzer({ shortcutTokenEnabled: true })} onBack={() => {}} />);

  fireEvent.click(screen.getByRole('button', { name: 'Kurzbefehl-Schlüssel entfernen' }));
  expect(screen.getByText(/^Noch kein Schlüssel/)).toBeInTheDocument();
  expect(mockRevokeShortcutToken).not.toHaveBeenCalled();

  await act(async () => { jest.advanceTimersByTime(6000); });
  expect(mockRevokeShortcutToken).toHaveBeenCalledTimes(1);
});

test('„Rückgängig“ behält den Schlüssel', async () => {
  jest.useFakeTimers();
  render(<PersonalDataPage currentUser={nutzer({ shortcutTokenEnabled: true })} onBack={() => {}} />);

  fireEvent.click(screen.getByRole('button', { name: 'Kurzbefehl-Schlüssel entfernen' }));
  fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));

  expect(screen.getByText('Schlüssel aktiv')).toBeInTheDocument();
  await act(async () => { jest.advanceTimersByTime(6000); });
  expect(mockRevokeShortcutToken).not.toHaveBeenCalled();
});

test('Fehler beim Erzeugen wird gemeldet, ohne Schlüssel anzuzeigen', async () => {
  mockCreateShortcutToken.mockImplementation(() => Promise.reject(new Error('internal')));
  render(<PersonalDataPage currentUser={nutzer()} onBack={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Schlüssel erzeugen' }));
  expect(await screen.findByText(/konnte nicht erzeugt werden/)).toBeInTheDocument();
  expect(screen.queryByText(TOKEN)).not.toBeInTheDocument();
});

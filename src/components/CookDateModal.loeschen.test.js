/**
 * Löschen eines „Gekocht am“-Eintrags nach CLAUDE.md (Tech-Check D9): Der Eintrag verschwindet sofort,
 * gelöscht wird erst nach dem Rückgängig-Fenster (6 s); „Rückgängig“ holt ihn an seine Stelle zurück.
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import CookDateModal from './CookDateModal';

const mockDeleteCookDate = jest.fn(() => Promise.resolve());

jest.mock('../utils/imageUtils', () => ({
  isBase64Image: jest.fn(() => false),
}));

jest.mock('../utils/recipeCookDates', () => ({
  setCookDate: () => Promise.resolve(true),
  deleteCookDate: (...args) => mockDeleteCookDate(...args),
  subscribeCookDates: (_recipeId, callback) => {
    callback([
      { id: 'cd-1', userId: 'u1', date: new Date('2026-11-20T12:00:00Z') },
      { id: 'cd-2', userId: 'u1', date: new Date('2026-11-10T12:00:00Z') },
    ]);
    return () => {};
  },
}));

const props = {
  recipeId: 'recipe-1',
  currentUser: { id: 'u1', vorname: 'Test' },
  canDeleteCookDates: true,
  onClose: jest.fn(),
};

beforeEach(() => {
  jest.useFakeTimers();
  // resetMocks setzt die Implementierung vor jedem Test zurück (Tech-Check T6)
  mockDeleteCookDate.mockImplementation(() => Promise.resolve());
});

afterEach(() => {
  jest.useRealTimers();
});

const eintraege = () => screen.queryAllByRole('button', { name: /^Eintrag vom .* entfernen$/ });

test('Eintrag verschwindet sofort, gelöscht wird erst nach 6 Sekunden', () => {
  render(<CookDateModal {...props} />);
  expect(eintraege()).toHaveLength(2);

  fireEvent.click(eintraege()[0]);

  expect(eintraege()).toHaveLength(1);
  expect(screen.getByRole('status')).toHaveTextContent(/Eintrag vom .* entfernt/);
  expect(mockDeleteCookDate).not.toHaveBeenCalled();

  act(() => { jest.advanceTimersByTime(6000); });
  expect(mockDeleteCookDate).toHaveBeenCalledWith('cd-1');
});

test('„Rückgängig“ holt den Eintrag an seine Stelle zurück und löscht nichts', () => {
  render(<CookDateModal {...props} />);
  const ersterName = eintraege()[0].getAttribute('aria-label');

  fireEvent.click(eintraege()[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));

  expect(eintraege()).toHaveLength(2);
  expect(eintraege()[0]).toHaveAttribute('aria-label', ersterName);
  act(() => { jest.advanceTimersByTime(6000); });
  expect(mockDeleteCookDate).not.toHaveBeenCalled();
});

test('ohne Berechtigung kein Löschen', () => {
  render(<CookDateModal {...props} canDeleteCookDates={false} />);
  expect(eintraege()).toHaveLength(0);
});

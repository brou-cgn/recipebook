/**
 * Löschen einer Bewertung nach CLAUDE.md (Tech-Check D9): Die Bewertung verschwindet sofort, gelöscht wird
 * erst nach dem Rückgängig-Fenster (6 s); „Rückgängig“ holt sie an ihre Stelle zurück.
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import RatingModal from './RatingModal';

const mockDeleteRating = jest.fn(() => Promise.resolve());
const mockRatings = [
  { id: 'r1', rating: 5, raterName: 'Anna', comment: 'Lecker', updatedAt: new Date('2026-11-20T12:00:00Z') },
  { id: 'r2', rating: 3, raterName: 'Ben', comment: '', updatedAt: new Date('2026-11-19T12:00:00Z') },
];

jest.mock('../utils/recipeRatings', () => ({
  rateRecipe: () => Promise.resolve(),
  getUserRatingData: () => Promise.resolve({ rating: null, comment: '' }),
  subscribeToRatingSummary: (_id, callback) => { callback({ avg: 4, count: 2 }); return () => {}; },
  getAllRatings: () => Promise.resolve(mockRatings),
  deleteRating: (...args) => mockDeleteRating(...args),
}));

jest.mock('../utils/customLists', () => {
  const actual = jest.requireActual('../utils/customLists');
  return { ...actual, getButtonIcons: () => Promise.resolve({ ...actual.DEFAULT_BUTTON_ICONS }) };
});

const props = {
  recipeId: 'recipe-1',
  currentUser: { id: 'admin', vorname: 'Admin' },
  canDeleteRatings: true,
  onClose: jest.fn(),
};

beforeEach(() => {
  jest.useFakeTimers();
  // resetMocks setzt die Implementierung vor jedem Test zurück (Tech-Check T6)
  mockDeleteRating.mockImplementation(() => Promise.resolve());
});

afterEach(() => {
  jest.useRealTimers();
});

const renderModal = async (overrides = {}) => {
  render(<RatingModal {...props} {...overrides} />);
  // Bewertungen laden asynchron
  await act(async () => { await Promise.resolve(); });
};

test('Bewertung verschwindet sofort, gelöscht wird erst nach 6 Sekunden', async () => {
  await renderModal();
  fireEvent.click(screen.getByRole('button', { name: 'Bewertung von Anna entfernen' }));

  expect(screen.queryByRole('button', { name: 'Bewertung von Anna entfernen' })).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('„Bewertung von Anna“ entfernt');
  expect(mockDeleteRating).not.toHaveBeenCalled();

  await act(async () => { jest.advanceTimersByTime(6000); });
  expect(mockDeleteRating).toHaveBeenCalledWith('recipe-1', 'r1');
});

test('„Rückgängig“ holt die Bewertung an ihre Stelle zurück und löscht nichts', async () => {
  await renderModal();
  fireEvent.click(screen.getByRole('button', { name: 'Bewertung von Anna entfernen' }));
  fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));

  const knoepfe = screen.getAllByRole('button', { name: /^Bewertung von .* entfernen$/ });
  expect(knoepfe.map((k) => k.getAttribute('aria-label'))).toEqual([
    'Bewertung von Anna entfernen',
    'Bewertung von Ben entfernen',
  ]);
  await act(async () => { jest.advanceTimersByTime(6000); });
  expect(mockDeleteRating).not.toHaveBeenCalled();
});

test('ohne Berechtigung kein Löschen', async () => {
  await renderModal({ canDeleteRatings: false });
  expect(screen.queryAllByRole('button', { name: /^Bewertung von .* entfernen$/ })).toHaveLength(0);
});

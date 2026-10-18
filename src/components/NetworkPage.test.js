import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import NetworkPage from './NetworkPage';
import {
  loadNetwork, respondToFollow, stopFollowing, removeFollower,
} from '../utils/followFirestore';

jest.mock('../utils/followFirestore', () => ({
  loadNetwork: jest.fn(),
  respondToFollow: jest.fn(() => Promise.resolve({ status: 'accepted' })),
  stopFollowing: jest.fn(() => Promise.resolve()),
  removeFollower: jest.fn(() => Promise.resolve()),
}));

const network = () => ({
  requests: [{ id: 'anna', name: 'Anna Berg' }],
  following: [{ id: 'ben', name: 'Ben Roth', status: 'accepted' }, { id: 'cleo', name: 'Cleo Vogt', status: 'pending' }],
  followers: [{ id: 'dora', name: 'Dora Lenz' }],
  blocked: [{ id: 'emil', name: 'Emil Hahn' }],
});

const user = { id: 'me' };

beforeEach(() => {
  jest.clearAllMocks();
  loadNetwork.mockResolvedValue(network());
});

test('zeigt offene Anfragen und nimmt eine an', async () => {
  render(<NetworkPage currentUser={user} onBack={() => {}} />);
  expect(await screen.findByText('Anna Berg')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Annehmen' }));
  await waitFor(() => expect(respondToFollow).toHaveBeenCalledWith('anna', 'accept'));
  expect(loadNetwork).toHaveBeenCalledTimes(2);
});

test('Ablehnen und Blockieren rufen respondFollow', async () => {
  render(<NetworkPage currentUser={user} onBack={() => {}} />);
  await screen.findByText('Anna Berg');
  fireEvent.click(screen.getByRole('button', { name: 'Ablehnen' }));
  await waitFor(() => expect(respondToFollow).toHaveBeenCalledWith('anna', 'decline'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Blockieren' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Blockieren' }));
  await waitFor(() => expect(respondToFollow).toHaveBeenCalledWith('anna', 'block'));
});

test('Blockierte lassen sich freigeben', async () => {
  render(<NetworkPage currentUser={user} onBack={() => {}} />);
  expect(await screen.findByText('Emil Hahn')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Freigeben' }));
  await waitFor(() => expect(respondToFollow).toHaveBeenCalledWith('emil', 'unblock'));
});

test('Ich folge: Angefragte sind markiert, Entfernen wirkt erst nach dem Undo-Fenster', async () => {
  jest.useFakeTimers();
  try {
    render(<NetworkPage currentUser={user} onBack={() => {}} />);
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByRole('tab', { name: 'Ich folge' }));
    expect(screen.getByText('Angefragt')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ben Roth entfernen' }));
    expect(screen.queryByText('Ben Roth', { selector: '.network-row-name' })).not.toBeInTheDocument();
    expect(stopFollowing).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(6000); });
    expect(stopFollowing).toHaveBeenCalledWith('me', 'ben');
  } finally {
    jest.useRealTimers();
  }
});

test('Rückgängig stellt die Zeile wieder her, ohne zu löschen', async () => {
  jest.useFakeTimers();
  try {
    render(<NetworkPage currentUser={user} onBack={() => {}} />);
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByRole('tab', { name: 'Follower' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dora Lenz entfernen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));
    expect(screen.getByText('Dora Lenz', { selector: '.network-row-name' })).toBeInTheDocument();
    act(() => { jest.advanceTimersByTime(6000); });
    expect(removeFollower).not.toHaveBeenCalled();
  } finally {
    jest.useRealTimers();
  }
});

test('Ladefehler wird angezeigt', async () => {
  loadNetwork.mockRejectedValue(new Error('x'));
  jest.spyOn(console, 'error').mockImplementation(() => {});
  render(<NetworkPage currentUser={user} onBack={() => {}} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('nicht geladen');
});

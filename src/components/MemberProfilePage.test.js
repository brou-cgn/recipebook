import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import MemberProfilePage from './MemberProfilePage';
import FollowName from './FollowName';
import { FollowProvider } from '../contexts/FollowContext';
import { subscribeMyFollows, requestToFollow, stopFollowing } from '../utils/followFirestore';

jest.mock('../utils/followFirestore', () => ({
  subscribeMyFollows: jest.fn(),
  requestToFollow: jest.fn(),
  stopFollowing: jest.fn(),
}));

const recipes = [
  { id: 'r1', title: 'Linsensuppe', authorId: 'anna' },
  { id: 'r2', title: 'Brot', authorId: 'ben' },
];

let statuses;

beforeEach(() => {
  jest.clearAllMocks();
  statuses = {};
  subscribeMyFollows.mockImplementation((uid, onChange) => {
    onChange(statuses);
    return () => {};
  });
  requestToFollow.mockResolvedValue({ status: 'pending' });
  stopFollowing.mockResolvedValue();
});

const renderProfile = (extra = {}) => render(
  <FollowProvider userId="me" enabled onOpenProfile={jest.fn()}>
    <MemberProfilePage userId="anna" name="Anna" recipes={recipes}
      onBack={() => {}} onSelectRecipe={jest.fn()} {...extra} />
  </FollowProvider>,
);

test('zeigt nur die Rezepte der Person', () => {
  const onSelectRecipe = jest.fn();
  renderProfile({ onSelectRecipe });
  expect(screen.getByText('Linsensuppe')).toBeInTheDocument();
  expect(screen.queryByText('Brot')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Linsensuppe'));
  expect(onSelectRecipe).toHaveBeenCalledWith(recipes[0]);
});

test('ohne Beziehung: Folgen stellt die Anfrage', () => {
  renderProfile();
  fireEvent.click(screen.getByRole('button', { name: 'Folgen' }));
  expect(requestToFollow).toHaveBeenCalledWith('anna');
});

test('angefragt: Zurückziehen wirkt erst nach dem Undo-Fenster', async () => {
  jest.useFakeTimers();
  try {
    statuses = { anna: 'pending' };
    renderProfile();
    expect(screen.getByText(/Angefragt/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Anfrage zurückziehen' }));
    expect(screen.getByText('Du folgst dieser Person nicht.')).toBeInTheDocument();
    expect(stopFollowing).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(6000); });
    expect(stopFollowing).toHaveBeenCalledWith('me', 'anna');
  } finally {
    jest.useRealTimers();
  }
});

test('angenommen: Rückgängig bricht das Beenden ab', async () => {
  jest.useFakeTimers();
  try {
    statuses = { anna: 'accepted' };
    renderProfile();
    expect(screen.getByText('Du folgst dieser Person.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Nicht mehr folgen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));
    expect(screen.getByText('Du folgst dieser Person.')).toBeInTheDocument();
    await act(async () => { jest.advanceTimersByTime(6000); });
    expect(stopFollowing).not.toHaveBeenCalled();
  } finally {
    jest.useRealTimers();
  }
});

test('eigenes Profil hat keine Folgen-Karte', () => {
  render(
    <FollowProvider userId="me" enabled>
      <MemberProfilePage userId="me" name="Ich" recipes={[]} onBack={() => {}} onSelectRecipe={() => {}} />
    </FollowProvider>,
  );
  expect(screen.queryByRole('button', { name: 'Folgen' })).not.toBeInTheDocument();
});

describe('FollowName', () => {
  const renderName = (provider = {}) => {
    const openProfile = jest.fn();
    render(
      <FollowProvider userId="me" enabled onOpenProfile={openProfile} {...provider}>
        <FollowName userId="anna" name="Anna" />
      </FollowProvider>,
    );
    return openProfile;
  };

  test('ohne Beziehung nur Text', () => {
    renderName();
    expect(screen.getByText('Anna')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  test('ab angefragt ein Link auf das Profil', () => {
    statuses = { anna: 'pending' };
    const openProfile = renderName();
    fireEvent.click(screen.getByRole('button', { name: 'Profil von Anna öffnen' }));
    expect(openProfile).toHaveBeenCalledWith('anna');
  });

  test('ohne Freischaltung immer Text', () => {
    statuses = { anna: 'pending' };
    renderName({ enabled: false });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

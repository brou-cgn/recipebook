import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import FuerDichAttributionText from './FuerDichAttributionText';
import { FollowProvider } from '../contexts/FollowContext';
import { subscribeMyFollows } from '../utils/followFirestore';

jest.mock('../utils/followFirestore', () => ({
  subscribeMyFollows: jest.fn(),
  requestToFollow: jest.fn(),
  stopFollowing: jest.fn(),
}));

const entries = [{ userId: 'anna', kind: 'cooked', day: '2026-10-18' }];
const nameOf = (id) => ({ anna: 'Anna' }[id] || '');

beforeEach(() => {
  jest.clearAllMocks();
  subscribeMyFollows.mockImplementation((uid, onChange) => {
    onChange({ anna: 'accepted' });
    return () => {};
  });
});

test('Name ist ein Link auf das Profil, ohne die Karte zu öffnen', () => {
  const onOpenProfile = jest.fn();
  const onCardClick = jest.fn();
  render(
    <FollowProvider userId="me" enabled onOpenProfile={onOpenProfile}>
      <div onClick={onCardClick}><FuerDichAttributionText entries={entries} nameOf={nameOf} /></div>
    </FollowProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Profil von Anna öffnen' }));
  expect(onOpenProfile).toHaveBeenCalledWith('anna');
  expect(onCardClick).not.toHaveBeenCalled();
});

test('ohne Freischaltung reiner Satz', () => {
  const { container } = render(
    <FollowProvider userId="me" enabled={false} onOpenProfile={() => {}}>
      <FuerDichAttributionText entries={entries} nameOf={nameOf} />
    </FollowProvider>,
  );
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(container.textContent).toMatch(/^Anna hat das gekocht · /);
});

test('unbekannte Mitglieder bleiben Text', () => {
  render(
    <FollowProvider userId="me" enabled onOpenProfile={() => {}}>
      <FuerDichAttributionText entries={[{ userId: 'zz', kind: 'cooked', day: '2026-10-18' }]} nameOf={nameOf} />
    </FollowProvider>,
  );
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.getByText(/Ein Mitglied hat das gekocht/)).toBeInTheDocument();
});

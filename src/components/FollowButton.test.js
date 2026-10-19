import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import FollowButton from './FollowButton';
import { FollowProvider } from '../contexts/FollowContext';
import { subscribeMyFollows, requestToFollow, stopFollowing } from '../utils/followFirestore';

jest.mock('../utils/followFirestore', () => ({
  subscribeMyFollows: jest.fn(),
  requestToFollow: jest.fn(),
  stopFollowing: jest.fn(),
}));

let pushStatuses;

beforeEach(() => {
  jest.clearAllMocks();
  subscribeMyFollows.mockImplementation((uid, onChange) => {
    pushStatuses = onChange;
    onChange({});
    return () => {};
  });
  requestToFollow.mockResolvedValue({ status: 'pending' });
  stopFollowing.mockResolvedValue();
});

const renderButton = (props = {}, provider = {}) => render(
  <FollowProvider userId="me" enabled {...provider}>
    <FollowButton userId="anna" name="Anna" {...props} />
  </FollowProvider>,
);

test('ohne Freischaltung wird nichts gerendert und nichts abonniert', () => {
  renderButton({}, { enabled: false });
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(subscribeMyFollows).not.toHaveBeenCalled();
});

test('ohne Provider wird nichts gerendert', () => {
  render(<FollowButton userId="anna" name="Anna" />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

test('nicht für die eigene Person', () => {
  renderButton({ userId: 'me', name: 'Ich' });
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

test('Klick stellt die Anfrage, Snackbar erlaubt Rückgängig', async () => {
  renderButton();
  fireEvent.click(screen.getByRole('button', { name: 'Anna folgen' }));
  await waitFor(() => expect(requestToFollow).toHaveBeenCalledWith('anna'));
  expect(await screen.findByText('Anfrage an Anna gesendet')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));
  await waitFor(() => expect(stopFollowing).toHaveBeenCalledWith('me', 'anna'));
  expect(screen.queryByText('Anfrage an Anna gesendet')).not.toBeInTheDocument();
});

test('ab "angefragt" verschwindet das Icon', async () => {
  renderButton();
  expect(screen.getByRole('button', { name: 'Anna folgen' })).toBeInTheDocument();
  act(() => pushStatuses({ anna: 'pending' }));
  expect(screen.queryByRole('button', { name: 'Anna folgen' })).not.toBeInTheDocument();
});

test('Fehler der Function erscheint in der Snackbar', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  requestToFollow.mockRejectedValue(new Error('Diese Person ist nicht erreichbar.'));
  renderButton();
  fireEvent.click(screen.getByRole('button', { name: 'Anna folgen' }));
  expect(await screen.findByText('Diese Person ist nicht erreichbar.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Rückgängig' })).not.toBeInTheDocument();
});

test('Standard-Symbol ist das Folgen-Icon, Variante setzt die Klasse', () => {
  const { container } = renderButton({ variant: 'round' });
  const button = screen.getByRole('button', { name: 'Anna folgen' });
  expect(button).toHaveClass('follow-button', 'follow-button--round');
  expect(container.querySelector('img.follow-button-icon-img').getAttribute('src')).toContain('data:image/svg+xml');
});

test('eingerichtetes Icon (Bild oder Text) ersetzt das Standard-Symbol', () => {
  const { container, rerender } = renderButton({ icon: 'data:image/png;base64,AAAA' });
  expect(container.querySelector('img.follow-button-icon-img').getAttribute('src')).toBe('data:image/png;base64,AAAA');
  rerender(
    <FollowProvider userId="me" enabled>
      <FollowButton userId="anna" name="Anna" icon="Folgen" />
    </FollowProvider>,
  );
  expect(screen.getByRole('button', { name: 'Anna folgen' })).toHaveTextContent('Folgen');
});

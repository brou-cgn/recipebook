import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import GuestLinkConflictDialog from './GuestLinkConflictDialog';

const zeige = (sprache, props = {}) => {
  const onChoose = jest.fn();
  renderWithProviders(
    <GuestLinkConflictDialog eventGuestCount={2} menuGuestCount={3} onChoose={onChoose} onCancel={() => {}} {...props} />,
    { sprache }
  );
  return onChoose;
};

describe('GuestLinkConflictDialog', () => {
  it('fragt auf Deutsch mit beiden Anzahlen', () => {
    zeige('de');
    expect(screen.getByText('Du hast an Event und Menü bereits Gäste erfasst (Event: 2, Menü: 3), welche möchtest du übernehmen?')).toBeInTheDocument();
  });

  it('fragt ohne Anzahlen ohne Klammer', () => {
    zeige('de', { eventGuestCount: undefined });
    expect(screen.getByText('Du hast an Event und Menü bereits Gäste erfasst, welche möchtest du übernehmen?')).toBeInTheDocument();
  });

  it('auf Englisch (Mehrsprachigkeit PR 6g)', () => {
    const onChoose = zeige('en');
    expect(screen.getByRole('heading', { name: 'Merge guest lists' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Guests from the menu' }));
    expect(onChoose).toHaveBeenCalledWith('menu');
  });

  it('auf Französisch mit geschütztem Leerzeichen', () => {
    zeige('fr');
    expect(screen.getByRole('button', { name: 'Tous les invités' })).toBeInTheDocument();
    expect(screen.getByText(/Lesquels veux-tu garder\u00a0\?$/, { normalizer: (text) => text })).toBeInTheDocument();
  });
});

import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import DeleteRowButton from './DeleteRowButton';

describe('DeleteRowButton', () => {
  it('heißt auf Deutsch „<Name> entfernen“', () => {
    renderWithProviders(<DeleteRowButton itemName="Anna" onClick={() => {}} />);
    const knopf = screen.getByRole('button', { name: 'Anna entfernen' });
    expect(knopf).toHaveAttribute('title', 'Anna entfernen');
  });

  it('folgt der geltenden Sprache (Mehrsprachigkeit PR 6g)', () => {
    renderWithProviders(<DeleteRowButton itemName="Anna" onClick={() => {}} />, { sprache: 'en' });
    expect(screen.getByRole('button', { name: 'Remove Anna' })).toBeInTheDocument();
  });

  it('nimmt einen eigenen Text unverändert', () => {
    renderWithProviders(<DeleteRowButton itemName="Anna" label="Retirer le vœu" onClick={() => {}} />, { sprache: 'en' });
    expect(screen.getByRole('button', { name: 'Retirer le vœu' })).toBeInTheDocument();
  });
});

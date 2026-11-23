import { render, screen } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import SplashScreen from './SplashScreen';

describe('SplashScreen: Mehrsprachigkeit (PR 6o)', () => {
  test('Deutsch: Logo und Standard-Slogan wie bisher', () => {
    render(<SplashScreen />);
    expect(screen.getByRole('img', { name: 'brouBook Logo' })).toBeInTheDocument();
    expect(screen.getByText('Unsere besten Momente')).toBeInTheDocument();
  });

  test('Englisch und Französisch: Slogan aus dem Wörterbuch des Headers', () => {
    const { unmount } = renderWithProviders(<SplashScreen />, { sprache: 'en' });
    expect(screen.getByRole('img', { name: 'brouBook logo' })).toBeInTheDocument();
    expect(screen.getByText('Our best moments')).toBeInTheDocument();
    unmount();

    renderWithProviders(<SplashScreen exiting />, { sprache: 'fr' });
    expect(screen.getByRole('img', { name: 'Logo brouBook' })).toBeInTheDocument();
    expect(screen.getByText('Nos meilleurs moments')).toBeInTheDocument();
  });
});

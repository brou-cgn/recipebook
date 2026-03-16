import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

// Preserve original location.hash
const originalHash = window.location.hash;

afterEach(() => {
  window.location.hash = originalHash;
  localStorage.clear();
});

describe('Shared Link Routing – no SplashScreen', () => {
  test('shows SharePage loading state (not SplashScreen) when hash is #share/{id}', () => {
    window.location.hash = '#share/test-recipe-123';
    render(<App />);

    // SharePage renders its loading indicator immediately while fetching the recipe
    expect(screen.getByText('Rezept wird geladen…')).toBeInTheDocument();

    // The SplashScreen slogan must NOT be present – the splash must be bypassed
    expect(screen.queryByText('Unsere besten Momente')).not.toBeInTheDocument();
  });

  test('shows MenuSharePage loading state (not SplashScreen) when hash is #menu-share/{id}', () => {
    window.location.hash = '#menu-share/test-menu-456';
    render(<App />);

    // MenuSharePage renders its loading indicator immediately while fetching the menu
    expect(screen.getByText('Menü wird geladen…')).toBeInTheDocument();

    // The SplashScreen slogan must NOT be present – the splash must be bypassed
    expect(screen.queryByText('Unsere besten Momente')).not.toBeInTheDocument();
  });

  test('shows SplashScreen on normal app start (no share hash)', () => {
    window.location.hash = '';
    render(<App />);

    // Without a share link, and with authLoading still true (Firebase not available in tests),
    // the SplashScreen must be shown
    expect(screen.getByText('Unsere besten Momente')).toBeInTheDocument();

    // Neither share page loading indicator should be present
    expect(screen.queryByText('Rezept wird geladen…')).not.toBeInTheDocument();
    expect(screen.queryByText('Menü wird geladen…')).not.toBeInTheDocument();
  });
});

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AtelierTasteIntroOverlay from './AtelierTasteIntroOverlay';

describe('AtelierTasteIntroOverlay', () => {
  test('renders the first card (Let\'s Taste) and the continue button', () => {
    render(<AtelierTasteIntroOverlay onContinue={() => {}} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText("Let's Taste")).toBeInTheDocument();
    expect(screen.getByText('7 Tage, 6 Rezepte')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Weiter: Nach dem Kochen/i })).toBeInTheDocument();
  });

  test('tapping the body text switches to the second card (The Final Bite)', () => {
    render(<AtelierTasteIntroOverlay onContinue={() => {}} />);

    fireEvent.click(screen.getByText(/Atelier-Grid/));

    expect(screen.getByText('The Final Bite')).toBeInTheDocument();
    expect(screen.getByText('Ein Rezept, dein Urteil')).toBeInTheDocument();
    expect(screen.queryByText("Let's Taste")).not.toBeInTheDocument();
  });

  test('shows a spotlight around the search button once the second card is active', () => {
    const mockBtn = document.createElement('button');
    mockBtn.setAttribute('aria-label', 'Suche');
    mockBtn.getBoundingClientRect = () => ({
      left: 300, top: 20, width: 32, height: 32, right: 332, bottom: 52,
    });
    document.body.appendChild(mockBtn);

    const { container } = render(<AtelierTasteIntroOverlay onContinue={() => {}} />);
    expect(container.querySelector('[data-testid="atelier-taste-intro-spotlight"]')).toBeNull();

    fireEvent.click(screen.getByText(/Atelier-Grid/));

    expect(container.querySelector('[data-testid="atelier-taste-intro-spotlight"]')).toBeTruthy();

    document.body.removeChild(mockBtn);
  });

  test('calls onContinue when the button is clicked', () => {
    const onContinue = jest.fn();
    render(<AtelierTasteIntroOverlay onContinue={onContinue} />);

    fireEvent.click(screen.getByRole('button', { name: /Weiter: Nach dem Kochen/i }));

    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});

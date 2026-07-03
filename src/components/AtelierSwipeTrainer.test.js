import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import AtelierSwipeTrainer from './AtelierSwipeTrainer';

describe('AtelierSwipeTrainer', () => {
  test('renders trainer with root testid and first card (Mango Cocktail)', () => {
    render(<AtelierSwipeTrainer onComplete={() => {}} />);

    expect(screen.getByTestId('atelier-swipe-trainer-view')).toBeInTheDocument();
    expect(screen.getByText('SWIPE TRAINER')).toBeInTheDocument();
    expect(screen.getByText('ALLE GESTEN')).toBeInTheDocument();
    expect(screen.getByText('Mango Cocktail')).toBeInTheDocument();
    expect(screen.getByText('Benjamin')).toBeInTheDocument();
    expect(screen.getByText('Vegetarisch')).toBeInTheDocument();
    expect(screen.getByText('5 Min.')).toBeInTheDocument();
  });

  test('shows accessible gesture buttons for each direction', () => {
    render(<AtelierSwipeTrainer onComplete={() => {}} />);

    expect(screen.getByRole('button', { name: '→ Für später parken' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '← Archivieren' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '↑ Jetzt kochen!' })).toBeInTheDocument();
  });

  test('walks through all three gestures via accessible buttons and shows result texts', () => {
    const onComplete = jest.fn();
    render(<AtelierSwipeTrainer onComplete={onComplete} />);

    const overlay = screen.getByTestId('result-overlay');

    // Step 0: right swipe – Für später parken
    const btnRight = screen.getByRole('button', { name: '→ Für später parken' });
    expect(btnRight).not.toBeDisabled();
    fireEvent.click(btnRight);
    // Result overlay: tag "Remind me later", title "Richtiges Rezept, falscher Moment", "30 Tagen"
    expect(within(overlay).getByText('Remind me later')).toBeInTheDocument();
    expect(within(overlay).getByRole('heading', { level: 2, name: /Richtiges Rezept, falscher Moment/ })).toBeInTheDocument();
    expect(within(overlay).getByText(/30 Tagen/)).toBeInTheDocument();

    // Step 1: left swipe – Archivieren
    const btnLeft = screen.getByRole('button', { name: '← Archivieren' });
    expect(btnLeft).not.toBeDisabled();
    fireEvent.click(btnLeft);
    // Result overlay: tag "I don't feel it", title "Rezept warm-", "im Archiv"
    expect(within(overlay).getByText(/I don't feel it/)).toBeInTheDocument();
    expect(within(overlay).getByRole('heading', { level: 2, name: /Rezept warm-/ })).toBeInTheDocument();
    expect(within(overlay).getByText(/im Archiv/)).toBeInTheDocument();

    // Step 2: up swipe – Jetzt kochen!
    const btnUp = screen.getByRole('button', { name: '↑ Jetzt kochen!' });
    expect(btnUp).not.toBeDisabled();
    fireEvent.click(btnUp);
    // Result overlay: tag "It's a Match", title "Ein Rezept, ein Koch", "7 Tage"
    expect(within(overlay).getByText(/It's a Match/)).toBeInTheDocument();
    expect(within(overlay).getByRole('heading', { level: 2, name: /Ein Rezept, ein Koch/ })).toBeInTheDocument();
    expect(within(overlay).getByText(/7 Tage/)).toBeInTheDocument();

    // Step 3: final card – "Weiter" button (accessible as complete-atelier-swipe-trainer)
    const btnWeiter = screen.getByRole('button', { name: 'complete-atelier-swipe-trainer' });
    expect(btnWeiter).toBeInTheDocument();
    fireEvent.click(btnWeiter);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test('progress pills update as gestures are completed', () => {
    render(<AtelierSwipeTrainer onComplete={() => {}} />);

    // Initially: first pill active (no dim/done), others dim
    const pillR = screen.getByTestId('pill-r');
    const pillL = screen.getByTestId('pill-l');
    const pillU = screen.getByTestId('pill-u');

    expect(pillL.className).toContain('dim');
    expect(pillU.className).toContain('dim');

    // Complete right swipe
    fireEvent.click(screen.getByRole('button', { name: '→ Für später parken' }));
    expect(pillR.className).toContain('done');
    expect(pillL.className).not.toContain('done');

    // Complete left swipe
    fireEvent.click(screen.getByRole('button', { name: '← Archivieren' }));
    expect(pillL.className).toContain('done');
    expect(pillU.className).not.toContain('done');

    // Complete up swipe
    fireEvent.click(screen.getByRole('button', { name: '↑ Jetzt kochen!' }));
    expect(pillU.className).toContain('done');
  });

  test('Nochmal ansehen restarts the trainer', () => {
    render(<AtelierSwipeTrainer onComplete={() => {}} />);

    // Complete all 3 gestures to reach final card
    fireEvent.click(screen.getByRole('button', { name: '→ Für später parken' }));
    fireEvent.click(screen.getByRole('button', { name: '← Archivieren' }));
    fireEvent.click(screen.getByRole('button', { name: '↑ Jetzt kochen!' }));

    // Final card: click "Nochmal ansehen"
    fireEvent.click(screen.getByRole('button', { name: 'Nochmal ansehen' }));

    // Should be back at step 0 – Mango Cocktail visible again
    expect(screen.getByText('Mango Cocktail')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '→ Für später parken' })).not.toBeDisabled();
  });

  test('complete-atelier-swipe-trainer accessible button calls onComplete', () => {
    const onComplete = jest.fn();
    render(<AtelierSwipeTrainer onComplete={onComplete} />);

    // Advance to final step
    fireEvent.click(screen.getByRole('button', { name: '→ Für später parken' }));
    fireEvent.click(screen.getByRole('button', { name: '← Archivieren' }));
    fireEvent.click(screen.getByRole('button', { name: '↑ Jetzt kochen!' }));

    fireEvent.click(screen.getByRole('button', { name: 'complete-atelier-swipe-trainer' }));

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});


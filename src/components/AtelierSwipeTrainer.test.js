import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AtelierSwipeTrainer from './AtelierSwipeTrainer';

describe('AtelierSwipeTrainer', () => {
  test('renders swipe trainer intro and first gesture guidance', () => {
    render(<AtelierSwipeTrainer onComplete={() => {}} />);

    expect(screen.getByTestId('atelier-swipe-trainer-view')).toBeInTheDocument();
    expect(screen.getByText('So funktioniert dein Atelier')).toBeInTheDocument();
    expect(screen.getByText(/Probiere als Nächstes/)).toBeInTheDocument();
    expect(screen.getByText('Remind me later')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Für später parken' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archivieren' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jetzt kochen!' })).toBeInTheDocument();
  });

  test('walks through all swipe gestures and completes onboarding', () => {
    const onComplete = jest.fn();
    render(<AtelierSwipeTrainer onComplete={onComplete} />);

    fireEvent.click(screen.getByRole('button', { name: 'Für später parken' }));
    expect(screen.getByText(/taucht nach 30 Tagen wieder auf/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Für später parken' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Archivieren' }));
    expect(screen.getByText(/bleibt auffindbar/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archivieren' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Jetzt kochen!' }));
    expect(screen.getByText(/7 Tage Zeit/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Weiter ins Atelier' }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

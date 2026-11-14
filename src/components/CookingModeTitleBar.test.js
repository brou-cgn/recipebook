import React from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import CookingModeTitleBar from './CookingModeTitleBar';

// Titelzeile des Kochmodus (Feinschliff Tablet, Punkte 2 und 3)
const rouladen = { id: 'rouladen', title: 'Rinderrouladen', image: 'rouladen.jpg' };
const ohneBild = { id: 'bratapfel', title: 'bratapfel' };

function renderBar(props = {}) {
  const onJumpToStep = jest.fn();
  const onAdd = jest.fn();
  renderWithProviders(
    <CookingModeTitleBar recipe={rouladen} stepNumber={6} totalSteps={7} onJumpToStep={onJumpToStep} onAdd={onAdd} addIcon="+" {...props} />
  );
  return { onJumpToStep, onAdd, bar: document.querySelector('.cooking-mode-titlebar') };
}

const chip = (stepIndex, text, extra = {}) => ({
  stepIndex, kind: 'timer', text, urgent: false, label: `Timer ${text}`, ...extra,
});

describe('CookingModeTitleBar', () => {
  test('auf dem Handy nur der Name und „Rezept dazunehmen“, ohne Bild und Schritt', () => {
    const { onAdd, bar } = renderBar();

    expect(screen.getByRole('heading', { name: 'Rinderrouladen' })).toBeInTheDocument();
    expect(bar).not.toHaveClass('cooking-mode-titlebar--tablet');
    expect(bar.querySelector('.cooking-mode-titlebar-thumb')).toBeNull();
    expect(screen.queryByText('Schritt 6 von 7')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Weiteres Rezept dazunehmen' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  test('auf dem Tablet wie eine Karte im Karussell: Bild, Name und Schritt', () => {
    const { bar } = renderBar({ tablet: true });

    expect(bar).toHaveClass('cooking-mode-titlebar--tablet');
    expect(bar.querySelector('img.cooking-mode-titlebar-thumb')).toHaveAttribute('src', 'rouladen.jpg');
    expect(within(bar).getByText('Schritt 6 von 7')).toBeInTheDocument();
  });

  test('ohne Rezeptbild zeigt der Kreis den Anfangsbuchstaben', () => {
    const { bar } = renderBar({ tablet: true, recipe: ohneBild });

    expect(bar.querySelector('.cooking-mode-titlebar-thumb--initial')).toHaveTextContent('B');
  });

  test('ohne Timer anderer Schritte gibt es keine Chips', () => {
    renderBar({ tablet: true });

    expect(screen.queryByRole('group', { name: 'Timer anderer Schritte' })).toBeNull();
  });

  test('ein Timer eines anderen Schritts steht als Chip da; Tippen springt zu seinem Schritt', () => {
    const { onJumpToStep } = renderBar({ tablet: true, timerChips: [chip(4, '1:12:40')] });

    const group = screen.getByRole('group', { name: 'Timer anderer Schritte' });
    const button = within(group).getByRole('button', { name: 'Zu Schritt 5 springen, Timer 1:12:40' });
    expect(button).toHaveTextContent('Schritt 5');
    expect(button).toHaveTextContent('1:12:40');
    expect(button).not.toHaveClass('cooking-mode-timer-chip--urgent');

    fireEvent.click(button);
    expect(onJumpToStep).toHaveBeenCalledWith(4);
  });

  test('höchstens zwei Chips, der Rest als „+n“; bald fällige und abgelaufene sind orange', () => {
    renderBar({
      timerChips: [
        chip(1, 'Fertig', { kind: 'finished', urgent: true, label: 'Timer abgelaufen' }),
        chip(2, '3:58', { urgent: true }),
        chip(3, '25:00'),
      ],
    });

    const group = screen.getByRole('group', { name: 'Timer anderer Schritte' });
    const buttons = within(group).getAllByRole('button');
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Zu Schritt 2 springen, Timer abgelaufen',
      'Zu Schritt 3 springen, Timer 3:58',
    ]);
    buttons.forEach((b) => expect(b).toHaveClass('cooking-mode-timer-chip--urgent'));
    expect(within(group).getByText('+1')).toBeInTheDocument();
  });
});

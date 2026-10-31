import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import CookingSessionDock from './CookingSessionDock';
import { CookingSessionProvider, useCookingSession } from '../contexts/CookingSessionContext';

jest.mock('../utils/alarmAudioUtils', () => ({
  playAlarmPattern: jest.fn(),
}));

const rouladen = { id: 'rouladen', title: 'Rinderrouladen', steps: ['Klopfen.', 'Anbraten.', { type: 'heading', text: 'Sauce' }, 'Schmoren.'] };
const rotkohl = { id: 'rotkohl', title: 'Apfelrotkohl', steps: ['Hobeln.', 'Köcheln.'] };
const kloesse = { id: 'kloesse', title: 'Kartoffelklöße', steps: ['Kochen.', 'Formen.'] };

let session;
function SessionProbe() {
  session = useCookingSession();
  return null;
}

function renderDock(props = {}, onOpenRecipe = jest.fn()) {
  const result = render(
    <CookingSessionProvider onOpenRecipe={onOpenRecipe}>
      <SessionProbe />
      <CookingSessionDock placement="top" currentRecipeId="kloesse" {...props} />
    </CookingSessionProvider>
  );
  return { onOpenRecipe, ...result };
}

// Rouladen (Schritt 2) und Rotkohl parken, Klöße sind vorn
function seedSession() {
  act(() => { session.addRecipe({ recipe: rouladen, stepIndex: 1, servingMultiplier: 1 }, rotkohl); });
  act(() => { session.addRecipe({ recipe: rotkohl, stepIndex: 0, servingMultiplier: 1 }, kloesse); });
}

function startTimer(recipe, seconds) {
  act(() => {
    session.startTimer({
      recipeId: recipe.id,
      recipeTitle: recipe.title,
      stepKey: 'step_0',
      timerIndex: 0,
      totalSeconds: seconds,
      label: `${seconds} Sekunden`,
      soundKey: 'radar',
    });
  });
}

function chipButtons() {
  return Array.from(document.querySelectorAll('.cooking-dock-chip-main'));
}

function swipeLeft(element) {
  fireEvent.touchStart(element, { touches: [{ clientX: 200, clientY: 10 }] });
  fireEvent.touchMove(element, { touches: [{ clientX: 120, clientY: 10 }] });
  fireEvent.touchEnd(element);
}

beforeEach(() => {
  window.AudioContext = jest.fn().mockImplementation(() => ({ state: 'running', close: jest.fn() }));
  window.webkitAudioContext = undefined;
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    writable: true,
    value: { request: jest.fn().mockResolvedValue({ release: jest.fn().mockResolvedValue(undefined) }) },
  });
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('CookingSessionDock', () => {
  test('renders nothing while no recipe waits in the background', () => {
    renderDock();
    expect(screen.queryByRole('navigation', { name: 'Rezepte im Hintergrund' })).toBeNull();
  });

  test('shows a chip per recipe in the background, without the open one, latest first', () => {
    renderDock();
    seedSession();

    expect(screen.getByRole('navigation', { name: 'Rezepte im Hintergrund' })).toBeInTheDocument();
    expect(chipButtons().map((b) => b.getAttribute('aria-label'))).toEqual([
      'Apfelrotkohl öffnen, Schritt 1 von 2',
      'Rinderrouladen öffnen, Schritt 2 von 3',
    ]);
  });

  test('sorts by the next due timer and highlights recipes due within five minutes', () => {
    renderDock();
    seedSession();
    startTimer(rouladen, 30 * 60);
    startTimer(rotkohl, 4 * 60);

    const [first, second] = chipButtons();
    expect(first).toHaveAttribute('aria-label', 'Apfelrotkohl öffnen, Timer 4:00');
    expect(first.closest('.cooking-dock-chip')).toHaveClass('cooking-dock-chip--urgent');
    expect(second).toHaveAttribute('aria-label', 'Rinderrouladen öffnen, Timer 30:00');
    expect(second.closest('.cooking-dock-chip')).not.toHaveClass('cooking-dock-chip--urgent');
  });

  test('shows „Fertig“ once a timer has run out', () => {
    renderDock();
    seedSession();
    startTimer(rotkohl, 10);

    act(() => { jest.advanceTimersByTime(10000); });

    const chip = screen.getByRole('button', { name: 'Apfelrotkohl öffnen, Timer abgelaufen' });
    expect(chip).toHaveTextContent('Fertig');
    expect(chip.closest('.cooking-dock-chip')).toHaveClass('cooking-dock-chip--urgent');
  });

  test('tapping a chip opens that recipe', () => {
    const { onOpenRecipe } = renderDock();
    seedSession();

    fireEvent.click(screen.getByRole('button', { name: 'Apfelrotkohl öffnen, Schritt 1 von 2' }));

    expect(onOpenRecipe).toHaveBeenLastCalledWith(rotkohl, { isNew: false });
  });

  test('a left swipe offers removal; „Rückgängig“ brings the chip back, otherwise it leaves the session', () => {
    renderDock();
    seedSession();

    swipeLeft(screen.getByRole('button', { name: 'Apfelrotkohl öffnen, Schritt 1 von 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apfelrotkohl entfernen' }));

    expect(screen.queryByRole('button', { name: 'Apfelrotkohl öffnen, Schritt 1 von 2' })).toBeNull();
    expect(screen.getByText('„Apfelrotkohl" entfernt')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));
    expect(screen.getByRole('button', { name: 'Apfelrotkohl öffnen, Schritt 1 von 2' })).toBeInTheDocument();
    expect(session.isInSession('rotkohl')).toBe(true);

    swipeLeft(screen.getByRole('button', { name: 'Apfelrotkohl öffnen, Schritt 1 von 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apfelrotkohl entfernen' }));
    act(() => { jest.advanceTimersByTime(6000); });

    expect(session.isInSession('rotkohl')).toBe(false);
    expect(session.isInSession('rouladen')).toBe(true);
  });

  test('the dock under the header sits in the page flow and reserves no space at the bottom', () => {
    renderDock();
    seedSession();
    expect(document.querySelector('.cooking-dock--top')).toBeInTheDocument();
    expect(document.documentElement.style.getPropertyValue('--cooking-dock-space')).toBe('');
  });

  test('the dock inside the cooking mode does not reserve page space', () => {
    renderDock({ placement: 'inline' });
    seedSession();
    expect(document.querySelector('.cooking-dock--inline')).toBeInTheDocument();
    expect(document.documentElement.style.getPropertyValue('--cooking-dock-space')).toBe('');
  });
});

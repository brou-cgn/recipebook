import React from 'react';
import { screen, fireEvent, act, within } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import CookingSessionCarousel from './CookingSessionCarousel';
import { CookingSessionProvider, useCookingSession } from '../contexts/CookingSessionContext';

jest.mock('../utils/alarmAudioUtils', () => ({
  playAlarmPattern: jest.fn(),
  getAlarmRepeatMs: () => 1000,
}));

const rouladen = {
  id: 'rouladen',
  title: 'Rinderrouladen',
  image: 'rouladen.jpg',
  steps: ['Rouladen flach klopfen.', 'Rundherum anbraten.', { type: 'heading', text: 'Sauce' }, 'Zugedeckt schmoren.'],
};
const rotkohl = { id: 'rotkohl', title: 'Apfelrotkohl', image: 'rotkohl.jpg', steps: ['Rotkohl fein hobeln.', 'Zugedeckt köcheln lassen.'] };
const kloesse = { id: 'kloesse', title: 'Kartoffelklöße', image: 'kloesse.jpg', steps: ['Kartoffeln kochen.', 'Klöße formen.'] };
const bratapfel = { id: 'bratapfel', title: 'Bratapfel', steps: ['Äpfel füllen.', 'Backen.'] };

let session;
function SessionProbe() {
  session = useCookingSession();
  return null;
}

function renderCarousel(props = {}) {
  const onSelect = jest.fn();
  const onAdd = jest.fn();
  renderWithProviders(
    <CookingSessionProvider onOpenRecipe={() => {}}>
      <SessionProbe />
      <CookingSessionCarousel currentRecipeId="kloesse" onSelect={onSelect} onAdd={onAdd} {...props} />
    </CookingSessionProvider>
  );
  return { onSelect, onAdd };
}

// Sitzung in dieser Reihenfolge: Rouladen (Schritt 2), Rotkohl (Schritt 1), Klöße; Klöße sind vorn
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

function carousel() {
  return screen.getByRole('navigation', { name: 'Weitere Rezepte am Herd' });
}

function cardNames() {
  return within(carousel()).queryAllByRole('button', { name: /nach vorn holen/ }).map((b) => b.getAttribute('aria-label'));
}

function cardOf(title) {
  return within(carousel()).getByRole('button', { name: new RegExp(`^${title} nach vorn holen`) });
}

function swipeLeft(element) {
  fireEvent.touchStart(element, { touches: [{ clientX: 300, clientY: 10 }] });
  fireEvent.touchMove(element, { touches: [{ clientX: 200, clientY: 10 }] });
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

describe('CookingSessionCarousel', () => {
  test('without other recipes it says so and offers to add one', () => {
    const { onAdd } = renderCarousel();

    expect(within(carousel()).getByRole('heading', { name: 'Am Herd' })).toBeInTheDocument();
    expect(cardNames()).toEqual([]);
    expect(screen.getByText('Noch kein weiteres Rezept am Herd')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Rezept dazunehmen' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  test('lists the other recipes in the order of the session, each with the step it is at', () => {
    renderCarousel();
    seedSession();

    expect(within(carousel()).getByRole('heading', { name: 'Am Herd · 2 weitere' })).toBeInTheDocument();
    expect(cardNames()).toEqual([
      'Rinderrouladen nach vorn holen, Schritt 2 von 3',
      'Apfelrotkohl nach vorn holen, Schritt 1 von 2',
    ]);
    // Zwischenüberschriften zählen nicht mit, wie im Kochmodus
    expect(cardOf('Rinderrouladen')).toHaveAccessibleDescription('Rundherum anbraten.');
    expect(within(cardOf('Rinderrouladen')).getByText('Schritt 2 von 3')).toBeInTheDocument();
    expect(cardOf('Apfelrotkohl')).toHaveAccessibleDescription('Rotkohl fein hobeln.');
    expect(screen.queryByRole('button', { name: /^Kartoffelklöße/ })).toBeNull();
    expect(screen.queryByText('Noch kein weiteres Rezept am Herd')).toBeNull();
    expect(document.querySelector('.cooking-carousel')).not.toHaveClass('cooking-carousel--compact');
  });

  test('one other recipe: „1 weiteres“', () => {
    renderCarousel();
    act(() => { session.addRecipe({ recipe: rotkohl, stepIndex: 0, servingMultiplier: 1 }, kloesse); });

    expect(within(carousel()).getByRole('heading', { name: 'Am Herd · 1 weiteres' })).toBeInTheDocument();
  });

  test('a running timer shows with its remaining time; within five minutes the card turns orange, then „Fertig“', () => {
    renderCarousel();
    seedSession();
    startTimer(rotkohl, 400);

    const card = cardOf('Apfelrotkohl');
    expect(card).toHaveAccessibleName('Apfelrotkohl nach vorn holen, Timer 6:40');
    expect(within(card).getByText('6:40')).toBeInTheDocument();
    expect(card.closest('li')).not.toHaveClass('cooking-carousel-item--urgent');
    expect(card.querySelector('.cooking-carousel-timer-fill')).toHaveStyle({ width: '100%' });
    // Die Reihenfolge bleibt, auch wenn ein Timer läuft
    expect(cardNames()[0]).toBe('Rinderrouladen nach vorn holen, Schritt 2 von 3');

    act(() => { jest.advanceTimersByTime(100000); });
    expect(cardOf('Apfelrotkohl')).toHaveAccessibleName('Apfelrotkohl nach vorn holen, Timer 5:00');
    expect(cardOf('Apfelrotkohl').closest('li')).toHaveClass('cooking-carousel-item--urgent');
    expect(cardOf('Apfelrotkohl').querySelector('.cooking-carousel-timer-fill')).toHaveStyle({ width: '75%' });

    act(() => { jest.advanceTimersByTime(300000); });
    expect(cardOf('Apfelrotkohl')).toHaveAccessibleName('Apfelrotkohl nach vorn holen, Timer abgelaufen');
    expect(within(cardOf('Apfelrotkohl')).getByText('Fertig')).toBeInTheDocument();
  });

  test('tapping a card hands the recipe over to swap', () => {
    const { onSelect } = renderCarousel();
    seedSession();

    fireEvent.click(cardOf('Apfelrotkohl'));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ recipe: rotkohl, stepIndex: 0 }));
  });

  test('from three other recipes on the cards get compact', () => {
    renderCarousel({ currentRecipeId: 'bratapfel' });
    seedSession();

    expect(cardNames()).toHaveLength(3);
    expect(document.querySelector('.cooking-carousel')).toHaveClass('cooking-carousel--compact');
  });

  test('without a picture the card shows the first letter of the recipe', () => {
    renderCarousel();
    seedSession();
    act(() => { session.addRecipe({ recipe: kloesse, stepIndex: 0, servingMultiplier: 1 }, bratapfel); });

    expect(cardOf('Bratapfel').querySelector('.cooking-carousel-thumb--initial')).toHaveTextContent('B');
  });

  test('a left swipe offers removal; „Rückgängig“ brings the card back at its place, otherwise it leaves the session', () => {
    renderCarousel();
    seedSession();

    swipeLeft(cardOf('Rinderrouladen'));
    fireEvent.click(screen.getByRole('button', { name: 'Rinderrouladen entfernen' }));

    expect(cardNames()).toEqual(['Apfelrotkohl nach vorn holen, Schritt 1 von 2']);
    expect(screen.getByText('„Rinderrouladen" entfernt')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));
    expect(cardNames()).toEqual([
      'Rinderrouladen nach vorn holen, Schritt 2 von 3',
      'Apfelrotkohl nach vorn holen, Schritt 1 von 2',
    ]);

    swipeLeft(cardOf('Rinderrouladen'));
    fireEvent.click(screen.getByRole('button', { name: 'Rinderrouladen entfernen' }));
    act(() => { jest.advanceTimersByTime(6000); });

    expect(session.sessionRecipes.map((e) => e.recipe.id)).toEqual(['rotkohl', 'kloesse']);
  });

  describe('a due recipe out of view', () => {
    const originalObserver = window.IntersectionObserver;
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    let reportVisibility;

    beforeEach(() => {
      window.IntersectionObserver = class {
        constructor(callback) {
          reportVisibility = (element, ratio, below = true) => act(() => {
            callback([{
              target: element,
              intersectionRatio: ratio,
              boundingClientRect: { top: below ? 900 : -200 },
              rootBounds: { top: 100 },
            }]);
          });
        }
        observe() {}
        disconnect() {}
      };
      Element.prototype.scrollIntoView = jest.fn();
    });

    afterEach(() => {
      window.IntersectionObserver = originalObserver;
      Element.prototype.scrollIntoView = originalScrollIntoView;
    });

    test('gets a pill on the side where it lies; tapping it scrolls there, the pill goes once it is visible', () => {
      renderCarousel();
      seedSession();
      startTimer(rouladen, 30);
      const card = cardOf('Rinderrouladen').closest('li');

      // Nicht fällig: keine Pille, auch wenn außer Sicht
      reportVisibility(cardOf('Apfelrotkohl').closest('li'), 0);
      expect(screen.queryByRole('button', { name: /scrollen/ })).toBeNull();

      reportVisibility(card, 0.2);
      const pill = screen.getByRole('button', { name: 'Zu Rinderrouladen scrollen, Timer 0:30' });
      expect(pill).toHaveTextContent('Rinderrouladen · 0:30');
      expect(pill).not.toHaveClass('cooking-carousel-jump--up');

      fireEvent.click(pill);
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'nearest' }));
      expect(Element.prototype.scrollIntoView.mock.instances[0]).toBe(card);

      reportVisibility(card, 1);
      expect(screen.queryByRole('button', { name: /scrollen/ })).toBeNull();

      reportVisibility(card, 0, false);
      expect(screen.getByRole('button', { name: 'Zu Rinderrouladen scrollen, Timer 0:30' }))
        .toHaveClass('cooking-carousel-jump--up');
    });

    test('a run-out timer goes before one that is still running', () => {
      renderCarousel();
      seedSession();
      startTimer(rouladen, 60);
      startTimer(rotkohl, 10);
      act(() => { jest.advanceTimersByTime(10000); });

      reportVisibility(cardOf('Rinderrouladen').closest('li'), 0);
      reportVisibility(cardOf('Apfelrotkohl').closest('li'), 0);

      expect(screen.getByRole('button', { name: /scrollen/ })).toHaveAccessibleName('Zu Apfelrotkohl scrollen, Timer abgelaufen');
    });
  });
});

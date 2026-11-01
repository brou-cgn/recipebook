import React from 'react';
import { screen, fireEvent, act, within } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import CookingSessionRail from './CookingSessionRail';
import { CookingSessionProvider, useCookingSession } from '../contexts/CookingSessionContext';

jest.mock('../utils/alarmAudioUtils', () => ({
  playAlarmPattern: jest.fn(),
  getAlarmRepeatMs: () => 1000,
}));

const rouladen = { id: 'rouladen', title: 'Rinderrouladen', image: 'rouladen.jpg', steps: ['Klopfen.', 'Anbraten.', { type: 'heading', text: 'Sauce' }, 'Schmoren.'] };
const rotkohl = { id: 'rotkohl', title: 'Apfelrotkohl', image: 'rotkohl.jpg', steps: ['Hobeln.', 'Köcheln.'] };
const kloesse = { id: 'kloesse', title: 'Kartoffelklöße', image: 'kloesse.jpg', steps: ['Kochen.', 'Formen.'] };
const bratapfel = { id: 'bratapfel', title: 'Bratapfel', image: 'bratapfel.jpg', steps: ['Füllen.', 'Backen.'] };

let session;
function SessionProbe() {
  session = useCookingSession();
  return null;
}

function renderRail(props = {}) {
  const onSelect = jest.fn();
  const onAdd = jest.fn();
  const tree = (extra) => (
    <CookingSessionProvider onOpenRecipe={() => {}}>
      <SessionProbe />
      <CookingSessionRail
        currentRecipe={kloesse}
        currentStepIndex={0}
        onSelect={onSelect}
        onAdd={onAdd}
        addIcon="+"
        {...props}
        {...extra}
      />
    </CookingSessionProvider>
  );
  const result = renderWithProviders(tree());
  // Neue Props, dieselbe Sitzung (der Provider bleibt stehen)
  const rerenderRail = (extra) => result.rerender(tree(extra));
  return { onSelect, onAdd, rerenderRail, ...result };
}

// Sitzung in dieser Reihenfolge: Rouladen (Schritt 2), Rotkohl, Klöße; Klöße sind vorn
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

// Je Eintrag der Schiene: das Rezept vorn als „vorn: <Name>“, die anderen mit dem Namen ihres Knopfs
function railItems() {
  return Array.from(document.querySelectorAll('.cooking-rail-item')).map((item) => {
    const current = item.querySelector('[aria-current="true"]');
    if (current) return `vorn: ${within(current).getByRole('img').getAttribute('aria-label') || within(current).getByRole('img').alt}`;
    return item.querySelector('button.cooking-rail-button').getAttribute('aria-label');
  });
}

function currentItem() {
  return document.querySelector('.cooking-rail-item--current');
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

describe('CookingSessionRail', () => {
  test('without other recipes it shows the open one and „+“', () => {
    renderRail();

    expect(screen.getByRole('navigation', { name: 'Rezepte am Herd' })).toBeInTheDocument();
    expect(railItems()).toEqual(['vorn: Kartoffelklöße']);
    expect(screen.getByRole('button', { name: 'Weiteres Rezept dazunehmen' })).toBeInTheDocument();
  });

  test('lists every recipe of the session in its order; the open one is marked, not a button', () => {
    renderRail();
    seedSession();

    expect(railItems()).toEqual([
      'Rinderrouladen öffnen, Schritt 2 von 3',
      'Apfelrotkohl öffnen, Schritt 1 von 2',
      'vorn: Kartoffelklöße',
    ]);
    expect(within(currentItem()).queryByRole('button')).toBeNull();
    expect(within(currentItem()).getByText('1 / 2')).toBeInTheDocument();
  });

  test('the open recipe shows its live step, not the one stored in the session', () => {
    renderRail({ currentStepIndex: 1 });
    seedSession();

    expect(within(currentItem()).getByText('2 / 2')).toBeInTheDocument();
  });

  test('the order stays fixed when a timer starts; a timer due within five minutes turns the recipe orange', () => {
    renderRail();
    seedSession();
    startTimer(rotkohl, 30);

    // Die Leiste im Hochformat sortierte Rotkohl jetzt nach vorn, die Schiene nicht
    expect(railItems()).toEqual([
      'Rinderrouladen öffnen, Schritt 2 von 3',
      'Apfelrotkohl öffnen, Timer 0:30',
      'vorn: Kartoffelklöße',
    ]);
    expect(screen.getByRole('button', { name: 'Apfelrotkohl öffnen, Timer 0:30' }).closest('li'))
      .toHaveClass('cooking-rail-item--urgent');
    expect(screen.getByRole('button', { name: 'Rinderrouladen öffnen, Schritt 2 von 3' }).closest('li'))
      .not.toHaveClass('cooking-rail-item--urgent');
  });

  test('a timer of the open recipe shows in its tab too, „Fertig“ once it has run out', () => {
    renderRail();
    seedSession();
    startTimer(kloesse, 10);
    expect(within(currentItem()).getByText('0:10')).toBeInTheDocument();

    act(() => { jest.advanceTimersByTime(10000); });

    expect(within(currentItem()).getByText('Fertig')).toBeInTheDocument();
    expect(currentItem()).toHaveClass('cooking-rail-item--urgent');
  });

  test('tapping a recipe in the background hands it over to swap; „+“ opens the sheet', () => {
    const { onSelect, onAdd } = renderRail();
    seedSession();

    fireEvent.click(screen.getByRole('button', { name: 'Apfelrotkohl öffnen, Schritt 1 von 2' }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ recipe: rotkohl, stepIndex: 0 }));

    fireEvent.click(screen.getByRole('button', { name: 'Weiteres Rezept dazunehmen' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  test('an open recipe that is not in the session yet stands at the end, where it parks when swapping', () => {
    renderRail({ currentRecipe: bratapfel });
    seedSession();

    expect(railItems()).toEqual([
      'Rinderrouladen öffnen, Schritt 2 von 3',
      'Apfelrotkohl öffnen, Schritt 1 von 2',
      'Kartoffelklöße öffnen, Schritt 1 von 2',
      'vorn: Bratapfel',
    ]);
  });

  test('stands on the left unless told otherwise; on the right it gets its mirrored class', () => {
    const { unmount } = renderRail();
    expect(document.querySelector('.cooking-rail')).toHaveClass('cooking-rail--left');
    unmount();

    renderRail({ side: 'right' });
    expect(document.querySelector('.cooking-rail')).toHaveClass('cooking-rail--right');
    expect(document.querySelector('.cooking-rail')).not.toHaveClass('cooking-rail--left');
  });

  test('with many recipes the circles keep their size; all stay in one list that scrolls as a carousel', () => {
    renderRail({ currentRecipe: bratapfel });
    seedSession();

    const rail = document.querySelector('.cooking-rail');
    expect(rail.className).not.toMatch(/compact/);
    expect(rail.querySelectorAll('.cooking-rail-list > .cooking-rail-item')).toHaveLength(4);
    expect(within(rail).getByRole('button', { name: 'Weiteres Rezept dazunehmen' }).closest('.cooking-rail-list')).toBeNull();
  });

  test('without a picture the circle shows the first letter of the recipe', () => {
    renderRail({ currentRecipe: { ...kloesse, image: undefined } });

    expect(within(currentItem()).getByRole('img', { name: 'Kartoffelklöße' })).toHaveTextContent('K');
    expect(railItems()).toEqual(['vorn: Kartoffelklöße']);
  });

  test('a left swipe offers removal; „Rückgängig“ brings the recipe back at its place, otherwise it leaves the session', () => {
    renderRail();
    seedSession();

    swipeLeft(screen.getByRole('button', { name: 'Apfelrotkohl öffnen, Schritt 1 von 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apfelrotkohl entfernen' }));

    expect(screen.queryByRole('button', { name: /^Apfelrotkohl öffnen/ })).toBeNull();
    expect(screen.getByText('„Apfelrotkohl" entfernt')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));
    expect(railItems()).toEqual([
      'Rinderrouladen öffnen, Schritt 2 von 3',
      'Apfelrotkohl öffnen, Schritt 1 von 2',
      'vorn: Kartoffelklöße',
    ]);

    swipeLeft(screen.getByRole('button', { name: 'Apfelrotkohl öffnen, Schritt 1 von 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apfelrotkohl entfernen' }));
    act(() => { jest.advanceTimersByTime(6000); });

    expect(session.sessionRecipes.map((e) => e.recipe.id)).toEqual(['rouladen', 'kloesse']);
  });

  test('the open recipe cannot be swiped away', () => {
    renderRail();
    seedSession();

    expect(currentItem().querySelector('.swipe-delete-background')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Kartoffelklöße entfernen' })).toBeNull();
  });

  describe('as a carousel', () => {
    const originalObserver = window.IntersectionObserver;
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    let reportVisibility;

    function itemOf(title) {
      return Array.from(document.querySelectorAll('.cooking-rail-item'))
        .find((item) => item.querySelector(`[title^="${title}"]`));
    }

    beforeEach(() => {
      window.IntersectionObserver = class {
        constructor(callback) {
          reportVisibility = (element, ratio, below = true) => act(() => {
            callback([{
              target: element,
              intersectionRatio: ratio,
              boundingClientRect: { top: below ? 400 : -100 },
              rootBounds: { top: 10 },
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

    test('keeps the open recipe in view, also when another one comes to the front', () => {
      const { rerenderRail } = renderRail();
      seedSession();
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'nearest' });

      Element.prototype.scrollIntoView.mockClear();
      rerenderRail({ currentRecipe: rotkohl });
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
      expect(Element.prototype.scrollIntoView.mock.instances[0]).toBe(currentItem());
      expect(currentItem().dataset.recipeId).toBe('rotkohl');
    });

    test('a due recipe out of view gets a hint on its side; tapping it scrolls there, the hint goes once it is visible', () => {
      renderRail();
      seedSession();
      startTimer(rotkohl, 30);

      // Nicht fällig: kein Hinweis, auch wenn außer Sicht
      reportVisibility(itemOf('Rinderrouladen'), 0);
      expect(screen.queryByRole('button', { name: /scrollen/ })).toBeNull();

      const item = itemOf('Apfelrotkohl');
      reportVisibility(item, 0.2);
      const hint = screen.getByRole('button', { name: 'Zu Apfelrotkohl scrollen, Timer 0:30' });
      expect(hint).toHaveTextContent('0:30');
      expect(hint).not.toHaveClass('cooking-rail-jump--up');

      Element.prototype.scrollIntoView.mockClear();
      fireEvent.click(hint);
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'nearest' });
      expect(Element.prototype.scrollIntoView.mock.instances[0]).toBe(item);

      reportVisibility(item, 1);
      expect(screen.queryByRole('button', { name: /scrollen/ })).toBeNull();

      reportVisibility(item, 0, false);
      expect(screen.getByRole('button', { name: 'Zu Apfelrotkohl scrollen, Timer 0:30' }))
        .toHaveClass('cooking-rail-jump--up');
    });
  });
});

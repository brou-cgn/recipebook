import React from 'react';
import { render, act } from '@testing-library/react';
import Tagesmenu from './Tagesmenu';

jest.mock('../utils/recipeSwipeFlags', () => ({
  setRecipeSwipeFlag: jest.fn(),
  getActiveSwipeFlags: () => Promise.resolve({}),
}));

jest.mock('../utils/customLists', () => ({
  getStatusValiditySettings: () => Promise.resolve({
    statusValidityDaysKandidat: null,
    statusValidityDaysGeparkt: null,
    statusValidityDaysArchiv: null,
  }),
}));

beforeAll(() => {
  if (!HTMLElement.prototype.setPointerCapture) {
    HTMLElement.prototype.setPointerCapture = jest.fn();
  }
  if (!HTMLElement.prototype.releasePointerCapture) {
    HTMLElement.prototype.releasePointerCapture = jest.fn();
  }
});

const makeRecipe = (id, title) => ({ id, title, groupId: 'list1' });

const list = { id: 'list1', name: 'Test Liste', listKind: 'interactive', recipeIds: [] };
const currentUser = { id: 'user1' };

const recipes = [
  makeRecipe('r1', 'Rezept 1'),
  makeRecipe('r2', 'Rezept 2'),
  makeRecipe('r3', 'Rezept 3'),
];

function renderMenu(recipeList = recipes) {
  return render(
    <Tagesmenu
      interactiveLists={[list]}
      recipes={recipeList}
      allUsers={[]}
      onSelectRecipe={() => {}}
      currentUser={currentUser}
    />
  );
}

/**
 * Retrieve a React component's event props directly from the DOM node.
 * JSDOM's PointerEvent does not support clientX, so we bypass fireEvent
 * and call the handlers directly with plain mock event objects.
 */
function getReactProps(element) {
  const key = Object.keys(element).find((k) => k.startsWith('__reactProps$'));
  return key ? element[key] : null;
}

const TRANSITION_EVENT = { propertyName: 'transform' };

/** Simulate a full left-swipe gesture by calling the handlers directly. */
function swipeLeft(element) {
  const props = getReactProps(element);
  if (!props) throw new Error('No React props found on element');
  act(() => {
    props.onPointerDown({ clientX: 200, clientY: 300, pointerId: 1, currentTarget: element });
  });
  act(() => {
    // Move far enough to exceed DIRECTION_THRESHOLD (5 px) and SWIPE_THRESHOLD (50 px)
    props.onPointerMove({ clientX: 100, clientY: 300, pointerId: 1, currentTarget: element });
  });
  act(() => {
    props.onPointerUp({ clientX: 100, clientY: 300, pointerId: 1, currentTarget: element });
  });
}

/** Simulate a full right-swipe gesture. */
function swipeRight(element) {
  const props = getReactProps(element);
  if (!props) throw new Error('No React props found on element');
  act(() => {
    props.onPointerDown({ clientX: 200, clientY: 300, pointerId: 1, currentTarget: element });
  });
  act(() => {
    props.onPointerMove({ clientX: 300, clientY: 300, pointerId: 1, currentTarget: element });
  });
  act(() => {
    props.onPointerUp({ clientX: 300, clientY: 300, pointerId: 1, currentTarget: element });
  });
}

/** Simulate a full up-swipe gesture. */
function swipeUp(element) {
  const props = getReactProps(element);
  if (!props) throw new Error('No React props found on element');
  act(() => {
    props.onPointerDown({ clientX: 200, clientY: 300, pointerId: 1, currentTarget: element });
  });
  act(() => {
    props.onPointerMove({ clientX: 200, clientY: 200, pointerId: 1, currentTarget: element });
  });
  act(() => {
    props.onPointerUp({ clientX: 200, clientY: 200, pointerId: 1, currentTarget: element });
  });
}

/** Complete the flying animation for the top card. */
function finishSwipeAnimation(element) {
  act(() => {
    const props = getReactProps(element);
    props.onTransitionEnd?.(TRANSITION_EVENT);
  });
}

describe('Tagesmenu – swipe card consistency', () => {
  test('initial render shows the first recipe as the top card', () => {
    renderMenu();

    const topCard = document.querySelector('.tagesmenu-card-top');
    expect(topCard).not.toBeNull();
    expect(topCard).toHaveTextContent('Rezept 1');

    // Second and third cards are also rendered in the stack
    const allCards = document.querySelectorAll('.tagesmenu-card');
    expect(allCards).toHaveLength(3);
  });

  test('after swiping, the card that was second becomes the new top card', () => {
    renderMenu();

    const topCard = document.querySelector('.tagesmenu-card-top');
    swipeLeft(topCard);
    finishSwipeAnimation(topCard);

    // Rezept 2 was behind Rezept 1 and must now be the top card
    expect(document.querySelector('.tagesmenu-card-top')).toHaveTextContent('Rezept 2');
  });

  test('background card transitions are suppressed immediately after a swipe (justSwiped)', () => {
    jest.useFakeTimers();
    try {
      renderMenu();

      const topCard = document.querySelector('.tagesmenu-card-top');
      swipeLeft(topCard);
      finishSwipeAnimation(topCard);

      // Right after the swipe (before the RAF fires) background cards must have
      // transition: none so they do NOT animate back to their smaller stacked sizes.
      const backgroundCards = Array.from(
        document.querySelectorAll('.tagesmenu-card')
      ).filter((c) => !c.classList.contains('tagesmenu-card-top'));

      backgroundCards.forEach((card) => {
        expect(card.style.transition).toBe('none');
      });

      // After the requestAnimationFrame fires, transitions are restored
      act(() => { jest.runAllTimers(); });

      backgroundCards.forEach((card) => {
        expect(card.style.transition).toBe('transform 0.3s ease');
      });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('Tagesmenu – completion tile view', () => {
  /** Swipe all three recipes and complete the animations. */
  function swipeAllCards(swipeActions) {
    swipeActions.forEach((swipeFn) => {
      const topCard = document.querySelector('.tagesmenu-card-top');
      swipeFn(topCard);
      finishSwipeAnimation(topCard);
    });
  }

  test('shows tile view after all cards are swiped', () => {
    renderMenu();
    swipeAllCards([swipeLeft, swipeLeft, swipeLeft]);

    expect(document.querySelector('.tagesmenu-results')).not.toBeNull();
    expect(document.querySelector('.tagesmenu-stack')).toBeNull();
  });

  test('groups swiped-left recipes under Archiviert', () => {
    renderMenu();
    swipeAllCards([swipeLeft, swipeLeft, swipeLeft]);

    const groups = document.querySelectorAll('.tagesmenu-results-group');
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveTextContent('Archiviert');
    expect(document.querySelectorAll('.tagesmenu-results-tile')).toHaveLength(3);
  });

  test('groups swiped-right recipes under Für später', () => {
    renderMenu();
    swipeAllCards([swipeRight, swipeRight, swipeRight]);

    const group = document.querySelector('.tagesmenu-results-group');
    expect(group).toHaveTextContent('Für später');
    expect(document.querySelectorAll('.tagesmenu-results-tile')).toHaveLength(3);
  });

  test('groups swiped-up recipes under Kandidat', () => {
    renderMenu();
    swipeAllCards([swipeUp, swipeUp, swipeUp]);

    const group = document.querySelector('.tagesmenu-results-group');
    expect(group).toHaveTextContent('Kandidat');
    expect(document.querySelectorAll('.tagesmenu-results-tile')).toHaveLength(3);
  });

  test('shows multiple groups when different swipe directions are used', () => {
    renderMenu();
    swipeAllCards([swipeUp, swipeRight, swipeLeft]);

    const groups = document.querySelectorAll('.tagesmenu-results-group');
    expect(groups).toHaveLength(3);
    expect(groups[0]).toHaveTextContent('Kandidat');
    expect(groups[1]).toHaveTextContent('Für später');
    expect(groups[2]).toHaveTextContent('Archiviert');
    expect(document.querySelectorAll('.tagesmenu-results-tile')).toHaveLength(3);
  });

  test('tiles display recipe titles', () => {
    renderMenu();
    swipeAllCards([swipeLeft, swipeLeft, swipeLeft]);

    const tiles = document.querySelectorAll('.tagesmenu-results-tile');
    const tileTexts = Array.from(tiles).map((t) =>
      t.querySelector('.tagesmenu-results-tile-name')?.textContent
    );
    expect(tileTexts).toEqual(
      expect.arrayContaining(['Rezept 1', 'Rezept 2', 'Rezept 3'])
    );
  });

  test('clicking restart resets to card stack view', () => {
    renderMenu();
    swipeAllCards([swipeLeft, swipeLeft, swipeLeft]);

    // Results view should be visible
    expect(document.querySelector('.tagesmenu-results')).not.toBeNull();

    // Click restart
    const restartBtn = document.querySelector('.tagesmenu-restart-btn');
    act(() => { restartBtn.click(); });

    // Card stack should be back
    expect(document.querySelector('.tagesmenu-stack')).not.toBeNull();
    expect(document.querySelector('.tagesmenu-results')).toBeNull();
    // Tile groups should be cleared after restart
    expect(document.querySelectorAll('.tagesmenu-results-group')).toHaveLength(0);
  });

  test('tile click triggers onSelectRecipe with the correct recipe', () => {
    const onSelectRecipe = jest.fn();
    render(
      <Tagesmenu
        interactiveLists={[list]}
        recipes={recipes}
        allUsers={[]}
        onSelectRecipe={onSelectRecipe}
        currentUser={currentUser}
      />
    );
    swipeAllCards([swipeLeft, swipeLeft, swipeLeft]);

    const firstTile = document.querySelector('.tagesmenu-results-tile');
    act(() => { firstTile.click(); });

    expect(onSelectRecipe).toHaveBeenCalledTimes(1);
    expect(onSelectRecipe).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }));
  });
});

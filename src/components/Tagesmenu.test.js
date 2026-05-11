import React from 'react';
import { render, act, fireEvent } from '@testing-library/react';
import Tagesmenu from './Tagesmenu';
import { parkAllRecipeSwipeFlagsForRecipeInList } from '../utils/recipeSwipeFlags';
import { archiveRecipeForAllUsersInList } from '../utils/recipeSwipeFlags';
import { updateRecipe } from '../utils/recipeFirestore';
import { addRecipeToGroup, removeRecipeFromGroup } from '../utils/groupFirestore';
import { addFavorite } from '../utils/userFavorites';

let mockActiveFlagsValue = {};
let mockAllMembersFlagsValue = {};
let mockMaxKandidatenSchwelle = null;
let mockComputeGroupRecipeStatus = () => 'kandidat';
let mockStatusValiditySettings = {
  statusValidityDaysKandidat: null,
  statusValidityDaysGeparkt: null,
  statusValidityDaysArchiv: null,
};

jest.mock('../utils/recipeSwipeFlags', () => ({
  setRecipeSwipeFlag: jest.fn(),
  parkAllRecipeSwipeFlagsForRecipeInList: jest.fn(() => Promise.resolve(true)),
  archiveRecipeForAllUsersInList: jest.fn(() => Promise.resolve(true)),
  getActiveSwipeFlags: () => Promise.resolve(mockActiveFlagsValue),
  getAllMembersSwipeFlags: () => Promise.resolve(mockAllMembersFlagsValue),
  computeGroupRecipeStatus: (...args) => mockComputeGroupRecipeStatus(...args),
  clearExpiryForArchivedRecipe: () => Promise.resolve(true),
}));

jest.mock('../utils/customLists', () => ({
  getStatusValiditySettings: () => Promise.resolve(mockStatusValiditySettings),
  getGroupStatusThresholds: () => Promise.resolve({
    groupThresholdKandidatMinKandidat: 50,
    groupThresholdKandidatMaxArchiv: 50,
    groupThresholdArchivMinArchiv: 50,
    groupThresholdArchivMaxKandidat: 50,
  }),
  getMaxKandidatenSchwelle: () => Promise.resolve(mockMaxKandidatenSchwelle),
  getButtonIcons: () => Promise.resolve({
    swipeRight: '👍',
    swipeLeft: '👎',
    swipeUp: '⭐',
    tagesmenuKachelMenu: '⋯',
    tagesmenuKachelMenuAlt: '⚪',
  }),
  DEFAULT_BUTTON_ICONS: {
    swipeRight: '👍',
    swipeLeft: '👎',
    swipeUp: '⭐',
    tagesmenuKachelMenu: '⋯',
    tagesmenuKachelMenuAlt: '⚪',
  },
  getEffectiveIcon: (icons, key) => icons[key] ?? '',
  getDarkModePreference: () => false,
}));

jest.mock('../utils/imageUtils', () => ({
  isBase64Image: jest.fn(() => false),
}));

jest.mock('../utils/recipeFirestore', () => ({
  updateRecipe: jest.fn(() => Promise.resolve()),
}));

jest.mock('../utils/groupFirestore', () => ({
  addRecipeToGroup: jest.fn(() => Promise.resolve()),
  removeRecipeFromGroup: jest.fn(() => Promise.resolve()),
}));

jest.mock('../utils/userFavorites', () => ({
  addFavorite: jest.fn(() => Promise.resolve(true)),
}));

beforeAll(() => {
  if (!HTMLElement.prototype.setPointerCapture) {
    HTMLElement.prototype.setPointerCapture = jest.fn();
  }
  if (!HTMLElement.prototype.releasePointerCapture) {
    HTMLElement.prototype.releasePointerCapture = jest.fn();
  }
});

beforeEach(() => {
  jest.clearAllMocks();
  mockStatusValiditySettings = {
    statusValidityDaysKandidat: null,
    statusValidityDaysGeparkt: null,
    statusValidityDaysArchiv: null,
  };
  parkAllRecipeSwipeFlagsForRecipeInList.mockClear();
  archiveRecipeForAllUsersInList.mockResolvedValue(true);
  parkAllRecipeSwipeFlagsForRecipeInList.mockResolvedValue(true);
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
  test('initial render shows the first recipe as the top card', async () => {
    await act(async () => { renderMenu(); });

    const topCard = document.querySelector('.tagesmenu-card-top');
    expect(topCard).not.toBeNull();
    expect(topCard).toHaveTextContent('Rezept 1');

    // Second and third cards are also rendered in the stack
    const allCards = document.querySelectorAll('.tagesmenu-card');
    expect(allCards).toHaveLength(3);
  });

  test('after swiping, the card that was second becomes the new top card', async () => {
    await act(async () => { renderMenu(); });

    const topCard = document.querySelector('.tagesmenu-card-top');
    swipeLeft(topCard);
    finishSwipeAnimation(topCard);

    // Rezept 2 was behind Rezept 1 and must now be the top card
    expect(document.querySelector('.tagesmenu-card-top')).toHaveTextContent('Rezept 2');
  });

  test('background card transitions are suppressed immediately after a swipe (justSwiped)', async () => {
    jest.useFakeTimers();
    try {
      await act(async () => { renderMenu(); });

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

  test('shows tile view after all cards are swiped', async () => {
    await act(async () => { renderMenu(); });
    swipeAllCards([swipeLeft, swipeLeft, swipeLeft]);

    expect(document.querySelector('.tagesmenu-results')).not.toBeNull();
    expect(document.querySelector('.tagesmenu-stack')).toBeNull();
  });

  test('groups swiped-left recipes under Archiviert', async () => {
    await act(async () => { renderMenu(); });
    swipeAllCards([swipeLeft, swipeLeft, swipeLeft]);

    const groups = document.querySelectorAll('.tagesmenu-results-group');
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveTextContent('Archiviert');
    expect(document.querySelectorAll('.tagesmenu-results-tile')).toHaveLength(3);
  });

  test('groups swiped-right recipes under Für später', async () => {
    await act(async () => { renderMenu(); });
    swipeAllCards([swipeRight, swipeRight, swipeRight]);

    const group = document.querySelector('.tagesmenu-results-group');
    expect(group).toHaveTextContent('Für später');
    expect(document.querySelectorAll('.tagesmenu-results-tile')).toHaveLength(3);
  });

  test('groups swiped-up recipes under Kandidat', async () => {
    await act(async () => { renderMenu(); });
    swipeAllCards([swipeUp, swipeUp, swipeUp]);

    const group = document.querySelector('.tagesmenu-results-group');
    expect(group).toHaveTextContent('Kandidat');
    expect(document.querySelectorAll('.tagesmenu-results-tile')).toHaveLength(3);
  });

  test('shows multiple groups when different swipe directions are used', async () => {
    await act(async () => { renderMenu(); });
    swipeAllCards([swipeUp, swipeRight, swipeLeft]);

    const groups = document.querySelectorAll('.tagesmenu-results-group');
    expect(groups).toHaveLength(3);
    expect(groups[0]).toHaveTextContent('Kandidat');
    expect(groups[1]).toHaveTextContent('Für später');
    expect(groups[2]).toHaveTextContent('Archiviert');
    expect(document.querySelectorAll('.tagesmenu-results-tile')).toHaveLength(3);
  });

  test('tiles display recipe titles', async () => {
    await act(async () => { renderMenu(); });
    swipeAllCards([swipeLeft, swipeLeft, swipeLeft]);

    const tiles = document.querySelectorAll('.tagesmenu-results-tile');
    const tileTexts = Array.from(tiles).map((t) =>
      t.querySelector('.tagesmenu-results-tile-name')?.textContent
    );
    expect(tileTexts).toEqual(
      expect.arrayContaining(['Rezept 1', 'Rezept 2', 'Rezept 3'])
    );
  });

  test('long tile titles render in the dedicated title element', async () => {
    const longTitle = 'Ein sehr sehr sehr sehr sehr sehr sehr sehr sehr langer Rezepttitel';
    await act(async () => { renderMenu([makeRecipe('r1', longTitle)]); });
    swipeAllCards([swipeLeft]);

    const tileTitle = document.querySelector('.tagesmenu-results-tile-name');
    expect(tileTitle).not.toBeNull();
    expect(tileTitle).toHaveTextContent(longTitle);
    expect(tileTitle.innerHTML).not.toContain('<br');
  });

  test('results view has no restart button', async () => {
    await act(async () => { renderMenu(); });
    swipeAllCards([swipeLeft, swipeLeft, swipeLeft]);

    // Results view should be visible
    expect(document.querySelector('.tagesmenu-results')).not.toBeNull();

    // Restart button should not exist
    expect(document.querySelector('.tagesmenu-restart-btn')).toBeNull();
  });

  test('tile click triggers onSelectRecipe with the correct recipe', async () => {
    const onSelectRecipe = jest.fn();
    await act(async () => {
      render(
        <Tagesmenu
          interactiveLists={[list]}
          recipes={recipes}
          allUsers={[]}
          onSelectRecipe={onSelectRecipe}
          currentUser={currentUser}
        />
      );
    });
    swipeAllCards([swipeLeft, swipeLeft, swipeLeft]);

    const firstTile = document.querySelector('.tagesmenu-results-tile');
    act(() => { firstTile.click(); });

    expect(onSelectRecipe).toHaveBeenCalledTimes(1);
    expect(onSelectRecipe).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }));
  });
});

describe('Tagesmenu – pre-existing active flags', () => {
  beforeEach(() => {
    mockActiveFlagsValue = {};
    mockAllMembersFlagsValue = {};
  });

  afterEach(() => {
    mockActiveFlagsValue = {};
    mockAllMembersFlagsValue = {};
  });

  test('no swipe card is shown before active flags are loaded', async () => {
    // Do NOT await – check the synchronous state before the promise resolves
    renderMenu();

    // While flags are still loading, neither the swipe stack nor the results
    // view should be visible, preventing any flash of recipe cards.
    expect(document.querySelector('.tagesmenu-stack')).toBeNull();
    expect(document.querySelector('.tagesmenu-results')).toBeNull();

    // Flush pending async operations so the component can unmount cleanly
    await act(async () => {});
  });

  test('shows tile view immediately when all recipes already have active flags', async () => {
    mockActiveFlagsValue = { r1: 'kandidat', r2: 'geparkt', r3: 'archiv' };

    await act(async () => {
      renderMenu();
    });

    // No swipeable cards remain → tile view should be shown
    expect(document.querySelector('.tagesmenu-results')).not.toBeNull();
    expect(document.querySelector('.tagesmenu-stack')).toBeNull();

    const groups = document.querySelectorAll('.tagesmenu-results-group');
    expect(groups).toHaveLength(3);
    expect(groups[0]).toHaveTextContent('Kandidat');
    expect(groups[1]).toHaveTextContent('Für später');
    expect(groups[2]).toHaveTextContent('Archiviert');
    expect(document.querySelectorAll('.tagesmenu-results-tile')).toHaveLength(3);
  });

  test('shows only un-swiped recipes when some flags are pre-existing', async () => {
    // r1 already has a flag; only r2 and r3 should appear in the swipe stack
    mockActiveFlagsValue = { r1: 'kandidat' };

    await act(async () => {
      renderMenu();
    });

    // The swipe stack should show r2 as the top card (r1 is filtered out)
    const topCard = document.querySelector('.tagesmenu-card-top');
    expect(topCard).not.toBeNull();
    expect(topCard).toHaveTextContent('Rezept 2');
  });

  test('tile view includes pre-flagged recipes alongside current-session swipes', async () => {
    // r1 already has a flag from a previous session; r2 and r3 are new
    mockActiveFlagsValue = { r1: 'kandidat' };

    await act(async () => {
      renderMenu();
    });

    // Only r2 and r3 are in the swipe stack; swipe them both left (archiv)
    function swipeCardLeft() {
      const topCard = document.querySelector('.tagesmenu-card-top');
      const propsKey = Object.keys(topCard).find((k) => k.startsWith('__reactProps$'));
      const props = topCard[propsKey];
      act(() => { props.onPointerDown({ clientX: 200, clientY: 300, pointerId: 1, currentTarget: topCard }); });
      act(() => { props.onPointerMove({ clientX: 100, clientY: 300, pointerId: 1, currentTarget: topCard }); });
      act(() => { props.onPointerUp({ clientX: 100, clientY: 300, pointerId: 1, currentTarget: topCard }); });
      // Re-read props after the state update so we get the updated handleTransitionEnd
      act(() => {
        const freshPropsKey = Object.keys(topCard).find((k) => k.startsWith('__reactProps$'));
        topCard[freshPropsKey].onTransitionEnd?.({ propertyName: 'transform' });
      });
    }

    swipeCardLeft(); // swipe r2 left → archiv
    swipeCardLeft(); // swipe r3 left → archiv

    // Tile view should now show all 3 recipes:
    // r1 (kandidat from activeFlags) + r2, r3 (archiv from current-session swipeResults)
    expect(document.querySelector('.tagesmenu-results')).not.toBeNull();

    const groups = document.querySelectorAll('.tagesmenu-results-group');
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveTextContent('Kandidat');
    expect(groups[1]).toHaveTextContent('Archiviert');
    expect(document.querySelectorAll('.tagesmenu-results-tile')).toHaveLength(3);
  });

  test('Gemeinsamer Status does not show a Kandidat group; kandidat recipes appear only in Meine Auswahl', async () => {
    // Setup: 5 recipes total, r1 and r2 have pre-existing flags from a previous session, r3-r5 are new
    mockActiveFlagsValue = { r1: 'kandidat', r2: 'archiv' };
    
    // Multi-member list to enable "Gemeinsamer Status" section
    const multiMemberList = {
      id: 'list1',
      name: 'Test Liste',
      listKind: 'interactive',
      recipeIds: [],
      ownerId: 'user1',
      memberIds: ['user2'],
    };

    // Set up group status: all recipes are considered 'kandidat' by the mock
    mockAllMembersFlagsValue = {
      user1: { r1: 'kandidat', r2: 'kandidat', r3: 'kandidat', r4: 'kandidat', r5: 'kandidat' },
      user2: { r1: 'kandidat', r2: 'kandidat', r3: 'kandidat', r4: 'kandidat', r5: 'kandidat' },
    };

    const allRecipes = [
      makeRecipe('r1', 'Old Recipe 1'),
      makeRecipe('r2', 'Old Recipe 2'),
      makeRecipe('r3', 'New Recipe 3'),
      makeRecipe('r4', 'New Recipe 4'),
      makeRecipe('r5', 'New Recipe 5'),
    ];

    await act(async () => {
      render(
        <Tagesmenu
          interactiveLists={[multiMemberList]}
          recipes={allRecipes}
          allUsers={[]}
          onSelectRecipe={() => {}}
          currentUser={currentUser}
        />
      );
    });

    // Swipe through all new recipes (r3, r4, r5)
    function swipeCardUp() {
      const topCard = document.querySelector('.tagesmenu-card-top');
      if (!topCard) return;
      const propsKey = Object.keys(topCard).find((k) => k.startsWith('__reactProps$'));
      const props = topCard[propsKey];
      act(() => { props.onPointerDown({ clientX: 200, clientY: 300, pointerId: 1, currentTarget: topCard }); });
      act(() => { props.onPointerMove({ clientX: 200, clientY: 200, pointerId: 1, currentTarget: topCard }); });
      act(() => { props.onPointerUp({ clientX: 200, clientY: 200, pointerId: 1, currentTarget: topCard }); });
      act(() => {
        const freshPropsKey = Object.keys(topCard).find((k) => k.startsWith('__reactProps$'));
        topCard[freshPropsKey].onTransitionEnd?.({ propertyName: 'transform' });
      });
    }

    swipeCardUp(); // swipe r3 up → kandidat
    swipeCardUp(); // swipe r4 up → kandidat
    swipeCardUp(); // swipe r5 up → kandidat

    // Results view should be shown
    expect(document.querySelector('.tagesmenu-results')).not.toBeNull();

    // "Gemeinsamer Status" section should NOT be shown since all group statuses are 'kandidat'
    // (Kandidat group removed from "Gemeinsamer Status"; no archiv recipes; maxKandidatenSchwelle=null)
    const sharedStatusTitle = Array.from(document.querySelectorAll('.tagesmenu-results-section-title'))
      .find(el => el.textContent === 'Gemeinsamer Status');
    expect(sharedStatusTitle).toBeUndefined();

    // Meine Auswahl is now in a dedicated view accessible via the bottom-center button
    // Verify the button is shown (currentUser has no tagesmenuTestmode=false, so button is visible)
    expect(document.querySelector('.tagesmenu-meine-auswahl-btn')).not.toBeNull();

    // Verify no "Kandidat" group heading appears in the results view (it belongs in Meine Auswahl view)
    const resultGroupHeadings = Array.from(document.querySelectorAll('.tagesmenu-results .tagesmenu-results-group-title'))
      .map(el => el.textContent);
    expect(resultGroupHeadings.filter(h => h === 'Kandidat')).toHaveLength(0);
  });

  test('Gemeinsamer Status does not show Kandidat group for pre-existing kandidat flags; recipes appear in Meine Auswahl', async () => {
    // Simulate returning to Tagesmenü: all recipes already flagged from a previous session.
    // swipeResults will be empty (no swipes this session).
    mockActiveFlagsValue = { r1: 'kandidat', r2: 'kandidat', r3: 'kandidat' };

    const multiMemberList = {
      id: 'list1',
      name: 'Test Liste',
      listKind: 'interactive',
      recipeIds: [],
      ownerId: 'user1',
      memberIds: ['user2'],
    };

    mockAllMembersFlagsValue = {
      user1: { r1: 'kandidat', r2: 'kandidat', r3: 'kandidat' },
      user2: { r1: 'kandidat', r2: 'kandidat', r3: 'kandidat' },
    };

    const allRecipes = [
      makeRecipe('r1', 'Rezept 1'),
      makeRecipe('r2', 'Rezept 2'),
      makeRecipe('r3', 'Rezept 3'),
    ];

    await act(async () => {
      render(
        <Tagesmenu
          interactiveLists={[multiMemberList]}
          recipes={allRecipes}
          allUsers={[]}
          onSelectRecipe={() => {}}
          currentUser={currentUser}
        />
      );
    });

    // All recipes have active flags, so the swipe stack is empty and results page shows immediately
    expect(document.querySelector('.tagesmenu-results')).not.toBeNull();

    // "Gemeinsamer Status" section should NOT be shown:
    // all group statuses are 'kandidat', Kandidat group was removed from Gemeinsamer Status,
    // no archiv recipes exist, and maxKandidatenSchwelle is null (no Gemeinsame Kandidaten).
    const sharedStatusTitle = Array.from(document.querySelectorAll('.tagesmenu-results-section-title'))
      .find(el => el.textContent === 'Gemeinsamer Status');
    expect(sharedStatusTitle).toBeUndefined();

    // "Meine Auswahl" is now in a dedicated view accessible via the bottom-center button
    const meineAuswahlBtn = document.querySelector('.tagesmenu-meine-auswahl-btn');
    expect(meineAuswahlBtn).not.toBeNull();

    // Click the button to open the Meine Auswahl view
    act(() => { fireEvent.click(meineAuswahlBtn); });

    expect(document.querySelector('.tagesmenu-meine-auswahl')).not.toBeNull();

    const meineAuswahlKandidatGroup = Array.from(document.querySelectorAll('.tagesmenu-results-group'))
      .find(el => el.querySelector('.tagesmenu-results-group-title')?.textContent === 'Kandidat');
    expect(meineAuswahlKandidatGroup).not.toBeNull();

    const tileNames = Array.from(meineAuswahlKandidatGroup.querySelectorAll('.tagesmenu-results-tile-name'))
      .map(el => el.textContent);
    expect(tileNames).toContain('Rezept 1');
    expect(tileNames).toContain('Rezept 2');
    expect(tileNames).toContain('Rezept 3');
  });
});

describe('Tagesmenu – candidate score threshold (maxKandidatenSchwelle)', () => {
  // Two-member list: user1 = current swiper (owner), user2 = other member.
  // The score is computed from user2's votes only (current user excluded).
  const listWithTwoMembers = {
    id: 'list1',
    name: 'Test Liste',
    listKind: 'interactive',
    recipeIds: [],
    ownerId: 'user1',
    memberIds: ['user2'],
  };

  function renderMenuWithTwoMembers(recipeList = recipes) {
    return render(
      <Tagesmenu
        interactiveLists={[listWithTwoMembers]}
        recipes={recipeList}
        allUsers={[]}
        onSelectRecipe={() => {}}
        currentUser={currentUser}
      />
    );
  }

  beforeEach(() => {
    mockActiveFlagsValue = {};
    mockAllMembersFlagsValue = {};
    mockMaxKandidatenSchwelle = null;
  });

  afterEach(() => {
    mockActiveFlagsValue = {};
    mockAllMembersFlagsValue = {};
    mockMaxKandidatenSchwelle = null;
  });

  test('swipe stack is not ended early when threshold is null (disabled)', async () => {
    // user2 has voted all recipes → S = 3 * 1/(1+0) = 3 if threshold applied,
    // but threshold = null so no early termination.
    mockMaxKandidatenSchwelle = null;
    mockAllMembersFlagsValue = { user2: { r1: 'kandidat', r2: 'kandidat', r3: 'kandidat' } };

    await act(async () => { renderMenuWithTwoMembers(); });

    expect(document.querySelector('.tagesmenu-stack')).not.toBeNull();
    expect(document.querySelector('.tagesmenu-results')).toBeNull();
  });

  test('stack ends immediately when other members have voted all recipes (current user excluded from formula)', async () => {
    // user2 has voted all 3 recipes → otherMembers (user2) have ni=0 for every recipe
    // S = 3 * 1/(1+0) = 3; threshold = 2 → 3 >= 2 → stack ends immediately
    // user1/currentUser has not swiped anything but their missing votes are excluded
    mockMaxKandidatenSchwelle = 2;
    mockAllMembersFlagsValue = { user2: { r1: 'kandidat', r2: 'kandidat', r3: 'kandidat' } };

    await act(async () => { renderMenuWithTwoMembers(); });

    expect(document.querySelector('.tagesmenu-results')).not.toBeNull();
    expect(document.querySelector('.tagesmenu-stack')).toBeNull();
  });

  test('no swipe card flickers before results view when threshold is already met at initial load', async () => {
    // Regression test: before the fix, flagsLoaded became true before maxKandidatenSchwelle
    // and allMembersFlags resolved, causing the swipe stack to briefly appear (flicker)
    // even when the threshold was already exceeded at load time.
    mockMaxKandidatenSchwelle = 2;
    mockAllMembersFlagsValue = { user2: { r1: 'kandidat', r2: 'kandidat', r3: 'kandidat' } };

    // Do NOT await – check the state while async loads are still pending.
    // The swipe stack must never be visible at any point during loading.
    renderMenuWithTwoMembers();

    expect(document.querySelector('.tagesmenu-stack')).toBeNull();
    expect(document.querySelector('.tagesmenu-results')).toBeNull();

    // After all data resolves, results view appears directly with no stack visible.
    await act(async () => {});

    expect(document.querySelector('.tagesmenu-results')).not.toBeNull();
    expect(document.querySelector('.tagesmenu-stack')).toBeNull();
  });

  test('stack stays open when other member has not yet voted (S < threshold)', async () => {
    // user2 has not voted any recipe → ni=1 for each (1 other member, none swiped)
    // S = 3 * 1/(1+1) = 1.5; threshold = 2 → 1.5 < 2 → stack continues
    mockMaxKandidatenSchwelle = 2;
    mockAllMembersFlagsValue = {}; // user2 has no votes yet

    await act(async () => { renderMenuWithTwoMembers(); });

    expect(document.querySelector('.tagesmenu-stack')).not.toBeNull();
    expect(document.querySelector('.tagesmenu-results')).toBeNull();
  });

  test('stack ends when other member has voted partially and S exactly meets threshold', async () => {
    // user2 voted r1 and r2 (not r3) → ni: r1=0, r2=0, r3=1
    // S = 1/(1+0) + 1/(1+0) + 1/(1+1) = 1 + 1 + 0.5 = 2.5; threshold = 2 → 2.5 >= 2 → ends
    mockMaxKandidatenSchwelle = 2;
    mockAllMembersFlagsValue = { user2: { r1: 'kandidat', r2: 'kandidat' } };

    await act(async () => { renderMenuWithTwoMembers(); });

    expect(document.querySelector('.tagesmenu-results')).not.toBeNull();
    expect(document.querySelector('.tagesmenu-stack')).toBeNull();
  });

  test('threshold is preserved and reloaded when switching between lists', async () => {
    // List 1: threshold set, all recipes voted → results shown immediately
    mockMaxKandidatenSchwelle = 2;
    mockAllMembersFlagsValue = { user2: { r1: 'kandidat', r2: 'kandidat', r3: 'kandidat' } };

    const list1 = {
      id: 'list1',
      name: 'Liste 1',
      listKind: 'interactive',
      recipeIds: [],
      ownerId: 'user1',
      memberIds: ['user2'],
    };
    const list2 = {
      id: 'list2',
      name: 'Liste 2',
      listKind: 'interactive',
      recipeIds: [],
      ownerId: 'user1',
      memberIds: ['user2'],
    };
    const recipesForBothLists = [
      { id: 'r1', title: 'Rezept 1', groupId: 'list1' },
      { id: 'r2', title: 'Rezept 2', groupId: 'list1' },
      { id: 'r3', title: 'Rezept 3', groupId: 'list1' },
      { id: 'r4', title: 'Rezept 4', groupId: 'list2' },
    ];

    const { container } = await act(async () =>
      render(
        <Tagesmenu
          interactiveLists={[list1, list2]}
          recipes={recipesForBothLists}
          allUsers={[]}
          onSelectRecipe={() => {}}
          currentUser={currentUser}
        />
      )
    );

    // List 1 starts selected; all recipes voted → results view due to threshold
    expect(container.querySelector('.tagesmenu-results')).not.toBeNull();

    // Open the filter overlay and switch to list 2
    const filterBtn = container.querySelector('.tagesmenu-filter-btn');
    await act(async () => { filterBtn.click(); });

    const pills = container.querySelectorAll('.mobile-search-filter-pill');
    // Second pill = list2
    await act(async () => { pills[1].click(); });

    // List 2 has r4 not voted by user2 → score 1/(1+1) = 0.5 < threshold 2 → stack shown
    expect(container.querySelector('.tagesmenu-stack')).not.toBeNull();
    expect(container.querySelector('.tagesmenu-results')).toBeNull();

    // Open overlay again and switch back to list 1
    // Note: the active list (list2) is shown first in the overlay, so list1 is at index 1
    const filterBtn2 = container.querySelector('.tagesmenu-filter-btn');
    await act(async () => { filterBtn2.click(); });

    const pills2 = container.querySelectorAll('.mobile-search-filter-pill');
    await act(async () => { pills2[1].click(); });

    expect(container.querySelector('.tagesmenu-results')).not.toBeNull();
  });
});

describe('Tagesmenu – one extra card shown when threshold is crossed mid-session by a swipe', () => {
  // Simulates a realistic scenario where group status is 'kandidat' only when both
  // user1 (current user) AND user2 (other member) have voted the recipe. This means
  // user1's swipes can increase the candidateScore, allowing the threshold to be
  // crossed mid-session (not at initial load time).
  function requireBothMembers(_memberIds, flags, recipeId) {
    const user1Voted = flags['user1']?.[recipeId] !== undefined;
    const user2Voted = flags['user2']?.[recipeId] !== undefined;
    return user1Voted && user2Voted ? 'kandidat' : 'archiv';
  }

  const listWithTwoMembers = {
    id: 'list1',
    name: 'Test Liste',
    listKind: 'interactive',
    recipeIds: [],
    ownerId: 'user1',
    memberIds: ['user2'],
  };

  function renderMenuWithTwoMembers() {
    return render(
      <Tagesmenu
        interactiveLists={[listWithTwoMembers]}
        recipes={recipes}
        allUsers={[]}
        onSelectRecipe={() => {}}
        currentUser={currentUser}
      />
    );
  }

  beforeEach(() => {
    // user2 has voted all 3 recipes as kandidat; user1 has not yet voted
    mockAllMembersFlagsValue = { user2: { r1: 'kandidat', r2: 'kandidat', r3: 'kandidat' } };
    mockMaxKandidatenSchwelle = 2;
    // Score only counts recipes where BOTH user1 and user2 have voted (dynamic mock)
    mockComputeGroupRecipeStatus = requireBothMembers;
  });

  afterEach(() => {
    mockActiveFlagsValue = {};
    mockAllMembersFlagsValue = {};
    mockMaxKandidatenSchwelle = null;
    mockComputeGroupRecipeStatus = () => 'kandidat';
  });

  test('stack stays open before any swipe when score is below threshold', async () => {
    // user1 has not voted yet → no recipe has 'kandidat' group status → score = 0 < threshold 2
    await act(async () => { renderMenuWithTwoMembers(); });

    expect(document.querySelector('.tagesmenu-stack')).not.toBeNull();
    expect(document.querySelector('.tagesmenu-results')).toBeNull();
  });

  test('after a swipe crosses the threshold, the already-visible next card remains as the last swipeable card', async () => {
    await act(async () => { renderMenuWithTwoMembers(); });

    // Swipe r1 as kandidat: r1 now 'kandidat' (both user1+user2 voted), score = 1 < threshold 2
    const card1 = document.querySelector('.tagesmenu-card-top');
    swipeUp(card1);
    finishSwipeAnimation(card1);
    expect(document.querySelector('.tagesmenu-stack')).not.toBeNull();
    expect(document.querySelector('.tagesmenu-results')).toBeNull();

    // Swipe r2 as kandidat: r2 now 'kandidat', score = 2 = threshold → threshold crossed by swipe
    const card2 = document.querySelector('.tagesmenu-card-top');
    swipeUp(card2);
    finishSwipeAnimation(card2);

    // Stack must still be visible: r3 is the extra last swipeable card
    expect(document.querySelector('.tagesmenu-stack')).not.toBeNull();
    expect(document.querySelector('.tagesmenu-results')).toBeNull();
    expect(document.querySelector('.tagesmenu-card-top')).toHaveTextContent('Rezept 3');
  });

  test('only 1 card is shown in the stack after the threshold is crossed mid-session', async () => {
    await act(async () => { renderMenuWithTwoMembers(); });

    // Swipe r1 and r2 to cross the threshold (score becomes 2 = threshold)
    const card1 = document.querySelector('.tagesmenu-card-top');
    swipeUp(card1);
    finishSwipeAnimation(card1);

    const card2 = document.querySelector('.tagesmenu-card-top');
    swipeUp(card2);
    finishSwipeAnimation(card2);

    // After threshold crossed mid-session: only 1 card shown (the last swipeable card)
    const allCards = document.querySelectorAll('.tagesmenu-card');
    expect(allCards).toHaveLength(1);
  });

  test('results view appears after swiping the extra last card following threshold crossing', async () => {
    await act(async () => { renderMenuWithTwoMembers(); });

    // Swipe r1 and r2 to cross the threshold
    const card1 = document.querySelector('.tagesmenu-card-top');
    swipeUp(card1);
    finishSwipeAnimation(card1);

    const card2 = document.querySelector('.tagesmenu-card-top');
    swipeUp(card2);
    finishSwipeAnimation(card2);

    // Stack still visible (r3 is the extra last card)
    expect(document.querySelector('.tagesmenu-stack')).not.toBeNull();

    // Swipe the last card (r3)
    const card3 = document.querySelector('.tagesmenu-card-top');
    swipeUp(card3);
    finishSwipeAnimation(card3);

    // Results view should now appear
    expect(document.querySelector('.tagesmenu-results')).not.toBeNull();
    expect(document.querySelector('.tagesmenu-stack')).toBeNull();
  });
});

describe('Tagesmenu – Gemeinsame Kandidaten group', () => {
  const multiMemberList = {
    id: 'list1',
    name: 'Test Liste',
    listKind: 'interactive',
    recipeIds: [],
    ownerId: 'user1',
    memberIds: ['user2'],
  };

  const allRecipes = [
    makeRecipe('r1', 'Rezept 1'),
    makeRecipe('r2', 'Rezept 2'),
    makeRecipe('r3', 'Rezept 3'),
  ];

  beforeEach(() => {
    mockActiveFlagsValue = {};
    mockAllMembersFlagsValue = {};
    mockMaxKandidatenSchwelle = null;
    mockComputeGroupRecipeStatus = () => 'kandidat';
  });

  afterEach(() => {
    mockActiveFlagsValue = {};
    mockAllMembersFlagsValue = {};
    mockMaxKandidatenSchwelle = null;
    mockComputeGroupRecipeStatus = () => 'kandidat';
  });

  function swipeCardUp() {
    const topCard = document.querySelector('.tagesmenu-card-top');
    if (!topCard) return;
    const propsKey = Object.keys(topCard).find((k) => k.startsWith('__reactProps$'));
    const props = topCard[propsKey];
    act(() => { props.onPointerDown({ clientX: 200, clientY: 300, pointerId: 1, currentTarget: topCard }); });
    act(() => { props.onPointerMove({ clientX: 200, clientY: 200, pointerId: 1, currentTarget: topCard }); });
    act(() => { props.onPointerUp({ clientX: 200, clientY: 200, pointerId: 1, currentTarget: topCard }); });
    act(() => {
      const freshPropsKey = Object.keys(topCard).find((k) => k.startsWith('__reactProps$'));
      topCard[freshPropsKey].onTransitionEnd?.({ propertyName: 'transform' });
    });
  }

  test('Gemeinsame Kandidaten group is not shown when maxKandidatenSchwelle is null', async () => {
    mockMaxKandidatenSchwelle = null;
    mockAllMembersFlagsValue = {
      user1: { r1: 'kandidat', r2: 'kandidat', r3: 'kandidat' },
      user2: { r1: 'kandidat', r2: 'kandidat', r3: 'kandidat' },
    };

    await act(async () => {
      render(
        <Tagesmenu
          interactiveLists={[multiMemberList]}
          recipes={allRecipes}
          allUsers={[]}
          onSelectRecipe={() => {}}
          currentUser={currentUser}
        />
      );
    });

    swipeCardUp();
    swipeCardUp();
    swipeCardUp();

    expect(document.querySelector('.tagesmenu-results')).not.toBeNull();
    expect(document.querySelector('.tagesmenu-results-group--gemeinsame-kandidaten')).toBeNull();
  });

  test('Gemeinsame Kandidaten group appears when maxKandidatenSchwelle is set and kandidaten exist', async () => {
    mockMaxKandidatenSchwelle = 3;
    mockAllMembersFlagsValue = {
      user1: { r1: 'kandidat', r2: 'kandidat', r3: 'kandidat' },
      user2: { r1: 'kandidat', r2: 'kandidat', r3: 'kandidat' },
    };

    await act(async () => {
      render(
        <Tagesmenu
          interactiveLists={[multiMemberList]}
          recipes={allRecipes}
          allUsers={[]}
          onSelectRecipe={() => {}}
          currentUser={currentUser}
        />
      );
    });

    swipeCardUp();
    swipeCardUp();
    swipeCardUp();

    expect(document.querySelector('.tagesmenu-results')).not.toBeNull();
    const gemeinsameGroup = document.querySelector('.tagesmenu-results-group--gemeinsame-kandidaten');
    expect(gemeinsameGroup).not.toBeNull();
    const tiles = gemeinsameGroup.querySelectorAll('.tagesmenu-results-tile');
    expect(tiles).toHaveLength(3);
  });

  test('Gemeinsame Kandidaten group is limited to maxKandidatenSchwelle items', async () => {
    mockMaxKandidatenSchwelle = 2;
    mockAllMembersFlagsValue = {
      user1: { r1: 'kandidat', r2: 'kandidat', r3: 'kandidat' },
      user2: { r1: 'kandidat', r2: 'kandidat', r3: 'kandidat' },
    };

    await act(async () => {
      render(
        <Tagesmenu
          interactiveLists={[multiMemberList]}
          recipes={allRecipes}
          allUsers={[]}
          onSelectRecipe={() => {}}
          currentUser={currentUser}
        />
      );
    });

    swipeCardUp();
    swipeCardUp();
    swipeCardUp();

    expect(document.querySelector('.tagesmenu-results')).not.toBeNull();
    const gemeinsameGroup = document.querySelector('.tagesmenu-results-group--gemeinsame-kandidaten');
    expect(gemeinsameGroup).not.toBeNull();
    const tiles = gemeinsameGroup.querySelectorAll('.tagesmenu-results-tile');
    // Group capped at maxKandidatenSchwelle = 2, even though 3 candidates qualify
    expect(tiles).toHaveLength(2);
  });

  test('Gemeinsame Kandidaten group sorts recipes by voting count descending', async () => {
    mockMaxKandidatenSchwelle = 3;
    // r1 voted by both user1 and user2 (2 votes), r2 only by user1 (1 vote), r3 by nobody (0 votes)
    mockAllMembersFlagsValue = {
      user1: { r1: 'kandidat', r2: 'kandidat', r3: 'kandidat' },
      user2: { r1: 'kandidat' },
    };
    // All recipes get 'kandidat' group status
    mockComputeGroupRecipeStatus = () => 'kandidat';

    await act(async () => {
      render(
        <Tagesmenu
          interactiveLists={[multiMemberList]}
          recipes={allRecipes}
          allUsers={[]}
          onSelectRecipe={() => {}}
          currentUser={currentUser}
        />
      );
    });

    swipeCardUp();
    swipeCardUp();
    swipeCardUp();

    expect(document.querySelector('.tagesmenu-results')).not.toBeNull();
    const gemeinsameGroup = document.querySelector('.tagesmenu-results-group--gemeinsame-kandidaten');
    expect(gemeinsameGroup).not.toBeNull();

    const tileNames = Array.from(gemeinsameGroup.querySelectorAll('.tagesmenu-results-tile-name'))
      .map((el) => el.textContent);
    // r1 has 2 votes, r2 has 1 vote, r3 has 0 votes → descending order: r1, r2, r3
    expect(tileNames[0]).toBe('Rezept 1');
    expect(tileNames[1]).toBe('Rezept 2');
    expect(tileNames[2]).toBe('Rezept 3');
  });

  test('Gemeinsame Kandidaten group includes all recipes with kandidat group status, including pre-existing ones', async () => {
    // r1 has a pre-existing active flag from a previous session → should now be INCLUDED
    mockActiveFlagsValue = { r1: 'kandidat' };
    mockMaxKandidatenSchwelle = 3;
    mockAllMembersFlagsValue = {
      user1: { r1: 'kandidat', r2: 'kandidat', r3: 'kandidat' },
      user2: { r1: 'kandidat', r2: 'kandidat', r3: 'kandidat' },
    };

    await act(async () => {
      render(
        <Tagesmenu
          interactiveLists={[multiMemberList]}
          recipes={allRecipes}
          allUsers={[]}
          onSelectRecipe={() => {}}
          currentUser={currentUser}
        />
      );
    });

    // Only r2 and r3 are in the swipe stack (r1 is pre-flagged); swipe them up
    swipeCardUp();
    swipeCardUp();

    expect(document.querySelector('.tagesmenu-results')).not.toBeNull();
    const gemeinsameGroup = document.querySelector('.tagesmenu-results-group--gemeinsame-kandidaten');
    expect(gemeinsameGroup).not.toBeNull();
    const tileNames = Array.from(gemeinsameGroup.querySelectorAll('.tagesmenu-results-tile-name'))
      .map((el) => el.textContent);
    // All 3 recipes should appear: r1 (pre-existing), r2 and r3 (current session)
    expect(tileNames).toContain('Rezept 1');
    expect(tileNames).toContain('Rezept 2');
    expect(tileNames).toContain('Rezept 3');
  });

  test('Gemeinsame Kandidaten group is not shown when no recipes qualify', async () => {
    mockMaxKandidatenSchwelle = 3;
    // All recipes get 'archiv' group status → no kandidaten
    mockComputeGroupRecipeStatus = () => 'archiv';
    mockAllMembersFlagsValue = {
      user1: { r1: 'archiv', r2: 'archiv', r3: 'archiv' },
      user2: { r1: 'archiv', r2: 'archiv', r3: 'archiv' },
    };

    await act(async () => {
      render(
        <Tagesmenu
          interactiveLists={[multiMemberList]}
          recipes={allRecipes}
          allUsers={[]}
          onSelectRecipe={() => {}}
          currentUser={currentUser}
        />
      );
    });

    swipeCardUp();
    swipeCardUp();
    swipeCardUp();

    expect(document.querySelector('.tagesmenu-results')).not.toBeNull();
    expect(document.querySelector('.tagesmenu-results-group--gemeinsame-kandidaten')).toBeNull();
  });
});

describe('Tagesmenu – Testmodus Tagesmenü permission', () => {
  const multiMemberList = {
    id: 'list1',
    name: 'Test Liste',
    listKind: 'interactive',
    recipeIds: [],
    ownerId: 'user1',
    memberIds: ['user2'],
  };

  const allRecipes = [
    makeRecipe('r1', 'Rezept 1'),
    makeRecipe('r2', 'Rezept 2'),
    makeRecipe('r3', 'Rezept 3'),
  ];

  beforeEach(() => {
    mockActiveFlagsValue = { r1: 'kandidat', r2: 'geparkt', r3: 'archiv' };
    mockAllMembersFlagsValue = {};
    mockMaxKandidatenSchwelle = null;
  });

  test('Meine Auswahl groups are shown when tagesmenuTestmode is true', async () => {
    const userWithTestmode = { id: 'user1', tagesmenuTestmode: true };

    await act(async () => {
      render(
        <Tagesmenu
          interactiveLists={[multiMemberList]}
          recipes={allRecipes}
          allUsers={[]}
          onSelectRecipe={() => {}}
          currentUser={userWithTestmode}
        />
      );
    });

    expect(document.querySelector('.tagesmenu-results')).not.toBeNull();

    // The Meine Auswahl button should be visible in test mode
    const meineAuswahlBtn = document.querySelector('.tagesmenu-meine-auswahl-btn');
    expect(meineAuswahlBtn).not.toBeNull();

    // Click the button to open the dedicated Meine Auswahl view
    act(() => { fireEvent.click(meineAuswahlBtn); });

    expect(document.querySelector('.tagesmenu-meine-auswahl')).not.toBeNull();
    const groups = document.querySelectorAll('.tagesmenu-results-group');
    expect(groups.length).toBeGreaterThan(0);
  });

  test('Meine Auswahl groups are hidden when tagesmenuTestmode is false', async () => {
    const userWithoutTestmode = { id: 'user1', tagesmenuTestmode: false };

    await act(async () => {
      render(
        <Tagesmenu
          interactiveLists={[multiMemberList]}
          recipes={allRecipes}
          allUsers={[]}
          onSelectRecipe={() => {}}
          currentUser={userWithoutTestmode}
        />
      );
    });

    expect(document.querySelector('.tagesmenu-results')).not.toBeNull();
    // Button should not be shown when tagesmenuTestmode is false
    expect(document.querySelector('.tagesmenu-meine-auswahl-btn')).toBeNull();
    // No groups shown (Meine Auswahl view not accessible without button)
    const groups = document.querySelectorAll('.tagesmenu-results-group');
    expect(groups).toHaveLength(0);
  });

  test('Meine Auswahl heading is hidden when tagesmenuTestmode is false (multi-member list)', async () => {
    mockMaxKandidatenSchwelle = 2;
    mockAllMembersFlagsValue = {
      user1: { r1: 'kandidat', r2: 'kandidat', r3: 'kandidat' },
      user2: { r1: 'kandidat', r2: 'kandidat', r3: 'kandidat' },
    };
    mockActiveFlagsValue = { r1: 'kandidat', r2: 'kandidat', r3: 'kandidat' };

    const userWithoutTestmode = { id: 'user1', tagesmenuTestmode: false };

    await act(async () => {
      render(
        <Tagesmenu
          interactiveLists={[multiMemberList]}
          recipes={allRecipes}
          allUsers={[]}
          onSelectRecipe={() => {}}
          currentUser={userWithoutTestmode}
        />
      );
    });

    expect(document.querySelector('.tagesmenu-results')).not.toBeNull();

    // Button should not be shown when tagesmenuTestmode is false
    expect(document.querySelector('.tagesmenu-meine-auswahl-btn')).toBeNull();
    // Meine Auswahl section title should not appear anywhere
    const meineAuswahlTitle = Array.from(document.querySelectorAll('.tagesmenu-results-section-title'))
      .find(el => el.textContent === 'Meine Auswahl');
    expect(meineAuswahlTitle).toBeUndefined();
  });

  test('Meine Auswahl heading is shown when tagesmenuTestmode is true (multi-member list)', async () => {
    mockMaxKandidatenSchwelle = 2;
    mockAllMembersFlagsValue = {
      user1: { r1: 'kandidat', r2: 'kandidat', r3: 'kandidat' },
      user2: { r1: 'kandidat', r2: 'kandidat', r3: 'kandidat' },
    };
    mockActiveFlagsValue = { r1: 'kandidat', r2: 'kandidat', r3: 'kandidat' };

    const userWithTestmode = { id: 'user1', tagesmenuTestmode: true };

    await act(async () => {
      render(
        <Tagesmenu
          interactiveLists={[multiMemberList]}
          recipes={allRecipes}
          allUsers={[]}
          onSelectRecipe={() => {}}
          currentUser={userWithTestmode}
        />
      );
    });

    expect(document.querySelector('.tagesmenu-results')).not.toBeNull();

    // The Meine Auswahl view is accessible via the bottom-center button in test mode
    const meineAuswahlBtn = document.querySelector('.tagesmenu-meine-auswahl-btn');
    expect(meineAuswahlBtn).not.toBeNull();

    // Click the button to open the dedicated Meine Auswahl view
    act(() => { fireEvent.click(meineAuswahlBtn); });

    // The page title "Meine Auswahl" should appear in the dedicated view
    const meineAuswahlTitle = Array.from(document.querySelectorAll('.tagesmenu-results-page-title'))
      .find(el => el.textContent === 'Meine Auswahl');
    expect(meineAuswahlTitle).not.toBeNull();
  });
});

describe('Tagesmenu – Meine Auswahl FAB button', () => {
  const multiMemberList = {
    id: 'list1',
    name: 'Test Liste',
    listKind: 'interactive',
    recipeIds: [],
    ownerId: 'user1',
    memberIds: ['user2'],
  };

  const allRecipes = [
    makeRecipe('r1', 'Rezept 1'),
    makeRecipe('r2', 'Rezept 2'),
    makeRecipe('r3', 'Rezept 3'),
  ];

  beforeEach(() => {
    mockActiveFlagsValue = { r1: 'kandidat', r2: 'geparkt', r3: 'archiv' };
    mockAllMembersFlagsValue = {};
    mockMaxKandidatenSchwelle = null;
  });

  test('button is shown during swipe stack in test mode', async () => {
    // No active flags → swipe stack is shown (not results)
    mockActiveFlagsValue = {};
    const userWithTestmode = { id: 'user1', tagesmenuTestmode: true };

    await act(async () => {
      render(
        <Tagesmenu
          interactiveLists={[multiMemberList]}
          recipes={allRecipes}
          allUsers={[]}
          onSelectRecipe={() => {}}
          currentUser={userWithTestmode}
        />
      );
    });

    expect(document.querySelector('.tagesmenu-stack')).not.toBeNull();
    expect(document.querySelector('.tagesmenu-meine-auswahl-btn')).not.toBeNull();
  });

  test('button is NOT shown during swipe stack when tagesmenuTestmode is false', async () => {
    mockActiveFlagsValue = {};
    const userWithoutTestmode = { id: 'user1', tagesmenuTestmode: false };

    await act(async () => {
      render(
        <Tagesmenu
          interactiveLists={[multiMemberList]}
          recipes={allRecipes}
          allUsers={[]}
          onSelectRecipe={() => {}}
          currentUser={userWithoutTestmode}
        />
      );
    });

    expect(document.querySelector('.tagesmenu-stack')).not.toBeNull();
    expect(document.querySelector('.tagesmenu-meine-auswahl-btn')).toBeNull();
  });

  test('clicking button during swipe stack shows Meine Auswahl view', async () => {
    mockActiveFlagsValue = {};
    const userWithTestmode = { id: 'user1', tagesmenuTestmode: true };
    // Pre-populate some flags in the active state for the Meine Auswahl view
    mockActiveFlagsValue = { r1: 'kandidat' };

    await act(async () => {
      render(
        <Tagesmenu
          interactiveLists={[multiMemberList]}
          recipes={allRecipes}
          allUsers={[]}
          onSelectRecipe={() => {}}
          currentUser={userWithTestmode}
        />
      );
    });

    const btn = document.querySelector('.tagesmenu-meine-auswahl-btn');
    expect(btn).not.toBeNull();

    act(() => { fireEvent.click(btn); });

    expect(document.querySelector('.tagesmenu-meine-auswahl')).not.toBeNull();
    expect(document.querySelector('.tagesmenu-stack')).toBeNull();
  });

  test('clicking button again from Meine Auswahl view returns to previous view', async () => {
    mockActiveFlagsValue = { r1: 'kandidat', r2: 'geparkt', r3: 'archiv' };
    const userWithTestmode = { id: 'user1', tagesmenuTestmode: true };

    await act(async () => {
      render(
        <Tagesmenu
          interactiveLists={[multiMemberList]}
          recipes={allRecipes}
          allUsers={[]}
          onSelectRecipe={() => {}}
          currentUser={userWithTestmode}
        />
      );
    });

    // All recipes have flags → results view shown
    expect(document.querySelector('.tagesmenu-results')).not.toBeNull();

    const btn = document.querySelector('.tagesmenu-meine-auswahl-btn');

    // Open Meine Auswahl view
    act(() => { fireEvent.click(btn); });
    expect(document.querySelector('.tagesmenu-meine-auswahl')).not.toBeNull();
    expect(document.querySelector('.tagesmenu-results')).toBeNull();

    // Close Meine Auswahl view → results view should return
    act(() => { fireEvent.click(btn); });
    expect(document.querySelector('.tagesmenu-meine-auswahl')).toBeNull();
    expect(document.querySelector('.tagesmenu-results')).not.toBeNull();
  });

  test('Meine Auswahl view shows own groups (Kandidat, Für später, Archiviert)', async () => {
    const userWithTestmode = { id: 'user1', tagesmenuTestmode: true };

    await act(async () => {
      render(
        <Tagesmenu
          interactiveLists={[multiMemberList]}
          recipes={allRecipes}
          allUsers={[]}
          onSelectRecipe={() => {}}
          currentUser={userWithTestmode}
        />
      );
    });

    const btn = document.querySelector('.tagesmenu-meine-auswahl-btn');
    act(() => { fireEvent.click(btn); });

    const groupTitles = Array.from(document.querySelectorAll('.tagesmenu-meine-auswahl .tagesmenu-results-group-title'))
      .map(el => el.textContent);
    expect(groupTitles).toContain('Kandidat');
    expect(groupTitles).toContain('Für später');
    expect(groupTitles).toContain('Archiviert');
  });

  test('Meine Auswahl view groups are separate from Gemeinsame Kandidaten view', async () => {
    mockMaxKandidatenSchwelle = 2;
    mockAllMembersFlagsValue = {
      user1: { r1: 'kandidat', r2: 'kandidat', r3: 'kandidat' },
      user2: { r1: 'kandidat', r2: 'kandidat', r3: 'kandidat' },
    };
    mockActiveFlagsValue = { r1: 'kandidat', r2: 'geparkt', r3: 'archiv' };
    const userWithTestmode = { id: 'user1', tagesmenuTestmode: true };

    await act(async () => {
      render(
        <Tagesmenu
          interactiveLists={[multiMemberList]}
          recipes={allRecipes}
          allUsers={[]}
          onSelectRecipe={() => {}}
          currentUser={userWithTestmode}
        />
      );
    });

    // Results view shows Gemeinsame Kandidaten without Meine Auswahl groups
    expect(document.querySelector('.tagesmenu-results')).not.toBeNull();
    expect(document.querySelector('.tagesmenu-meine-auswahl')).toBeNull();

    // Open Meine Auswahl view → Gemeinsame Kandidaten view hidden
    const btn = document.querySelector('.tagesmenu-meine-auswahl-btn');
    act(() => { fireEvent.click(btn); });
    expect(document.querySelector('.tagesmenu-meine-auswahl')).not.toBeNull();
    expect(document.querySelector('.tagesmenu-results')).toBeNull();
  });
});

describe('Tagesmenu – Kachel-Kontextmenü', () => {
  const swipeAllCardsToResults = () => {
    [swipeLeft, swipeLeft, swipeLeft].forEach((swipeFn) => {
      const topCard = document.querySelector('.tagesmenu-card-top');
      swipeFn(topCard);
      finishSwipeAnimation(topCard);
    });
  };

  beforeEach(() => {
    mockActiveFlagsValue = {};
    mockAllMembersFlagsValue = {};
    mockMaxKandidatenSchwelle = null;
    mockStatusValiditySettings = {
      statusValidityDaysKandidat: null,
      statusValidityDaysGeparkt: null,
      statusValidityDaysArchiv: 14,
    };
  });

  test('zeigt das Select-Overlay nur in den Kandidaten-Kacheln mit allen Aktionen', async () => {
    await act(async () => { renderMenu(); });

    expect(document.querySelector('.tagesmenu-stack .tagesmenu-kachel-context-select')).toBeNull();
    swipeAllCardsToResults();

    const selects = document.querySelectorAll('.tagesmenu-results-tile .tagesmenu-kachel-context-select');
    expect(selects).toHaveLength(3);

    const optionLabels = Array.from(selects[0].querySelectorAll('option')).map((option) => option.textContent);
    expect(optionLabels).toEqual([
      'Aktion wählen...',
      'Ich bin enttäuscht',
      'Vielleicht kann ich das besser',
      'Will ich mal wieder kochen',
      'Will ich regelmäßig kochen',
    ]);
    expect(document.querySelector('.tagesmenu-kachel-context-menu')).toBeNull();
  });

  test('setzt den nativen Select nach Auswahl eines Eintrags zurück', async () => {
    await act(async () => { renderMenu(); });
    swipeAllCardsToResults();

    const select = document.querySelector('.tagesmenu-results-tile .tagesmenu-kachel-context-select');
    await act(async () => { fireEvent.change(select, { target: { value: 'Ich bin enttäuscht' } }); });
    expect(select.value).toBe('');
    expect(document.querySelector('.tagesmenu-kachel-context-menu')).toBeNull();
  });

  test('verwendet das Alt-Icon im Kachel-Menü bei dunklem Bild (isBright === false)', async () => {
    const darkRecipe = {
      ...makeRecipe('r-dark', 'Dunkles Rezept'),
      images: [{ url: '/test/dark.jpg', isDefault: true, imageBrightness: { isBright: false } }],
    };
    await act(async () => { renderMenu([darkRecipe]); });

    const topCard = document.querySelector('.tagesmenu-card-top');
    swipeLeft(topCard);
    finishSwipeAnimation(topCard);

    const icon = document.querySelector('.tagesmenu-results-tile .tagesmenu-kachel-context-icon');
    expect(icon).not.toBeNull();
    expect(icon.textContent).toContain('⚪');
  });

  test('verwendet beim Kachel-Menü das normale Icon bei hellem oder unbekanntem Bild', async () => {
    const brightRecipe = {
      ...makeRecipe('r-bright', 'Helles Rezept'),
      images: [{ url: '/test/bright.jpg', isDefault: true, imageBrightness: { isBright: true } }],
    };
    await act(async () => { renderMenu([brightRecipe]); });

    const topCardBright = document.querySelector('.tagesmenu-card-top');
    swipeLeft(topCardBright);
    finishSwipeAnimation(topCardBright);

    let icon = document.querySelector('.tagesmenu-results-tile .tagesmenu-kachel-context-icon');
    expect(icon).not.toBeNull();
    expect(icon.textContent).toContain('⋯');
    expect(icon.textContent).not.toContain('⚪');

    const unknownRecipe = {
      ...makeRecipe('r-unknown', 'Unbekanntes Rezept'),
      images: [{ url: '/test/unknown.jpg', isDefault: true }],
    };
    await act(async () => { renderMenu([unknownRecipe]); });

    const topCardUnknown = document.querySelector('.tagesmenu-card-top');
    swipeLeft(topCardUnknown);
    finishSwipeAnimation(topCardUnknown);

    icon = document.querySelector('.tagesmenu-results-tile .tagesmenu-kachel-context-icon');
    expect(icon).not.toBeNull();
    expect(icon.textContent).toContain('⋯');
    expect(icon.textContent).not.toContain('⚪');
  });

  test('Option "Vielleicht kann ich das besser" parkt alle Flags für aktuelles Rezept in aktueller Liste', async () => {
    mockStatusValiditySettings = {
      statusValidityDaysKandidat: null,
      statusValidityDaysGeparkt: 14,
      statusValidityDaysArchiv: null,
    };

    await act(async () => { renderMenu([makeRecipe('r-special', 'Spezialrezept')]); });
    const topCard = document.querySelector('.tagesmenu-card-top');
    swipeLeft(topCard);
    finishSwipeAnimation(topCard);

    const select = document.querySelector('.tagesmenu-results-tile .tagesmenu-kachel-context-select');
    await act(async () => {
      fireEvent.change(select, { target: { value: 'Vielleicht kann ich das besser' } });
    });

    expect(parkAllRecipeSwipeFlagsForRecipeInList).toHaveBeenCalledTimes(1);
    expect(parkAllRecipeSwipeFlagsForRecipeInList).toHaveBeenCalledWith('list1', 'r-special', 14);
  });

  test('setzt bei "Ich bin enttäuscht" alle Flags des aktuellen Rezepts in der aktuellen Liste auf archiv', async () => {
    await act(async () => { renderMenu(); });
    swipeAllCardsToResults();

    const firstTile = document.querySelectorAll('.tagesmenu-results-tile')[0];
    const select = firstTile.querySelector('.tagesmenu-kachel-context-select');
    await act(async () => { fireEvent.change(select, { target: { value: 'Ich bin enttäuscht' } }); });

    expect(archiveRecipeForAllUsersInList).toHaveBeenCalledWith('list1', 'r1', 14);
  });

  test('Option "Will ich mal wieder kochen" weist Rezept der Zielliste zu', async () => {
    const interactiveListWithTarget = {
      ...list,
      targetListId: 'target-list-1',
    };
    const targetRecipe = { id: 'r-target', title: 'Zielrezept', groupId: 'list1' };

    await act(async () => {
      render(
        <Tagesmenu
          interactiveLists={[interactiveListWithTarget]}
          recipes={[targetRecipe]}
          allUsers={[]}
          onSelectRecipe={() => {}}
          currentUser={currentUser}
        />
      );
    });

    const topCard = document.querySelector('.tagesmenu-card-top');
    swipeUp(topCard);
    finishSwipeAnimation(topCard);

    const select = document.querySelector('.tagesmenu-results-tile .tagesmenu-kachel-context-select');
    await act(async () => { fireEvent.change(select, { target: { value: 'Will ich mal wieder kochen' } }); });

    expect(removeRecipeFromGroup).toHaveBeenCalledWith('list1', 'r-target');
    expect(addRecipeToGroup).toHaveBeenCalledWith('target-list-1', 'r-target');
    expect(updateRecipe).toHaveBeenCalledWith('r-target', { groupId: 'target-list-1' });
    expect(addFavorite).not.toHaveBeenCalled();
  });

  test('Option "Will ich regelmäßig kochen" setzt zusätzlich den Favoritenstatus', async () => {
    const interactiveListWithTarget = {
      ...list,
      targetListId: 'target-list-2',
    };
    const targetRecipe = { id: 'r-fav', title: 'Favoritenrezept', groupId: 'list1' };

    await act(async () => {
      render(
        <Tagesmenu
          interactiveLists={[interactiveListWithTarget]}
          recipes={[targetRecipe]}
          allUsers={[]}
          onSelectRecipe={() => {}}
          currentUser={currentUser}
        />
      );
    });

    const topCard = document.querySelector('.tagesmenu-card-top');
    swipeUp(topCard);
    finishSwipeAnimation(topCard);

    const select = document.querySelector('.tagesmenu-results-tile .tagesmenu-kachel-context-select');
    await act(async () => { fireEvent.change(select, { target: { value: 'Will ich regelmäßig kochen' } }); });

    expect(removeRecipeFromGroup).toHaveBeenCalledWith('list1', 'r-fav');
    expect(addRecipeToGroup).toHaveBeenCalledWith('target-list-2', 'r-fav');
    expect(updateRecipe).toHaveBeenCalledWith('r-fav', { groupId: 'target-list-2' });
    expect(addFavorite).toHaveBeenCalledWith('user1', 'r-fav');
  });
});

import React from 'react';
import { render, act } from '@testing-library/react';
import Tagesmenu from './Tagesmenu';

let mockActiveFlagsValue = {};
let mockAllMembersFlagsValue = {};
let mockMaxKandidatenSchwelle = null;
let mockComputeGroupRecipeStatus = () => 'kandidat';

jest.mock('../utils/recipeSwipeFlags', () => ({
  setRecipeSwipeFlag: jest.fn(),
  getActiveSwipeFlags: () => Promise.resolve(mockActiveFlagsValue),
  getAllMembersSwipeFlags: () => Promise.resolve(mockAllMembersFlagsValue),
  computeGroupRecipeStatus: (...args) => mockComputeGroupRecipeStatus(...args),
}));

jest.mock('../utils/customLists', () => ({
  getStatusValiditySettings: () => Promise.resolve({
    statusValidityDaysKandidat: null,
    statusValidityDaysGeparkt: null,
    statusValidityDaysArchiv: null,
  }),
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
  }),
  DEFAULT_BUTTON_ICONS: {
    swipeRight: '👍',
    swipeLeft: '👎',
    swipeUp: '⭐',
  },
}));

jest.mock('../utils/imageUtils', () => ({
  isBase64Image: jest.fn(() => false),
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

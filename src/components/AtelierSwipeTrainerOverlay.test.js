import React from 'react';
import { render, screen, within, act } from '@testing-library/react';
import AtelierSwipeTrainerOverlay from './AtelierSwipeTrainerOverlay';

beforeAll(() => {
  if (!HTMLElement.prototype.setPointerCapture) {
    HTMLElement.prototype.setPointerCapture = jest.fn();
  }
});

const TRANSITION_EVENT = { propertyName: 'transform' };

/**
 * Retrieve a React component's event props directly from the DOM node.
 * JSDOM's PointerEvent does not support clientX, so we bypass fireEvent
 * and call the handlers directly with plain mock event objects
 * (same approach used in Tagesmenu.test.js).
 */
function getReactProps(element) {
  const key = Object.keys(element).find((k) => k.startsWith('__reactProps$'));
  return key ? element[key] : null;
}

function getCard() {
  return screen.getByTestId('atelier-swipe-trainer-card');
}

/** Simulate a full drag gesture (dx, dy) from press to release, then settle any resulting transition. */
function drag(dx, dy) {
  const card = getCard();
  const props = getReactProps(card);
  act(() => {
    props.onPointerDown({ clientX: 0, clientY: 0, pointerId: 1, currentTarget: card });
  });
  act(() => {
    props.onPointerMove({ clientX: dx, clientY: dy, pointerId: 1, currentTarget: card });
  });
  act(() => {
    props.onPointerUp({ clientX: dx, clientY: dy, pointerId: 1, currentTarget: card });
  });
  // Settle the resulting flying/snap transition (component listens for transitionend on the card).
  act(() => {
    getReactProps(getCard()).onTransitionEnd?.(TRANSITION_EVENT);
  });
}

const swipeRight = () => drag(120, 0);
const swipeLeft = () => drag(-120, 0);
const swipeUp = () => drag(0, -120);

describe('AtelierSwipeTrainerOverlay', () => {
  test('renders the first demo card and previews the next one behind it', () => {
    render(<AtelierSwipeTrainerOverlay onComplete={() => {}} />);

    const card = getCard();
    const ghost = screen.getByTestId('atelier-swipe-trainer-ghost');

    expect(within(card).getByText('Mango Cocktail')).toBeInTheDocument();
    expect(within(card).getByText('Benjamin')).toBeInTheDocument();
    expect(within(ghost).getByText('Richtiges Rezept, falscher Moment')).toBeInTheDocument();
  });

  test('swiping the wrong direction snaps the card back without advancing', () => {
    render(<AtelierSwipeTrainerOverlay onComplete={() => {}} />);

    swipeLeft(); // step 0 expects a right-swipe

    expect(within(getCard()).getByText('Mango Cocktail')).toBeInTheDocument();
  });

  test('swiping the correct direction advances to the next step', () => {
    render(<AtelierSwipeTrainerOverlay onComplete={() => {}} />);

    swipeRight(); // right = park => advances to step 1

    expect(within(getCard()).getByText('Richtiges Rezept, falscher Moment')).toBeInTheDocument();
  });

  test('walking through all three gestures reaches the final match card', () => {
    render(<AtelierSwipeTrainerOverlay onComplete={() => {}} />);

    swipeRight(); // step 0 -> 1
    swipeLeft();  // step 1 -> 2
    swipeUp();    // step 2 -> 3 (final)

    expect(within(getCard()).getByText("It's a Match")).toBeInTheDocument();
    expect(within(getCard()).getByText('Ein Rezept, ein Koch')).toBeInTheDocument();
  });

  test('swiping right on the final card restarts the trainer from the beginning', () => {
    render(<AtelierSwipeTrainerOverlay onComplete={() => {}} />);

    swipeRight();
    swipeLeft();
    swipeUp();
    swipeRight(); // restart

    expect(within(getCard()).getByText('Mango Cocktail')).toBeInTheDocument();
  });

  test('swiping up on the final card completes the trainer', () => {
    const onComplete = jest.fn();
    render(<AtelierSwipeTrainerOverlay onComplete={onComplete} />);

    swipeRight();
    swipeLeft();
    swipeUp();
    expect(onComplete).not.toHaveBeenCalled();
    swipeUp(); // finish

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test('swiping left on the final card also completes the trainer', () => {
    const onComplete = jest.fn();
    render(<AtelierSwipeTrainerOverlay onComplete={onComplete} />);

    swipeRight();
    swipeLeft();
    swipeUp();
    swipeLeft(); // finish

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

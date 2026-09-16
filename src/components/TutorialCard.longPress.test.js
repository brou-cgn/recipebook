import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import TutorialCard from './TutorialCard';

// Longpress auf einer Tutorialkarte öffnet das Tutorial zum Bearbeiten,
// ein kurzer Druck spielt weiterhin das Video ab. Beides muss sich sauber
// trennen - sonst öffnet jeder Bearbeiten-Versuch zusätzlich den Player.
describe('TutorialCard long press', () => {
  const tutorial = {
    id: 'tut-1',
    title: 'Zwiebeln schneiden',
    videoUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
    category: 'schneiden'
  };

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  const getCard = () => screen.getByRole('button', { name: /abspielen/ });

  // JSDOMs PointerEvent traegt kein clientX/clientY (siehe
  // AtelierSwipeTrainerOverlay.test.js). MouseEvent tut es - React verteilt
  // anhand des Event-Typs, nicht der Konstruktorklasse.
  const firePointer = (card, type, { x = 100, y = 100 } = {}) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
    event.pointerType = 'touch';
    event.pointerId = 1;
    fireEvent(card, event);
  };
  const press = (card, x = 100, y = 100) => firePointer(card, 'pointerdown', { x, y });

  test('long press calls onEdit while the finger is still down', () => {
    const onEdit = jest.fn();
    render(<TutorialCard tutorial={tutorial} onEdit={onEdit} />);

    press(getCard());
    act(() => { jest.advanceTimersByTime(600); });

    // Kein pointerup: auf dem Touchscreen kommt stattdessen oft pointercancel,
    // der Longpress darf davon nicht abhaengen.
    expect(onEdit).toHaveBeenCalledWith(tutorial);
  });

  test('the click following a long press does not open the player', () => {
    const onEdit = jest.fn();
    render(<TutorialCard tutorial={tutorial} onEdit={onEdit} />);

    press(getCard());
    act(() => { jest.advanceTimersByTime(600); });
    firePointer(getCard(), 'pointerup');
    fireEvent.click(getCard());

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('a short press still opens the player and leaves onEdit alone', () => {
    const onEdit = jest.fn();
    render(<TutorialCard tutorial={tutorial} onEdit={onEdit} />);

    press(getCard());
    act(() => { jest.advanceTimersByTime(100); });
    firePointer(getCard(), 'pointerup');
    fireEvent.click(getCard());

    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  test('a cancelled press (browser takes over for scrolling) does not edit', () => {
    const onEdit = jest.fn();
    render(<TutorialCard tutorial={tutorial} onEdit={onEdit} />);

    press(getCard());
    act(() => { jest.advanceTimersByTime(200); });
    firePointer(getCard(), 'pointercancel');
    act(() => { jest.advanceTimersByTime(600); });

    expect(onEdit).not.toHaveBeenCalled();
  });

  test('a finger that wanders off is a scroll, not a long press', () => {
    const onEdit = jest.fn();
    render(<TutorialCard tutorial={tutorial} onEdit={onEdit} />);

    press(getCard(), 100, 100);
    firePointer(getCard(), 'pointermove', { x: 100, y: 140 });
    act(() => { jest.advanceTimersByTime(600); });

    expect(onEdit).not.toHaveBeenCalled();
  });

  test('a tiny finger tremor still counts as a long press', () => {
    const onEdit = jest.fn();
    render(<TutorialCard tutorial={tutorial} onEdit={onEdit} />);

    press(getCard(), 100, 100);
    firePointer(getCard(), 'pointermove', { x: 103, y: 104 });
    act(() => { jest.advanceTimersByTime(600); });

    expect(onEdit).toHaveBeenCalledWith(tutorial);
  });

  test('without onEdit the card behaves exactly as before', () => {
    render(<TutorialCard tutorial={tutorial} />);

    press(getCard());
    act(() => { jest.advanceTimersByTime(600); });
    firePointer(getCard(), 'pointerup');
    fireEvent.click(getCard());

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

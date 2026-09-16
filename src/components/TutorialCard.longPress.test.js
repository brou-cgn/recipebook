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

  test('long press calls onEdit with the tutorial', () => {
    const onEdit = jest.fn();
    render(<TutorialCard tutorial={tutorial} onEdit={onEdit} />);

    fireEvent.pointerDown(getCard(), { pointerType: 'touch' });
    act(() => { jest.advanceTimersByTime(600); });
    fireEvent.pointerUp(getCard());

    expect(onEdit).toHaveBeenCalledWith(tutorial);
  });

  test('the click following a long press does not open the player', () => {
    const onEdit = jest.fn();
    render(<TutorialCard tutorial={tutorial} onEdit={onEdit} />);

    fireEvent.pointerDown(getCard(), { pointerType: 'touch' });
    act(() => { jest.advanceTimersByTime(600); });
    fireEvent.pointerUp(getCard());
    fireEvent.click(getCard());

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('a short press still opens the player and leaves onEdit alone', () => {
    const onEdit = jest.fn();
    render(<TutorialCard tutorial={tutorial} onEdit={onEdit} />);

    fireEvent.pointerDown(getCard(), { pointerType: 'touch' });
    act(() => { jest.advanceTimersByTime(100); });
    fireEvent.pointerUp(getCard());
    fireEvent.click(getCard());

    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  test('a cancelled press (scroll) does not count as a long press', () => {
    const onEdit = jest.fn();
    render(<TutorialCard tutorial={tutorial} onEdit={onEdit} />);

    fireEvent.pointerDown(getCard(), { pointerType: 'touch' });
    act(() => { jest.advanceTimersByTime(600); });
    fireEvent.pointerCancel(getCard());
    fireEvent.pointerUp(getCard());

    expect(onEdit).not.toHaveBeenCalled();
  });
});

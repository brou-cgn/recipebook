import React from 'react';
import { render, fireEvent, act, screen } from '@testing-library/react';
import { useAcceleratingLongPress, stepToNextMultiple } from './useAcceleratingLongPress';

function Harness({ onTick }) {
  const longPress = useAcceleratingLongPress(onTick);
  return (
    <button
      aria-label="stepper"
      onMouseDown={() => longPress.start(1)}
      onMouseUp={longPress.end}
      onMouseLeave={longPress.end}
    >
      +
    </button>
  );
}

describe('stepToNextMultiple', () => {
  test('increments to the next higher multiple when off-grid', () => {
    expect(stepToNextMultiple(23, 1, 10)).toBe(30);
    expect(stepToNextMultiple(4, 1, 5)).toBe(5);
    expect(stepToNextMultiple(5, 1, 2)).toBe(6);
  });

  test('increments by a full step when already on-grid', () => {
    expect(stepToNextMultiple(20, 1, 10)).toBe(30);
    expect(stepToNextMultiple(10, 1, 5)).toBe(15);
  });

  test('decrements to the next lower multiple when off-grid', () => {
    expect(stepToNextMultiple(23, -1, 10)).toBe(20);
    expect(stepToNextMultiple(7, -1, 5)).toBe(5);
    expect(stepToNextMultiple(5, -1, 2)).toBe(4);
  });

  test('decrements by a full step when already on-grid', () => {
    expect(stepToNextMultiple(20, -1, 10)).toBe(10);
    expect(stepToNextMultiple(10, -1, 5)).toBe(5);
  });

  test('step size 1 behaves like a plain +/-1', () => {
    expect(stepToNextMultiple(7, 1, 1)).toBe(8);
    expect(stepToNextMultiple(7, -1, 1)).toBe(6);
  });
});

describe('useAcceleratingLongPress', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('does not fire before the initial delay', () => {
    const onTick = jest.fn();
    render(<Harness onTick={onTick} />);
    const btn = screen.getByLabelText('stepper');

    fireEvent.mouseDown(btn);
    act(() => { jest.advanceTimersByTime(400); });
    fireEvent.mouseUp(btn);

    expect(onTick).not.toHaveBeenCalled();
  });

  test('first repeat tick after the initial delay uses step 1', () => {
    const onTick = jest.fn();
    render(<Harness onTick={onTick} />);
    const btn = screen.getByLabelText('stepper');

    fireEvent.mouseDown(btn);
    act(() => { jest.advanceTimersByTime(650); }); // 500ms delay + first 150ms tick
    fireEvent.mouseUp(btn);

    expect(onTick).toHaveBeenCalledWith(1, 1);
  });

  test('escalates to step 5 once the hold reaches 1.5s', () => {
    const onTick = jest.fn();
    render(<Harness onTick={onTick} />);
    const btn = screen.getByLabelText('stepper');

    fireEvent.mouseDown(btn);
    act(() => { jest.advanceTimersByTime(1600); }); // a bit past the 1.5s threshold
    fireEvent.mouseUp(btn);

    expect(onTick).toHaveBeenLastCalledWith(1, 5);
  });

  test('escalates to step 10 once the hold reaches 3s', () => {
    const onTick = jest.fn();
    render(<Harness onTick={onTick} />);
    const btn = screen.getByLabelText('stepper');

    fireEvent.mouseDown(btn);
    act(() => { jest.advanceTimersByTime(3100); });
    fireEvent.mouseUp(btn);

    expect(onTick).toHaveBeenLastCalledWith(1, 10);
  });

  test('escalates to step 50 once the hold reaches 4.5s', () => {
    const onTick = jest.fn();
    render(<Harness onTick={onTick} />);
    const btn = screen.getByLabelText('stepper');

    fireEvent.mouseDown(btn);
    act(() => { jest.advanceTimersByTime(4600); });
    fireEvent.mouseUp(btn);

    expect(onTick).toHaveBeenLastCalledWith(1, 50);
  });

  test('escalates to step 100 once the hold reaches 6s', () => {
    const onTick = jest.fn();
    render(<Harness onTick={onTick} />);
    const btn = screen.getByLabelText('stepper');

    fireEvent.mouseDown(btn);
    act(() => { jest.advanceTimersByTime(6100); });
    fireEvent.mouseUp(btn);

    expect(onTick).toHaveBeenLastCalledWith(1, 100);
  });

  test('releasing and pressing again restarts escalation from step 1', () => {
    const onTick = jest.fn();
    render(<Harness onTick={onTick} />);
    const btn = screen.getByLabelText('stepper');

    fireEvent.mouseDown(btn);
    act(() => { jest.advanceTimersByTime(4600); }); // escalated to step 50
    fireEvent.mouseUp(btn);
    onTick.mockClear();

    fireEvent.mouseDown(btn);
    act(() => { jest.advanceTimersByTime(650); });
    fireEvent.mouseUp(btn);

    expect(onTick).toHaveBeenCalledWith(1, 1);
  });

  test('stops firing once released', () => {
    const onTick = jest.fn();
    render(<Harness onTick={onTick} />);
    const btn = screen.getByLabelText('stepper');

    fireEvent.mouseDown(btn);
    act(() => { jest.advanceTimersByTime(650); });
    fireEvent.mouseUp(btn);
    const callsAtRelease = onTick.mock.calls.length;

    act(() => { jest.advanceTimersByTime(1000); });

    expect(onTick.mock.calls.length).toBe(callsAtRelease);
  });
});

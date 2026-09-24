import React from 'react';
import { render, fireEvent, act, screen } from '@testing-library/react';
import { useAcceleratingLongPress } from './useAcceleratingLongPress';

function Harness({ onStep }) {
  const longPress = useAcceleratingLongPress(onStep);
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

describe('useAcceleratingLongPress', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('does not fire before the initial delay', () => {
    const onStep = jest.fn();
    render(<Harness onStep={onStep} />);
    const btn = screen.getByLabelText('stepper');

    fireEvent.mouseDown(btn);
    act(() => { jest.advanceTimersByTime(400); });
    fireEvent.mouseUp(btn);

    expect(onStep).not.toHaveBeenCalled();
  });

  test('first repeat tick after the initial delay steps by 1', () => {
    const onStep = jest.fn();
    render(<Harness onStep={onStep} />);
    const btn = screen.getByLabelText('stepper');

    fireEvent.mouseDown(btn);
    act(() => { jest.advanceTimersByTime(650); }); // 500ms delay + first 150ms tick
    fireEvent.mouseUp(btn);

    expect(onStep).toHaveBeenCalledWith(1);
  });

  test('escalates to 10er steps once the hold reaches 2s', () => {
    const onStep = jest.fn();
    render(<Harness onStep={onStep} />);
    const btn = screen.getByLabelText('stepper');

    fireEvent.mouseDown(btn);
    act(() => { jest.advanceTimersByTime(2000); });
    fireEvent.mouseUp(btn);

    expect(onStep).toHaveBeenLastCalledWith(10);
  });

  test('escalates to 20er steps once the hold reaches 4s', () => {
    const onStep = jest.fn();
    render(<Harness onStep={onStep} />);
    const btn = screen.getByLabelText('stepper');

    fireEvent.mouseDown(btn);
    act(() => { jest.advanceTimersByTime(4200); }); // a bit past the 4s threshold so a tick lands after it
    fireEvent.mouseUp(btn);

    expect(onStep).toHaveBeenLastCalledWith(20);
  });

  test('escalates to 50er steps once the hold reaches 6s', () => {
    const onStep = jest.fn();
    render(<Harness onStep={onStep} />);
    const btn = screen.getByLabelText('stepper');

    fireEvent.mouseDown(btn);
    act(() => { jest.advanceTimersByTime(6200); }); // a bit past the 6s threshold so a tick lands after it
    fireEvent.mouseUp(btn);

    expect(onStep).toHaveBeenLastCalledWith(50);
  });

  test('escalates to 100er steps once the hold reaches 9s', () => {
    const onStep = jest.fn();
    render(<Harness onStep={onStep} />);
    const btn = screen.getByLabelText('stepper');

    fireEvent.mouseDown(btn);
    act(() => { jest.advanceTimersByTime(9200); }); // a bit past the 9s threshold so a tick lands after it
    fireEvent.mouseUp(btn);

    expect(onStep).toHaveBeenLastCalledWith(100);
  });

  test('releasing and pressing again restarts escalation from 1er steps', () => {
    const onStep = jest.fn();
    render(<Harness onStep={onStep} />);
    const btn = screen.getByLabelText('stepper');

    fireEvent.mouseDown(btn);
    act(() => { jest.advanceTimersByTime(4000); }); // escalated to 20er
    fireEvent.mouseUp(btn);
    onStep.mockClear();

    fireEvent.mouseDown(btn);
    act(() => { jest.advanceTimersByTime(650); });
    fireEvent.mouseUp(btn);

    expect(onStep).toHaveBeenCalledWith(1);
  });

  test('stops firing once released', () => {
    const onStep = jest.fn();
    render(<Harness onStep={onStep} />);
    const btn = screen.getByLabelText('stepper');

    fireEvent.mouseDown(btn);
    act(() => { jest.advanceTimersByTime(650); });
    fireEvent.mouseUp(btn);
    const callsAtRelease = onStep.mock.calls.length;

    act(() => { jest.advanceTimersByTime(1000); });

    expect(onStep.mock.calls.length).toBe(callsAtRelease);
  });
});

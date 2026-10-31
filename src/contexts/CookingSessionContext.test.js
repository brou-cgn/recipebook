import React from 'react';
import { render, fireEvent, act, screen } from '@testing-library/react';
import { CookingSessionProvider, useCookingSession } from './CookingSessionContext';
import { playAlarmPattern } from '../utils/alarmAudioUtils';

jest.mock('../utils/alarmAudioUtils', () => ({
  playAlarmPattern: jest.fn(),
}));

function TimerStarter({ recipeId, recipeTitle, seconds, label }) {
  const session = useCookingSession();
  const timer = session.getTimers(recipeId).step_0?.[0];
  return (
    <div>
      <button
        type="button"
        onClick={() => session.startTimer({
          recipeId,
          recipeTitle,
          stepKey: 'step_0',
          timerIndex: 0,
          totalSeconds: seconds,
          label,
          soundKey: 'radar',
        })}
      >
        {`Start ${recipeTitle}`}
      </button>
      <span data-testid={`rest-${recipeId}`}>{timer ? String(timer.remainingSeconds) : '-'}</span>
    </div>
  );
}

let wakeLockRelease;

beforeEach(() => {
  window.AudioContext = jest.fn().mockImplementation(() => ({ state: 'running', close: jest.fn() }));
  window.webkitAudioContext = undefined;
  wakeLockRelease = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    writable: true,
    value: { request: jest.fn().mockResolvedValue({ release: wakeLockRelease }) },
  });
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

function renderTwoRecipes() {
  return render(
    <CookingSessionProvider>
      <TimerStarter recipeId="rotkohl" recipeTitle="Apfelrotkohl" seconds={30} label="40 Minuten" />
      <TimerStarter recipeId="rouladen" recipeTitle="Rinderrouladen" seconds={60} label="90 Minuten" />
    </CookingSessionProvider>
  );
}

describe('CookingSessionContext', () => {
  test('keeps timers of several recipes apart', () => {
    renderTwoRecipes();
    fireEvent.click(screen.getByText('Start Apfelrotkohl'));
    act(() => { jest.advanceTimersByTime(10000); });
    fireEvent.click(screen.getByText('Start Rinderrouladen'));
    act(() => { jest.advanceTimersByTime(5000); });

    expect(screen.getByTestId('rest-rotkohl').textContent).toBe('15');
    expect(screen.getByTestId('rest-rouladen').textContent).toBe('55');
  });

  test('lists every finished timer in one alarm and plays a single sound loop', () => {
    renderTwoRecipes();
    fireEvent.click(screen.getByText('Start Apfelrotkohl'));
    fireEvent.click(screen.getByText('Start Rinderrouladen'));

    act(() => { jest.advanceTimersByTime(60000); });

    const recipes = Array.from(document.querySelectorAll('.alarm-modal-recipe')).map((el) => el.textContent);
    expect(recipes).toEqual(['Apfelrotkohl', 'Rinderrouladen']);
    expect(window.AudioContext).toHaveBeenCalledTimes(1);
    // Ton startet einmal beim ersten Timer und wiederholt sich danach im Sekundentakt
    const callsAfterAlarm = playAlarmPattern.mock.calls.length;
    act(() => { jest.advanceTimersByTime(1000); });
    expect(playAlarmPattern.mock.calls.length).toBe(callsAfterAlarm + 1);

    fireEvent.click(screen.getByText('OK'));
    expect(document.querySelector('.alarm-modal-overlay')).toBeNull();
    act(() => { jest.advanceTimersByTime(3000); });
    expect(playAlarmPattern.mock.calls.length).toBe(callsAfterAlarm + 1);
  });

  test('keeps the screen awake while a timer runs and releases it afterwards', async () => {
    renderTwoRecipes();
    fireEvent.click(screen.getByText('Start Apfelrotkohl'));
    await act(async () => {});
    expect(navigator.wakeLock.request).toHaveBeenCalledWith('screen');
    expect(wakeLockRelease).not.toHaveBeenCalled();

    await act(async () => { jest.advanceTimersByTime(30000); });
    expect(wakeLockRelease).toHaveBeenCalled();
  });

  test('without a provider the session is local to the component', () => {
    function Probe() {
      const session = useCookingSession();
      return <span data-testid="shared">{String(session.isShared)}</span>;
    }
    const { unmount } = render(<Probe />);
    expect(screen.getByTestId('shared').textContent).toBe('false');
    unmount();

    render(<CookingSessionProvider><Probe /></CookingSessionProvider>);
    expect(screen.getByTestId('shared').textContent).toBe('true');
  });
});

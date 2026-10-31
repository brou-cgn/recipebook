import React from 'react';
import { render, fireEvent, act, screen } from '@testing-library/react';
import { CookingSessionProvider, useCookingSession, sortByNextDue } from './CookingSessionContext';
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

describe('CookingSessionContext – several recipes', () => {
  const rouladen = { id: 'rouladen', title: 'Rinderrouladen' };
  const rotkohl = { id: 'rotkohl', title: 'Apfelrotkohl' };
  const kloesse = { id: 'kloesse', title: 'Kartoffelklöße' };
  const bratapfel = { id: 'bratapfel', title: 'Bratapfel' };
  const spaetzle = { id: 'spaetzle', title: 'Spätzle' };

  let session;
  function SessionProbe() {
    session = useCookingSession();
    return null;
  }

  function renderSession(onOpenRecipe = jest.fn()) {
    render(
      <CookingSessionProvider onOpenRecipe={onOpenRecipe}>
        <SessionProbe />
      </CookingSessionProvider>
    );
    return onOpenRecipe;
  }

  test('adding a recipe parks the current one with its step and portions and opens the new one', () => {
    const onOpenRecipe = renderSession();
    expect(session.canOpenRecipes).toBe(true);

    act(() => { session.addRecipe({ recipe: rouladen, stepIndex: 4, servingMultiplier: 1.5 }, rotkohl); });

    expect(onOpenRecipe).toHaveBeenCalledWith(rotkohl, { isNew: true });
    expect(session.sessionRecipeIds).toEqual(['rouladen', 'rotkohl']);
    expect(session.getCookingState('rouladen')).toMatchObject({ stepIndex: 4, servingMultiplier: 1.5 });
    expect(session.getCookingState('rotkohl')).toMatchObject({ stepIndex: 0, servingMultiplier: null });
    expect(screen.getByText('„Rinderrouladen“ läuft im Hintergrund')).toBeInTheDocument();
  });

  test('„Zurück“ in the notice switches back to the parked recipe', () => {
    const onOpenRecipe = renderSession();
    act(() => { session.addRecipe({ recipe: rouladen, stepIndex: 2, servingMultiplier: 1 }, rotkohl); });

    fireEvent.click(screen.getByText('Zurück'));

    expect(onOpenRecipe).toHaveBeenLastCalledWith(rouladen, { isNew: false });
    expect(screen.queryByText('„Rinderrouladen“ läuft im Hintergrund')).toBeNull();
  });

  test('the notice disappears after six seconds', () => {
    renderSession();
    act(() => { session.addRecipe({ recipe: rouladen, stepIndex: 0, servingMultiplier: 1 }, rotkohl); });
    act(() => { jest.advanceTimersByTime(6000); });
    expect(screen.queryByText('„Rinderrouladen“ läuft im Hintergrund')).toBeNull();
  });

  test('saves the step of a recipe in the session and ignores recipes outside it', () => {
    renderSession();
    act(() => { session.addRecipe({ recipe: rouladen, stepIndex: 0, servingMultiplier: 1 }, rotkohl); });
    act(() => { session.saveCookingState('rotkohl', { stepIndex: 3, servingMultiplier: 2 }); });
    act(() => { session.saveCookingState('fremd', { stepIndex: 1, servingMultiplier: 1 }); });

    expect(session.getCookingState('rotkohl')).toMatchObject({ stepIndex: 3, servingMultiplier: 2 });
    expect(session.isInSession('fremd')).toBe(false);
  });

  test('holds at most four recipes', () => {
    const onOpenRecipe = renderSession();
    act(() => { session.addRecipe({ recipe: rouladen, stepIndex: 0, servingMultiplier: 1 }, rotkohl); });
    act(() => { session.addRecipe({ recipe: rotkohl, stepIndex: 0, servingMultiplier: 1 }, kloesse); });
    act(() => { session.addRecipe({ recipe: kloesse, stepIndex: 0, servingMultiplier: 1 }, bratapfel); });
    expect(session.canAddRecipe('bratapfel')).toBe(false);

    let added;
    act(() => { added = session.addRecipe({ recipe: bratapfel, stepIndex: 0, servingMultiplier: 1 }, spaetzle); });

    expect(added).toBe(false);
    expect(session.sessionRecipeIds).toEqual(['rouladen', 'rotkohl', 'kloesse', 'bratapfel']);
    expect(onOpenRecipe).not.toHaveBeenCalledWith(spaetzle, expect.anything());
  });

  test('leaving a recipe lets the one with the next due timer move up', () => {
    const onOpenRecipe = renderSession();
    act(() => { session.addRecipe({ recipe: rouladen, stepIndex: 0, servingMultiplier: 1 }, rotkohl); });
    act(() => { session.addRecipe({ recipe: rotkohl, stepIndex: 0, servingMultiplier: 1 }, kloesse); });
    act(() => {
      session.startTimer({ recipeId: 'rouladen', recipeTitle: 'Rinderrouladen', stepKey: 'step_0', timerIndex: 0, totalSeconds: 90, label: '90 Minuten', soundKey: 'radar' });
      session.startTimer({ recipeId: 'rotkohl', recipeTitle: 'Apfelrotkohl', stepKey: 'step_0', timerIndex: 0, totalSeconds: 40, label: '40 Minuten', soundKey: 'radar' });
    });

    let next;
    act(() => { next = session.leaveSession('kloesse'); });

    expect(next.recipe).toBe(rotkohl);
    expect(onOpenRecipe).toHaveBeenLastCalledWith(rotkohl, { isNew: false });
    expect(session.sessionRecipeIds).toEqual(['rouladen', 'rotkohl']);
  });

  test('leaving the last recipe returns nothing to move up', () => {
    renderSession();
    act(() => { session.addRecipe({ recipe: rouladen, stepIndex: 0, servingMultiplier: 1 }, rotkohl); });
    act(() => { session.leaveSession('rotkohl'); });

    let next;
    act(() => { next = session.leaveSession('rouladen'); });

    expect(next).toBeNull();
    expect(session.sessionRecipeIds).toEqual([]);
  });

  test('sortByNextDue: finished timers first, then the earliest running, then the latest added', () => {
    const entries = [rouladen, rotkohl, kloesse, bratapfel].map((recipe) => ({ recipe }));
    const timers = {
      rouladen: { step_0: { 0: { running: true, endTime: 5000 } } },
      rotkohl: { step_0: { 0: { running: false, finished: true, endTime: 1000 } } },
      kloesse: { step_0: { 0: { running: true, endTime: 2000 } } },
    };
    expect(sortByNextDue(entries, timers).map((e) => e.recipe.id)).toEqual(['rotkohl', 'kloesse', 'rouladen', 'bratapfel']);
    expect(sortByNextDue(entries, {}).map((e) => e.recipe.id)).toEqual(['bratapfel', 'kloesse', 'rotkohl', 'rouladen']);
  });

  test('swapWith parks the recipe in front with its state and opens the chosen one', () => {
    const onOpenRecipe = renderSession();
    act(() => { session.addRecipe({ recipe: rouladen, stepIndex: 0, servingMultiplier: 1 }, rotkohl); });

    act(() => { session.swapWith({ recipe: rotkohl, stepIndex: 1, servingMultiplier: 2 }, 'rouladen'); });

    expect(onOpenRecipe).toHaveBeenLastCalledWith(rouladen, { isNew: false });
    expect(session.getCookingState('rotkohl')).toMatchObject({ stepIndex: 1, servingMultiplier: 2 });
  });

  test('swapWith also parks a recipe in front that was not in the session yet', () => {
    renderSession();
    act(() => { session.addRecipe({ recipe: rouladen, stepIndex: 0, servingMultiplier: 1 }, rotkohl); });

    act(() => { session.swapWith({ recipe: kloesse, stepIndex: 2, servingMultiplier: 1 }, 'rouladen'); });

    expect(session.sessionRecipeIds).toEqual(['rouladen', 'rotkohl', 'kloesse']);
    expect(session.getCookingState('kloesse')).toMatchObject({ stepIndex: 2 });
  });

  test('removeFromSession takes a recipe out without opening another one', () => {
    const onOpenRecipe = renderSession();
    act(() => { session.addRecipe({ recipe: rouladen, stepIndex: 0, servingMultiplier: 1 }, rotkohl); });
    const callsBefore = onOpenRecipe.mock.calls.length;

    act(() => { session.removeFromSession('rouladen'); });

    expect(session.sessionRecipeIds).toEqual(['rotkohl']);
    expect(onOpenRecipe.mock.calls.length).toBe(callsBefore);
  });

  test('without onOpenRecipe the session cannot switch recipes', () => {
    render(
      <CookingSessionProvider>
        <SessionProbe />
      </CookingSessionProvider>
    );
    expect(session.canOpenRecipes).toBe(false);
  });
});

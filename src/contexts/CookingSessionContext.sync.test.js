import React from 'react';
import { render, act } from '@testing-library/react';
import { CookingSessionProvider, useCookingSession } from './CookingSessionContext';
import { saveCookingSession, subscribeCookingSession } from '../utils/cookingSessionFirestore';

jest.mock('../utils/cookingSessionFirestore', () => ({
  getCookingDeviceId: () => 'device-a',
  subscribeCookingSession: jest.fn(),
  saveCookingSession: jest.fn(() => Promise.resolve()),
}));
jest.mock('../utils/timerPush', () => ({
  ...jest.requireActual('../utils/timerPush'),
  scheduleTimerPush: jest.fn(),
  cancelTimerPush: jest.fn(),
}));

const A = { id: 'a', title: 'Rouladen' };
const B = { id: 'b', title: 'Rotkohl' };
const C = { id: 'c', title: 'Kloesse' };
const RECIPES = [A, B, C];

let session;
let emit;
const opened = [];
function Probe() {
  session = useCookingSession();
  return null;
}

function setup({ syncForUserId = 'u1' } = {}) {
  subscribeCookingSession.mockImplementation((uid, cb) => {
    emit = cb;
    return jest.fn();
  });
  return render(
    <CookingSessionProvider
      syncForUserId={syncForUserId}
      recipes={RECIPES}
      onOpenRecipe={(recipe) => opened.push(recipe.id)}
    >
      <Probe />
    </CookingSessionProvider>
  );
}

const remote = (over) => ({
  recipes: [], activeRecipeId: null, deviceId: 'device-b', updatedAtMs: Date.now(), hasPendingWrites: false, ...over,
});

beforeEach(() => {
  jest.useFakeTimers();
  saveCookingSession.mockClear();
  opened.length = 0;
});
afterEach(() => jest.useRealTimers());

describe('Kochsitzung: Abgleich zwischen Geräten', () => {
  it('abonniert nur mit syncForUserId', () => {
    subscribeCookingSession.mockClear();
    setup({ syncForUserId: null });
    expect(subscribeCookingSession).not.toHaveBeenCalled();
  });

  it('übernimmt Rezepte, Schritt und Rezept vorn von einem anderen Gerät', () => {
    setup();
    act(() => emit(remote({ recipes: [{ id: 'a', stepIndex: 2 }, { id: 'b', stepIndex: 0 }], activeRecipeId: 'a' })));
    expect(session.sessionRecipes.map((e) => [e.recipe.id, e.stepIndex])).toEqual([['a', 2], ['b', 0]]);
    expect(session.activeRecipeId).toBe('a');
    act(() => jest.advanceTimersByTime(2000));
    expect(saveCookingSession).not.toHaveBeenCalled();
  });

  it('schreibt Änderungen erst nach dem ersten Abruf und gebündelt', () => {
    setup();
    act(() => session.addRecipe({ recipe: A, stepIndex: 1, servingMultiplier: null }, B));
    act(() => jest.advanceTimersByTime(2000));
    expect(saveCookingSession).not.toHaveBeenCalled();
    act(() => emit(null));
    act(() => jest.advanceTimersByTime(700));
    expect(saveCookingSession).toHaveBeenCalledTimes(1);
    expect(saveCookingSession).toHaveBeenCalledWith('u1', {
      recipes: [{ id: 'a', stepIndex: 1 }, { id: 'b', stepIndex: 0 }],
      activeRecipeId: null,
    });
  });

  it('schreibt den Schritt je Rezept und das Rezept vorn', () => {
    setup();
    act(() => emit(remote({ recipes: [{ id: 'a', stepIndex: 0 }, { id: 'b', stepIndex: 0 }], activeRecipeId: 'a' })));
    act(() => session.saveCookingState('b', { stepIndex: 3, servingMultiplier: null }));
    act(() => session.setActiveRecipe('b'));
    act(() => jest.advanceTimersByTime(700));
    expect(saveCookingSession).toHaveBeenLastCalledWith('u1', {
      recipes: [{ id: 'a', stepIndex: 0 }, { id: 'b', stepIndex: 3 }],
      activeRecipeId: 'b',
    });
  });

  it('ignoriert das eigene Echo', () => {
    setup();
    act(() => emit(null));
    act(() => session.addRecipe({ recipe: A, stepIndex: 0, servingMultiplier: null }, B));
    act(() => emit(remote({ deviceId: 'device-a', recipes: [{ id: 'a', stepIndex: 5 }] })));
    expect(session.sessionRecipes.map((e) => e.recipe.id)).toEqual(['a', 'b']);
    expect(session.getCookingState('a').stepIndex).toBe(0);
  });

  it('wechselt mit, wenn hier ein Rezept vorn steht und ein anderes aktiv wird', () => {
    setup();
    act(() => emit(remote({ recipes: [{ id: 'a', stepIndex: 0 }, { id: 'b', stepIndex: 4 }], activeRecipeId: 'a' })));
    act(() => session.setActiveRecipe('a'));
    act(() => emit(remote({ recipes: [{ id: 'a', stepIndex: 0 }, { id: 'b', stepIndex: 4 }], activeRecipeId: 'b' })));
    expect(opened).toEqual(['b']);
  });

  it('wechselt nicht, wenn hier kein Rezept vorn steht', () => {
    setup();
    act(() => emit(remote({ recipes: [{ id: 'a', stepIndex: 0 }, { id: 'b', stepIndex: 0 }], activeRecipeId: 'a' })));
    act(() => emit(remote({ recipes: [{ id: 'a', stepIndex: 0 }, { id: 'b', stepIndex: 0 }], activeRecipeId: 'b' })));
    expect(opened).toEqual([]);
    expect(session.activeRecipeId).toBe('b');
  });

  it('nimmt ein dort entferntes Rezept auch hier heraus und lässt das Rezept vorn los', () => {
    setup();
    act(() => emit(remote({ recipes: [{ id: 'a', stepIndex: 0 }, { id: 'b', stepIndex: 0 }], activeRecipeId: 'a' })));
    act(() => emit(remote({ recipes: [{ id: 'a', stepIndex: 0 }], activeRecipeId: 'a' })));
    expect(session.sessionRecipes.map((e) => e.recipe.id)).toEqual(['a']);
    act(() => emit(remote({ recipes: [], activeRecipeId: null })));
    expect(session.sessionRecipes).toHaveLength(0);
    expect(session.activeRecipeId).toBeNull();
  });

  it('hält Rezepte zurück, die die Rezeptliste noch nicht kennt, und schreibt sie nicht weg', () => {
    setup();
    act(() => emit(remote({ recipes: [{ id: 'a', stepIndex: 1 }, { id: 'zzz', stepIndex: 2 }] })));
    expect(session.sessionRecipes.map((e) => e.recipe.id)).toEqual(['a']);
    act(() => session.saveCookingState('a', { stepIndex: 2, servingMultiplier: null }));
    act(() => jest.advanceTimersByTime(700));
    expect(saveCookingSession).toHaveBeenLastCalledWith('u1', {
      recipes: [{ id: 'a', stepIndex: 2 }, { id: 'zzz', stepIndex: 2 }],
      activeRecipeId: null,
    });
  });

  it('übernimmt keine Sitzung, die älter als 12 Stunden ist', () => {
    setup();
    act(() => emit(remote({ recipes: [{ id: 'a', stepIndex: 0 }], updatedAtMs: Date.now() - 13 * 3600 * 1000 })));
    expect(session.sessionRecipes).toHaveLength(0);
  });

  it('löscht das Rezept vorn nur, wenn es noch das aktive ist', () => {
    setup();
    act(() => emit(null));
    act(() => session.setActiveRecipe('a'));
    act(() => session.setActiveRecipe('b'));
    act(() => session.clearActiveRecipe('a'));
    expect(session.activeRecipeId).toBe('b');
    act(() => session.clearActiveRecipe('b'));
    expect(session.activeRecipeId).toBeNull();
  });
});

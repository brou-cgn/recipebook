import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { playAlarmPattern } from '../utils/alarmAudioUtils';
import CookingAlarmModal from '../components/CookingAlarmModal';
import UndoSnackbar from '../components/UndoSnackbar';

/**
 * Kochsitzung (Vorhaben „Parallel kochen“, docs/vorhaben/parallel-kochen.md).
 *
 * Die Schritt-Timer und ihr Alarm liegen hier statt in RecipeDetail. Dadurch laufen
 * Timer weiter, wenn man das Rezept verlässt, und der Alarm kommt auch, wenn das
 * Rezept gerade nicht offen ist. Timer liegen je Rezept:
 * timers[recipeId][stepKey][timerIndex] = { totalSeconds, remainingSeconds, endTime,
 * running, finished, label, recipeTitle, soundKey }.
 *
 * Ein einziger Takt (1 s) rechnet die Restzeit aus endTime; nach Bildschirmsperre oder
 * App-Wechsel gleicht visibilitychange sie ab. Solange ein Timer läuft, hält die
 * Sitzung den Bildschirm wach.
 *
 * Mit dem Rollen-Flag parallelKochen kocht man mehrere Rezepte zugleich: Die Sitzung
 * führt die Rezepte im Kochmodus (höchstens MAX_SESSION_RECIPES) samt Schritt und
 * Portionen. Wer eines dazunimmt, parkt das bisherige; geöffnet wird über
 * onOpenRecipe des Providers (App.js).
 *
 * Ohne Provider legt useCookingSession einen lokalen Speicher an, der mit der
 * aufrufenden Komponente endet (wie vor der Kochsitzung); den Alarm-Dialog rendert
 * dann die Komponente selbst (isShared ist false), Rezepte wechseln geht nicht.
 */

export const MAX_SESSION_RECIPES = 4;
const CookingSessionContext = createContext(null);
const NO_TIMERS = {};
const NO_ENTRIES = [];
const TICK_MS = 1000;
const NOTICE_MS = 6000;

const anyRunning = (timers) =>
  Object.values(timers).some((steps) =>
    Object.values(steps).some((byIndex) => Object.values(byIndex).some((t) => t.running))
  );

// Wann ein Rezept als Nächstes Aufmerksamkeit braucht: abgelaufener Timer sofort,
// sonst das früheste Ende eines laufenden Timers, ohne Timer nie.
function nextDueAt(timers, recipeId) {
  let due = Infinity;
  Object.values(timers[recipeId] || {}).forEach((byIndex) => {
    Object.values(byIndex).forEach((t) => {
      if (t.finished) due = Math.min(due, 0);
      else if (t.running) due = Math.min(due, t.endTime);
    });
  });
  return due;
}

/**
 * Rezepte der Sitzung nach Dringlichkeit: zuerst das mit dem nächsten fälligen Timer,
 * bei Gleichstand (z. B. keiner hat einen Timer) das zuletzt dazugenommene.
 */
export function sortByNextDue(entries, timers) {
  return entries
    .map((entry, index) => ({ entry, index, due: nextDueAt(timers, entry.recipe.id) }))
    .sort((a, b) => (a.due - b.due) || (b.index - a.index))
    .map(({ entry }) => entry);
}

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function releaseQuietly(sentinel) {
  try {
    const result = sentinel.release();
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch (_) {
    // schon freigegeben
  }
}

function useCookingSessionStore({ enabled, shared, onOpenRecipe }) {
  const [timers, setTimers] = useState(NO_TIMERS);
  const [alarm, setAlarm] = useState(null);
  const [entries, setEntries] = useState(NO_ENTRIES);
  const [notice, setNotice] = useState(null);
  const timersRef = useRef(timers);
  const entriesRef = useRef(entries);
  const onOpenRecipeRef = useRef(onOpenRecipe);
  const tickRef = useRef(null);
  const syncRef = useRef(null);
  const alarmActiveRef = useRef(false);
  const alarmIntervalRef = useRef(null);
  const alarmCtxRef = useRef(null);
  onOpenRecipeRef.current = onOpenRecipe;

  const commit = useCallback((next) => {
    timersRef.current = next;
    setTimers(next);
  }, []);

  const commitEntries = useCallback((next) => {
    entriesRef.current = next;
    setEntries(next);
  }, []);

  const stopTicking = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const playAlarmLoop = useCallback(async (soundKey) => {
    try {
      if (!alarmCtxRef.current) {
        // Fallback: Context wurde nicht beim Timerstart angelegt (z. B. in Tests, nicht iOS).
        // Auf iOS blockiert der Browser diesen Weg vermutlich (Autoplay-Regel).
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) throw new Error('AudioContext not supported');
        alarmCtxRef.current = new AudioCtx();
      }
      const ctx = alarmCtxRef.current;
      // Auf manchen Mobilgeräten startet der Context suspended
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      if (!alarmActiveRef.current) return;
      playAlarmPattern(ctx, soundKey);
      // Wiederholen, bis OK gedrückt wird
      alarmIntervalRef.current = setInterval(async () => {
        try {
          if (ctx.state === 'suspended') {
            await ctx.resume();
          }
          playAlarmPattern(ctx, soundKey);
        } catch (_) {
          // ignorieren
        }
      }, 1000);
    } catch (_) {
      // Audio API nicht verfügbar – der Dialog bleibt trotzdem sichtbar
    }
  }, []);

  const startAlarm = useCallback((timer) => {
    const item = { recipeTitle: timer.recipeTitle || '', label: timer.label || '' };
    setAlarm((prev) => ({ items: [...(prev ? prev.items : []), item] }));
    if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
      new Notification('Timer abgelaufen!', {
        body: item.recipeTitle ? `${item.recipeTitle}: ${item.label}` : item.label,
        icon: '/favicon.ico',
      });
    }
    // Nur ein Ton gleichzeitig; weitere abgelaufene Timer stehen mit im Dialog
    if (alarmActiveRef.current) return;
    alarmActiveRef.current = true;
    playAlarmLoop(timer.soundKey);
  }, [playAlarmLoop]);

  const stopAlarm = useCallback(() => {
    alarmActiveRef.current = false;
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
    // Context nicht schließen, sondern behalten: stabiler, als bei jedem Alarm einen neuen anzulegen.
    setAlarm(null);
  }, []);

  const sync = useCallback(() => {
    const now = Date.now();
    const finished = [];
    let changed = false;
    const next = {};
    Object.entries(timersRef.current).forEach(([recipeId, steps]) => {
      next[recipeId] = {};
      Object.entries(steps).forEach(([stepKey, byIndex]) => {
        const stepNext = { ...byIndex };
        Object.entries(byIndex).forEach(([timerIndex, t]) => {
          if (!t.running) return;
          const remaining = Math.max(0, Math.round((t.endTime - now) / 1000));
          if (remaining <= 0) {
            stepNext[timerIndex] = { ...t, remainingSeconds: 0, running: false, finished: true };
            finished.push(t);
            changed = true;
          } else if (remaining !== t.remainingSeconds) {
            stepNext[timerIndex] = { ...t, remainingSeconds: remaining };
            changed = true;
          }
        });
        next[recipeId][stepKey] = stepNext;
      });
    });
    if (changed) commit(next);
    if (!anyRunning(timersRef.current)) stopTicking();
    finished.forEach((t) => startAlarm(t));
  }, [commit, stopTicking, startAlarm]);
  syncRef.current = sync;

  const startTimer = useCallback(({ recipeId, recipeTitle, stepKey, timerIndex, totalSeconds, label, soundKey }) => {
    requestNotificationPermission();

    // AudioContext hier anlegen (direkte Nutzergeste), damit iOS den Alarm später abspielen darf.
    if (!alarmCtxRef.current) {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          alarmCtxRef.current = new AudioCtx();
        }
      } catch (e) {
        console.warn('AudioContext creation failed:', e);
      }
    }

    // Fortsetzen, falls iOS den Context angehalten hat.
    if (alarmCtxRef.current && alarmCtxRef.current.state === 'suspended') {
      alarmCtxRef.current.resume().catch((e) => console.warn('AudioContext resume failed:', e));
    }

    const current = timersRef.current;
    const steps = current[recipeId] || {};
    commit({
      ...current,
      [recipeId]: {
        ...steps,
        [stepKey]: {
          ...(steps[stepKey] || {}),
          [timerIndex]: {
            totalSeconds,
            remainingSeconds: totalSeconds,
            endTime: Date.now() + totalSeconds * 1000,
            running: true,
            finished: false,
            label,
            recipeTitle,
            soundKey,
          },
        },
      },
    });
    if (!tickRef.current) {
      tickRef.current = setInterval(() => syncRef.current(), TICK_MS);
    }
  }, [commit]);

  const stopTimer = useCallback((recipeId, stepKey, timerIndex) => {
    const current = timersRef.current;
    const steps = current[recipeId];
    if (!steps || !steps[stepKey]) return;
    const byIndex = { ...steps[stepKey] };
    delete byIndex[timerIndex];
    commit({ ...current, [recipeId]: { ...steps, [stepKey]: byIndex } });
    if (!anyRunning(timersRef.current)) stopTicking();
  }, [commit, stopTicking]);

  const openRecipe = useCallback((recipe, isNew) => {
    if (onOpenRecipeRef.current) onOpenRecipeRef.current(recipe, { isNew });
  }, []);

  // Schritt und Portionen eines Rezepts der Sitzung mitschreiben
  const saveCookingState = useCallback((recipeId, state) => {
    const list = entriesRef.current;
    const index = list.findIndex((e) => e.recipe.id === recipeId);
    if (index < 0) return;
    const entry = list[index];
    if (entry.stepIndex === state.stepIndex && entry.servingMultiplier === state.servingMultiplier) return;
    const next = list.slice();
    next[index] = { ...entry, ...state };
    commitEntries(next);
  }, [commitEntries]);

  // Nächstes Rezept dazunehmen: das bisherige parkt mit seinem Zustand, das neue öffnet im Kochmodus
  const addRecipe = useCallback((current, nextRecipe) => {
    const parked = { recipe: current.recipe, stepIndex: current.stepIndex, servingMultiplier: current.servingMultiplier };
    let list = entriesRef.current;
    const currentIndex = list.findIndex((e) => e.recipe.id === parked.recipe.id);
    list = currentIndex >= 0 ? list.map((e, i) => (i === currentIndex ? parked : e)) : [...list, parked];
    if (!list.some((e) => e.recipe.id === nextRecipe.id)) {
      if (list.length >= MAX_SESSION_RECIPES) return false;
      list = [...list, { recipe: nextRecipe, stepIndex: 0, servingMultiplier: null }];
    }
    commitEntries(list);
    setNotice({ recipe: parked.recipe });
    openRecipe(nextRecipe, true);
    return true;
  }, [commitEntries, openRecipe]);

  const switchTo = useCallback((recipeId) => {
    const entry = entriesRef.current.find((e) => e.recipe.id === recipeId);
    if (!entry) return false;
    setNotice(null);
    openRecipe(entry.recipe, false);
    return true;
  }, [openRecipe]);

  // Tippen auf ein geparktes Rezept: das Rezept vorn parkt (wenn Platz ist), das gewählte öffnet
  const swapWith = useCallback((current, targetId) => {
    const target = entriesRef.current.find((e) => e.recipe.id === targetId);
    if (!target) return false;
    if (current && current.recipe.id !== targetId) {
      const parked = { recipe: current.recipe, stepIndex: current.stepIndex, servingMultiplier: current.servingMultiplier };
      const list = entriesRef.current;
      const index = list.findIndex((e) => e.recipe.id === parked.recipe.id);
      if (index >= 0) commitEntries(list.map((e, i) => (i === index ? parked : e)));
      else if (list.length < MAX_SESSION_RECIPES) commitEntries([...list, parked]);
    }
    setNotice(null);
    openRecipe(target.recipe, false);
    return true;
  }, [commitEntries, openRecipe]);

  // Aus der Leiste entfernen: nur aus der Sitzung nehmen, nichts öffnen; seine Timer laufen weiter
  const removeFromSession = useCallback((recipeId) => {
    const remaining = entriesRef.current.filter((e) => e.recipe.id !== recipeId);
    if (remaining.length !== entriesRef.current.length) commitEntries(remaining);
  }, [commitEntries]);

  // Kochmodus eines Rezepts beenden: es verlässt die Sitzung, das nächste fällige rückt nach
  const leaveSession = useCallback((recipeId) => {
    const remaining = entriesRef.current.filter((e) => e.recipe.id !== recipeId);
    if (remaining.length === entriesRef.current.length) return null;
    commitEntries(remaining);
    setNotice(null);
    if (remaining.length === 0) return null;
    const next = sortByNextDue(remaining, timersRef.current)[0];
    openRecipe(next.recipe, false);
    return next;
  }, [commitEntries, openRecipe]);

  // „läuft im Hintergrund“ nach dem Parken nur kurz zeigen, wie die Rückgängig-Snackbar
  useEffect(() => {
    if (!notice) return undefined;
    const timeout = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timeout);
  }, [notice]);

  // Nach Bildschirmsperre oder App-Wechsel die Restzeit aus endTime neu berechnen
  useEffect(() => {
    if (!enabled) return undefined;
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') syncRef.current();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [enabled]);

  // Bildschirm wach halten, solange ein Timer läuft – auch wenn kein Rezept offen ist
  const running = anyRunning(timers);
  useEffect(() => {
    if (!enabled || !running || !('wakeLock' in navigator)) return undefined;
    let active = true;
    let sentinel = null;
    const request = async () => {
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (!lock) return;
        if (!active) {
          releaseQuietly(lock);
          return;
        }
        if (sentinel) releaseQuietly(sentinel);
        sentinel = lock;
      } catch (_) {
        // Wake-Lock nicht erlaubt (z. B. Energiesparmodus) – die Timer laufen trotzdem
      }
    };
    request();
    // Der Browser gibt den Wake-Lock frei, wenn die Seite verdeckt wird
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') request();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (sentinel) releaseQuietly(sentinel);
    };
  }, [enabled, running]);

  // Takt und Alarm enden mit der Sitzung (Provider bzw. Komponente ohne Provider)
  useEffect(() => () => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (alarmIntervalRef.current) clearInterval(alarmIntervalRef.current);
    if (alarmCtxRef.current) {
      try { alarmCtxRef.current.close(); } catch (_) {}
    }
  }, []);

  const canOpenRecipes = Boolean(onOpenRecipe);
  return useMemo(() => ({
    isShared: shared,
    canOpenRecipes,
    getTimers: (recipeId) => timers[recipeId] || NO_TIMERS,
    allTimers: timers,
    startTimer,
    stopTimer,
    alarm,
    stopAlarm,
    sessionRecipes: entries,
    sessionRecipeIds: entries.map((e) => e.recipe.id),
    isInSession: (recipeId) => entries.some((e) => e.recipe.id === recipeId),
    getCookingState: (recipeId) => entries.find((e) => e.recipe.id === recipeId) || null,
    canAddRecipe: (currentRecipeId) =>
      entries.length + (entries.some((e) => e.recipe.id === currentRecipeId) ? 0 : 1) < MAX_SESSION_RECIPES,
    saveCookingState,
    addRecipe,
    switchTo,
    swapWith,
    removeFromSession,
    leaveSession,
    notice,
  }), [shared, canOpenRecipes, timers, startTimer, stopTimer, alarm, stopAlarm, entries,
    saveCookingState, addRecipe, switchTo, swapWith, removeFromSession, leaveSession, notice]);
}

export function CookingSessionProvider({ children, onOpenRecipe }) {
  const session = useCookingSessionStore({ enabled: true, shared: true, onOpenRecipe });
  const { notice, switchTo } = session;
  return (
    <CookingSessionContext.Provider value={session}>
      {children}
      {notice && (
        <UndoSnackbar
          key={notice.recipe.id}
          message={`„${notice.recipe.title}“ läuft im Hintergrund`}
          actionLabel="Zurück"
          onUndo={() => switchTo(notice.recipe.id)}
        />
      )}
      <CookingAlarmModal alarm={session.alarm} onStop={session.stopAlarm} />
    </CookingSessionContext.Provider>
  );
}

/**
 * Zugriff auf die Kochsitzung. Ohne Provider entsteht ein lokaler Speicher, der mit
 * der aufrufenden Komponente endet; sie rendert dann den Alarm-Dialog selbst.
 */
export function useCookingSession() {
  const sharedSession = useContext(CookingSessionContext);
  const localSession = useCookingSessionStore({ enabled: !sharedSession, shared: false });
  return sharedSession || localSession;
}

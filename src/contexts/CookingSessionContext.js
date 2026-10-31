import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { playAlarmPattern } from '../utils/alarmAudioUtils';
import CookingAlarmModal from '../components/CookingAlarmModal';

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
 * Ohne Provider legt useCookingSession einen lokalen Speicher an, der mit der
 * aufrufenden Komponente endet (wie vor der Kochsitzung); den Alarm-Dialog rendert
 * dann die Komponente selbst (isShared ist false).
 */

const CookingSessionContext = createContext(null);
const NO_TIMERS = {};
const TICK_MS = 1000;

const anyRunning = (timers) =>
  Object.values(timers).some((steps) =>
    Object.values(steps).some((byIndex) => Object.values(byIndex).some((t) => t.running))
  );

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

function useCookingSessionStore({ enabled, shared }) {
  const [timers, setTimers] = useState(NO_TIMERS);
  const [alarm, setAlarm] = useState(null);
  const timersRef = useRef(timers);
  const tickRef = useRef(null);
  const syncRef = useRef(null);
  const alarmActiveRef = useRef(false);
  const alarmIntervalRef = useRef(null);
  const alarmCtxRef = useRef(null);

  const commit = useCallback((next) => {
    timersRef.current = next;
    setTimers(next);
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

  return useMemo(() => ({
    isShared: shared,
    getTimers: (recipeId) => timers[recipeId] || NO_TIMERS,
    startTimer,
    stopTimer,
    alarm,
    stopAlarm,
  }), [shared, timers, startTimer, stopTimer, alarm, stopAlarm]);
}

export function CookingSessionProvider({ children }) {
  const session = useCookingSessionStore({ enabled: true, shared: true });
  return (
    <CookingSessionContext.Provider value={session}>
      {children}
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

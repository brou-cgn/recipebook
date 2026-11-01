import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { playAlarmPattern, getAlarmRepeatMs } from '../utils/alarmAudioUtils';
import { showLocalNotification } from '../utils/localNotification';
import { PUSH_NOT_ALLOWED, cancelTimerPush, scheduleTimerPush, timerAlarmId } from '../utils/timerPush';
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

export const MAX_SESSION_RECIPES = 6;
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

const hasRunningTimer = (timers, recipeId) =>
  Object.values(timers[recipeId] || {}).some((byIndex) => Object.values(byIndex).some((t) => t.running));

// Schritt mit einem abgelaufenen Timer (der früheste, wenn es mehrere gibt)
function finishedStepIndex(timers, recipeId) {
  const steps = Object.entries(timers[recipeId] || {})
    .filter(([, byIndex]) => Object.values(byIndex).some((t) => t.finished))
    .map(([stepKey]) => Number(stepKey.replace('step_', '')))
    .filter(Number.isInteger)
    .sort((a, b) => a - b);
  return steps.length > 0 ? steps[0] : null;
}

// ── Speichern über einen Neustart hinweg (localStorage, je Nutzer) ──────────
const STORAGE_PREFIX = 'cookingSession_';
// Eine gespeicherte Sitzung gilt höchstens so lange; danach startet die App ohne sie
const MAX_SAVED_AGE_MS = 12 * 60 * 60 * 1000;

// Gespeichert wird nur, was sich nicht aus den Rezepten ergibt: Timer ohne Restzeit (die folgt aus endTime)
function timersForStorage(timers) {
  const out = {};
  Object.entries(timers).forEach(([recipeId, steps]) => {
    Object.entries(steps).forEach(([stepKey, byIndex]) => {
      Object.entries(byIndex).forEach(([timerIndex, t]) => {
        const stored = { ...t };
        delete stored.remainingSeconds;
        out[recipeId] = out[recipeId] || {};
        out[recipeId][stepKey] = out[recipeId][stepKey] || {};
        out[recipeId][stepKey][timerIndex] = stored;
      });
    });
  });
  return out;
}

function timersFromStorage(raw, now) {
  const out = {};
  Object.entries(raw || {}).forEach(([recipeId, steps]) => {
    Object.entries(steps || {}).forEach(([stepKey, byIndex]) => {
      Object.entries(byIndex || {}).forEach(([timerIndex, t]) => {
        if (!t || !Number.isFinite(t.endTime) || !Number.isFinite(t.totalSeconds)) return;
        out[recipeId] = out[recipeId] || {};
        out[recipeId][stepKey] = out[recipeId][stepKey] || {};
        out[recipeId][stepKey][timerIndex] = {
          ...t,
          remainingSeconds: t.finished ? 0 : Math.max(0, Math.round((t.endTime - now) / 1000)),
        };
      });
    });
  });
  return out;
}

function readSavedSession(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (!saved || typeof saved !== 'object') return null;
    if (!Number.isFinite(saved.savedAt) || Date.now() - saved.savedAt > MAX_SAVED_AGE_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return {
      entries: (Array.isArray(saved.entries) ? saved.entries : []).filter((e) => e && typeof e.id === 'string'),
      timers: timersFromStorage(saved.timers, Date.now()),
    };
  } catch (_) {
    return null;
  }
}

function writeSavedSession(key, payload) {
  try {
    if (payload.entries.length === 0 && Object.keys(payload.timers).length === 0) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify({ ...payload, savedAt: Date.now() }));
    }
  } catch (_) {
    // Speicher voll oder gesperrt (z. B. privater Modus): die Sitzung gilt dann nur bis zum Neustart
  }
}

function useCookingSessionStore({
  enabled, shared, onOpenRecipe, persistForUserId = null, recipes = null, pushForUserId = null,
}) {
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
  // Das gerade klingende Muster, damit „OK“ es sofort abbrechen kann
  const alarmPatternRef = useRef(null);
  const alarmCtxRef = useRef(null);
  // Rezepte, die jemand ausdrücklich herausgenommen hat (beenden, wegwischen): nicht wieder automatisch parken
  const leftIdsRef = useRef(new Set());
  const recipesRef = useRef(recipes);
  const pendingEntriesRef = useRef([]);
  const restoredKeyRef = useRef(null);
  const skipNextSaveRef = useRef(false);
  const lastSavedRef = useRef('');
  onOpenRecipeRef.current = onOpenRecipe;
  recipesRef.current = recipes;

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
      alarmPatternRef.current = playAlarmPattern(ctx, soundKey);
      // Wiederholen, bis OK gedrückt wird
      alarmIntervalRef.current = setInterval(async () => {
        try {
          if (ctx.state === 'suspended') {
            await ctx.resume();
          }
          // Während des Wartens kann OK gedrückt worden sein
          if (!alarmActiveRef.current) return;
          alarmPatternRef.current = playAlarmPattern(ctx, soundKey);
        } catch (_) {
          // ignorieren
        }
      }, getAlarmRepeatMs(soundKey));
    } catch (_) {
      // Audio API nicht verfügbar – der Dialog bleibt trotzdem sichtbar
    }
  }, []);

  const startAlarm = useCallback((timer) => {
    const item = { recipeTitle: timer.recipeTitle || '', label: timer.label || '' };
    setAlarm((prev) => ({ items: [...(prev ? prev.items : []), item] }));
    // Nur ein Ton gleichzeitig; weitere abgelaufene Timer stehen mit im Dialog
    if (!alarmActiveRef.current) {
      alarmActiveRef.current = true;
      playAlarmLoop(timer.soundKey);
    }
    // Im Hintergrund zusätzlich eine Mitteilung – nach dem Ton und so, dass sie ihn nie verhindert.
    // Früher `new Notification()`: Chrome auf Android wirft dabei, der Ton startete dann gar nicht.
    if (document.visibilityState !== 'visible') {
      showLocalNotification('Timer abgelaufen!', {
        body: item.recipeTitle ? `${item.recipeTitle}: ${item.label}` : item.label,
        icon: '/logo192.png',
        badge: '/favicon.ico',
        tag: 'cooking-timer',
        renotify: true,
        data: { type: 'cooking_timer' },
      });
    }
  }, [playAlarmLoop]);

  const stopAlarm = useCallback(() => {
    alarmActiveRef.current = false;
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
    // Den gerade klingenden Ton sofort ausblenden, nicht erst ausklingen lassen
    if (alarmPatternRef.current) {
      alarmPatternRef.current.stop();
      alarmPatternRef.current = null;
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
    leftIdsRef.current.delete(parked.recipe.id);
    leftIdsRef.current.delete(nextRecipe.id);
    setNotice({ recipe: parked.recipe });
    openRecipe(nextRecipe, true);
    return true;
  }, [commitEntries, openRecipe]);

  // Öffnet ein Rezept der Sitzung; mit abgelaufenem Timer an dessen Schritt statt am zuletzt offenen
  const openFromSession = useCallback((recipeId) => {
    const entry = entriesRef.current.find((e) => e.recipe.id === recipeId);
    if (!entry) return false;
    const finishedStep = finishedStepIndex(timersRef.current, recipeId);
    if (finishedStep !== null && finishedStep !== entry.stepIndex) {
      commitEntries(entriesRef.current.map((e) => (e.recipe.id === recipeId ? { ...e, stepIndex: finishedStep } : e)));
    }
    setNotice(null);
    openRecipe(entry.recipe, false);
    return true;
  }, [commitEntries, openRecipe]);

  const switchTo = useCallback((recipeId) => openFromSession(recipeId), [openFromSession]);

  // Tippen auf ein geparktes Rezept: das Rezept vorn parkt (wenn Platz ist), das gewählte öffnet.
  // Leiste und Schiene behalten die Reihenfolge (das Rezept vorn parkt an seinem Platz). Mit inPlace
  // (Karussell im iPad-Querformat, Entwurf I4) übernimmt es stattdessen den Platz des gewählten:
  // Das Karussell zeigt das Rezept vorn nicht, so bleiben dort alle anderen Karten stehen.
  const swapWith = useCallback((current, targetId, { inPlace = false } = {}) => {
    if (!entriesRef.current.some((e) => e.recipe.id === targetId)) return false;
    if (current && current.recipe.id !== targetId) {
      const parked = { recipe: current.recipe, stepIndex: current.stepIndex, servingMultiplier: current.servingMultiplier };
      const list = entriesRef.current;
      const index = list.findIndex((e) => e.recipe.id === parked.recipe.id);
      const targetIndex = list.findIndex((e) => e.recipe.id === targetId);
      if (inPlace && index >= 0) {
        const next = list.slice();
        next[index] = list[targetIndex];
        next[targetIndex] = parked;
        commitEntries(next);
      } else if (inPlace && list.length < MAX_SESSION_RECIPES) {
        commitEntries([...list.map((e, i) => (i === targetIndex ? parked : e)), list[targetIndex]]);
      } else if (index >= 0) {
        commitEntries(list.map((e, i) => (i === index ? parked : e)));
      } else if (list.length < MAX_SESSION_RECIPES) {
        commitEntries([...list, parked]);
      }
      leftIdsRef.current.delete(parked.recipe.id);
    }
    return openFromSession(targetId);
  }, [commitEntries, openFromSession]);

  // Aus der Leiste entfernen: nur aus der Sitzung nehmen, nichts öffnen; seine Timer laufen weiter
  const removeFromSession = useCallback((recipeId) => {
    leftIdsRef.current.add(recipeId);
    const remaining = entriesRef.current.filter((e) => e.recipe.id !== recipeId);
    if (remaining.length !== entriesRef.current.length) commitEntries(remaining);
  }, [commitEntries]);

  // Kochmodus eines Rezepts beenden: es verlässt die Sitzung, das nächste fällige rückt nach
  const leaveSession = useCallback((recipeId) => {
    const remaining = entriesRef.current.filter((e) => e.recipe.id !== recipeId);
    if (remaining.length === entriesRef.current.length) return null;
    leftIdsRef.current.add(recipeId);
    commitEntries(remaining);
    setNotice(null);
    if (remaining.length === 0) return null;
    const next = sortByNextDue(remaining, timersRef.current)[0];
    openRecipe(next.recipe, false);
    return next;
  }, [commitEntries, openRecipe]);

  // Wer ein Rezept mit laufendem Timer verlässt, parkt es automatisch (Entscheidung 31.10.2026),
  // außer er hat es vorher ausdrücklich herausgenommen
  const parkIfTimerRunning = useCallback((state) => {
    const recipeId = state.recipe.id;
    const list = entriesRef.current;
    if (!hasRunningTimer(timersRef.current, recipeId) || leftIdsRef.current.has(recipeId)) return false;
    if (list.some((e) => e.recipe.id === recipeId) || list.length >= MAX_SESSION_RECIPES) return false;
    commitEntries([...list, { recipe: state.recipe, stepIndex: state.stepIndex, servingMultiplier: state.servingMultiplier }]);
    setNotice({ recipe: state.recipe });
    return true;
  }, [commitEntries]);

  // Gespeicherte Rezepte der Sitzung einsetzen, sobald die Rezeptliste sie kennt
  const resolvePendingEntries = useCallback(() => {
    const pending = pendingEntriesRef.current;
    const list = recipesRef.current;
    if (pending.length === 0 || !Array.isArray(list) || list.length === 0) return;
    const resolved = [];
    const stillPending = [];
    pending.forEach((saved) => {
      const recipe = list.find((r) => r.id === saved.id);
      if (recipe) {
        resolved.push({ recipe, stepIndex: saved.stepIndex || 0, servingMultiplier: saved.servingMultiplier ?? null });
      } else {
        stillPending.push(saved);
      }
    });
    pendingEntriesRef.current = stillPending;
    if (resolved.length === 0) return;
    const current = entriesRef.current;
    commitEntries([
      ...resolved.filter((e) => !current.some((c) => c.recipe.id === e.recipe.id)),
      ...current,
    ].slice(0, MAX_SESSION_RECIPES));
  }, [commitEntries]);

  // Nach einem Neustart: gespeicherte Timer und Rezepte des Nutzers wiederherstellen.
  // Abgelaufene Timer melden sich dabei sofort (der erste Abgleich).
  const storageKey = shared && persistForUserId ? `${STORAGE_PREFIX}${persistForUserId}` : null;
  const lastUserKeyRef = useRef(null);
  useEffect(() => {
    restoredKeyRef.current = null;
    lastSavedRef.current = '';
    if (!storageKey) return;
    // Anderer Nutzer auf demselben Gerät: dessen Sitzung bleibt in seinem Speicher, hier beginnt eine eigene
    if (lastUserKeyRef.current && lastUserKeyRef.current !== storageKey) {
      commit(NO_TIMERS);
      commitEntries(NO_ENTRIES);
      pendingEntriesRef.current = [];
      leftIdsRef.current = new Set();
      stopTicking();
    }
    lastUserKeyRef.current = storageKey;
    const saved = readSavedSession(storageKey);
    if (saved) {
      if (Object.keys(saved.timers).length > 0) {
        commit({ ...saved.timers, ...timersRef.current });
        if (!tickRef.current) tickRef.current = setInterval(() => syncRef.current(), TICK_MS);
      }
      pendingEntriesRef.current = saved.entries;
      resolvePendingEntries();
      syncRef.current();
    }
    restoredKeyRef.current = storageKey;
    // Der Speicher-Effekt läuft im selben Durchgang noch mit dem alten Zustand: einmal auslassen
    skipNextSaveRef.current = true;
  }, [storageKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    resolvePendingEntries();
  }, [recipes, resolvePendingEntries]);

  // Speichern, sobald sich Rezepte, Schritte oder Timer ändern (nicht bei jeder Sekunde Restzeit)
  useEffect(() => {
    if (!storageKey || restoredKeyRef.current !== storageKey) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    const payload = {
      entries: [
        ...entries.map((e) => ({ id: e.recipe.id, stepIndex: e.stepIndex || 0, servingMultiplier: e.servingMultiplier ?? null })),
        ...pendingEntriesRef.current,
      ],
      timers: timersForStorage(timers),
    };
    const signature = JSON.stringify(payload);
    if (signature === lastSavedRef.current) return;
    lastSavedRef.current = signature;
    writeSavedSession(storageKey, payload);
  }, [storageKey, entries, timers]);

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

  // Nach einem Neustart fehlt der AudioContext, den iOS nur nach einer Geste zulässt:
  // beim ersten Tippen anlegen, damit ein wiederhergestellter Timer hörbar klingelt
  useEffect(() => {
    if (!enabled || !running) return undefined;
    const primeAudio = () => {
      try {
        if (!alarmCtxRef.current) {
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (AudioCtx) alarmCtxRef.current = new AudioCtx();
        }
        if (alarmCtxRef.current && alarmCtxRef.current.state === 'suspended') {
          alarmCtxRef.current.resume().catch(() => {});
        }
      } catch (_) {
        // Audio API nicht verfügbar
      }
    };
    document.addEventListener('touchend', primeAudio, { once: true });
    document.addEventListener('click', primeAudio, { once: true });
    return () => {
      document.removeEventListener('touchend', primeAudio);
      document.removeEventListener('click', primeAudio);
    };
  }, [enabled, running]);

  // Weckruf vom Server (Tech-Check P8): Für jeden laufenden Timer liegt einer bereit, damit eine
  // Push-Mitteilung kommt, auch wenn die App beim Ablauf pausiert ist (iOS im Hintergrund).
  // Endet ein Timer anders – gestoppt, oder er klingelt hier in der offenen App –, wird sein
  // Weckruf gelöscht; der Server wartet dafür kurz über die Endzeit hinaus.
  const pushAlarmIdsRef = useRef(new Set());
  useEffect(() => {
    if (!shared || !pushForUserId) return;
    const now = Date.now();
    const wanted = new Map();
    Object.entries(timers).forEach(([recipeId, steps]) => {
      Object.entries(steps).forEach(([stepKey, byIndex]) => {
        Object.entries(byIndex).forEach(([timerIndex, t]) => {
          if (!t.running || !(t.endTime > now)) return;
          wanted.set(timerAlarmId(pushForUserId, recipeId, stepKey, timerIndex, t.endTime), t);
        });
      });
    });
    const known = pushAlarmIdsRef.current;
    wanted.forEach((t, id) => {
      if (known.has(id)) return;
      known.add(id);
      const label = t.label || '';
      Promise.resolve(scheduleTimerPush(pushForUserId, id, {
        dueAt: t.endTime,
        body: t.recipeTitle ? `${t.recipeTitle}: ${label}` : label,
      })).then((status) => {
        // Mitteilungen noch nicht erlaubt (z. B. Abfrage offen): beim nächsten Takt erneut versuchen
        if (status === PUSH_NOT_ALLOWED) known.delete(id);
      });
    });
    known.forEach((id) => {
      if (wanted.has(id)) return;
      known.delete(id);
      cancelTimerPush(id);
    });
  }, [shared, pushForUserId, timers]);

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
    parkIfTimerRunning,
    notice,
  }), [shared, canOpenRecipes, timers, startTimer, stopTimer, alarm, stopAlarm, entries,
    saveCookingState, addRecipe, switchTo, swapWith, removeFromSession, leaveSession, parkIfTimerRunning, notice]);
}

/**
 * persistForUserId: mit gesetzter Nutzer-ID übersteht die Sitzung einen Neustart (localStorage,
 * höchstens MAX_SAVED_AGE_MS alt). recipes: die sichtbaren Rezepte, aus denen die gespeicherten
 * Rezepte der Sitzung nach dem Start wieder aufgelöst werden. pushForUserId: mit gesetzter
 * Nutzer-ID kommt zur Endzeit jedes Timers eine Push-Mitteilung vom Server, auch wenn die App
 * dann pausiert ist (utils/timerPush.js, Tech-Check P8).
 */
export function CookingSessionProvider({
  children, onOpenRecipe, persistForUserId = null, recipes = null, pushForUserId = null,
}) {
  const session = useCookingSessionStore({
    enabled: true, shared: true, onOpenRecipe, persistForUserId, recipes, pushForUserId,
  });
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

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { deleteField } from 'firebase/firestore';
import {
  addRecipe,
  updateRecipe,
  deleteRecipe,
  subscribeToTempRecipes,
} from '../utils/recipeFirestore';
import { compressImage } from '../utils/imageUtils';
import { runWebImport, runUniversalImport, runPhotoScanImport } from '../utils/importRunners';
import { logFailedWebImport } from '../utils/failedWebImportsFirestore';
import useUndoableDelete from '../hooks/useUndoableDelete';

const RecipeImportQueueContext = createContext(null);

const noopQueue = {
  jobs: [],
  reviewRecipes: [],
  deleteBanners: [],
  enqueueImportJob: () => undefined,
  dismissJob: () => {},
  restartJob: () => {},
  cancelJob: () => {},
  undoDelete: () => {},
};

// Images are compressed before being persisted as importSource (for
// restarting a job later) to stay well clear of Firestore's 1 MiB document
// size limit — uploaded photos can be up to 5MB uncompressed (see
// fileToBase64). The live run for the current attempt still uses the
// original, uncompressed images; only the restart snapshot is compressed.
async function buildImportSourceSnapshot(source) {
  if (!source) return null;
  if ((source.type === 'universal' || source.type === 'photo') && Array.isArray(source.images) && source.images.length > 0) {
    const compressedImages = await Promise.all(
      source.images.map((img) => compressImage(img, 1000, 1400, 0.5).catch(() => img))
    );
    return { ...source, images: compressedImages };
  }
  return source;
}

// Reconstructs the `run` function an import job was originally queued with,
// from its persisted importSource — used to restart a job that is stuck
// waiting (e.g. its owning tab was closed/reloaded before it could finish).
// `run` receives (onProgress, jobMeta) — see processQueue below for how
// jobMeta ({jobId, authorId}) is supplied on every attempt, fresh or
// restarted, so the underlying Cloud Function call can finalize the job
// directly in Firestore and survive this tab being closed again.
function buildRunFromSource(source) {
  if (!source) return null;
  switch (source.type) {
    case 'web':
      return (onProgress, jobMeta) => runWebImport(source.url, source.authorId, onProgress, jobMeta);
    case 'universal':
      return (onProgress, jobMeta) => runUniversalImport({ images: source.images, text: source.text, url: source.url }, onProgress, jobMeta);
    case 'photo':
      return (onProgress, jobMeta) => runPhotoScanImport(source.images, source.language, onProgress, jobMeta);
    default:
      return null;
  }
}

// Progress-only Firestore writes are throttled to this interval so a fast
// OCR/screenshot progress callback (which can fire many times per second)
// doesn't turn into a Firestore write per tick. Status changes (queued →
// processing → error) and the final 100% always write immediately.
const PROGRESS_WRITE_INTERVAL_MS = 1000;

// A job whose importHeartbeatAt is older than this is considered orphaned —
// its owning tab was closed/reloaded/backgrounded before finishing — and
// becomes eligible for automatic recovery (see the orphan-recovery effect
// below). Comfortably above HEARTBEAT_INTERVAL_MS so a tab that's still
// alive and actively processing never gets pre-empted by another tab.
const STALE_JOB_MS = 60000;

// While a job is actively running in this tab, its importHeartbeatAt is
// refreshed on this interval — independent of progress updates — so a job
// stuck on a long silent network call (e.g. a slow screenshot capture) still
// reads as "alive" to other tabs instead of being treated as orphaned.
const HEARTBEAT_INTERVAL_MS = 20000;

const PENDING_STATUSES = ['queued', 'processing', 'error'];
const isPendingImport = (tempRecipe) => PENDING_STATUSES.includes(tempRecipe.importStatus);

/**
 * Runs recipe-import recognition (web import, AI photo OCR, ...) as a
 * sequential background queue: enqueueImportJob() takes an async `run`
 * function that resolves to a recipe object (no id yet).
 *
 * Rather than a separate job-tracking collection, each queued import is a
 * normal isTemp recipe document (the same one used for the "Neues Rezept
 * hinzufügen" review queue, see subscribeToTempRecipes), created up front
 * with importStatus:'queued'/'processing'/'error' and importProgress. Once
 * the recognition resolves, that same document is updated in place with the
 * real recipe fields and the import* fields are cleared, at which point it
 * naturally becomes a normal pending-review item. This keeps job status and
 * review queue on one Firestore listener, synced across every open session
 * (tab/device) of the user — not just the one running the import.
 *
 * Jobs are processed one at a time (FIFO) so multiple queued imports don't
 * race each other or blow through OCR rate limits.
 */
export function RecipeImportQueueProvider({ userId, children }) {
  const [tempRecipes, setTempRecipes] = useState([]);
  const queueRef = useRef([]);
  const processingRef = useRef(false);
  const lastProgressWriteRef = useRef({});
  // Ids whose in-flight/queued run() result should be discarded instead of
  // written to Firestore once it settles — set by cancelJob() and by
  // restartJob() when it supersedes an attempt that's already running.
  // There is no AbortController threaded through the import runners (OCR /
  // screenshot / AI calls), so a "cancel" can't actually stop the network
  // work in flight; it only makes sure the stale result is never persisted.
  const cancelledJobsRef = useRef(new Set());
  // CLAUDE.md: every delete acts immediately + a 6s "Rückgängig" snackbar;
  // the row disappears from `jobs` right away, the underlying Firestore
  // delete only runs once the undo window passes unconfirmed.
  const { banners: deleteBanners, pendingKeys: pendingDeleteKeys, scheduleDelete, undoDelete } = useUndoableDelete();

  useEffect(() => {
    const unsubscribe = subscribeToTempRecipes(userId, setTempRecipes);
    return unsubscribe;
  }, [userId]);

  const jobs = useMemo(() => tempRecipes
    .filter(isPendingImport)
    .filter((r) => !pendingDeleteKeys.has(r.id))
    .map((r) => ({
      id: r.id,
      label: r.title,
      status: r.importStatus,
      progress: r.importProgress || 0,
      error: r.importError,
      canRestart: Boolean(r.importSource),
    })), [tempRecipes, pendingDeleteKeys]);

  const reviewRecipes = useMemo(
    () => tempRecipes.filter((r) => !isPendingImport(r)),
    [tempRecipes]
  );

  const patchJob = useCallback((jobId, patch) => {
    updateRecipe(jobId, patch).catch((error) => {
      console.error('Fehler beim Aktualisieren des Import-Jobs:', error);
    });
  }, []);

  const patchProgress = useCallback((jobId, progress, label) => {
    const clamped = Math.max(0, Math.min(100, Math.round(progress || 0)));
    const now = Date.now();
    const lastWrite = lastProgressWriteRef.current[jobId] || 0;
    if (clamped < 100 && !label && now - lastWrite < PROGRESS_WRITE_INTERVAL_MS) {
      return;
    }
    lastProgressWriteRef.current[jobId] = now;
    patchJob(jobId, { importProgress: clamped, ...(label ? { title: label } : {}) });
  }, [patchJob]);

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      while (queueRef.current.length > 0) {
        const job = queueRef.current[0];
        if (cancelledJobsRef.current.has(job.id)) {
          cancelledJobsRef.current.delete(job.id);
          queueRef.current.shift();
          continue;
        }
        patchJob(job.id, { importStatus: 'processing', importHeartbeatAt: Date.now() });
        const heartbeatInterval = setInterval(() => {
          patchJob(job.id, { importHeartbeatAt: Date.now() });
        }, HEARTBEAT_INTERVAL_MS);
        try {
          const recipe = await job.run(
            (progress, label) => patchProgress(job.id, progress, label),
            { jobId: job.id, authorId: job.userId },
          );
          if (cancelledJobsRef.current.has(job.id)) {
            // Cancelled (or superseded by a restart) while running — the
            // recognition finished, but nobody is waiting on this result
            // anymore, so don't persist it.
            cancelledJobsRef.current.delete(job.id);
          } else {
            await updateRecipe(job.id, {
              ...recipe,
              ...job.context,
              // Matches the previous addRecipe(..., job.userId) behavior: the
              // doc's owner is always whoever queued the job, regardless of
              // any authorId the parsed recipe itself may carry (e.g. an
              // Instagram caption's author).
              authorId: job.userId,
              isTemp: true,
              importStatus: deleteField(),
              importProgress: deleteField(),
              importHeartbeatAt: deleteField(),
            });
          }
          delete lastProgressWriteRef.current[job.id];
        } catch (error) {
          if (cancelledJobsRef.current.has(job.id)) {
            cancelledJobsRef.current.delete(job.id);
          } else {
            console.error('Hintergrund-Import fehlgeschlagen:', error);
            patchJob(job.id, { importStatus: 'error', importError: error?.message || 'Import fehlgeschlagen' });
          }
        } finally {
          clearInterval(heartbeatInterval);
          queueRef.current.shift();
        }
      }
    } finally {
      processingRef.current = false;
    }
  }, [patchJob, patchProgress]);

  const enqueueImportJob = useCallback(({ label, run, context = {}, userId: jobUserId, source = null }) => {
    buildImportSourceSnapshot(source).catch(() => null).then((importSource) => (
      addRecipe(
        {
          title: label || 'Rezept-Import',
          isTemp: true,
          importStatus: 'queued',
          importProgress: 0,
          importHeartbeatAt: Date.now(),
          ...context,
          ...(importSource ? { importSource } : {}),
        },
        jobUserId
      )
    )).then((created) => {
      queueRef.current.push({ id: created.id, run, context, userId: jobUserId });
      processQueue();
    }).catch((error) => {
      console.error('Fehler beim Anlegen des Import-Jobs:', error);
    });
  }, [processQueue]);

  const dismissJob = useCallback((id, label) => {
    // Snapshot the job now (not inside onConfirm) — by the time the 6s undo
    // window passes, this job may already have been removed from tempRecipes.
    const tempRecipe = tempRecipes.find((r) => r.id === id);
    scheduleDelete({
      key: id,
      message: `„${label || 'Import'}" verworfen`,
      onConfirm: () => {
        // Log dismissed, failed web imports (URL + error) so app development
        // can look into what went wrong on that site. Only web imports have
        // a meaningful source URL for this purpose.
        if (tempRecipe?.importStatus === 'error' && tempRecipe.importSource?.type === 'web') {
          logFailedWebImport({
            url: tempRecipe.importSource.url,
            error: tempRecipe.importError,
            title: tempRecipe.title,
            userId: tempRecipe.authorId,
          });
        }
        deleteRecipe(id).catch((error) => {
          console.error('Fehler beim Verwerfen des Import-Jobs:', error);
        });
      },
      onUndo: () => {},
    });
  }, [scheduleDelete, tempRecipes]);

  // Cancels a queued or actively running job: it disappears from the list
  // immediately and, if the job is mid-run, its eventual result is discarded
  // by processQueue right away instead of being written back (see
  // cancelledJobsRef above — there's no way to actually abort the in-flight
  // OCR/screenshot call itself). The temp-recipe doc itself is only deleted
  // once the undo window passes; undoing puts the job back in the run
  // discard-list so a still-in-flight attempt resumes being honored.
  const cancelJob = useCallback((id, label) => {
    cancelledJobsRef.current.add(id);
    scheduleDelete({
      key: id,
      message: `„${label || 'Import'}" abgebrochen`,
      onConfirm: () => {
        deleteRecipe(id).catch((error) => {
          console.error('Fehler beim Abbrechen des Import-Jobs:', error);
        });
      },
      onUndo: () => {
        cancelledJobsRef.current.delete(id);
      },
    });
  }, [scheduleDelete]);

  // Requeues a job from its persisted importSource — shared by the manual
  // "Neu starten" button (restartJob) and the orphan-recovery effect below.
  // Restarting a 'processing' job supersedes its current attempt
  // (cancelledJobsRef makes sure the stale result is discarded) and queues a
  // fresh one behind it.
  const queueRestart = useCallback((tempRecipe) => {
    const run = buildRunFromSource(tempRecipe.importSource);
    if (!run) return;

    // Only mark the old attempt cancelled if one is actually still
    // queued/in-flight in *this* tab's queueRef — e.g. restarting an
    // 'error' job, or recovering a job orphaned by a different tab, has
    // nothing of this tab's own to supersede, and flagging its id here
    // would wrongly cause the freshly-queued attempt below to be discarded
    // by the very first "is this cancelled?" check in processQueue.
    if (queueRef.current.some((job) => job.id === tempRecipe.id)) {
      cancelledJobsRef.current.add(tempRecipe.id);
    }
    patchJob(tempRecipe.id, { importStatus: 'queued', importProgress: 0, importHeartbeatAt: Date.now(), importError: deleteField() });
    queueRef.current.push({ id: tempRecipe.id, run, context: {}, userId: tempRecipe.authorId });
    processQueue();
  }, [patchJob, processQueue]);

  // Restarts a waiting/failed/running job from its persisted importSource —
  // this is what makes a job stuck in 'queued'/'error' (e.g. because the tab
  // that queued it was closed or reloaded, dropping the in-memory queue)
  // worth recovering from, instead of only being dismissable.
  const restartJob = useCallback((id) => {
    const tempRecipe = tempRecipes.find((r) => r.id === id);
    if (!tempRecipe || !tempRecipe.importSource) return;
    queueRestart(tempRecipe);
  }, [tempRecipes, queueRestart]);

  // Auto-recovers jobs orphaned by a tab that closed/reloaded/was
  // backgrounded before finishing: on every Firestore update (including the
  // first one after mount), any pending job that isn't tracked in *this*
  // tab's queueRef and whose heartbeat has gone stale is requeued here,
  // exactly like clicking "Neu starten" — without requiring the user to
  // notice and click it. 'error' jobs are left alone (the user decides via
  // the existing restart/dismiss actions); jobs without an importSource
  // can't be rebuilt at all. Jobs still legitimately being worked on by
  // another live tab keep a fresh heartbeat and are skipped.
  useEffect(() => {
    const now = Date.now();
    tempRecipes.forEach((tempRecipe) => {
      if (!isPendingImport(tempRecipe) || tempRecipe.importStatus === 'error') return;
      if (!tempRecipe.importSource) return;
      if (queueRef.current.some((job) => job.id === tempRecipe.id)) return;
      const heartbeat = tempRecipe.importHeartbeatAt || 0;
      if (now - heartbeat < STALE_JOB_MS) return;
      queueRestart(tempRecipe);
    });
  }, [tempRecipes, queueRestart]);

  const value = { jobs, reviewRecipes, deleteBanners, enqueueImportJob, dismissJob, restartJob, cancelJob, undoDelete };

  return (
    <RecipeImportQueueContext.Provider value={value}>
      {children}
    </RecipeImportQueueContext.Provider>
  );
}

/**
 * Reads the shared import queue. Safe to call even when no
 * RecipeImportQueueProvider is mounted (e.g. pre-login screens that still
 * render <Header>) — falls back to an inert, always-empty queue.
 */
export function useRecipeImportQueue() {
  const context = useContext(RecipeImportQueueContext);
  return context || noopQueue;
}

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

const RecipeImportQueueContext = createContext(null);

const noopQueue = {
  jobs: [],
  reviewRecipes: [],
  enqueueImportJob: () => undefined,
  dismissJob: () => {},
  restartJob: () => {},
  cancelJob: () => {},
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

  useEffect(() => {
    const unsubscribe = subscribeToTempRecipes(userId, setTempRecipes);
    return unsubscribe;
  }, [userId]);

  const jobs = useMemo(() => tempRecipes
    .filter(isPendingImport)
    .map((r) => ({
      id: r.id,
      label: r.title,
      status: r.importStatus,
      progress: r.importProgress || 0,
      error: r.importError,
      canRestart: Boolean(r.importSource),
    })), [tempRecipes]);

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
        patchJob(job.id, { importStatus: 'processing' });
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

  const dismissJob = useCallback((id) => {
    deleteRecipe(id).catch((error) => {
      console.error('Fehler beim Verwerfen des Import-Jobs:', error);
    });
  }, []);

  // Cancels a queued or actively running job: the temp-recipe doc is
  // removed right away, and if the job is mid-run its eventual result is
  // discarded by processQueue instead of being written back (see
  // cancelledJobsRef above — there's no way to actually abort the
  // in-flight OCR/screenshot call itself).
  const cancelJob = useCallback((id) => {
    cancelledJobsRef.current.add(id);
    deleteRecipe(id).catch((error) => {
      console.error('Fehler beim Abbrechen des Import-Jobs:', error);
    });
  }, []);

  // Restarts a waiting/failed/running job from its persisted importSource —
  // this is what makes a job stuck in 'queued'/'error' (e.g. because the tab
  // that queued it was closed or reloaded, dropping the in-memory queue)
  // worth recovering from, instead of only being dismissable. Restarting a
  // 'processing' job supersedes its current attempt (cancelledJobsRef makes
  // sure the stale result is discarded) and queues a fresh one behind it.
  const restartJob = useCallback((id) => {
    const tempRecipe = tempRecipes.find((r) => r.id === id);
    if (!tempRecipe || !tempRecipe.importSource) return;
    const run = buildRunFromSource(tempRecipe.importSource);
    if (!run) return;

    // Only mark the old attempt cancelled if one is actually still
    // queued/in-flight (queueRef) — e.g. restarting an 'error' job has
    // nothing left in the queue to supersede, and flagging its id here
    // would wrongly cause the freshly-queued attempt below to be discarded
    // by the very first "is this cancelled?" check in processQueue.
    if (queueRef.current.some((job) => job.id === id)) {
      cancelledJobsRef.current.add(id);
    }
    patchJob(id, { importStatus: 'queued', importProgress: 0, importError: deleteField() });
    queueRef.current.push({ id, run, context: {}, userId: tempRecipe.authorId });
    processQueue();
  }, [tempRecipes, patchJob, processQueue]);

  const value = { jobs, reviewRecipes, enqueueImportJob, dismissJob, restartJob, cancelJob };

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

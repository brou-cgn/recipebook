import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { addRecipe as addRecipeToFirestore } from '../utils/recipeFirestore';
import {
  subscribeToImportJobs,
  createImportJob,
  updateImportJob,
  deleteImportJob,
} from '../utils/importJobsFirestore';

const RecipeImportQueueContext = createContext(null);

let jobIdCounter = 0;
function nextJobId() {
  jobIdCounter += 1;
  return `import-${Date.now()}-${jobIdCounter}`;
}

const noopQueue = {
  jobs: [],
  enqueueImportJob: () => undefined,
  dismissJob: () => {},
};

// Progress-only Firestore writes are throttled to this interval so a fast
// OCR/screenshot progress callback (which can fire many times per second)
// doesn't turn into a Firestore write per tick. Status changes (queued →
// processing → error) and the final 100% always write immediately.
const PROGRESS_WRITE_INTERVAL_MS = 1000;

/**
 * Runs recipe-import recognition (web import, AI photo OCR, ...) as a
 * sequential background queue: enqueueImportJob() takes an async `run`
 * function that resolves to a recipe object (no id yet), and once it
 * resolves, the recipe is saved directly to Firestore with isTemp:true.
 * Jobs are processed one at a time (FIFO) so multiple queued imports don't
 * race each other or blow through OCR rate limits.
 *
 * Job status/progress is mirrored to users/{userId}/importJobs so the
 * header's progress indicator shows the same jobs in every open session
 * (tab/device) of the user, not just the one running the import.
 *
 * Pending temp recipes are later surfaced on the "Neues Rezept hinzufügen"
 * page (see subscribeToTempRecipes) for the user to confirm or discard.
 */
export function RecipeImportQueueProvider({ userId, children }) {
  const [jobs, setJobs] = useState([]);
  const queueRef = useRef([]);
  const processingRef = useRef(false);
  const lastProgressWriteRef = useRef({});

  useEffect(() => {
    const unsubscribe = subscribeToImportJobs(userId, setJobs);
    return unsubscribe;
  }, [userId]);

  const patchJob = useCallback((job, patch) => {
    updateImportJob(job.userId, job.id, patch).catch((error) => {
      console.error('Fehler beim Aktualisieren des Import-Jobs:', error);
    });
  }, []);

  const patchProgress = useCallback((job, progress, label) => {
    const clamped = Math.max(0, Math.min(100, Math.round(progress || 0)));
    const now = Date.now();
    const lastWrite = lastProgressWriteRef.current[job.id] || 0;
    if (clamped < 100 && !label && now - lastWrite < PROGRESS_WRITE_INTERVAL_MS) {
      return;
    }
    lastProgressWriteRef.current[job.id] = now;
    patchJob(job, { progress: clamped, ...(label ? { label } : {}) });
  }, [patchJob]);

  const removeJob = useCallback((job) => {
    delete lastProgressWriteRef.current[job.id];
    return deleteImportJob(job.userId, job.id);
  }, []);

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      while (queueRef.current.length > 0) {
        const job = queueRef.current[0];
        patchJob(job, { status: 'processing' });
        try {
          const recipe = await job.run((progress, label) => patchProgress(job, progress, label));
          await addRecipeToFirestore({ ...recipe, ...job.context, isTemp: true }, job.userId);
          await removeJob(job);
        } catch (error) {
          console.error('Hintergrund-Import fehlgeschlagen:', error);
          patchJob(job, { status: 'error', error: error?.message || 'Import fehlgeschlagen' });
        } finally {
          queueRef.current.shift();
        }
      }
    } finally {
      processingRef.current = false;
    }
  }, [patchJob, patchProgress, removeJob]);

  const enqueueImportJob = useCallback(({ label, run, context = {}, userId: jobUserId }) => {
    const id = nextJobId();
    const job = { id, run, context, userId: jobUserId };
    queueRef.current.push(job);
    createImportJob(jobUserId, id, label).catch((error) => {
      console.error('Fehler beim Anlegen des Import-Jobs:', error);
    });
    processQueue();
    return id;
  }, [processQueue]);

  // Jobs in `jobs` always belong to `userId` (that's what they're subscribed
  // by), so dismissal doesn't need to look up the job's own userId field.
  const dismissJob = useCallback((id) => removeJob({ id, userId }), [removeJob, userId]);

  const value = { jobs, enqueueImportJob, dismissJob };

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

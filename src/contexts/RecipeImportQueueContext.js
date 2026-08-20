import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { addRecipe as addRecipeToFirestore } from '../utils/recipeFirestore';

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

/**
 * Runs recipe-import recognition (web import, AI photo OCR, ...) as a
 * sequential background queue: enqueueImportJob() takes an async `run`
 * function that resolves to a recipe object (no id yet), and once it
 * resolves, the recipe is saved directly to Firestore with isTemp:true.
 * Jobs are processed one at a time (FIFO) so multiple queued imports don't
 * race each other or blow through OCR rate limits.
 *
 * Pending temp recipes are later surfaced on the "Neues Rezept hinzufügen"
 * page (see subscribeToTempRecipes) for the user to confirm or discard.
 */
export function RecipeImportQueueProvider({ children }) {
  const [jobs, setJobs] = useState([]);
  const queueRef = useRef([]);
  const processingRef = useRef(false);

  const patchJob = useCallback((id, patch) => {
    setJobs((prev) => prev.map((job) => (job.id === id ? { ...job, ...patch } : job)));
  }, []);

  const removeJob = useCallback((id) => {
    setJobs((prev) => prev.filter((job) => job.id !== id));
  }, []);

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      while (queueRef.current.length > 0) {
        const job = queueRef.current[0];
        patchJob(job.id, { status: 'processing' });
        try {
          const recipe = await job.run((progress, label) => {
            patchJob(job.id, {
              progress: Math.max(0, Math.min(100, Math.round(progress || 0))),
              ...(label ? { label } : {}),
            });
          });
          await addRecipeToFirestore({ ...recipe, ...job.context, isTemp: true }, job.userId);
          removeJob(job.id);
        } catch (error) {
          console.error('Hintergrund-Import fehlgeschlagen:', error);
          patchJob(job.id, { status: 'error', error: error?.message || 'Import fehlgeschlagen' });
        } finally {
          queueRef.current.shift();
        }
      }
    } finally {
      processingRef.current = false;
    }
  }, [patchJob, removeJob]);

  const enqueueImportJob = useCallback(({ label, run, context = {}, userId }) => {
    const id = nextJobId();
    queueRef.current.push({ id, run, context, userId });
    setJobs((prev) => [...prev, { id, label, status: 'queued', progress: 0 }]);
    processQueue();
    return id;
  }, [processQueue]);

  const value = { jobs, enqueueImportJob, dismissJob: removeJob };

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

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import {
  NUTRITION_REFERENCE_FIELDS,
  NUTRITION_SOURCE_SUFFIX,
  NUTRITION_SOURCE_PRIORITY,
  parseNutritionReferenceBooleanFields,
  parseNutritionReferencePossibleUnits,
  parseNutritionReferenceStatus,
  parseNutritionReferenceValues,
  parseNutritionReferenceFallbackWeight,
  parseNutritionReferenceSynonyms,
} from '../utils/nutritionReferenceUtils';

const NutritionReferenceContext = createContext(null);
export const NUTRITION_REF_CACHE_KEY = 'nutrition_reference_cache';
export const NUTRITION_REF_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export function loadCachedRows() {
  try {
    const raw = localStorage.getItem(NUTRITION_REF_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.rows)) return null;
    if (typeof parsed.cachedAt !== 'number') return null;
    const lastUpdatedAt = typeof parsed.lastUpdatedAt === 'number' ? parsed.lastUpdatedAt : null;
    return { rows: parsed.rows, cachedAt: parsed.cachedAt, lastUpdatedAt };
  } catch {
    return null;
  }
}

export function saveCachedRows(rows, lastUpdatedAt) {
  try {
    localStorage.setItem(
      NUTRITION_REF_CACHE_KEY,
      JSON.stringify({
        rows: Array.isArray(rows) ? rows : [],
        cachedAt: Date.now(),
        lastUpdatedAt: typeof lastUpdatedAt === 'number' ? lastUpdatedAt : null,
      })
    );
  } catch {
    // ignore storage errors
  }
}

export function clearNutritionReferenceCache() {
  try {
    localStorage.removeItem(NUTRITION_REF_CACHE_KEY);
  } catch {
    // ignore storage errors
  }
}

function mapNutritionReferenceRows(snapshot) {
  return snapshot.docs
    .map((entry) => {
      const data = entry.data() || {};
      const fallbackWeight = parseNutritionReferenceFallbackWeight(data);
      const ingredientID = String(data.ingredientID || entry.id || '').trim();
      const synonyms = parseNutritionReferenceSynonyms(data);
      const displayName = String(data.displayName || data.Anzeigename || data.name || '').trim();

      // Read source-specific nutrition fields that are already stored in Firestore.
      const sourceSpecificFields = {};
      for (const src of Object.keys(NUTRITION_SOURCE_SUFFIX)) {
        const suffix = NUTRITION_SOURCE_SUFFIX[src];
        for (const field of NUTRITION_REFERENCE_FIELDS) {
          const fname = `${field}${suffix}`;
          const raw = data[fname];
          if (raw === '' || raw == null) continue;
          const numeric = Number(raw);
          if (Number.isFinite(numeric) && numeric >= 0) {
            sourceSpecificFields[fname] = numeric;
          }
        }
      }

      // Lazy migration: if no source-specific fields exist yet but the document
      // has flat nutrition values and a known source, populate in-memory so the
      // UI shows the correct sub-cell without requiring an explicit save first.
      const hasAnySourceSpecific = Object.keys(sourceSpecificFields).length > 0;
      if (!hasAnySourceSpecific) {
        const src = data.source || '';
        const suffix = NUTRITION_SOURCE_SUFFIX[src];
        if (suffix) {
          for (const field of NUTRITION_REFERENCE_FIELDS) {
            const raw = data[field];
            if (raw === '' || raw == null) continue;
            const numeric = Number(raw);
            if (Number.isFinite(numeric) && numeric >= 0) {
              sourceSpecificFields[`${field}${suffix}`] = numeric;
            }
          }
        }
      }

      return {
        id: entry.id,
        ingredientID,
        displayName,
        nutritionFamily: data.nutritionFamily || data.family || '',
        seasonalFamily: data.seasonalFamily || '',
        category: data.category || '',
        status: parseNutritionReferenceStatus(data),
        approvedAt: data.approvedAt ?? null,
        source: data.source || '',
        searchTerm: data.searchTerm || '',
        AI_Gemini_Error: data.AI_Gemini_Error || '',
        nutritionSetActual: Array.isArray(data.nutritionSetActual) ? data.nutritionSetActual : [],
        nutritionSetOutdated: Array.isArray(data.nutritionSetOutdated) ? data.nutritionSetOutdated : [],
        recalc: typeof data.recalc === 'boolean' ? data.recalc : false,
        ...parseNutritionReferenceBooleanFields(data),
        synonyms,
        possibleUnits: parseNutritionReferencePossibleUnits(data),
        name: displayName || synonyms[0] || data.name || '',
        ...(fallbackWeight != null ? { defaultAmountG: fallbackWeight } : {}),
        ...parseNutritionReferenceValues(data),
        ...sourceSpecificFields,
      };
    })
    .sort((a, b) => (a.ingredientID || '').localeCompare(b.ingredientID || '', 'de', { sensitivity: 'base' }));
}

async function fetchNutritionReferenceRows() {
  const snapshot = await getDocs(collection(db, 'nutritionReferences'));
  return mapNutritionReferenceRows(snapshot);
}

async function fetchNutritionReferenceLastUpdatedAt() {
  try {
    const snap = await getDoc(doc(db, 'appConfig', 'nutritionReferences'));
    if (snap.exists()) {
      const ts = snap.data()?.lastUpdatedAt;
      return ts?.toMillis ? ts.toMillis() : (typeof ts === 'number' ? ts : null);
    }
  } catch { /* ignore */ }
  return null;
}

export function NutritionReferenceProvider({ children, enabled = true }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  const reload = useCallback(async ({ throwOnError = false } = {}) => {
    if (!enabled) {
      setRows([]);
      setLoading(false);
      return [];
    }

    clearNutritionReferenceCache();
    setLoading(true);
    try {
      const [loaded, updatedAt] = await Promise.all([
        fetchNutritionReferenceRows(),
        fetchNutritionReferenceLastUpdatedAt(),
      ]);
      setRows(loaded);
      setLastUpdatedAt(updatedAt);
      saveCachedRows(loaded, updatedAt);
      return loaded;
    } catch (error) {
      console.error('Fehler beim Laden der Nährwert-Referenzen:', error);
      setRows([]);
      if (throwOnError) {
        throw error;
      }
      return [];
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    let isMounted = true;

    if (!enabled) {
      setRows([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);

    const run = async () => {
      try {
        const updatedAt = await fetchNutritionReferenceLastUpdatedAt();
        const cached = loadCachedRows();
        const cachedLastUpdatedAt = cached?.lastUpdatedAt;
        const cacheIsFresh = cached && (Date.now() - cached.cachedAt) < NUTRITION_REF_CACHE_TTL_MS;
        const cacheIsCurrent = updatedAt === null
          || (typeof cachedLastUpdatedAt === 'number' && cachedLastUpdatedAt >= updatedAt);
        if (cacheIsFresh && cacheIsCurrent) {
          if (isMounted) {
            setRows(cached.rows);
            setLastUpdatedAt(updatedAt);
          }
          return;
        }

        const loaded = await fetchNutritionReferenceRows();
        saveCachedRows(loaded, updatedAt);
        if (isMounted) {
          setRows(loaded);
          setLastUpdatedAt(updatedAt);
        }
      } catch (error) {
        console.error('Fehler beim Laden der Nährwert-Referenzen:', error);
        if (isMounted) {
          setRows([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    run();

    return () => {
      isMounted = false;
    };
  }, [enabled]);

  const value = useMemo(
    () => ({
      rows,
      loading,
      reload,
      lastUpdatedAt,
    }),
    [rows, loading, reload, lastUpdatedAt]
  );

  return <NutritionReferenceContext.Provider value={value}>{children}</NutritionReferenceContext.Provider>;
}

export function useNutritionReference() {
  const context = useContext(NutritionReferenceContext);

  if (!context) {
    throw new Error('useNutritionReference muss innerhalb eines NutritionReferenceProvider verwendet werden.');
  }

  return context;
}

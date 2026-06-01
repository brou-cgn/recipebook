import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import {
  parseNutritionReferenceBooleanFields,
  parseNutritionReferencePossibleUnits,
  parseNutritionReferenceValues,
  parseNutritionReferenceFallbackWeight,
  parseNutritionReferenceSynonyms,
} from '../utils/nutritionReferenceUtils';

const NutritionReferenceContext = createContext(null);

function mapNutritionReferenceRows(snapshot) {
  return snapshot.docs
    .map((entry) => {
      const data = entry.data() || {};
      const fallbackWeight = parseNutritionReferenceFallbackWeight(data);
      const ingredientID = String(data.ingredientID || entry.id || '').trim();
      const synonyms = parseNutritionReferenceSynonyms(data);
      return {
        id: entry.id,
        ingredientID,
        nutritionFamily: data.nutritionFamily || data.family || '',
        seasonalFamily: data.seasonalFamily || '',
        category: data.category || '',
        source: data.source || '',
        searchTerm: data.searchTerm || '',
        AI_Gemini_Error: data.AI_Gemini_Error || '',
        ...parseNutritionReferenceBooleanFields(data),
        synonyms,
        possibleUnits: parseNutritionReferencePossibleUnits(data),
        name: synonyms[0] || data.name || '',
        ...(fallbackWeight != null ? { defaultAmountG: fallbackWeight } : {}),
        ...parseNutritionReferenceValues(data),
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

  const reload = useCallback(async () => {
    if (!enabled) {
      setRows([]);
      setLoading(false);
      return [];
    }

    setLoading(true);
    try {
      const [loaded, updatedAt] = await Promise.all([
        fetchNutritionReferenceRows(),
        fetchNutritionReferenceLastUpdatedAt(),
      ]);
      setRows(loaded);
      setLastUpdatedAt(updatedAt);
      return loaded;
    } catch (error) {
      console.error('Fehler beim Laden der Nährwert-Referenzen:', error);
      setRows([]);
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
        const [loaded, updatedAt] = await Promise.all([
          fetchNutritionReferenceRows(),
          fetchNutritionReferenceLastUpdatedAt(),
        ]);
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

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { parseNutritionReferenceValues } from '../utils/nutritionReferenceUtils';

const NutritionReferenceContext = createContext(null);

function mapNutritionReferenceRows(snapshot) {
  return snapshot.docs
    .map((entry) => {
      const data = entry.data() || {};
      return {
        id: entry.id,
        name: data.name || '',
        ...parseNutritionReferenceValues(data),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }));
}

async function fetchNutritionReferenceRows() {
  const snapshot = await getDocs(collection(db, 'nutritionReferences'));
  return mapNutritionReferenceRows(snapshot);
}

export function NutritionReferenceProvider({ children, enabled = true }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(enabled);

  const reload = useCallback(async () => {
    if (!enabled) {
      setRows([]);
      setLoading(false);
      return [];
    }

    setLoading(true);
    try {
      const loaded = await fetchNutritionReferenceRows();
      setRows(loaded);
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
        const loaded = await fetchNutritionReferenceRows();
        if (isMounted) {
          setRows(loaded);
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
    }),
    [rows, loading, reload]
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

import React, { useEffect, useState } from 'react';
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { ROLES } from '../utils/userManagement';
import { useNutritionReference } from '../contexts/NutritionReferenceContext';
import {
  NUTRITION_REFERENCE_FIELDS,
  normalizeNutritionReferenceId,
  parseNutritionReferenceValues,
  parseNutritionReferenceFallbackWeight,
} from '../utils/nutritionReferenceUtils';

const NUTRITION_FIELD_LABELS = {
  kalorien: 'Kalorien (kcal)',
  protein: 'Protein (g)',
  fett: 'Fett (g)',
  kohlenhydrate: 'Kohlenhydrate (g)',
  zucker: 'Zucker (g)',
  ballaststoffe: 'Ballaststoffe (g)',
  salz: 'Salz (g)',
};

const OPEN_FOOD_FACTS_SEARCH_URL = 'https://world.openfoodfacts.org/cgi/search.pl';

async function loadNutritionReferenceFromOpenFoodFacts(name) {
  const response = await fetch(
    `${OPEN_FOOD_FACTS_SEARCH_URL}?search_terms=${encodeURIComponent(name)}&action=process&json=1&page_size=5`
  );

  if (!response.ok) {
    throw new Error(`OpenFoodFacts-Fehler (HTTP ${response.status})`);
  }

  const data = await response.json();
  const product = (data.products || []).find((entry) => {
    const nutriments = entry?.nutriments || {};
    return nutriments['energy-kcal_100g'] != null || nutriments['energy-kcal'] != null;
  });

  if (!product) {
    throw new Error('Keine Nährwertdaten bei OpenFoodFacts gefunden.');
  }

  const nutriments = product.nutriments || {};
  const values = parseNutritionReferenceValues({
    kalorien: nutriments['energy-kcal_100g'] ?? nutriments['energy-kcal'],
    protein: nutriments['proteins_100g'] ?? nutriments.proteins,
    fett: nutriments['fat_100g'] ?? nutriments.fat,
    kohlenhydrate: nutriments['carbohydrates_100g'] ?? nutriments.carbohydrates,
    zucker: nutriments['sugars_100g'] ?? nutriments.sugars,
    ballaststoffe: nutriments['fiber_100g'] ?? nutriments.fiber,
    salz: nutriments['salt_100g'] ?? nutriments.salt,
  });

  if (Object.keys(values).length === 0) {
    throw new Error('Keine Nährwertdaten bei OpenFoodFacts gefunden.');
  }

  return {
    productName: product.product_name || name,
    values,
  };
}

function NutritionReferenceTab({ currentUser }) {
  const canManage = currentUser?.role === ROLES.ADMIN || currentUser?.role === ROLES.MODERATOR;
  const { rows: cachedRows, loading, reload } = useNutritionReference();
  const [rows, setRows] = useState([]);
  const [newName, setNewName] = useState('');
  const [newValues, setNewValues] = useState({});
  const [newDefaultAmountG, setNewDefaultAmountG] = useState('');
  const [refreshingRowId, setRefreshingRowId] = useState(null);
  const [lookupError, setLookupError] = useState('');

  useEffect(() => {
    setRows(cachedRows);
  }, [cachedRows]);

  const updateCell = (id, field, value) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const saveRow = async (row) => {
    const name = String(row.name || '').trim();
    const id = normalizeNutritionReferenceId(name || row.id);
    if (!name || !id) {
      alert('Bitte einen gültigen Zutatennamen eingeben.');
      return;
    }

    const payload = {
      name,
      ...parseNutritionReferenceValues(row),
      updatedAt: serverTimestamp(),
      updatedBy: currentUser?.id || null,
      source: 'manual',
    };
    const fallbackWeight = parseNutritionReferenceFallbackWeight(row);
    if (fallbackWeight != null) {
      payload.defaultAmountG = fallbackWeight;
    }
    await setDoc(doc(db, 'nutritionReferences', id), payload, { merge: true });
    if (row.id !== id) {
      await deleteDoc(doc(db, 'nutritionReferences', row.id));
    }
    await reload();
  };

  const addRow = async () => {
    const name = newName.trim();
    const id = normalizeNutritionReferenceId(name);
    if (!name || !id) {
      alert('Bitte einen gültigen Zutatennamen eingeben.');
      return;
    }
    if (rows.some((row) => normalizeNutritionReferenceId(row.name || row.id) === id)) {
      return;
    }
    const addPayload = {
      name,
      ...parseNutritionReferenceValues(newValues),
      updatedAt: serverTimestamp(),
      updatedBy: currentUser?.id || null,
      source: 'manual',
    };
    const newFallbackWeight = parseNutritionReferenceFallbackWeight({ defaultAmountG: newDefaultAmountG });
    if (newFallbackWeight != null) {
      addPayload.defaultAmountG = newFallbackWeight;
    }
    await setDoc(
      doc(db, 'nutritionReferences', id),
      addPayload,
      { merge: true }
    );
    setNewName('');
    setNewValues({});
    setNewDefaultAmountG('');
    await reload();
  };

  const removeRow = async (id) => {
    await deleteDoc(doc(db, 'nutritionReferences', id));
    await reload();
  };

  const refreshRowFromOpenFoodFacts = async (row) => {
    const name = String(row.name || '').trim();
    if (!name) {
      setLookupError('Bitte einen gültigen Zutatennamen eingeben.');
      return;
    }

    setLookupError('');
    setRefreshingRowId(row.id);

    try {
      const { productName, values } = await loadNutritionReferenceFromOpenFoodFacts(name);
      await setDoc(
        doc(db, 'nutritionReferences', row.id),
        {
          name,
          product: productName,
          ...values,
          source: 'openfoodfacts',
          updatedAt: serverTimestamp(),
          updatedBy: currentUser?.id || null,
        },
        { merge: false }
      );
      await reload();
    } catch (error) {
      setLookupError(error?.message || 'OpenFoodFacts-Abruf fehlgeschlagen.');
    } finally {
      setRefreshingRowId(null);
    }
  };

  if (!canManage) {
    return (
      <div className="settings-section">
        <h3>Nährwerte je 100 g</h3>
        <p className="section-description">Nur Admins und Moderatoren können diese Tabelle bearbeiten.</p>
      </div>
    );
  }

  return (
    <div className="settings-section">
      <h3>Nährwerte je 100 g</h3>
      <p className="section-description">
        Diese Werte werden bei der automatischen Nährwert-Berechnung pro 100 g gespeichert und können hier korrigiert werden.
      </p>
      {lookupError && <p className="section-description">{lookupError}</p>}

      {loading ? (
        <p>Lade Nährwerte...</p>
      ) : (
        <div className="conversion-table-container">
          <table className="conversion-table">
            <thead>
              <tr>
                <th>Zutat</th>
                <th>Fallbackgew. (g)</th>
                {NUTRITION_REFERENCE_FIELDS.map((field) => (
                  <th key={field}>{NUTRITION_FIELD_LABELS[field]}</th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <input
                      type="text"
                      value={row.name || ''}
                      onChange={(e) => updateCell(row.id, 'name', e.target.value)}
                      className="conversion-table-input"
                      aria-label={`Zutat ${row.id}`}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={row.defaultAmountG ?? ''}
                      onChange={(e) => updateCell(row.id, 'defaultAmountG', e.target.value)}
                      className="conversion-table-input"
                      aria-label={`Fallbackgewicht ${row.id}`}
                    />
                  </td>
                  {NUTRITION_REFERENCE_FIELDS.map((field) => (
                    <td key={field}>
                      <input
                        type="number"
                        min="0"
                        step={field === 'kalorien' ? '1' : '0.1'}
                        value={row[field] ?? ''}
                        onChange={(e) => updateCell(row.id, field, e.target.value)}
                        className="conversion-table-input"
                        aria-label={`${NUTRITION_FIELD_LABELS[field]} ${row.id}`}
                      />
                    </td>
                  ))}
                  <td className="conversion-table-actions">
                    <button className="add-btn" onClick={() => saveRow(row)}>Speichern</button>
                    <button
                      className="add-btn"
                      onClick={() => refreshRowFromOpenFoodFacts(row)}
                      disabled={refreshingRowId === row.id}
                    >
                      {refreshingRowId === row.id ? '⏳' : '🔍 OpenFoodFacts'}
                    </button>
                    <button className="remove-btn" onClick={() => removeRow(row.id)} title="Entfernen">×</button>
                  </td>
                </tr>
              ))}
              <tr className="conversion-table-new-row">
                <td>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Neue Zutat..."
                    className="conversion-table-input"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={newDefaultAmountG}
                    onChange={(e) => setNewDefaultAmountG(e.target.value)}
                    className="conversion-table-input"
                    placeholder="z.B. 2"
                  />
                </td>
                {NUTRITION_REFERENCE_FIELDS.map((field) => (
                  <td key={field}>
                    <input
                      type="number"
                      min="0"
                      step={field === 'kalorien' ? '1' : '0.1'}
                      value={newValues[field] ?? ''}
                      onChange={(e) => setNewValues((prev) => ({ ...prev, [field]: e.target.value }))}
                      className="conversion-table-input"
                    />
                  </td>
                ))}
                <td>
                  <button className="add-btn" onClick={addRow}>Hinzufügen</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default NutritionReferenceTab;

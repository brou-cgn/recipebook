import React, { useCallback, useEffect, useState } from 'react';
import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { ROLES } from '../utils/userManagement';
import {
  NUTRITION_REFERENCE_FIELDS,
  normalizeNutritionReferenceId,
  parseNutritionReferenceValues,
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

function NutritionReferenceTab({ currentUser }) {
  const canManage = currentUser?.role === ROLES.ADMIN || currentUser?.role === ROLES.MODERATOR;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newValues, setNewValues] = useState({});

  const loadRows = useCallback(async () => {
    const snapshot = await getDocs(collection(db, 'nutritionReferences'));
    const loaded = snapshot.docs
      .map((entry) => {
        const data = entry.data() || {};
        return {
          id: entry.id,
          name: data.name || '',
          ...parseNutritionReferenceValues(data),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }));
    setRows(loaded);
  }, []);

  useEffect(() => {
    if (!canManage) {
      setLoading(false);
      return undefined;
    }
    const run = async () => {
      try {
        await loadRows();
      } finally {
        setLoading(false);
      }
    };
    run();
    return undefined;
  }, [canManage, loadRows]);

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
    await setDoc(doc(db, 'nutritionReferences', id), payload, { merge: true });
    if (row.id !== id) {
      await deleteDoc(doc(db, 'nutritionReferences', row.id));
    }
    await loadRows();
  };

  const addRow = async () => {
    const name = newName.trim();
    const id = normalizeNutritionReferenceId(name);
    if (!name || !id) {
      alert('Bitte einen gültigen Zutatennamen eingeben.');
      return;
    }
    await setDoc(
      doc(db, 'nutritionReferences', id),
      {
        name,
        ...parseNutritionReferenceValues(newValues),
        updatedAt: serverTimestamp(),
        updatedBy: currentUser?.id || null,
        source: 'manual',
      },
      { merge: true }
    );
    setNewName('');
    setNewValues({});
    await loadRows();
  };

  const removeRow = async (id) => {
    await deleteDoc(doc(db, 'nutritionReferences', id));
    await loadRows();
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

      {loading ? (
        <p>Lade Nährwerte...</p>
      ) : (
        <div className="conversion-table-container">
          <table className="conversion-table">
            <thead>
              <tr>
                <th>Zutat</th>
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

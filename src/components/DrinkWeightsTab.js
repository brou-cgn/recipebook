import React, { useEffect, useMemo, useState } from 'react';
import './DrinkWeightsTab.css';
import {
  subscribeToDrinkWeights,
  subscribeToChildrenDrinkWeights,
  setDrinkWeightEntry,
  setChildrenDrinkWeightEntry
} from '../utils/drinkWeightsFirestore';
import { DEFAULT_DRINK_WEIGHTS, DEFAULT_CHILDREN_DRINK_WEIGHTS, DRINK_WEIGHT_CATEGORY_ORDER } from '../utils/drinkWeightsDefaults';
import { getDrinkCategoryLabel } from '../utils/drinkCategories';
import { canManageDrinkWeights } from '../utils/userManagement';

const NUMBER_FIELDS = ['basis', 'winter', 'sommer', 'nachmittag'];

const createFormData = (row) => ({
  basis: row.basis,
  winter: row.winter,
  sommer: row.sommer,
  nachmittag: row.nachmittag
});

const formatGermanDate = (timestamp) => {
  if (!timestamp) return '—';
  const date = typeof timestamp?.toDate === 'function' ? timestamp.toDate() : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

const resolveUpdatedBy = (currentUser) => {
  if (!currentUser) return undefined;
  const fullName = [currentUser.vorname, currentUser.nachname].filter(Boolean).join(' ').trim();
  return fullName || currentUser.email || currentUser.id || undefined;
};

const buildRows = (defaults, overrides) =>
  DRINK_WEIGHT_CATEGORY_ORDER.map((id) => ({
    id,
    ...defaults[id],
    ...(overrides[id] || {})
  }));

function DrinkWeightMatrixTable({ title, description, rows, defaults, onSave, currentUser }) {
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const basisSum = useMemo(() => rows.reduce((sum, row) => sum + (Number(row.basis) || 0), 0), [rows]);

  const handleEdit = (row) => {
    setEditingId(row.id);
    setFormData(createFormData(row));
    setErrorMessage('');
  };

  const resetEditing = () => {
    setEditingId(null);
    setFormData({});
    setErrorMessage('');
  };

  const handleResetToDefault = async (categoryId) => {
    if (!window.confirm(`"${getDrinkCategoryLabel(categoryId)}" wirklich auf den Standardwert zurücksetzen?`)) return;
    setErrorMessage('');
    try {
      await onSave(categoryId, defaults[categoryId], resolveUpdatedBy(currentUser));
      if (editingId === categoryId) resetEditing();
    } catch (error) {
      setErrorMessage(`Fehler beim Zurücksetzen: ${error.message}`);
    }
  };

  const validate = () => {
    for (const field of NUMBER_FIELDS) {
      if (!Number.isFinite(Number(formData[field]))) {
        return `Bitte einen gültigen Wert für "${field}" eingeben.`;
      }
    }
    if (Number(formData.basis) < 0) return 'Das Basis-Gewicht darf nicht negativ sein.';
    return '';
  };

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setIsSaving(true);
    setErrorMessage('');

    const payload = {
      basis: Number(formData.basis),
      winter: Number(formData.winter),
      sommer: Number(formData.sommer),
      nachmittag: Number(formData.nachmittag)
    };

    try {
      await onSave(editingId, payload, resolveUpdatedBy(currentUser));
      resetEditing();
    } catch (error) {
      setErrorMessage(`Fehler beim Speichern: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="drink-weights-section">
      <div className="drink-weights-section-header">
        <h3>{title}</h3>
        <p className="section-description">{description}</p>
        <span className="drink-weights-basis-sum" title="Die Basis-Gewichte aller Kategorien sollten in Summe ~1,0 ergeben.">
          Summe Basis-Gewichte: {basisSum.toFixed(3)}
        </span>
      </div>

      {errorMessage && <div className="message error">{errorMessage}</div>}

      <div className="drink-weights-table-container">
        <table className="drink-weights-table">
          <thead>
            <tr>
              <th>Kategorie</th>
              <th>Basis</th>
              <th>Winter Δ</th>
              <th>Sommer Δ</th>
              <th>Nachmittag Δ</th>
              <th>Letzte Änderung</th>
              <th>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isEditing = editingId === row.id;
              const parentLabel = row.parent ? getDrinkCategoryLabel(row.parent) : null;
              return (
                <tr key={row.id}>
                  <td>
                    {getDrinkCategoryLabel(row.id)}
                    {parentLabel && <span className="drink-weights-parent-hint"> (Unterkategorie von {parentLabel})</span>}
                  </td>
                  <td>
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.001"
                        className="drink-weights-inline-input"
                        aria-label={`Basis für ${row.id}`}
                        value={formData.basis}
                        onChange={(event) => setFormData((prev) => ({ ...prev, basis: event.target.value }))}
                      />
                    ) : row.basis}
                  </td>
                  <td>
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.001"
                        className="drink-weights-inline-input"
                        aria-label={`Winter-Delta für ${row.id}`}
                        value={formData.winter}
                        onChange={(event) => setFormData((prev) => ({ ...prev, winter: event.target.value }))}
                      />
                    ) : row.winter}
                  </td>
                  <td>
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.001"
                        className="drink-weights-inline-input"
                        aria-label={`Sommer-Delta für ${row.id}`}
                        value={formData.sommer}
                        onChange={(event) => setFormData((prev) => ({ ...prev, sommer: event.target.value }))}
                      />
                    ) : row.sommer}
                  </td>
                  <td>
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.001"
                        className="drink-weights-inline-input"
                        aria-label={`Nachmittag-Delta für ${row.id}`}
                        value={formData.nachmittag}
                        onChange={(event) => setFormData((prev) => ({ ...prev, nachmittag: event.target.value }))}
                      />
                    ) : row.nachmittag}
                  </td>
                  <td>{formatGermanDate(row.updatedAt)}</td>
                  <td>
                    <div className="drink-weights-actions">
                      {isEditing ? (
                        <>
                          <button type="button" className="drink-weights-edit-btn" onClick={handleSave} disabled={isSaving}>
                            {isSaving ? 'Speichern...' : 'Speichern'}
                          </button>
                          <button type="button" className="drink-weights-delete-btn" onClick={resetEditing}>
                            Abbrechen
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="drink-weights-edit-btn" onClick={() => handleEdit(row)}>
                            Bearbeiten
                          </button>
                          <button type="button" className="drink-weights-delete-btn" onClick={() => handleResetToDefault(row.id)}>
                            Zurücksetzen
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DrinkWeightsTab({ currentUser }) {
  const hasAccess = canManageDrinkWeights(currentUser);
  const [adultsOverrides, setAdultsOverrides] = useState({});
  const [childrenOverrides, setChildrenOverrides] = useState({});

  useEffect(() => {
    if (!hasAccess) return undefined;
    const unsubscribeAdults = subscribeToDrinkWeights(setAdultsOverrides);
    const unsubscribeChildren = subscribeToChildrenDrinkWeights(setChildrenOverrides);
    return () => {
      unsubscribeAdults();
      unsubscribeChildren();
    };
  }, [hasAccess]);

  const adultsRows = useMemo(() => buildRows(DEFAULT_DRINK_WEIGHTS, adultsOverrides), [adultsOverrides]);
  const childrenRows = useMemo(() => buildRows(DEFAULT_CHILDREN_DRINK_WEIGHTS, childrenOverrides), [childrenOverrides]);

  if (!hasAccess) {
    return (
      <div className="settings-section drink-weights-tab">
        <h3>Getränkegewichtung</h3>
        <div className="message error">
          Nur Moderatoren und Administratoren können die Getränkegewichtung bearbeiten.
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="settings-tab-header">
        <h2>Getränkegewichtung</h2>
      </div>
      <div className="settings-section drink-weights-tab">
        <p className="section-description">
          Steuert, wie sich der Getränkebedarf eines Events auf die einzelnen Kategorien verteilt
          (siehe Getränkekalkulation). Änderungen wirken sich auf alle künftigen Berechnungen aus.
        </p>

        <DrinkWeightMatrixTable
          title="Erwachsene"
          description="Basis-Gewichte und saisonale Anpassungen je Kategorie."
          rows={adultsRows}
          defaults={DEFAULT_DRINK_WEIGHTS}
          onSave={setDrinkWeightEntry}
          currentUser={currentUser}
        />

        <DrinkWeightMatrixTable
          title="Kinder"
          description="Basis-Gewichte und saisonale Anpassungen für den Kinderanteil des Getränkebedarfs. Alkoholische Kategorien bleiben bei 0."
          rows={childrenRows}
          defaults={DEFAULT_CHILDREN_DRINK_WEIGHTS}
          onSave={setChildrenDrinkWeightEntry}
          currentUser={currentUser}
        />
      </div>
    </>
  );
}

export default DrinkWeightsTab;

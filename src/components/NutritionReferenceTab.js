import React, { useEffect, useRef, useState } from 'react';
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { ROLES } from '../utils/userManagement';
import { useNutritionReference } from '../contexts/NutritionReferenceContext';
import {
  NUTRITION_REFERENCE_FIELDS,
  normalizeNutritionReferenceId,
  parseNutritionReferenceValues,
  parseNutritionReferenceFallbackWeight,
  parseNutritionReferenceSynonyms,
  getNormalizedNutritionReferenceSynonyms,
} from '../utils/nutritionReferenceUtils';
import {
  createNutritionReferenceCsv,
  parseNutritionReferenceCsv,
} from '../utils/nutritionReferenceImportExport';

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

const getRecipeIngredientTexts = (recipe = {}) => {
  const rawIngredients = recipe.ingredients || recipe.zutaten || [];
  return rawIngredients
    .filter((item) => typeof item === 'string' || (item && item.type === 'ingredient'))
    .map((item) => (typeof item === 'string' ? item : item.text || ''))
    .filter(Boolean);
};

const extractIngredientName = (ingredientText) => String(ingredientText || '')
  .replace(/^#recipe:[^\s]+\s*/i, '')
  .replace(/^(\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?)\s*[a-zA-ZäöüÄÖÜßµ%]+\.?\s+/u, '')
  .replace(/^(\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?)\s+/u, '')
  .trim();

function NutritionReferenceTab({ currentUser, allRecipes = [] }) {
  const canManage = currentUser?.role === ROLES.ADMIN || currentUser?.role === ROLES.MODERATOR;
  const { rows: cachedRows, loading, reload } = useNutritionReference();
  const [rows, setRows] = useState([]);
  const [newIngredientID, setNewIngredientID] = useState('');
  const [newFamily, setNewFamily] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newSynonyms, setNewSynonyms] = useState('');
  const [newValues, setNewValues] = useState({});
  const [newDefaultAmountG, setNewDefaultAmountG] = useState('');
  const [refreshingRowId, setRefreshingRowId] = useState(null);
  const [lookupError, setLookupError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const importInputRef = useRef(null);

  useEffect(() => {
    setRows(cachedRows);
  }, [cachedRows]);

  const updateCell = (id, field, value) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const getIngredientID = (row) => String(row.ingredientID || row.id || '').trim();

  const buildPayload = (row, source = 'manual') => {
    const ingredientID = getIngredientID(row);
    const synonyms = parseNutritionReferenceSynonyms(row);
    const payload = {
      ingredientID,
      synonyms,
      normalizedSynonyms: getNormalizedNutritionReferenceSynonyms({ synonyms }),
      name: synonyms[0] || '',
      ...parseNutritionReferenceValues(row),
      updatedAt: serverTimestamp(),
      updatedBy: currentUser?.id || null,
      source,
    };
    const fallbackWeight = parseNutritionReferenceFallbackWeight(row);
    if (fallbackWeight != null) {
      payload.defaultAmountG = fallbackWeight;
    }
    const family = String(row.family || '').trim();
    const category = String(row.category || '').trim();
    if (family) payload.family = family;
    if (category) payload.category = category;
    return payload;
  };

  const hasIngredientIDConflict = (ingredientID, ownRowId = null) => rows.some((row) => (
    row.id !== ownRowId && getIngredientID(row).toLowerCase() === ingredientID.toLowerCase()
  ));

  const saveRow = async (row) => {
    const ingredientID = getIngredientID(row);
    const synonyms = parseNutritionReferenceSynonyms(row);
    if (!ingredientID) {
      alert('Bitte eine eindeutige ingredientID eingeben.');
      return;
    }
    if (synonyms.length === 0) {
      alert('Bitte mindestens ein Synonym eingeben.');
      return;
    }
    if (hasIngredientIDConflict(ingredientID, row.id)) {
      alert('Diese ingredientID existiert bereits.');
      return;
    }

    await setDoc(doc(db, 'nutritionReferences', ingredientID), buildPayload(row), { merge: true });
    if (row.id !== ingredientID) {
      await deleteDoc(doc(db, 'nutritionReferences', row.id));
    }
    await reload();
    setActionMessage(`Eintrag ${ingredientID} gespeichert.`);
  };

  const addRow = async () => {
    const ingredientID = newIngredientID.trim();
    const synonyms = parseNutritionReferenceSynonyms({ synonyms: newSynonyms });
    if (!ingredientID) {
      alert('Bitte eine eindeutige ingredientID eingeben.');
      return;
    }
    if (synonyms.length === 0) {
      alert('Bitte mindestens ein Synonym eingeben.');
      return;
    }
    if (hasIngredientIDConflict(ingredientID)) {
      alert('Diese ingredientID existiert bereits.');
      return;
    }

    await setDoc(
      doc(db, 'nutritionReferences', ingredientID),
      buildPayload({
        ingredientID,
        family: newFamily,
        category: newCategory,
        synonyms,
        defaultAmountG: newDefaultAmountG,
        ...newValues,
      }),
      { merge: true }
    );
    setNewIngredientID('');
    setNewFamily('');
    setNewCategory('');
    setNewSynonyms('');
    setNewValues({});
    setNewDefaultAmountG('');
    await reload();
    setActionMessage(`Eintrag ${ingredientID} hinzugefügt.`);
  };

  const removeRow = async (id) => {
    await deleteDoc(doc(db, 'nutritionReferences', id));
    await reload();
  };

  const removeAllRows = async () => {
    if (!window.confirm('Alle Nährwert-Einträge wirklich löschen?')) return;
    await Promise.all(rows.map((row) => deleteDoc(doc(db, 'nutritionReferences', row.id))));
    await reload();
    setActionMessage('Alle Einträge wurden gelöscht.');
  };

  const refreshRowFromOpenFoodFacts = async (row) => {
    const synonyms = parseNutritionReferenceSynonyms(row);
    const searchName = String(synonyms[0] || '').trim();
    if (!searchName) {
      setLookupError('Bitte mindestens ein Synonym eingeben.');
      return;
    }

    setLookupError('');
    setRefreshingRowId(row.id);

    try {
      const { productName, values } = await loadNutritionReferenceFromOpenFoodFacts(searchName);
      const ingredientID = getIngredientID(row);
      await setDoc(
        doc(db, 'nutritionReferences', ingredientID),
        {
          ...buildPayload(row, 'openfoodfacts'),
          product: productName,
          ...values,
        },
        { merge: true }
      );
      if (row.id !== ingredientID) {
        await deleteDoc(doc(db, 'nutritionReferences', row.id));
      }
      await reload();
      setActionMessage(`OpenFoodFacts-Daten für ${ingredientID} aktualisiert.`);
    } catch (error) {
      setLookupError(error?.message || 'OpenFoodFacts-Abruf fehlgeschlagen.');
    } finally {
      setRefreshingRowId(null);
    }
  };

  const importRecipeIngredients = async () => {
    const existingNormalizedSynonyms = new Set(
      rows.flatMap((row) => getNormalizedNutritionReferenceSynonyms(row))
    );
    const names = [];

    allRecipes.forEach((recipe) => {
      getRecipeIngredientTexts(recipe).forEach((ingredientText) => {
        const name = extractIngredientName(ingredientText);
        if (name) names.push(name);
      });
    });

    const uniqueNames = [...new Set(names)];
    const usedIds = new Set(rows.map((row) => getIngredientID(row)).filter(Boolean));
    let importedCount = 0;
    const importOperations = [];

    for (const name of uniqueNames) {
      const normalizedName = normalizeNutritionReferenceId(name);
      if (!normalizedName || existingNormalizedSynonyms.has(normalizedName)) {
        continue;
      }
      let candidate = `dummy-${normalizedName}`;
      let suffix = 2;
      while (usedIds.has(candidate)) {
        candidate = `dummy-${normalizedName}-${suffix}`;
        suffix += 1;
      }

      usedIds.add(candidate);
      existingNormalizedSynonyms.add(normalizedName);
      importOperations.push(setDoc(
        doc(db, 'nutritionReferences', candidate),
        buildPayload({
          ingredientID: candidate,
          synonyms: [name],
        }, 'recipe-import'),
        { merge: true }
      ));
      importedCount += 1;
    }

    await Promise.all(importOperations);
    await reload();
    setActionMessage(importedCount > 0
      ? `${importedCount} Zutaten aus Rezepten importiert.`
      : 'Keine neuen Zutaten gefunden.');
  };

  const handleExportCsv = () => {
    const csv = createNutritionReferenceCsv(rows.map((row) => ({
      ingredientID: getIngredientID(row),
      family: row.family || '',
      category: row.category || '',
      synonyms: parseNutritionReferenceSynonyms(row),
      defaultAmountG: row.defaultAmountG ?? '',
      ...parseNutritionReferenceValues(row),
    })));
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'nutrition-references.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setActionMessage('CSV exportiert.');
  };

  const readImportFile = async (file) => {
    if (typeof TextDecoder === 'undefined') {
      if (file.text) {
        return file.text();
      }
      throw new Error('Datei kann in dieser Browserumgebung nicht gelesen werden.');
    }

    const arrayBuffer = await file.arrayBuffer();
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(arrayBuffer);
    } catch {
      try {
        return new TextDecoder('windows-1252').decode(arrayBuffer);
      } catch {
        return new TextDecoder('iso-8859-1').decode(arrayBuffer);
      }
    }
  };

  const handleImportCsv = async (event) => {
    const [file] = event.target.files || [];
    if (!file) {
      if (importInputRef.current) {
        importInputRef.current.value = '';
      }
      return;
    }
    setIsImportingCsv(true);
    setActionMessage('');
    setLookupError('');

    try {
      const content = await readImportFile(file);
      const importedRows = parseNutritionReferenceCsv(content);
      const importedIds = new Set(importedRows.map((row) => row.ingredientID));
      await Promise.all(importedRows.map((importedRow) => setDoc(
          doc(db, 'nutritionReferences', importedRow.ingredientID),
          buildPayload(importedRow, 'csv-import'),
          { merge: false }
        )));

      await Promise.all(rows
        .filter((row) => {
          const ingredientID = getIngredientID(row);
          return row.id !== ingredientID || !importedIds.has(ingredientID);
        })
        .map((row) => deleteDoc(doc(db, 'nutritionReferences', row.id))));

      await reload();
      setActionMessage(`CSV importiert (${importedRows.length} Einträge).`);
    } catch (error) {
      setLookupError(`Import fehlgeschlagen: ${error.message}`);
    } finally {
      setIsImportingCsv(false);
      if (importInputRef.current) {
        importInputRef.current.value = '';
      }
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
      {actionMessage && <p className="section-description">{actionMessage}</p>}
      {lookupError && <p className="section-description">{lookupError}</p>}

      <div className="season-matrix-import-export-actions">
        <button type="button" className="save-button" onClick={importRecipeIngredients}>
          Zutatenliste importieren (Dummy-IDs)
        </button>
        <button type="button" className="save-button" onClick={handleExportCsv}>
          CSV exportieren
        </button>
        <label htmlFor="nutrition-reference-import-input" className={`save-button ${isImportingCsv ? 'disabled' : ''}`}>
          {isImportingCsv ? 'Import läuft...' : 'CSV importieren'}
        </label>
        <input
          id="nutrition-reference-import-input"
          ref={importInputRef}
          type="file"
          accept="text/csv"
          onChange={handleImportCsv}
          disabled={isImportingCsv}
        />
        <button type="button" className="remove-btn" onClick={removeAllRows}>
          Alle Einträge löschen
        </button>
      </div>

      {loading ? (
        <p>Lade Nährwerte...</p>
      ) : (
        <div className="conversion-table-container">
          <table className="conversion-table">
            <thead>
              <tr>
                <th>ingredientID</th>
                <th>family</th>
                <th>category</th>
                <th>Synonyme</th>
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
                      value={row.ingredientID || row.id || ''}
                      onChange={(e) => updateCell(row.id, 'ingredientID', e.target.value)}
                      className="conversion-table-input"
                      aria-label={`ingredientID ${row.id}`}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={row.family || ''}
                      onChange={(e) => updateCell(row.id, 'family', e.target.value)}
                      className="conversion-table-input"
                      aria-label={`family ${row.id}`}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={row.category || ''}
                      onChange={(e) => updateCell(row.id, 'category', e.target.value)}
                      className="conversion-table-input"
                      aria-label={`category ${row.id}`}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={parseNutritionReferenceSynonyms(row).join(', ')}
                      onChange={(e) => updateCell(row.id, 'synonyms', e.target.value)}
                      className="conversion-table-input"
                      aria-label={`Synonyme ${row.id}`}
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
                    value={newIngredientID}
                    onChange={(e) => setNewIngredientID(e.target.value)}
                    placeholder="dummy-zutat"
                    className="conversion-table-input"
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={newFamily}
                    onChange={(e) => setNewFamily(e.target.value)}
                    className="conversion-table-input"
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="conversion-table-input"
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={newSynonyms}
                    onChange={(e) => setNewSynonyms(e.target.value)}
                    placeholder="z. B. Tomate, Paradeiser"
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

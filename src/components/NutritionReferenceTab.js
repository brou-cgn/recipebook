import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { deleteDoc, deleteField, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { ROLES } from '../utils/userManagement';
import { useNutritionReference } from '../contexts/NutritionReferenceContext';
import {
  NUTRITION_REFERENCE_BOOLEAN_FIELDS,
  NUTRITION_REFERENCE_FIELDS,
  NUTRITION_REFERENCE_MANUAL_STATUS,
  NUTRITION_REFERENCE_PENDING_STATUS,
  normalizeNutritionReferenceId,
  parseNutritionReferenceBooleanFields,
  parseNutritionReferenceStatus,
  parseNutritionReferenceValues,
  parseNutritionReferenceFallbackWeight,
  parseNutritionReferenceSynonyms,
  parseNutritionReferencePossibleUnits,
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

const NUTRITION_BOOLEAN_LABELS = {
  seasonRelevant: 'Saisonrelevant',
  nutritionRelevant: 'Nährwertrelevant',
  isFresh: 'Frischprodukt',
  isSpice: 'Gewürz',
  isProcessed: 'Verarbeitet',
};

const NUTRITION_REFERENCE_TABLE_COLUMNS = [
  { key: 'ingredientID', label: 'ingredientID' },
  { key: 'displayName', label: 'Anzeigename' },
  { key: 'nutritionFamily', label: 'nutritionFamily' },
  { key: 'seasonalFamily', label: 'seasonalFamily' },
  { key: 'category', label: 'category' },
  { key: 'status', label: 'Status' },
  { key: 'source', label: 'Quelle' },
  { key: 'searchTerm', label: 'Suchbegriff' },
  ...NUTRITION_REFERENCE_BOOLEAN_FIELDS.map((field) => ({
    key: field,
    label: NUTRITION_BOOLEAN_LABELS[field],
    type: 'boolean',
  })),
  { key: 'synonyms', label: 'Synonyme' },
  { key: 'possibleUnits', label: 'Mögliche Einheiten' },
  { key: 'defaultAmountG', label: 'Fallbackgew. (g)' },
  ...NUTRITION_REFERENCE_FIELDS.map((field) => ({
    key: field,
    label: NUTRITION_FIELD_LABELS[field],
  })),
];
const NUTRITION_REFERENCE_BOOLEAN_FILTER_FIELDS = new Set(NUTRITION_REFERENCE_BOOLEAN_FIELDS);

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
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newNutritionFamily, setNewNutritionFamily] = useState('');
  const [newSeasonalFamily, setNewSeasonalFamily] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [newSource, setNewSource] = useState('');
  const [newSearchTerm, setNewSearchTerm] = useState('');
  const [newSynonyms, setNewSynonyms] = useState('');
  const [newPossibleUnits, setNewPossibleUnits] = useState('');
  const [newValues, setNewValues] = useState({});
  const [newBooleanValues, setNewBooleanValues] = useState({});
  const [newDefaultAmountG, setNewDefaultAmountG] = useState('');
  const [refreshingRowId, setRefreshingRowId] = useState(null);
  const [lookupError, setLookupError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState({});
  const importInputRef = useRef(null);

  useEffect(() => {
    setRows(cachedRows);
  }, [cachedRows]);

  const updateCell = (id, field, value) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const getIngredientID = (row) => String(row.ingredientID || row.id || '').trim();

  const buildPayload = (
    row,
    source = 'manual',
    { removeLegacyFamily = true } = {}
  ) => {
    const ingredientID = getIngredientID(row);
    const synonyms = parseNutritionReferenceSynonyms(row);
    const possibleUnits = parseNutritionReferencePossibleUnits(row);
    const sourceValue = String(source || '').trim();
    const status = parseNutritionReferenceStatus(row);
    const payload = {
      ingredientID,
      displayName: String(row.displayName || '').trim(),
      synonyms,
      normalizedSynonyms: getNormalizedNutritionReferenceSynonyms({ synonyms }),
      name: synonyms[0] || '',
      possibleUnits,
      ...parseNutritionReferenceBooleanFields(row),
      ...parseNutritionReferenceValues(row),
      updatedAt: serverTimestamp(),
      updatedBy: currentUser?.id || null,
      source: sourceValue,
    };
    if (removeLegacyFamily) {
      payload.family = deleteField();
    }
    const fallbackWeight = parseNutritionReferenceFallbackWeight(row);
    if (fallbackWeight != null) {
      payload.defaultAmountG = fallbackWeight;
    }
    const nutritionFamily = String(row.nutritionFamily || row.family || '').trim();
    const seasonalFamily = String(row.seasonalFamily || '').trim();
    const category = String(row.category || '').trim();
    const searchTerm = String(row.searchTerm || '').trim();
    if (nutritionFamily) payload.nutritionFamily = nutritionFamily;
    if (seasonalFamily) payload.seasonalFamily = seasonalFamily;
    if (category) payload.category = category;
    if (status) payload.status = status;
    if (searchTerm) payload.searchTerm = searchTerm;
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

    await setDoc(
      doc(db, 'nutritionReferences', ingredientID),
      buildPayload(row, row.source || 'manual'),
      { merge: true }
    );
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
        displayName: newDisplayName,
        nutritionFamily: newNutritionFamily,
        seasonalFamily: newSeasonalFamily,
        category: newCategory,
        status: newStatus,
        source: newSource,
        searchTerm: newSearchTerm,
        synonyms,
        possibleUnits: newPossibleUnits,
        defaultAmountG: newDefaultAmountG,
        ...newBooleanValues,
        ...newValues,
      }, newSource || 'manual'),
      { merge: true }
    );
    setNewIngredientID('');
    setNewDisplayName('');
    setNewNutritionFamily('');
    setNewSeasonalFamily('');
    setNewCategory('');
    setNewStatus('');
    setNewSource('');
    setNewSearchTerm('');
    setNewSynonyms('');
    setNewPossibleUnits('');
    setNewValues({});
    setNewBooleanValues({});
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
    setLookupError('');
    if (parseNutritionReferenceStatus(row) === NUTRITION_REFERENCE_MANUAL_STATUS) {
      setLookupError(`Eintrag „${getIngredientID(row)}" hat Status „${NUTRITION_REFERENCE_MANUAL_STATUS}" und wird nicht automatisch aktualisiert.`);
      return;
    }
    setRefreshingRowId(row.id);
    const ingredientID = getIngredientID(row);

    try {
      if (row.AI_Gemini_Error) {
        await setDoc(
          doc(db, 'nutritionReferences', ingredientID),
          { AI_Gemini_Error: deleteField() },
          { merge: true }
        );
      }

      const generateNutrition = httpsCallable(functions, 'generateNutritionFromReference');
      const result = await generateNutrition({
        ingredientID,
        nutritionFamily: row.nutritionFamily || '',
        category: row.category || '',
      });

      const { searchTerm, source, values } = result.data;
      const parsedValues = parseNutritionReferenceValues(values || {});

      await setDoc(
        doc(db, 'nutritionReferences', ingredientID),
        {
          source: String(source || '').trim(),
          ...(searchTerm ? { searchTerm } : {}),
          ...parsedValues,
        },
        { merge: true }
      );

      if (row.id !== ingredientID) {
        await deleteDoc(doc(db, 'nutritionReferences', row.id));
      }
      await reload();
      const sourceLabel = source === 'openfoodfacts' ? 'OpenFoodFacts' : 'KI-Schätzung';
      setActionMessage(`${sourceLabel}-Daten für ${ingredientID} aktualisiert. Suchbegriff: „${searchTerm}"`);
    } catch (error) {
      await setDoc(
        doc(db, 'nutritionReferences', ingredientID),
        { AI_Gemini_Error: error?.message || 'Abruf fehlgeschlagen.' },
        { merge: true }
      );
      setLookupError(error?.message || 'Abruf fehlgeschlagen.');
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
          status: NUTRITION_REFERENCE_PENDING_STATUS,
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
      displayName: String(row.displayName || '').trim(),
      nutritionFamily: row.nutritionFamily || '',
      seasonalFamily: row.seasonalFamily || '',
      category: row.category || '',
      status: parseNutritionReferenceStatus(row),
      source: row.source || '',
      searchTerm: row.searchTerm || '',
      ...parseNutritionReferenceBooleanFields(row),
      synonyms: parseNutritionReferenceSynonyms(row),
      possibleUnits: parseNutritionReferencePossibleUnits(row),
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

      const existingById = Object.fromEntries(
        rows.map((row) => [getIngredientID(row), row])
      );

      await Promise.all(importedRows.map((importedRow) => {
        const existing = existingById[importedRow.ingredientID];
        // Protect source (Quelle): keep existing value if already set
        const source = existing?.source || importedRow.source || 'csv-import';
        // Protect nutrition fields: keep existing values if already set
        const existingNutrition = parseNutritionReferenceValues(existing || {});
        // Protect searchTerm (Suchbegriff): keep existing value if already set
        const existingSearchTerm = existing?.searchTerm ? { searchTerm: existing.searchTerm } : {};
        const mergedRow = { ...importedRow, ...existingNutrition, ...existingSearchTerm };
        return setDoc(
          doc(db, 'nutritionReferences', importedRow.ingredientID),
          // merge:false replaces the document, so legacy "family" is dropped implicitly.
          buildPayload(mergedRow, source, { removeLegacyFamily: false }),
          { merge: false }
        );
      }));

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

  const normalizedStatusFilter = statusFilter.trim().toLowerCase();
  const normalizedColumnFilters = useMemo(() => NUTRITION_REFERENCE_TABLE_COLUMNS.reduce((acc, column) => {
    const rawValue = columnFilters[column.key];
    if (rawValue == null) return acc;
    const trimmed = String(rawValue).trim();
    if (!trimmed || trimmed === 'all') return acc;
    acc[column.key] = column.type === 'boolean' ? trimmed : trimmed.toLowerCase();
    return acc;
  }, {}), [columnFilters]);
  const getRowFilterValue = useCallback((row, field) => {
    if (field === 'ingredientID') return getIngredientID(row);
    if (field === 'status') return parseNutritionReferenceStatus(row);
    if (field === 'synonyms') return parseNutritionReferenceSynonyms(row).join(', ');
    if (field === 'possibleUnits') return parseNutritionReferencePossibleUnits(row).join(';');
    if (NUTRITION_REFERENCE_BOOLEAN_FILTER_FIELDS.has(field)) return row[field] === true ? 'true' : 'false';
    return row[field] ?? '';
  }, []);
  const updateColumnFilter = useCallback((field, value) => {
    setColumnFilters((prev) => ({ ...prev, [field]: value }));
  }, []);

  if (!canManage) {
    return (
      <div className="settings-section nutrition-reference-section">
        <h3>Nährwerte je 100 g</h3>
        <p className="section-description">Nur Admins und Moderatoren können diese Tabelle bearbeiten.</p>
      </div>
    );
  }
  const visibleRows = rows.filter((row) => {
    const matchesStatusFilter = !normalizedStatusFilter
      || parseNutritionReferenceStatus(row).toLowerCase().includes(normalizedStatusFilter);
    if (!matchesStatusFilter) return false;

    return Object.entries(normalizedColumnFilters).every(([field, filterValue]) => {
      const value = String(getRowFilterValue(row, field)).toLowerCase();
      return value.includes(filterValue);
    });
  });

  return (
    <div className="settings-section nutrition-reference-section">
      <h3>Nährwerte je 100 g</h3>
      <p className="section-description">
        Diese Werte werden bei der automatischen Nährwert-Berechnung pro 100 g gespeichert und können hier korrigiert werden.
      </p>
      {actionMessage && <p className="section-description">{actionMessage}</p>}
      {lookupError && <p className="section-description">{lookupError}</p>}

      <label className="section-description" htmlFor="nutrition-reference-status-filter">
        Status filtern
      </label>
      <input
        id="nutrition-reference-status-filter"
        type="text"
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
        placeholder="z. B. Freizugeben"
        className="conversion-table-input"
      />

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
                <th>Anzeigename</th>
                <th>nutritionFamily</th>
                <th>seasonalFamily</th>
                <th>category</th>
                <th>Status</th>
                <th>Quelle</th>
                <th>Suchbegriff</th>
                {NUTRITION_REFERENCE_BOOLEAN_FIELDS.map((field) => (
                  <th key={field}>{NUTRITION_BOOLEAN_LABELS[field]}</th>
                ))}
                <th>Synonyme</th>
                <th>Mögliche Einheiten</th>
                <th>Fallbackgew. (g)</th>
                {NUTRITION_REFERENCE_FIELDS.map((field) => (
                  <th key={field}>{NUTRITION_FIELD_LABELS[field]}</th>
                ))}
                <th />
              </tr>
              <tr className="conversion-table-filter-row">
                {NUTRITION_REFERENCE_TABLE_COLUMNS.map((column) => (
                  <th key={column.key}>
                    {column.type === 'boolean' ? (
                      <select
                        className="conversion-table-input"
                        aria-label={`Filter ${column.label}`}
                        value={columnFilters[column.key] || 'all'}
                        onChange={(e) => updateColumnFilter(column.key, e.target.value)}
                      >
                        <option value="all">Alle</option>
                        <option value="true">Ja</option>
                        <option value="false">Nein</option>
                      </select>
                    ) : (
                      <input
                        type="text"
                        className="conversion-table-input"
                        aria-label={`Filter ${column.label}`}
                        value={columnFilters[column.key] || ''}
                        onChange={(e) => updateColumnFilter(column.key, e.target.value)}
                        placeholder="Filtern..."
                      />
                    )}
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
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
                      value={row.displayName || ''}
                      onChange={(e) => updateCell(row.id, 'displayName', e.target.value)}
                      className="conversion-table-input"
                      aria-label={`Anzeigename ${row.id}`}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={row.nutritionFamily || ''}
                      onChange={(e) => updateCell(row.id, 'nutritionFamily', e.target.value)}
                      className="conversion-table-input"
                      aria-label={`nutritionFamily ${row.id}`}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={row.seasonalFamily || ''}
                      onChange={(e) => updateCell(row.id, 'seasonalFamily', e.target.value)}
                      className="conversion-table-input"
                      aria-label={`seasonalFamily ${row.id}`}
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
                      value={parseNutritionReferenceStatus(row)}
                      onChange={(e) => updateCell(row.id, 'status', e.target.value)}
                      className="conversion-table-input"
                      aria-label={`Status ${row.id}`}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={row.source || ''}
                      onChange={(e) => updateCell(row.id, 'source', e.target.value)}
                      className="conversion-table-input"
                      aria-label={`Quelle ${row.id}`}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={row.searchTerm || ''}
                      onChange={(e) => updateCell(row.id, 'searchTerm', e.target.value)}
                      className="conversion-table-input"
                      aria-label={`Suchbegriff ${row.id}`}
                    />
                  </td>
                  {NUTRITION_REFERENCE_BOOLEAN_FIELDS.map((field) => (
                    <td key={field}>
                      <input
                        type="checkbox"
                        checked={row[field] === true}
                        onChange={(e) => updateCell(row.id, field, e.target.checked)}
                        className="conversion-table-input"
                        aria-label={`${NUTRITION_BOOLEAN_LABELS[field]} ${row.id}`}
                      />
                    </td>
                  ))}
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
                      type="text"
                      value={parseNutritionReferencePossibleUnits(row).join(';')}
                      onChange={(e) => updateCell(row.id, 'possibleUnits', e.target.value)}
                      className="conversion-table-input"
                      aria-label={`Mögliche Einheiten ${row.id}`}
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
                      disabled={refreshingRowId === row.id || parseNutritionReferenceStatus(row) === NUTRITION_REFERENCE_MANUAL_STATUS}
                      title={parseNutritionReferenceStatus(row) === NUTRITION_REFERENCE_MANUAL_STATUS ? `Status „${NUTRITION_REFERENCE_MANUAL_STATUS}": keine automatische Aktualisierung` : undefined}
                    >
                      {refreshingRowId === row.id ? '⏳' : '🤖 Nährwerte abrufen'}
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
                    value={newDisplayName}
                    onChange={(e) => setNewDisplayName(e.target.value)}
                    placeholder="z. B. Tomate"
                    className="conversion-table-input"
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={newNutritionFamily}
                    onChange={(e) => setNewNutritionFamily(e.target.value)}
                    className="conversion-table-input"
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={newSeasonalFamily}
                    onChange={(e) => setNewSeasonalFamily(e.target.value)}
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
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    className="conversion-table-input"
                    placeholder={NUTRITION_REFERENCE_PENDING_STATUS}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={newSource}
                    onChange={(e) => setNewSource(e.target.value)}
                    className="conversion-table-input"
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={newSearchTerm}
                    onChange={(e) => setNewSearchTerm(e.target.value)}
                    className="conversion-table-input"
                  />
                </td>
                {NUTRITION_REFERENCE_BOOLEAN_FIELDS.map((field) => (
                  <td key={field}>
                    <input
                      type="checkbox"
                      checked={newBooleanValues[field] === true}
                      onChange={(e) => setNewBooleanValues((prev) => ({ ...prev, [field]: e.target.checked }))}
                      className="conversion-table-input"
                      aria-label={`${NUTRITION_BOOLEAN_LABELS[field]} neu`}
                    />
                  </td>
                ))}
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
                    type="text"
                    value={newPossibleUnits}
                    onChange={(e) => setNewPossibleUnits(e.target.value)}
                    placeholder="z. B. g;kg;ml"
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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { deleteDoc, deleteField, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { ROLES } from '../utils/userManagement';
import { useNutritionReference } from '../contexts/NutritionReferenceContext';
import {
  NUTRITION_REFERENCE_APPROVED_STATUS,
  NUTRITION_REFERENCE_BOOLEAN_FIELDS,
  NUTRITION_REFERENCE_FIELDS,
  NUTRITION_SOURCE_SUFFIX,
  NUTRITION_SOURCE_PRIORITY,
  NUTRITION_REFERENCE_NEW_STATUS,
  NUTRITION_REFERENCE_STATUS_OPTIONS,
  buildNutritionTrackingFields,
  buildSourceNutritionFields,
  computeEffectiveNutritionValues,
  getStatusAfterNutritionFetch,
  parseNutritionReferenceBooleanFields,
  parseNutritionReferenceStatus,
  parseNutritionReferenceValues,
  parseNutritionReferenceFallbackWeight,
  parseNutritionReferenceSynonyms,
  parseNutritionReferencePossibleUnits,
  getNormalizedNutritionReferenceSynonyms,
  calculateOpenFoodFactsDiagnostics,
} from '../utils/nutritionReferenceUtils';
import { hasMeaningfulGeneratedNutrition } from '../utils/nutritionStatusResolver';
import {
  createNutritionReferenceCsv,
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

const SOURCE_OPTIONS = [
  { value: '', label: '—' },
  { value: 'openfoodfacts', label: 'OpenFoodFacts' },
  { value: 'manual', label: 'Manuell' },
  { value: 'ai-generiert', label: 'AI generiert' },
];

const NUTRITION_REFERENCE_TABLE_COLUMNS = [
  { key: 'overallConfidence', label: 'Verlässlichkeit', type: 'static' },
  { key: 'ingredientID', label: 'ingredientID' },
  { key: 'displayName', label: 'Anzeigename' },
  { key: 'nutritionFamily', label: 'nutritionFamily' },
  { key: 'seasonalFamily', label: 'seasonalFamily' },
  { key: 'category', label: 'category' },
  { key: 'status', label: 'Status', type: 'status' },
  { key: 'source', label: 'Quelle', type: 'select' },
  { key: 'searchTerm', label: 'Suchbegriff' },
  ...NUTRITION_REFERENCE_BOOLEAN_FIELDS.map((field) => ({
    key: field,
    label: NUTRITION_BOOLEAN_LABELS[field],
    type: 'boolean',
  })),
  { key: 'synonyms', label: 'Synonyme' },
  { key: 'possibleUnits', label: 'Mögliche Einheiten' },
  { key: 'defaultAmountG', label: 'Fallbackgew. (g)' },
  { key: 'nutritionLabels', label: 'Beschriftung', type: 'static' },
  ...NUTRITION_REFERENCE_FIELDS.map((field) => ({
    key: field,
    label: NUTRITION_FIELD_LABELS[field],
  })),
];
const NUTRITION_REFERENCE_BOOLEAN_FILTER_FIELDS = new Set(NUTRITION_REFERENCE_BOOLEAN_FIELDS);
const EMPTY_STATUS_FILTER_VALUE = '__empty__';
const EMPTY_STATUS_DISPLAY_LABEL = '<leer>';
const getStatusOptionLabel = (status) => (status || EMPTY_STATUS_DISPLAY_LABEL);
const DEFAULT_HEADER_ROW_HEIGHT = 32;
const formatConfidenceValue = (value) => (value == null ? '—' : `${value}%`);
const getIngredientID = (row) => String(row?.ingredientID || row?.id || '').trim();
const normalizeEditableNumber = (value) => {
  if (value == null) return '';
  if (typeof value === 'string' && value.trim() === '') return '';
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 0) return numeric;
  return String(value).trim();
};
const getEditableRowState = (row) => ({
  ingredientID: getIngredientID(row),
  displayName: String(row?.displayName || '').trim(),
  nutritionFamily: String(row?.nutritionFamily || row?.family || '').trim(),
  seasonalFamily: String(row?.seasonalFamily || '').trim(),
  category: String(row?.category || '').trim(),
  status: parseNutritionReferenceStatus(row || {}),
  source: String(row?.source || '').trim(),
  searchTerm: String(row?.searchTerm || '').trim(),
  synonyms: parseNutritionReferenceSynonyms(row || {}),
  possibleUnits: parseNutritionReferencePossibleUnits(row || {}),
  defaultAmountG: normalizeEditableNumber(parseNutritionReferenceFallbackWeight(row || {})),
  booleans: parseNutritionReferenceBooleanFields(row || {}),
  manualNutrition: NUTRITION_REFERENCE_FIELDS.reduce((acc, field) => {
    acc[field] = normalizeEditableNumber(row?.[`${field}_manual`]);
    return acc;
  }, {}),
});
const getConfidenceInfoText = (diagnostics) => {
  const fieldBreakdown = NUTRITION_REFERENCE_FIELDS
    .map((field) => `${NUTRITION_FIELD_LABELS[field]}: ${formatConfidenceValue(diagnostics.confidenceByField[field])}`)
    .join('\n');
  return [
    'Gesamt-Confidence = Durchschnitt der Feld-Confidencewerte (OFf vs. KI).',
    'Feld-Confidence = 100 - (|OFf - KI| / max((|OFf| + |KI|) / 2, 1)) * 100, begrenzt auf 0–100 und gerundet.',
    '',
    fieldBreakdown,
  ].join('\n');
};

function NutritionReferenceTab({ currentUser }) {
  const canManage = currentUser?.role === ROLES.ADMIN || currentUser?.role === ROLES.MODERATOR;
  const { rows: cachedRows, loading, reload } = useNutritionReference();
  const [rows, setRows] = useState([]);
  const [newIngredientID, setNewIngredientID] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newNutritionFamily, setNewNutritionFamily] = useState('');
  const [newSeasonalFamily, setNewSeasonalFamily] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newStatus, setNewStatus] = useState(NUTRITION_REFERENCE_NEW_STATUS);
  const [newSource, setNewSource] = useState('');
  const [newSearchTerm, setNewSearchTerm] = useState('');
  const [newSynonyms, setNewSynonyms] = useState('');
  const [newPossibleUnits, setNewPossibleUnits] = useState('');
  const [newValues, setNewValues] = useState({});
  const [newBooleanValues, setNewBooleanValues] = useState({});
  const [newDefaultAmountG, setNewDefaultAmountG] = useState('');
  const [refreshingRowId, setRefreshingRowId] = useState(null);
  const [savingChanges, setSavingChanges] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [columnFilters, setColumnFilters] = useState({});
  const tableContainerRef = useRef(null);
  const tableHeaderRowRef = useRef(null);
  const [headerRowHeight, setHeaderRowHeight] = useState(null);
  const persistedRowsById = useMemo(
    () => new Map(cachedRows.map((row) => [row.id, row])),
    [cachedRows]
  );

  useEffect(() => {
    setRows(cachedRows);
  }, [cachedRows]);

  useEffect(() => {
    const headerRow = tableHeaderRowRef.current;
    if (!headerRow) return undefined;

    const updateHeaderHeight = () => {
      const clientHeight = headerRow.getBoundingClientRect().height;
      const offsetHeight = headerRow.offsetHeight;
      const measuredHeight = (Number.isFinite(clientHeight) && clientHeight > 0)
        ? clientHeight
        : ((Number.isFinite(offsetHeight) && offsetHeight > 0) ? offsetHeight : DEFAULT_HEADER_ROW_HEIGHT);
      setHeaderRowHeight(measuredHeight);
    };

    updateHeaderHeight();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateHeaderHeight);
      observer.observe(headerRow);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', updateHeaderHeight);
    return () => window.removeEventListener('resize', updateHeaderHeight);
  }, [loading]);

  const withPreservedTableScroll = useCallback(async (operation) => {
    const container = tableContainerRef.current;
    const scrollTop = container?.scrollTop ?? null;
    const scrollLeft = container?.scrollLeft ?? null;
    await operation();
    if (container) {
      const restoreScroll = () => {
        if (scrollTop != null) {
          container.scrollTop = scrollTop;
        }
        if (scrollLeft != null) {
          container.scrollLeft = scrollLeft;
        }
      };
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(restoreScroll);
      } else {
        setTimeout(restoreScroll, 0);
      }
    }
  }, []);

  const updateCell = (id, field, value) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const dirtyRows = useMemo(() => rows.filter((row) => {
    const previousRow = persistedRowsById.get(row.id);
    if (!previousRow) return false;
    return JSON.stringify(getEditableRowState(row)) !== JSON.stringify(getEditableRowState(previousRow));
  }), [persistedRowsById, rows]);

  const buildPayload = (
    row,
    source = '',
    { removeLegacyFamily = true, previousRow = null } = {}
  ) => {
    const ingredientID = getIngredientID(row);
    const synonyms = parseNutritionReferenceSynonyms(row);
    const possibleUnits = parseNutritionReferencePossibleUnits(row);
    const sourceValue = String(source || '').trim();
    const status = parseNutritionReferenceStatus(row);

    // Collect all source-specific nutrition fields present in the row.
    const sourceFields = {};
    for (const src of Object.keys(NUTRITION_SOURCE_SUFFIX)) {
      const suffix = NUTRITION_SOURCE_SUFFIX[src];
      for (const field of NUTRITION_REFERENCE_FIELDS) {
        const fname = `${field}${suffix}`;
        const raw = row[fname];
        if (raw === '' || raw == null) continue;
        const numeric = Number(raw);
        if (Number.isFinite(numeric) && numeric >= 0) {
          sourceFields[fname] = numeric;
        }
      }
    }

    // Compute effective flat values. If source-specific fields are present use
    // priority (manual > openfoodfacts > ai), otherwise fall back to any flat
    // values already on the row (backward-compat for CSV-import mergedRow etc.).
    const effectiveValues = Object.keys(sourceFields).length > 0
      ? computeEffectiveNutritionValues({ ...row, ...sourceFields })
      : parseNutritionReferenceValues(row);

    const payload = {
      ingredientID,
      displayName: String(row.displayName || '').trim(),
      synonyms,
      normalizedSynonyms: getNormalizedNutritionReferenceSynonyms({ synonyms }),
      name: synonyms[0] || '',
      possibleUnits,
      ...parseNutritionReferenceBooleanFields(row),
      ...sourceFields,
      ...effectiveValues,
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
    else payload.seasonalFamily = deleteField();
    if (category) payload.category = category;
    if (status) payload.status = status;
    if (searchTerm) payload.searchTerm = searchTerm;
    const previousStatus = parseNutritionReferenceStatus(previousRow || {});
    const isApprovalTransition =
      status === NUTRITION_REFERENCE_APPROVED_STATUS
      && previousStatus !== NUTRITION_REFERENCE_APPROVED_STATUS;
    const trackingFields = buildNutritionTrackingFields({
      previousData: previousRow || {},
      nextValues: effectiveValues,
      nextSource: sourceValue,
      forceRecalc: isApprovalTransition,
      preserveOnManualSourceChange: true,
      fromNutritionGeneration: false,
    });
    if (trackingFields.recalcDate !== undefined) {
      trackingFields.recalcDate = serverTimestamp();
    }
    Object.assign(payload, trackingFields);
    if (
      isApprovalTransition
    ) {
      payload.approvedAt = serverTimestamp();
    } else if (previousRow?.approvedAt !== undefined && previousRow?.approvedAt !== null) {
      payload.approvedAt = previousRow.approvedAt;
    }
    return payload;
  };

  const hasIngredientIDConflict = (ingredientID, ownRowId = null) => rows.some((row) => (
    row.id !== ownRowId && getIngredientID(row).toLowerCase() === ingredientID.toLowerCase()
  ));

  const validateRow = (row) => {
    const ingredientID = getIngredientID(row);
    const synonyms = parseNutritionReferenceSynonyms(row);
    if (!ingredientID) {
      alert('Bitte eine eindeutige ingredientID eingeben.');
      return null;
    }
    if (synonyms.length === 0) {
      alert('Bitte mindestens ein Synonym eingeben.');
      return null;
    }
    if (hasIngredientIDConflict(ingredientID, row.id)) {
      alert('Diese ingredientID existiert bereits.');
      return null;
    }
    return ingredientID;
  };

  const getClearedNutritionFields = (row) => {
    const clearedManualNutritionValues = NUTRITION_REFERENCE_FIELDS.reduce((acc, field) => {
      const raw = row[`${field}_manual`];
      const isEmpty = raw == null || (typeof raw === 'string' && raw.trim() === '');
      if (isEmpty) {
        acc[`${field}_manual`] = deleteField();
      }
      return acc;
    }, {});

    const clearedEffectiveFlatValues = NUTRITION_REFERENCE_FIELDS.reduce((acc, field) => {
      const hasValue = NUTRITION_SOURCE_PRIORITY.some((src) => {
        const fname = `${field}${NUTRITION_SOURCE_SUFFIX[src]}`;
        const raw = row[fname];
        return raw !== '' && raw != null && Number.isFinite(Number(raw)) && Number(raw) >= 0;
      });
      if (!hasValue) {
        acc[field] = deleteField();
      }
      return acc;
    }, {});

    return {
      ...clearedManualNutritionValues,
      ...clearedEffectiveFlatValues,
    };
  };

  const saveDirtyRows = async () => {
    if (dirtyRows.length === 0) return;

    const rowsToSave = [];
    for (const row of dirtyRows) {
      const ingredientID = validateRow(row);
      if (!ingredientID) return;
      rowsToSave.push({ row, ingredientID });
    }

    setSavingChanges(true);
    try {
      await withPreservedTableScroll(async () => {
        for (const { row, ingredientID } of rowsToSave) {
          const previousRow = persistedRowsById.get(row.id) || null;
          await setDoc(
            doc(db, 'nutritionReferences', ingredientID),
            {
              ...buildPayload(row, row.source, { previousRow }),
              ...getClearedNutritionFields(row),
            },
            { merge: true }
          );
          if (row.id !== ingredientID) {
            await deleteDoc(doc(db, 'nutritionReferences', row.id));
          }
        }
        await reload();
      });
      setActionMessage(
        rowsToSave.length === 1
          ? `Eintrag ${rowsToSave[0].ingredientID} gespeichert.`
          : `${rowsToSave.length} Einträge gespeichert.`
      );
    } catch (error) {
      console.error('Error saving nutrition reference changes:', error);
      alert('Fehler beim Speichern der Nährwerttabelle. Bitte versuchen Sie es erneut.');
    } finally {
      setSavingChanges(false);
    }
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
      }, newSource),
      { merge: true }
    );
    setNewIngredientID('');
    setNewDisplayName('');
    setNewNutritionFamily('');
    setNewSeasonalFamily('');
    setNewCategory('');
    setNewStatus(NUTRITION_REFERENCE_NEW_STATUS);
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

  const refreshRowFromOpenFoodFacts = async (row) => {
    setLookupError('');
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

      await withPreservedTableScroll(async () => {
        if (hasMeaningfulGeneratedNutrition(values)) {
          await setDoc(
            doc(db, 'nutritionReferences', ingredientID),
            {
              source: String(source || '').trim(),
              status: getStatusAfterNutritionFetch(parseNutritionReferenceStatus(row)),
              ...(searchTerm ? { searchTerm } : {}),
              ...parsedValues,
              ...buildSourceNutritionFields(parsedValues, source),
              ...buildNutritionTrackingFields({
                previousData: row,
                nextValues: parsedValues,
                nextSource: source,
                preserveOnManualSourceChange: true,
                fromNutritionGeneration: true,
              }),
            },
            { merge: true }
          );
        }

        if (row.id !== ingredientID) {
          await deleteDoc(doc(db, 'nutritionReferences', row.id));
        }
        await reload();
      });
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

  const columnTypeByKey = useMemo(() => NUTRITION_REFERENCE_TABLE_COLUMNS.reduce((acc, column) => {
    acc[column.key] = column.type || 'text';
    return acc;
  }, {}), []);
  const normalizedColumnFilters = useMemo(() => NUTRITION_REFERENCE_TABLE_COLUMNS.reduce((acc, column) => {
    const rawValue = columnFilters[column.key];
    if (rawValue == null) return acc;
    if (column.type === 'status' && rawValue === EMPTY_STATUS_FILTER_VALUE) {
      acc[column.key] = EMPTY_STATUS_FILTER_VALUE;
      return acc;
    }
    const trimmed = String(rawValue).trim();
    if (!trimmed || trimmed === 'all') return acc;
    acc[column.key] = (column.type === 'boolean' || column.type === 'select') ? trimmed : trimmed.toLowerCase();
    return acc;
  }, {}), [columnFilters]);
  const getRowFilterValue = useCallback((row, field) => {
    if (field === 'ingredientID') return getIngredientID(row);
    if (field === 'status') return parseNutritionReferenceStatus(row);
    if (field === 'source') return row.source || '';
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
    return Object.entries(normalizedColumnFilters).every(([field, filterValue]) => {
      const value = String(getRowFilterValue(row, field));
      if (filterValue === EMPTY_STATUS_FILTER_VALUE) {
        return value === '';
      }
      if (columnTypeByKey[field] === 'select') {
        return value === filterValue;
      }
      return value.toLowerCase().includes(filterValue);
    });
  });

  return (
    <div className="settings-section nutrition-reference-section">
      <h3>Nährwerte je 100 g</h3>
      {actionMessage && <p className="section-description">{actionMessage}</p>}
      {lookupError && <p className="section-description">{lookupError}</p>}

      <div className="season-matrix-import-export-actions">
        <button
          type="button"
          className="save-button"
          onClick={saveDirtyRows}
          disabled={savingChanges || dirtyRows.length === 0}
        >
          {savingChanges ? 'Speichert…' : (dirtyRows.length > 0 ? `Änderungen speichern (${dirtyRows.length})` : 'Änderungen speichern')}
        </button>
        <button type="button" className="save-button" onClick={handleExportCsv}>
          CSV exportieren
        </button>
      </div>

      {loading && rows.length === 0 ? (
        <p>Lade Nährwerte...</p>
      ) : (
        <div className="conversion-table-container" ref={tableContainerRef}>
          <table
            className="conversion-table"
            style={headerRowHeight != null ? { '--nutrition-header-height': `${headerRowHeight}px` } : undefined}
          >
            <thead>
              <tr ref={tableHeaderRowRef}>
                <th>Verlässlichkeit</th>
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
                <th>Beschriftung</th>
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
                    ) : column.type === 'status' ? (
                      <select
                        className="conversion-table-input"
                        aria-label={`Filter ${column.label}`}
                        value={columnFilters[column.key] || 'all'}
                        onChange={(e) => updateColumnFilter(column.key, e.target.value)}
                      >
                        <option value="all">Alle</option>
                        {NUTRITION_REFERENCE_STATUS_OPTIONS.map((opt) => (
                          <option key={opt || 'empty'} value={opt || EMPTY_STATUS_FILTER_VALUE}>{getStatusOptionLabel(opt)}</option>
                        ))}
                      </select>
                    ) : column.type === 'select' ? (
                      <select
                        className="conversion-table-input"
                        aria-label={`Filter ${column.label}`}
                        value={columnFilters[column.key] || 'all'}
                        onChange={(e) => updateColumnFilter(column.key, e.target.value)}
                      >
                        <option value="all">Alle</option>
                        {SOURCE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : column.type === 'static' ? (
                      <span className="nutrition-static-filter-placeholder">—</span>
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
              {visibleRows.map((row, rowIndex) => {
                const diagnostics = calculateOpenFoodFactsDiagnostics(row);
                const confidenceInfo = getConfidenceInfoText(diagnostics);
                return (
                  <tr key={row.id}>
                  <td className="nutrition-confidence-cell">
                    <span className="nutrition-overall-confidence" aria-label={`Gesamt-Confidence ${row.id}`}>
                      {formatConfidenceValue(diagnostics.overallConfidence)}
                    </span>
                    <button
                      type="button"
                      className="nutrition-confidence-info"
                      aria-label={`Confidence-Berechnung ${row.id}`}
                      title={confidenceInfo}
                    >
                      (i)
                    </button>
                  </td>
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
                    <select
                      value={parseNutritionReferenceStatus(row)}
                      onChange={(e) => updateCell(row.id, 'status', e.target.value)}
                      className="conversion-table-input"
                      aria-label={`Status ${row.id}`}
                    >
                      {NUTRITION_REFERENCE_STATUS_OPTIONS.map((opt) => (
                        <option key={opt || 'empty'} value={opt}>{getStatusOptionLabel(opt)}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={row.source || ''}
                      onChange={(e) => updateCell(row.id, 'source', e.target.value)}
                      className="conversion-table-input"
                      aria-label={`Quelle ${row.id}`}
                      disabled={parseNutritionReferenceStatus(row) === NUTRITION_REFERENCE_APPROVED_STATUS}
                    >
                      {SOURCE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                      {row.source && !SOURCE_OPTIONS.find(option => option.value === row.source) && (
                        <option value={row.source}>{row.source}</option>
                      )}
                    </select>
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
                  <td className="nutrition-source-label-column">
                    <div className="nutrition-source-row">OFf</div>
                    <div className="nutrition-source-row">KI</div>
                    <div className="nutrition-source-row">Man</div>
                  </td>
                  {NUTRITION_REFERENCE_FIELDS.map((field, fieldIndex) => {
                    const F = NUTRITION_REFERENCE_FIELDS.length;
                    const baseIndex = 1 + rowIndex * F * 3;
                    return (
                    <td key={field} className="nutrition-source-cell">
                      <div className="nutrition-source-row">
                        <input
                          type="number"
                          min="0"
                          step={field === 'kalorien' ? '1' : '0.1'}
                          value={row[`${field}_openfoodfacts`] ?? ''}
                          readOnly
                          className="conversion-table-input nutrition-source-input-readonly"
                          aria-label={`${NUTRITION_FIELD_LABELS[field]} (OpenFoodFacts) ${row.id}`}
                          tabIndex={baseIndex + fieldIndex}
                        />
                      </div>
                      <div className="nutrition-source-row">
                        <input
                          type="number"
                          min="0"
                          step={field === 'kalorien' ? '1' : '0.1'}
                          value={row[`${field}_ai`] ?? ''}
                          readOnly
                          className="conversion-table-input nutrition-source-input-readonly"
                          aria-label={`${NUTRITION_FIELD_LABELS[field]} (KI) ${row.id}`}
                          tabIndex={baseIndex + F + fieldIndex}
                        />
                      </div>
                      <div className="nutrition-source-row">
                        <input
                          type="number"
                          min="0"
                          step={field === 'kalorien' ? '1' : '0.1'}
                          value={row[`${field}_manual`] ?? ''}
                          onChange={(e) => updateCell(row.id, `${field}_manual`, e.target.value)}
                          className="conversion-table-input"
                          aria-label={`${NUTRITION_FIELD_LABELS[field]} (Manuell) ${row.id}`}
                          tabIndex={baseIndex + 2 * F + fieldIndex}
                          readOnly={parseNutritionReferenceStatus(row) === NUTRITION_REFERENCE_APPROVED_STATUS}
                        />
                      </div>
                    </td>
                    );
                  })}
                  <td className="conversion-table-actions">
                    <button
                      className="add-btn"
                      onClick={() => refreshRowFromOpenFoodFacts(row)}
                      disabled={refreshingRowId === row.id}
                    >
                      {refreshingRowId === row.id ? '⏳' : '🤖 Nährwerte abrufen'}
                    </button>
                    <button className="remove-btn" onClick={() => removeRow(row.id)} title="Entfernen">×</button>
                  </td>
                  </tr>
                );
              })}
              <tr className="conversion-table-new-row">
                <td className="nutrition-confidence-cell">—</td>
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
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    className="conversion-table-input"
                  >
                    {NUTRITION_REFERENCE_STATUS_OPTIONS.map((opt) => (
                      <option key={opt || 'empty'} value={opt}>{getStatusOptionLabel(opt)}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    value={newSource}
                    onChange={(e) => setNewSource(e.target.value)}
                    className="conversion-table-input"
                  >
                    {SOURCE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
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
                <td className="nutrition-source-label-column">
                  <div className="nutrition-source-row">Man</div>
                </td>
                {NUTRITION_REFERENCE_FIELDS.map((field) => (
                  <td key={field} className="nutrition-source-cell">
                    <div className="nutrition-source-row">
                      <input
                        type="number"
                        min="0"
                        step={field === 'kalorien' ? '1' : '0.1'}
                        value={newValues[`${field}_manual`] ?? ''}
                        onChange={(e) => setNewValues((prev) => ({ ...prev, [`${field}_manual`]: e.target.value }))}
                        className="conversion-table-input"
                        aria-label={`${NUTRITION_FIELD_LABELS[field]} (Manuell) neu`}
                      />
                    </div>
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

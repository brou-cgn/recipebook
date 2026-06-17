import React, { useEffect, useMemo, useRef, useState } from 'react';
import './SeasonMatrixTab.css';
import {
  subscribeToSeasonMatrix,
  addSeasonMatrixEntry,
  updateSeasonMatrixEntry,
  deleteSeasonMatrixEntry,
  CURRENT_SEASON_STATUS
} from '../utils/seasonMatrix';
import { createSeasonMatrixTemplateCsv, parseSeasonMatrixImport } from '../utils/seasonMatrixImportExport';
import { canManageSeasonMatrix } from '../utils/userManagement';

const MONTH_LABELS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const REGION_OPTIONS = ['GLOBAL', 'DE', 'AT', 'CH'];

const createInitialFormData = () => ({
  id: '',
  name: '',
  category: '',
  mainSeasonMonths: [],
  secondarySeasonMonths: [],
  seasonScore: 0,
  isActive: true,
  region: 'GLOBAL',
  synonyms: '',
  description: ''
});

const normalizeMonthArray = (months = []) => {
  const unique = [...new Set(
    (months || [])
      .map((month) => Number(month))
      .filter((month) => Number.isInteger(month) && month >= 1 && month <= 12)
  )];
  return unique.sort((a, b) => a - b);
};

const parseMonthInput = (value) => normalizeMonthArray(
  String(value || '')
    .split(/[^0-9]+/)
    .filter(Boolean)
);

const formatMonthRange = (months = []) => {
  const normalized = normalizeMonthArray(months);
  if (normalized.length === 0) return '—';
  if (normalized.length === 1) return MONTH_LABELS[normalized[0] - 1];

  const isContiguous = normalized.every((month, index) => index === 0 || month === normalized[index - 1] + 1);
  if (isContiguous) {
    return `${MONTH_LABELS[normalized[0] - 1]}–${MONTH_LABELS[normalized[normalized.length - 1] - 1]}`;
  }

  return normalized.map((month) => MONTH_LABELS[month - 1]).join(', ');
};

const formatGermanDate = (timestamp) => {
  if (!timestamp) return '—';
  const date = typeof timestamp?.toDate === 'function' ? timestamp.toDate() : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
};

const SEASON_STATUS_CSS_CLASS = {
  [CURRENT_SEASON_STATUS.HAUPTSAISON]: 'hauptsaison',
  [CURRENT_SEASON_STATUS.NEBENSAISON]: 'nebensaison',
  [CURRENT_SEASON_STATUS.BALD_SAISON]: 'bald-saison',
  [CURRENT_SEASON_STATUS.KEINE_SAISON]: 'keine-saison',
};

const resolveUpdatedBy = (currentUser) => {
  if (!currentUser) return undefined;
  const fullName = [currentUser.vorname, currentUser.nachname].filter(Boolean).join(' ').trim();
  return fullName || currentUser.email || currentUser.id || undefined;
};

function SeasonMatrixTab({ currentUser }) {
  const hasSeasonMatrixAccess = canManageSeasonMatrix(currentUser);
  const [entries, setEntries] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [regionFilter, setRegionFilter] = useState('ALLE');
  const [statusFilter, setStatusFilter] = useState('alle');
  const [formData, setFormData] = useState(createInitialFormData());
  const [editingId, setEditingId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [importResult, setImportResult] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const importInputRef = useRef(null);

  useEffect(() => {
    if (!hasSeasonMatrixAccess) return undefined;
    const unsubscribe = subscribeToSeasonMatrix((seasonEntries) => {
      setEntries(seasonEntries);
    });
    return () => unsubscribe();
  }, [hasSeasonMatrixAccess]);

  const filteredEntries = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();

    return entries.filter((entry) => {
      if (regionFilter !== 'ALLE' && entry.region !== regionFilter) return false;
      if (statusFilter === 'aktiv' && entry.isActive !== true) return false;
      if (statusFilter === 'inaktiv' && entry.isActive !== false) return false;

      if (!needle) return true;

      const searchValues = [
        entry.name,
        entry.category,
        ...(Array.isArray(entry.synonyms) ? entry.synonyms : [])
      ].filter(Boolean).map((value) => String(value).toLowerCase());

      return searchValues.some((value) => value.includes(needle));
    });
  }, [entries, searchTerm, regionFilter, statusFilter]);

  if (!hasSeasonMatrixAccess) {
    return (
      <div className="settings-section season-matrix-tab">
        <h3>Saisonmatrix</h3>
        <div className="message error">
          Nur Moderatoren und Administratoren können die Saisonmatrix bearbeiten.
        </div>
      </div>
    );
  }

  const setMonthSelection = (field, month, checked) => {
    setFormData((prev) => {
      const nextMonths = checked
        ? [...prev[field], month]
        : prev[field].filter((value) => value !== month);
      return {
        ...prev,
        [field]: normalizeMonthArray(nextMonths)
      };
    });
  };

  const resetForm = () => {
    setFormData(createInitialFormData());
    setEditingId(null);
    setErrorMessage('');
  };

  const handleEdit = (entry) => {
    const numericScore = Number(entry.seasonScore);
    setFormData({
      id: entry.id || '',
      name: entry.name || '',
      category: entry.category || '',
      mainSeasonMonths: normalizeMonthArray(entry.mainSeasonMonths),
      secondarySeasonMonths: normalizeMonthArray(entry.secondarySeasonMonths),
      seasonScore: Number.isFinite(numericScore) ? numericScore : 0,
      isActive: entry.isActive !== false,
      region: entry.region || 'GLOBAL',
      synonyms: Array.isArray(entry.synonyms) ? entry.synonyms.join(', ') : '',
      description: entry.description || ''
    });
    setEditingId(entry.id);
    setErrorMessage('');
  };

  const validateForm = () => {
    if (!editingId && !formData.id.trim()) return 'Bitte eine ID eingeben.';
    if (!formData.name.trim()) return 'Bitte einen Namen eingeben.';
    if (formData.mainSeasonMonths.length === 0) return 'Bitte mindestens einen Hauptsaison-Monat wählen.';
    if (!Number.isFinite(Number(formData.seasonScore))) return 'Bitte einen gültigen Score eingeben.';
    if (Number(formData.seasonScore) < 0 || Number(formData.seasonScore) > 100) return 'Der Score muss zwischen 0 und 100 liegen.';
    if (!formData.region) return 'Bitte eine Region auswählen.';
    return '';
  };

  const handleSave = async () => {
    const validationError = validateForm();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setErrorMessage('');
    setIsSaving(true);

    const normalizedId = formData.id.trim();
    if (!editingId && entries.some((entry) => entry.id === normalizedId)) {
      setErrorMessage('Diese ID existiert bereits. Bitte eine andere ID verwenden.');
      setIsSaving(false);
      return;
    }
    const payload = {
      id: normalizedId,
      name: formData.name.trim(),
      category: formData.category.trim() || undefined,
      mainSeasonMonths: normalizeMonthArray(formData.mainSeasonMonths),
      secondarySeasonMonths: normalizeMonthArray(formData.secondarySeasonMonths),
      seasonScore: Number(formData.seasonScore),
      isActive: formData.isActive,
      region: formData.region,
      synonyms: formData.synonyms
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
      description: formData.description.trim() || undefined
    };

    if (payload.synonyms.length === 0) {
      payload.synonyms = undefined;
    }

    const updatedBy = resolveUpdatedBy(currentUser);

    try {
      if (editingId) {
        await updateSeasonMatrixEntry(editingId, payload, updatedBy);
      } else {
        await addSeasonMatrixEntry(payload, updatedBy);
      }
      resetForm();
    } catch (error) {
      setErrorMessage(`Fehler beim Speichern: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (entryId) => {
    if (!window.confirm('Möchten Sie diesen Saisonmatrix-Eintrag wirklich löschen?')) return;

    try {
      await deleteSeasonMatrixEntry(entryId);
      if (editingId === entryId) {
        resetForm();
      }
    } catch (error) {
      setErrorMessage(`Fehler beim Löschen: ${error.message}`);
    }
  };

  const handleTemplateDownload = () => {
    const blob = new Blob([createSeasonMatrixTemplateCsv()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'saisonmatrix-import-template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setImportResult({ type: 'success', text: 'Importvorlage wurde heruntergeladen.' });
    console.info('Saisonmatrix Template exportiert');
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

  const handleImport = async (event) => {
    const [file] = event.target.files || [];
    if (!file) return;

    setImportResult(null);
    setErrorMessage('');
    setIsImporting(true);

    try {
      const fileContent = await readImportFile(file);
      const { entries: parsedEntries, errors: parseErrors } = parseSeasonMatrixImport(fileContent, {
        fileName: file.name,
        regionOptions: REGION_OPTIONS
      });
      const updatedBy = resolveUpdatedBy(currentUser);

      let importedCount = 0;
      let updatedCount = 0;
      const importErrors = [...parseErrors];

      for (const entry of parsedEntries) {
        try {
          const exists = entries.some((existingEntry) => existingEntry.id === entry.id);
          if (exists) {
            await updateSeasonMatrixEntry(entry.id, entry, updatedBy);
            updatedCount += 1;
          } else {
            await addSeasonMatrixEntry(entry, updatedBy);
            importedCount += 1;
          }
        } catch (error) {
          importErrors.push(`Eintrag ${entry.id}: ${error.message}`);
        }
      }

      if (importedCount + updatedCount === 0) {
        throw new Error(`Alle Einträge fehlgeschlagen:\n${importErrors.join('\n')}`);
      }

      const status = [`${importedCount} neu`, `${updatedCount} aktualisiert`];
      const message = `Import abgeschlossen (${status.join(', ')}).`;
      if (importErrors.length > 0) {
        setImportResult({ type: 'warning', text: `${message}\nHinweise:\n${importErrors.join('\n')}` });
      } else {
        setImportResult({ type: 'success', text: message });
      }

      console.info('Saisonmatrix importiert', { importedCount, updatedCount, warningCount: importErrors.length });
    } catch (error) {
      setImportResult({ type: 'error', text: `Import fehlgeschlagen: ${error.message}` });
    } finally {
      setIsImporting(false);
      if (importInputRef.current) {
        importInputRef.current.value = '';
      }
    }
  };

  return (
    <>
      <div className="settings-tab-header">
        <h2>Saisonmatrix</h2>
      </div>
      <div className="settings-section season-matrix-tab">
        <p className="section-description">
          Verwalte hier saisonale Zutaten-Einträge inklusive Score und Region.
        </p>

      <div className="season-matrix-import-export">
        <div className="season-matrix-import-export-header">
          <h4>Import &amp; Export</h4>
          <p>
            Lade die Vorlage herunter und befülle Felder wie <code>mainSeasonMonths</code> bzw. <code>synonyms</code> mit
            <strong> | </strong> getrennten Werten (z. B. <code>1|2|3</code>).
          </p>
        </div>
        <div className="season-matrix-import-export-actions">
          <button type="button" className="save-button" onClick={handleTemplateDownload}>
            Template herunterladen
          </button>
          <label htmlFor="season-matrix-import-input" className={`save-button ${isImporting ? 'disabled' : ''}`}>
            {isImporting ? 'Import läuft...' : 'Datei importieren'}
          </label>
          <input
            id="season-matrix-import-input"
            ref={importInputRef}
            type="file"
            accept="text/csv,application/json"
            onChange={handleImport}
            disabled={isImporting}
          />
        </div>
        {importResult && (
          <div className={`season-matrix-import-result ${importResult.type}`}>
            {importResult.text}
          </div>
        )}
      </div>

      <div className="season-matrix-filters">
        <input
          type="text"
          placeholder="Suche nach Name, Kategorie oder Synonymen..."
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
        <select value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)}>
          <option value="ALLE">Alle Regionen</option>
          {REGION_OPTIONS.map((region) => (
            <option key={region} value={region}>{region}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="alle">Alle Status</option>
          <option value="aktiv">Aktiv</option>
          <option value="inaktiv">Inaktiv</option>
        </select>
        <button type="button" className="save-button season-matrix-new-button" onClick={resetForm}>
          Neu
        </button>
      </div>

      <div className="season-matrix-table-container">
        <table className="season-matrix-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Kategorie</th>
              <th>Region</th>
              <th>Hauptsaison</th>
              <th>Score</th>
              <th>Status</th>
              <th>Aktiv</th>
              <th>Letzte Änderung</th>
              <th>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.length === 0 ? (
              <tr>
                <td colSpan={10} className="season-matrix-empty">Keine Einträge gefunden.</td>
              </tr>
            ) : (
              filteredEntries.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.id}</td>
                  <td>
                    {editingId === entry.id ? (
                      <input
                        type="text"
                        className="season-matrix-inline-input"
                        aria-label={`Name für ${entry.id}`}
                        value={formData.name}
                        onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
                      />
                    ) : (
                      entry.name || entry.id
                    )}
                  </td>
                  <td>
                    {editingId === entry.id ? (
                      <input
                        type="text"
                        className="season-matrix-inline-input"
                        aria-label={`Kategorie für ${entry.id}`}
                        value={formData.category}
                        onChange={(event) => setFormData((prev) => ({ ...prev, category: event.target.value }))}
                      />
                    ) : (
                      entry.category || '—'
                    )}
                  </td>
                  <td>
                    {editingId === entry.id ? (
                      <select
                        className="season-matrix-inline-select"
                        aria-label={`Region für ${entry.id}`}
                        value={formData.region}
                        onChange={(event) => setFormData((prev) => ({ ...prev, region: event.target.value }))}
                      >
                        {REGION_OPTIONS.map((region) => (
                          <option key={region} value={region}>{region}</option>
                        ))}
                      </select>
                    ) : (
                      entry.region || '—'
                    )}
                  </td>
                  <td>
                    {editingId === entry.id ? (
                      <input
                        type="text"
                        className="season-matrix-inline-input season-matrix-inline-months"
                        aria-label={`Hauptsaison für ${entry.id}`}
                        placeholder="z. B. 4,5,6"
                        value={formData.mainSeasonMonths.join(',')}
                        onChange={(event) => setFormData((prev) => ({
                          ...prev,
                          mainSeasonMonths: parseMonthInput(event.target.value)
                        }))}
                      />
                    ) : (
                      formatMonthRange(entry.mainSeasonMonths)
                    )}
                  </td>
                  <td>
                    {editingId === entry.id ? (
                      <input
                        type="number"
                        min={0}
                        max={100}
                        className="season-matrix-inline-input"
                        aria-label={`Score für ${entry.id}`}
                        value={formData.seasonScore}
                        onChange={(event) => setFormData((prev) => ({ ...prev, seasonScore: event.target.value }))}
                      />
                    ) : (
                      entry.seasonScore ?? '—'
                    )}
                  </td>
                  <td>
                    {entry.currentSeasonStatus ? (
                      <span className={`current-season-badge ${SEASON_STATUS_CSS_CLASS[entry.currentSeasonStatus] || 'keine-saison'}`}>
                        {entry.currentSeasonStatus}
                      </span>
                    ) : '—'}
                  </td>
                  <td>
                    {editingId === entry.id ? (
                      <input
                        type="checkbox"
                        className="season-matrix-inline-checkbox"
                        aria-label={`Aktiv für ${entry.id}`}
                        checked={formData.isActive}
                        onChange={(event) => setFormData((prev) => ({ ...prev, isActive: event.target.checked }))}
                      />
                    ) : (
                      <span className={`season-status-badge ${entry.isActive ? 'active' : 'inactive'}`}>
                        {entry.isActive ? 'Aktiv' : 'Inaktiv'}
                      </span>
                    )}
                  </td>
                  <td>{formatGermanDate(entry.updatedAt)}</td>
                  <td>
                    <div className="season-matrix-actions">
                      {editingId === entry.id ? (
                        <>
                          <button
                            type="button"
                            className="season-matrix-edit-btn"
                            onClick={handleSave}
                            disabled={isSaving}
                            aria-label={`Speichern für ${entry.id}`}
                          >
                            {isSaving ? 'Speichern...' : 'Speichern'}
                          </button>
                          <button
                            type="button"
                            className="season-matrix-delete-btn"
                            onClick={resetForm}
                            aria-label={`Bearbeitung abbrechen für ${entry.id}`}
                          >
                            Abbrechen
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="season-matrix-edit-btn" onClick={() => handleEdit(entry)}>
                            Bearbeiten
                          </button>
                          <button type="button" className="season-matrix-delete-btn" onClick={() => handleDelete(entry.id)}>
                            Löschen
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="season-matrix-form">
        <h4>{editingId ? 'Eintrag bearbeiten' : 'Neuen Eintrag anlegen'}</h4>
        {errorMessage && <div className="message error">{errorMessage}</div>}

        <div className="season-matrix-grid">
          <label>
            ID *
            <input
              type="text"
              value={formData.id}
              onChange={(event) => setFormData((prev) => ({ ...prev, id: event.target.value }))}
              placeholder="z. B. kartoffel"
              readOnly={Boolean(editingId)}
            />
          </label>
          <label>
            Name *
            <input
              type="text"
              value={formData.name}
              onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
            />
          </label>
          <label>
            Kategorie
            <input
              type="text"
              value={formData.category}
              onChange={(event) => setFormData((prev) => ({ ...prev, category: event.target.value }))}
            />
          </label>
          <label>
            Score (0–100) *
            <input
              type="number"
              min={0}
              max={100}
              value={formData.seasonScore}
              onChange={(event) => setFormData((prev) => ({ ...prev, seasonScore: event.target.value }))}
            />
          </label>
          <label>
            Region *
            <select
              value={formData.region}
              onChange={(event) => setFormData((prev) => ({ ...prev, region: event.target.value }))}
            >
              {REGION_OPTIONS.map((region) => (
                <option key={region} value={region}>{region}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="season-matrix-month-block">
          <p>Hauptsaison-Monate *</p>
          <div className="season-month-checkboxes">
            {MONTH_LABELS.map((monthLabel, index) => {
              const monthValue = index + 1;
              return (
                <label key={`main-${monthValue}`} className="season-month-checkbox">
                  <input
                    type="checkbox"
                    checked={formData.mainSeasonMonths.includes(monthValue)}
                    onChange={(event) => setMonthSelection('mainSeasonMonths', monthValue, event.target.checked)}
                  />
                  {monthLabel}
                </label>
              );
            })}
          </div>
        </div>

        <div className="season-matrix-month-block">
          <p>Nebensaison-Monate</p>
          <div className="season-month-checkboxes">
            {MONTH_LABELS.map((monthLabel, index) => {
              const monthValue = index + 1;
              return (
                <label key={`secondary-${monthValue}`} className="season-month-checkbox">
                  <input
                    type="checkbox"
                    checked={formData.secondarySeasonMonths.includes(monthValue)}
                    onChange={(event) => setMonthSelection('secondarySeasonMonths', monthValue, event.target.checked)}
                  />
                  {monthLabel}
                </label>
              );
            })}
          </div>
        </div>

        <label className="season-matrix-checkbox">
          <input
            type="checkbox"
            checked={formData.isActive}
            onChange={(event) => setFormData((prev) => ({ ...prev, isActive: event.target.checked }))}
          />
          Aktiv
        </label>

        <label className="season-matrix-full-width">
          Synonyme (kommagetrennt)
          <input
            type="text"
            value={formData.synonyms}
            onChange={(event) => setFormData((prev) => ({ ...prev, synonyms: event.target.value }))}
            placeholder="z. B. Erdapfel, Kartoffeln"
          />
        </label>

        <label className="season-matrix-full-width">
          Beschreibung
          <textarea
            value={formData.description}
            rows={3}
            onChange={(event) => setFormData((prev) => ({ ...prev, description: event.target.value }))}
          />
        </label>

        <div className="season-matrix-form-actions">
          <button type="button" className="save-button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Speichern...' : 'Speichern'}
          </button>
          <button type="button" className="reset-button" onClick={resetForm}>
            Abbrechen
          </button>
        </div>
      </div>
    </div>
    </>
  );
}

export default SeasonMatrixTab;

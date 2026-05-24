import React, { useEffect, useMemo, useState } from 'react';
import './SeasonMatrixTab.css';
import {
  subscribeToSeasonMatrix,
  addSeasonMatrixEntry,
  updateSeasonMatrixEntry,
  deleteSeasonMatrixEntry
} from '../utils/seasonMatrix';

const MONTH_LABELS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const REGION_OPTIONS = ['GLOBAL', 'DE', 'AT', 'CH'];
const LABEL_MODE_OPTIONS = ['jetzt_saison', 'bald_saison', 'ausserhalb'];

const createInitialFormData = () => ({
  id: '',
  name: '',
  category: '',
  mainSeasonMonths: [],
  secondarySeasonMonths: [],
  seasonScore: 0,
  labelMode: 'jetzt_saison',
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

const resolveUpdatedBy = (currentUser) => {
  if (!currentUser) return undefined;
  const fullName = [currentUser.vorname, currentUser.nachname].filter(Boolean).join(' ').trim();
  return fullName || currentUser.email || currentUser.id || undefined;
};

function SeasonMatrixTab({ currentUser }) {
  const [entries, setEntries] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [regionFilter, setRegionFilter] = useState('ALLE');
  const [statusFilter, setStatusFilter] = useState('alle');
  const [formData, setFormData] = useState(createInitialFormData());
  const [editingId, setEditingId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const unsubscribe = subscribeToSeasonMatrix((seasonEntries) => {
      setEntries(seasonEntries);
    });
    return () => unsubscribe();
  }, []);

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
      labelMode: entry.labelMode || 'jetzt_saison',
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
    if (!formData.labelMode) return 'Bitte einen Label-Modus auswählen.';
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
      labelMode: formData.labelMode,
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

  return (
    <div className="settings-section season-matrix-tab">
      <h3>Saisonmatrix</h3>
      <p className="section-description">
        Verwalte hier saisonale Zutaten-Einträge inklusive Score, Region und Label-Modus.
      </p>

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
              <th>Name</th>
              <th>Kategorie</th>
              <th>Region</th>
              <th>Hauptsaison</th>
              <th>Score</th>
              <th>Label</th>
              <th>Aktiv</th>
              <th>Letzte Änderung</th>
              <th>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.length === 0 ? (
              <tr>
                <td colSpan={9} className="season-matrix-empty">Keine Einträge gefunden.</td>
              </tr>
            ) : (
              filteredEntries.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.name || entry.id}</td>
                  <td>{entry.category || '—'}</td>
                  <td>{entry.region || '—'}</td>
                  <td>{formatMonthRange(entry.mainSeasonMonths)}</td>
                  <td>{entry.seasonScore ?? '—'}</td>
                  <td>{entry.labelMode || '—'}</td>
                  <td>
                    <span className={`season-status-badge ${entry.isActive ? 'active' : 'inactive'}`}>
                      {entry.isActive ? 'Aktiv' : 'Inaktiv'}
                    </span>
                  </td>
                  <td>{formatGermanDate(entry.updatedAt)}</td>
                  <td>
                    <div className="season-matrix-actions">
                      <button type="button" className="season-matrix-edit-btn" onClick={() => handleEdit(entry)}>
                        Bearbeiten
                      </button>
                      <button type="button" className="season-matrix-delete-btn" onClick={() => handleDelete(entry.id)}>
                        Löschen
                      </button>
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
            Label-Modus *
            <select
              value={formData.labelMode}
              onChange={(event) => setFormData((prev) => ({ ...prev, labelMode: event.target.value }))}
            >
              {LABEL_MODE_OPTIONS.map((mode) => (
                <option key={mode} value={mode}>{mode}</option>
              ))}
            </select>
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
  );
}

export default SeasonMatrixTab;

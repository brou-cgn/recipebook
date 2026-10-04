import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PrintFormatEditor from './PrintFormatEditor';
import DeleteRowButton from './DeleteRowButton';
import UndoSnackbar from './UndoSnackbar';
import useUndoableDelete from '../hooks/useUndoableDelete';
import useSwipeToDelete from '../hooks/useSwipeToDelete';
import {
  loadPrintFormatsForEditing,
  savePrintFormats,
  DEFAULT_PRINT_FORMATS,
  PrintFormatValidationError,
  validatePrintFormats,
  selectPrintFormat,
  createPrintFormat,
  duplicatePrintFormat,
} from '../utils/customLists';
import { getRecipeImages } from '../utils/printRecipe';

const isCatchAll = (f) => f.maxPhotos === null || f.maxPhotos === undefined;

function FormatHeader({ format, canDelete, deleteHint, onNameChange, onDuplicate, onDelete }) {
  const { offset, isDeleteVisible, reset, handlers } = useSwipeToDelete({ disabled: !canDelete });
  const label = format.name || 'Format';
  return (
    <div className={`print-format-header pf-header-row${offset < 0 ? ' pf-swipe-active' : ''}`}>
      <div className="swipe-delete-background" aria-hidden={!isDeleteVisible}>
        {isDeleteVisible && (
          <button
            type="button"
            className="swipe-delete-action"
            onClick={() => { onDelete(); reset(); }}
            aria-label={`${label} entfernen`}
          >
            <span className="swipe-delete-icon-text">🗑</span>
          </button>
        )}
      </div>
      <div
        className="pf-header-content delete-row-hover-target"
        style={{ transform: `translateX(${offset}px)`, transition: 'transform 0.15s ease' }}
        {...handlers}
      >
        <input
          type="text"
          className="print-format-name-input"
          value={format.name}
          placeholder="Formatname"
          aria-label="Formatname"
          onChange={(e) => onNameChange(e.target.value)}
        />
        <button type="button" className="pfe-reset-btn pf-duplicate-btn" onClick={onDuplicate} title="Format duplizieren">
          Duplizieren
        </button>
        <span className="pf-delete-wrap" title={canDelete ? undefined : deleteHint}>
          <DeleteRowButton itemName={label} onClick={onDelete} className="pf-delete-btn" disabled={!canDelete} />
        </span>
      </div>
    </div>
  );
}

/**
 * "Drucklayout" settings tab: list, edit, duplicate, delete and save print formats.
 */
export default function PrintFormatsSettings({ allRecipes = [], allUsers = [] }) {
  const [formats, setFormats] = useState(DEFAULT_PRINT_FORMATS);
  const [loadState, setLoadState] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [usingDefaults, setUsingDefaults] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null); // { type: 'success'|'error', text }
  const [previewRecipeId, setPreviewRecipeId] = useState('');
  const savedJsonRef = useRef('');
  const undo = useUndoableDelete();

  const load = useCallback(async () => {
    setLoadState('loading');
    try {
      const result = await loadPrintFormatsForEditing();
      setFormats(result.formats);
      setUsingDefaults(result.usingDefaults);
      savedJsonRef.current = JSON.stringify(result.formats);
      setLoadState('ready');
    } catch (err) {
      console.error('Error loading print formats:', err);
      setLoadState('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const errors = useMemo(() => validatePrintFormats(formats), [formats]);
  const dirty = loadState === 'ready' && JSON.stringify(formats) !== savedJsonRef.current;

  // Warn before leaving the page with unsaved changes.
  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const updateFormat = (index, next) => setFormats((prev) => prev.map((f, i) => (i === index ? next : f)));

  const catchAllCount = formats.filter(isCatchAll).length;
  const canDeleteAt = (f) => formats.length > 1 && !(isCatchAll(f) && catchAllCount === 1);

  const deleteFormat = (index) => {
    const removed = formats[index];
    if (!removed || !canDeleteAt(removed)) return;
    setFormats((prev) => prev.filter((_, i) => i !== index));
    undo.notifyDeleted({
      id: removed.id,
      name: removed.name || 'Format',
      undo: () => setFormats((prev) => {
        const next = [...prev];
        next.splice(Math.min(index, next.length), 0, removed);
        return next;
      }),
    });
  };

  const addFormat = () => {
    setFormats((prev) => [...prev, createPrintFormat('portrait', `Format ${prev.length + 1}`)]);
  };

  const duplicateFormat = (index) => {
    setFormats((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, duplicatePrintFormat(prev[index]));
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      await savePrintFormats(formats);
      await load(); // show what is really stored (AK 7.3)
      setStatus({ type: 'success', text: 'Druckformate gespeichert.' });
    } catch (err) {
      const text = err instanceof PrintFormatValidationError
        ? err.message
        : `Fehler beim Speichern der Druckformate: ${err.message}`;
      setStatus({ type: 'error', text });
    } finally {
      setSaving(false);
    }
  };

  const previewRecipe = allRecipes.find((r) => r.id === previewRecipeId) || null;
  const previewAuthor = previewRecipe
    ? allUsers.find((u) => u.id === previewRecipe.authorId)?.vorname
    : undefined;
  const activeFormatId = previewRecipe
    ? selectPrintFormat(formats, getRecipeImages(previewRecipe).length)?.id
    : null;
  const errorsFor = (index) => errors.filter((e) => e.index === index);
  const listErrors = errors.filter((e) => e.index === -1);

  if (loadState === 'loading') return <p className="section-description">Druckformate werden geladen…</p>;
  if (loadState === 'error') {
    return (
      <div className="settings-section">
        <p className="pf-error" role="alert">
          Die Druckformate konnten nicht geladen werden. Speichern ist gesperrt, damit die gespeicherten Formate nicht überschrieben werden.
        </p>
        <button type="button" className="save-button" onClick={load}>Erneut laden</button>
      </div>
    );
  }

  return (
    <div className="settings-section">
      <p className="section-description">
        Konfigurieren Sie das Drucklayout für Rezepte. Platzieren Sie die Elemente per Drag &amp; Drop
        frei auf der Seite und passen Sie ihre Größe durch Ziehen an den Rändern an.
        Die Anzahl der Fotos bestimmt, welches Format angewendet wird.
      </p>
      {usingDefaults && (
        <p className="pfe-hint" role="note">Es sind noch keine Druckformate gespeichert; angezeigt wird das Standardformat.</p>
      )}

      {allRecipes.length > 0 && (
        <div className="print-preview-selector">
          <label htmlFor="print-preview-recipe" className="print-preview-label">Vorschau-Rezept:</label>
          <select
            id="print-preview-recipe"
            className="pfe-select"
            value={previewRecipeId}
            onChange={(e) => setPreviewRecipeId(e.target.value)}
          >
            <option value="">– kein Vorschau-Rezept –</option>
            {[...allRecipes]
              .sort((a, b) => (a.title || '').localeCompare(b.title || '', 'de'))
              .map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
          </select>
        </div>
      )}

      {listErrors.map((e, i) => <p key={i} className="pf-error" role="alert">{e.message}</p>)}

      {formats.map((fmt, index) => (
        <div key={fmt.id} className="print-format-item" data-testid="print-format-item">
          <FormatHeader
            format={fmt}
            canDelete={canDeleteAt(fmt)}
            deleteHint={formats.length <= 1
              ? 'Es muss mindestens ein Druckformat vorhanden sein.'
              : 'Mindestens ein Format ohne Fotolimit (Standardformat) muss vorhanden sein.'}
            onNameChange={(name) => updateFormat(index, { ...fmt, name })}
            onDuplicate={() => duplicateFormat(index)}
            onDelete={() => deleteFormat(index)}
          />

          <div className="sort-settings-field" style={{ marginBottom: '0.75rem' }}>
            <label htmlFor={`max-photos-${fmt.id}`}>Maximale Fotoanzahl:</label>
            <input
              id={`max-photos-${fmt.id}`}
              type="number"
              min="0"
              placeholder="Unbegrenzt"
              value={fmt.maxPhotos != null ? fmt.maxPhotos : ''}
              onChange={(e) => {
                const val = e.target.value === '' ? null : parseInt(e.target.value, 10);
                updateFormat(index, { ...fmt, maxPhotos: Number.isNaN(val) ? null : val });
              }}
            />
            <span className="sort-settings-hint">
              Dieses Format wird verwendet, wenn die Anzahl der Fotos ≤ diesem Wert ist. Leer = gilt für alle.
            </span>
          </div>

          {errorsFor(index).map((e, i) => <p key={i} className="pf-error" role="alert">{e.message}</p>)}

          {previewRecipe && (
            <div className="print-preview-header">
              <span className="print-preview-title">Vorschau: {previewRecipe.title}</span>
              <span className={`print-preview-badge print-preview-badge--${activeFormatId === fmt.id ? 'active' : 'inactive'}`}>
                {activeFormatId === fmt.id ? 'Aktives Format für dieses Rezept' : 'Nicht aktiv für dieses Rezept'}
              </span>
            </div>
          )}

          <PrintFormatEditor
            format={fmt}
            onChange={(next) => updateFormat(index, next)}
            previewRecipe={previewRecipe}
            authorName={previewAuthor}
          />
        </div>
      ))}

      <div className="print-format-actions">
        <button type="button" className="save-button" onClick={addFormat}>+ Neues Format hinzufügen</button>
        <button type="button" className="save-button" disabled={saving || errors.length > 0 || !dirty} onClick={save}>
          {saving ? 'Speichern...' : 'Druckformate speichern'}
        </button>
        {dirty && <span className="sort-settings-hint">Ungespeicherte Änderungen</span>}
      </div>
      {status && (
        <p className={status.type === 'error' ? 'pf-error' : 'sort-settings-hint'} role={status.type === 'error' ? 'alert' : 'status'}>
          {status.text}
        </p>
      )}

      <UndoSnackbar itemName={undo.pendingName} onUndo={undo.undo} />
    </div>
  );
}

import React, { useCallback, useEffect, useRef, useState } from 'react';
import './PrintFormatsSettings.css';
import PrintFormatsOverview, { deleteBlocker } from './PrintFormatsOverview';
import PrintFormatScreen from './PrintFormatScreen';
import Button from '../Button';
import UndoSnackbar from '../UndoSnackbar';
import useUndoableDelete from '../../hooks/useUndoableDelete';
import { loadPrintFormatsForEditing, savePrintFormats } from '../../utils/printFormatsFirestore';
import { PrintFormatValidationError, createFlowFormat, duplicatePrintFormat } from '../../utils/print/printFormats';
import { newFormatMaxPhotos, repairPrintFormats } from '../../utils/print/printFormatRules';

const EMPTY = { formats: [], usingDefaults: false, repairs: [] };
const errorText = (err) => (err instanceof PrintFormatValidationError ? err.message : `Fehler beim Speichern: ${err.message}`);
const withoutNotes = ({ migrationNotes, ...format }) => format;

/** What was read from Firestore as the state of the tab; a list that cannot be stored is repaired. */
function loadedState({ formats, usingDefaults }) {
  const repaired = repairPrintFormats(formats);
  return { formats: repaired.formats, usingDefaults, repairs: repaired.repairs };
}

/**
 * Reiter „Drucklayout“ der Einstellungen (Vorhaben Drucklayout, Stufe 3, Entwurf C): die Übersicht
 * der Druckformate und, für ein Format zur Zeit, der Editor im Vollfenster.
 *
 * Gespeichert wird je Handlung, nicht mehr gesammelt: „Speichern“ im Editor schreibt dieses eine
 * Format, Entfernen wirkt sofort (mit „Rückgängig“). Die Formate liegen als ein Feld in settings/app;
 * jedes Speichern schreibt deshalb die ganze Liste, der Reihe nach (commit).
 */
export default function PrintFormatsSettings({ allRecipes = [], allUsers = [] }) {
  const [state, setState] = useState(EMPTY);
  const [loadState, setLoadState] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [error, setError] = useState(null);
  const [savingNow, setSavingNow] = useState(false);
  const [editing, setEditing] = useState(null); // { format, isNew } | null
  const [previewRecipeId, setPreviewRecipeId] = useState('');
  const undo = useUndoableDelete();

  // Für Abläufe, die nach dem Rendern weiterlaufen (Speichern der Reihe nach, „Rückgängig“):
  const formatsRef = useRef(EMPTY.formats); // die Liste, wie sie gerade gilt (auch schon vor dem Speichern)
  const storedRef = useRef(EMPTY); // der letzte Stand aus Firestore: dahin zurück, wenn ein Speichern scheitert
  const queueRef = useRef(Promise.resolve());
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const show = useCallback((next) => {
    formatsRef.current = next.formats;
    if (mountedRef.current) setState(next);
  }, []);

  const load = useCallback(async () => {
    setLoadState('loading');
    try {
      const loaded = loadedState(await loadPrintFormatsForEditing());
      storedRef.current = loaded;
      show(loaded);
      if (mountedRef.current) setLoadState('ready');
    } catch (err) {
      console.error('Error loading print formats:', err);
      if (mountedRef.current) setLoadState('error');
    }
  }, [show]);

  useEffect(() => { load(); }, [load]);

  /**
   * Zeigt die neue Liste sofort und speichert sie; mehrere Aufrufe laufen der Reihe nach.
   * Liefert die Liste, wie sie danach gespeichert ist. Scheitert das Speichern, gilt wieder der
   * letzte gespeicherte Stand (außer ein späterer Aufruf steht schon an) und das Versprechen
   * schlägt fehl. Läuft auch nach dem Verlassen des Reiters zu Ende.
   */
  const commit = useCallback((formats) => {
    show({ ...storedRef.current, formats });
    const job = async () => {
      try {
        await savePrintFormats(formats);
      } catch (err) {
        if (formatsRef.current === formats) show(storedRef.current);
        throw err;
      }
      let stored;
      try {
        // Anzeigen, was wirklich gespeichert ist
        stored = loadedState(await loadPrintFormatsForEditing());
      } catch (err) {
        stored = { formats: formats.map(withoutNotes), usingDefaults: false, repairs: [] };
      }
      storedRef.current = stored;
      if (formatsRef.current === formats) show(stored);
      return stored.formats;
    };
    const result = queueRef.current.then(job);
    queueRef.current = result.catch(() => {});
    return result;
  }, [show]);

  const report = (text) => (err) => {
    console.error(text, err);
    if (mountedRef.current) setError(`${text} ${errorText(err)}`);
  };

  const saveNow = () => {
    setSavingNow(true);
    setError(null);
    commit(formatsRef.current)
      .catch(report('Die Druckformate konnten nicht gespeichert werden.'))
      .finally(() => { if (mountedRef.current) setSavingNow(false); });
  };

  const deleteFormat = (format) => {
    const current = formatsRef.current;
    const index = current.findIndex((f) => f.id === format.id);
    if (index < 0 || deleteBlocker(current, format)) return;
    const name = format.name || 'Format';
    setError(null);
    commit(current.filter((f) => f.id !== format.id)).catch(report(`„${name}“ konnte nicht entfernt werden.`));
    undo.notifyDeleted({
      id: format.id,
      name,
      undo: () => {
        const now = formatsRef.current;
        // Ist das Entfernen gescheitert, steht das Format schon wieder da
        if (now.some((f) => f.id === format.id)) return;
        // Hat inzwischen ein anderes Format dieselbe Fotoanzahl bekommen, kommt es ohne Regel zurück
        const taken = format.maxPhotos != null && now.some((f) => f.maxPhotos === format.maxPhotos);
        const next = [...now];
        next.splice(Math.min(index, next.length), 0, taken ? { ...format, maxPhotos: null } : format);
        commit(next).catch(report(`„${name}“ konnte nicht wiederhergestellt werden.`));
      },
    });
  };

  const createFormat = () => {
    const formats = formatsRef.current;
    const format = { ...createFlowFormat('classic', 'portrait', 'Neues Format'), maxPhotos: newFormatMaxPhotos(formats) };
    setEditing({ format, isNew: true });
  };
  const duplicateFormat = (source) => {
    const format = { ...duplicatePrintFormat(source), maxPhotos: newFormatMaxPhotos(formatsRef.current) };
    setEditing({ format, isNew: true });
  };

  const saveEdited = (draft) => {
    const current = formatsRef.current;
    const next = current.some((f) => f.id === draft.id)
      ? current.map((f) => (f.id === draft.id ? draft : f))
      : [...current, draft];
    setError(null);
    return commit(next).then((stored) => stored.find((f) => f.id === draft.id) || draft);
  };

  if (loadState === 'loading') return <p className="section-description">Druckformate werden geladen…</p>;
  if (loadState === 'error') {
    return (
      <div className="settings-section">
        <p className="pf-error" role="alert">
          Die Druckformate konnten nicht geladen werden. Bearbeiten ist gesperrt, damit die gespeicherten Formate nicht überschrieben werden.
        </p>
        <Button onClick={load}>Erneut laden</Button>
      </div>
    );
  }

  return (
    <>
      <PrintFormatsOverview
        formats={state.formats}
        usingDefaults={state.usingDefaults}
        repairs={state.repairs}
        saving={savingNow}
        error={error}
        recipes={allRecipes}
        checkRecipeId={previewRecipeId}
        onCheckRecipeChange={setPreviewRecipeId}
        onEdit={(format) => setEditing({ format, isNew: false })}
        onDuplicate={duplicateFormat}
        onDelete={deleteFormat}
        onCreate={createFormat}
        onSaveNow={saveNow}
      />
      {editing && (
        <PrintFormatScreen
          key={editing.format.id}
          format={editing.format}
          isNew={editing.isNew}
          formats={state.formats}
          recipes={allRecipes}
          users={allUsers}
          previewRecipeId={previewRecipeId}
          onPreviewRecipeChange={setPreviewRecipeId}
          onSave={saveEdited}
          onClose={() => setEditing(null)}
        />
      )}
      <UndoSnackbar itemName={undo.pendingName} onUndo={undo.undo} />
    </>
  );
}

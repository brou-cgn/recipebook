import React, { useEffect, useMemo, useState } from 'react';
import './DiscoverTopicsTab.css';
import './DeleteRowButton.css';
import './UndoSnackbar.css';
import DeleteRowButton from './DeleteRowButton';
import useSwipeToDelete from '../hooks/useSwipeToDelete';
import useUndoableDelete from '../hooks/useUndoableDelete';
import {
  MONTH_NAMES,
  deleteDiscoverTopic,
  formatPeriod,
  saveDiscoverTopic,
  sortTopics,
  subscribeToDiscoverTopics,
  toMonthDay,
  validateTopic,
} from '../utils/discoverTopics';

const emptyForm = () => ({
  id: '',
  rubrik: '',
  beschreibung: '',
  recipeIds: [],
  periodStart: '',
  periodEnd: '',
  isActive: true,
});

const splitMonthDay = (value) => {
  const [month, day] = (value || '').split('-').map(Number);
  return { month: month || '', day: day || '' };
};

const resolveUpdatedBy = (user) =>
  [user?.vorname, user?.nachname].filter(Boolean).join(' ').trim() || user?.email || user?.id;

// Ein Datum des Zeitraums: Tag + Monat (das Jahr ist egal, der Zeitraum gilt jährlich).
function MonthDayInput({ label, value, onChange }) {
  const { month, day } = splitMonthDay(value);
  const update = (nextMonth, nextDay) => {
    if (!nextMonth && !nextDay) onChange('');
    else onChange(toMonthDay(nextMonth || 1, nextDay || 1));
  };
  return (
    <div className="dtt-monthday">
      <span className="dtt-label">{label}</span>
      <input
        type="number"
        min="1"
        max="31"
        inputMode="numeric"
        aria-label={`${label}: Tag`}
        value={day}
        onChange={(e) => update(month, e.target.value)}
      />
      <select aria-label={`${label}: Monat`} value={month} onChange={(e) => update(e.target.value, day)}>
        <option value="">Monat</option>
        {MONTH_NAMES.map((name, index) => (
          <option key={name} value={index + 1}>{name}</option>
        ))}
      </select>
    </div>
  );
}

function TopicRow({ topic, recipeTitles, onEdit, onDelete }) {
  const { offset, isDeleteVisible, reset, handlers } = useSwipeToDelete();
  const name = topic.rubrik || 'Thema';
  const recipeCount = topic.recipeIds?.length || 0;

  return (
    <div className={`dtt-row${offset < 0 ? ' dtt-swipe-active' : ''}${topic.isActive === false ? ' dtt-inactive' : ''}`}>
      <div className="swipe-delete-background" aria-hidden={!isDeleteVisible}>
        {isDeleteVisible && (
          <button
            type="button"
            className="swipe-delete-action"
            onClick={() => { onDelete(topic); reset(); }}
            aria-label={`${name} entfernen`}
          >
            <span className="swipe-delete-icon-text">🗑</span>
          </button>
        )}
      </div>
      <div
        className="dtt-row-content delete-row-hover-target"
        style={{ transform: `translateX(${offset}px)` }}
        onClick={offset < 0 ? undefined : () => onEdit(topic)}
        {...handlers}
      >
        <span className="dtt-cell dtt-cell-rubrik" data-label="Rubrik">
          {name}
          {topic.isActive === false && <em className="dtt-badge">pausiert</em>}
        </span>
        <span className="dtt-cell dtt-cell-beschreibung" data-label="Beschreibung">{topic.beschreibung}</span>
        <span
          className="dtt-cell dtt-cell-rezepte"
          data-label="Relevante Rezepte"
          title={recipeTitles.join(', ')}
        >
          {recipeCount === 0 ? '—' : recipeCount === 1 ? '1 Rezept' : `${recipeCount} Rezepte`}
        </span>
        <span className="dtt-cell dtt-cell-zeitraum" data-label="Zeitraum">{formatPeriod(topic)}</span>
        <DeleteRowButton
          itemName={name}
          className="dtt-delete"
          onClick={(e) => { e.stopPropagation(); onDelete(topic); }}
        />
      </div>
    </div>
  );
}

function TopicEditor({ initial, allRecipes, onSave, onCancel, saving, error }) {
  const [form, setForm] = useState(initial);
  const [search, setSearch] = useState('');
  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));
  const allYear = !form.periodStart && !form.periodEnd;

  const recipesById = useMemo(() => new Map(allRecipes.map((r) => [r.id, r])), [allRecipes]);
  const selected = form.recipeIds.map((id) => ({ id, title: recipesById.get(id)?.title || 'Unbekanntes Rezept' }));

  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return [];
    return allRecipes
      .filter((r) => !form.recipeIds.includes(r.id) && String(r.title || '').toLowerCase().includes(needle))
      .slice(0, 8);
  }, [allRecipes, form.recipeIds, search]);

  const addRecipe = (id) => { set({ recipeIds: [...form.recipeIds, id] }); setSearch(''); };
  const removeRecipe = (id) => set({ recipeIds: form.recipeIds.filter((rid) => rid !== id) });

  return (
    <form
      className="dtt-editor"
      onSubmit={(e) => { e.preventDefault(); onSave(form); }}
    >
      <h4>{form.id ? 'Thema bearbeiten' : 'Neues Thema'}</h4>
      <label className="dtt-field">
        <span className="dtt-label">Rubrik</span>
        <input
          type="text"
          value={form.rubrik}
          placeholder="z. B. Saison"
          onChange={(e) => set({ rubrik: e.target.value })}
        />
      </label>
      <label className="dtt-field">
        <span className="dtt-label">Beschreibung (Titel auf der Kachel)</span>
        <input
          type="text"
          value={form.beschreibung}
          placeholder="z. B. Kürbis-Zeit"
          onChange={(e) => set({ beschreibung: e.target.value })}
        />
      </label>

      <div className="dtt-field">
        <span className="dtt-label">Zeitraum (gilt jedes Jahr)</span>
        <label className="dtt-check">
          <input
            type="checkbox"
            checked={allYear}
            onChange={(e) => set(e.target.checked
              ? { periodStart: '', periodEnd: '' }
              : { periodStart: '01-01', periodEnd: '12-31' })}
          />
          Ganzjährig
        </label>
        {!allYear && (
          <>
            <div className="dtt-period">
              <MonthDayInput label="Von" value={form.periodStart} onChange={(v) => set({ periodStart: v })} />
              <MonthDayInput label="Bis" value={form.periodEnd} onChange={(v) => set({ periodEnd: v })} />
            </div>
            <p className="dtt-hint">Liegt „Von" nach „Bis", läuft der Zeitraum über den Jahreswechsel (z. B. 15. Dezember – 6. Januar).</p>
          </>
        )}
      </div>

      <div className="dtt-field">
        <span className="dtt-label">Relevante Rezepte</span>
        {selected.length > 0 && (
          <ul className="dtt-chips">
            {selected.map((r) => (
              <li key={r.id} className="dtt-chip delete-row-hover-target">
                <span>{r.title}</span>
                <DeleteRowButton itemName={r.title} onClick={() => removeRecipe(r.id)} />
              </li>
            ))}
          </ul>
        )}
        <input
          type="search"
          value={search}
          placeholder="Rezept suchen und hinzufügen"
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Rezept suchen"
        />
        {matches.length > 0 && (
          <ul className="dtt-matches">
            {matches.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => addRecipe(r.id)}>{r.title}</button>
              </li>
            ))}
          </ul>
        )}
        <p className="dtt-hint">Nur Rezepte, die alle Nutzer sehen dürfen (nicht privat, nicht gruppengebunden), kommen in die Rotation.</p>
      </div>

      <label className="dtt-check">
        <input type="checkbox" checked={form.isActive} onChange={(e) => set({ isActive: e.target.checked })} />
        In der Rotation verwenden
      </label>

      {error && <div className="message error">{error}</div>}
      <div className="dtt-actions">
        <button type="button" className="dtt-btn" onClick={onCancel} disabled={saving}>Abbrechen</button>
        <button type="submit" className="dtt-btn dtt-btn-primary" disabled={saving}>
          {saving ? 'Speichern…' : 'Speichern'}
        </button>
      </div>
    </form>
  );
}

/**
 * DiscoverTopicsTab – Admin-Liste der Themen für die Kachel "Für dich
 * entdeckt" (Einstellungen). Spalten: Rubrik, Beschreibung, Relevante
 * Rezepte, Zeitraum. Der Rotationsjob zieht daraus die aktuell relevanten
 * Themen (siehe utils/discoverTopics.js).
 */
function DiscoverTopicsTab({ currentUser, allRecipes = [] }) {
  const isAdmin = currentUser?.isAdmin === true || currentUser?.role === 'admin';
  const [topics, setTopics] = useState([]);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { banners, pendingKeys, scheduleDelete, undoDelete } = useUndoableDelete();

  useEffect(() => {
    if (!isAdmin) return undefined;
    return subscribeToDiscoverTopics(setTopics);
  }, [isAdmin]);

  const recipesById = useMemo(() => new Map(allRecipes.map((r) => [r.id, r])), [allRecipes]);
  const visibleTopics = useMemo(
    () => sortTopics(topics.filter((t) => !pendingKeys.has(t.id))),
    [topics, pendingKeys]
  );

  if (!isAdmin) {
    return (
      <div className="settings-section dtt">
        <h3>Für dich entdeckt</h3>
        <div className="message error">Nur Administratoren können die Themen pflegen.</div>
      </div>
    );
  }

  const handleSave = async (form) => {
    const validation = validateTopic(form);
    if (validation) { setError(validation); return; }
    setSaving(true);
    setError('');
    try {
      await saveDiscoverTopic(form, resolveUpdatedBy(currentUser));
      setEditing(null);
    } catch (e) {
      console.error('Error saving discover topic:', e);
      setError('Das Thema konnte nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  };

  // Verschwindet sofort aus der Liste; Firestore-Delete läuft nach dem Undo-Fenster.
  const handleDelete = (topic) => {
    scheduleDelete({
      key: topic.id,
      message: `„${topic.rubrik || 'Thema'}" entfernt`,
      onConfirm: () => deleteDiscoverTopic(topic.id).catch((e) => console.error('Error deleting discover topic:', e)),
      onUndo: () => {},
    });
  };

  const openEditor = (topic) => {
    setError('');
    setEditing(topic ? { ...emptyForm(), ...topic } : emptyForm());
  };

  return (
    <div className="settings-section dtt">
      <h3>Für dich entdeckt</h3>
      <p className="dtt-intro">
        Themen für die Startseiten-Kachel. Der wöchentliche Rotationsjob wählt unter den Themen, deren
        Zeitraum heute gilt, eines aus und füllt die Listen mit bis zu 5 der zugehörigen Rezepte.
        Ist kein Thema relevant, bleiben die Listen unverändert.
      </p>

      {editing ? (
        <TopicEditor
          initial={editing}
          allRecipes={allRecipes}
          saving={saving}
          error={error}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <button type="button" className="dtt-btn dtt-btn-primary" onClick={() => openEditor(null)}>
          Thema hinzufügen
        </button>
      )}

      <div className="dtt-list" role="table" aria-label="Themen">
        <div className="dtt-head" role="row">
          <span role="columnheader">Rubrik</span>
          <span role="columnheader">Beschreibung</span>
          <span role="columnheader">Relevante Rezepte</span>
          <span role="columnheader">Zeitraum</span>
          <span aria-hidden="true" />
        </div>
        {visibleTopics.length === 0 && <p className="dtt-empty">Noch keine Themen angelegt.</p>}
        {visibleTopics.map((topic) => (
          <TopicRow
            key={topic.id}
            topic={topic}
            recipeTitles={(topic.recipeIds || []).map((id) => recipesById.get(id)?.title).filter(Boolean)}
            onEdit={openEditor}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {banners.map((banner) => (
        <div key={banner.id} className="undo-snackbar" role="status">
          <span className="undo-snackbar-message">{banner.message}</span>
          <button type="button" className="undo-snackbar-action" onClick={() => undoDelete(banner.id)}>
            Rückgängig
          </button>
        </div>
      ))}
    </div>
  );
}

export default DiscoverTopicsTab;

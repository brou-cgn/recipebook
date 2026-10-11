import React, { useEffect, useMemo, useState } from 'react';
import './DiscoverTopicsTab.css';
import './DeleteRowButton.css';
import './UndoSnackbar.css';
import DeleteRowButton from './DeleteRowButton';
import useSwipeToDelete from '../hooks/useSwipeToDelete';
import useUndoableDelete from '../hooks/useUndoableDelete';
import { getCustomLists } from '../utils/customLists';
import { useOptionalNutritionReference } from '../contexts/NutritionReferenceContext';
import { searchIngredientIds } from '../utils/ingredientIdMatching';
import {
  MONTH_NAMES,
  deleteDiscoverTopic,
  emptyRecipeRule,
  formatDisplayDays,
  formatPeriod,
  formatRecipeRule,
  normalizeRecipeRule,
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
  displayDays: '',
  recipeRule: emptyRecipeRule(),
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

// Ein-/Ausschlussliste der Rezepte-Regel. Mit `options` Auswahl aus einer Liste, sonst Freitext.
function RuleValues({ label, values, options, searchRows, onChange }) {
  const [draft, setDraft] = useState('');
  const [active, setActive] = useState(0);
  // Typeahead nur, wenn eine Zutaten-Referenz geladen ist; sonst Freitext.
  const suggestions = useMemo(
    () => (searchRows?.length ? searchIngredientIds(draft, searchRows).filter((m) => !values.includes(m.ingredientID)) : []),
    [draft, searchRows, values]
  );
  const add = (value) => {
    const v = String(value || '').trim();
    if (v && !values.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...values, v]);
    setDraft('');
    setActive(0);
  };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' && suggestions.length) { e.preventDefault(); setActive((a) => Math.min(a + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp' && suggestions.length) { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Escape') setDraft('');
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (searchRows?.length) { if (suggestions[active]) add(suggestions[active].ingredientID); } else add(draft);
    }
  };
  return (
    <div className="dtt-rule-values">
      <ul className="dtt-chips">
        {values.map((v) => (
          <li key={v} className="dtt-chip delete-row-hover-target">
            <span>{v}</span>
            <DeleteRowButton itemName={v} onClick={() => onChange(values.filter((x) => x !== v))} />
          </li>
        ))}
      </ul>
      {options ? (
        <select aria-label={label} value="" onChange={(e) => add(e.target.value)}>
          <option value="">+ hinzufügen</option>
          {options.filter((o) => !values.includes(o)).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <>
          <input
            type="text"
            aria-label={label}
            value={draft}
            placeholder={searchRows?.length ? 'Zutat suchen …' : '+ hinzufügen (Enter)'}
            autoComplete="off"
            onChange={(e) => { setDraft(e.target.value); setActive(0); }}
            onKeyDown={onKeyDown}
            onBlur={() => { if (!searchRows?.length) add(draft); }}
          />
          {suggestions.length > 0 && (
            <ul className="dtt-matches" role="listbox" aria-label={`${label}: Vorschläge`}>
              {suggestions.map((m, i) => (
                <li key={m.ingredientID} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    className={i === active ? 'dtt-match-active' : undefined}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => add(m.ingredientID)}
                  >
                    {m.ingredientID}
                    {m.displayName && m.displayName !== m.ingredientID && <em className="dtt-match-sub"> {m.displayName}</em>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function RuleFilter({ title, filter, options, searchRows, onChange }) {
  return (
    <div className="dtt-rule-filter">
      <span className="dtt-label">{title}</span>
      <div className="dtt-rule-pair">
        <span className="dtt-rule-tag">Einschließen</span>
        <RuleValues
          label={`${title} einschließen`}
          values={filter.include}
          options={options}
          searchRows={searchRows}
          onChange={(include) => onChange({ ...filter, include })}
        />
        <span className="dtt-rule-tag">Ausschließen</span>
        <RuleValues
          label={`${title} ausschließen`}
          values={filter.exclude}
          options={options}
          searchRows={searchRows}
          onChange={(exclude) => onChange({ ...filter, exclude })}
        />
      </div>
    </div>
  );
}

function RuleRange({ title, range, onChange }) {
  const set = (key) => (e) => onChange({ ...range, [key]: e.target.value === '' ? null : e.target.value });
  return (
    <div className="dtt-rule-range">
      <span className="dtt-label">{title}</span>
      <label>
        vor mindestens
        <input type="number" min="0" inputMode="numeric" aria-label={`${title}: mindestens Tage`}
          value={range.minDays ?? ''} onChange={set('minDays')} />
        Tagen
      </label>
      <label>
        und höchstens
        <input type="number" min="0" inputMode="numeric" aria-label={`${title}: höchstens Tage`}
          value={range.maxDays ?? ''} onChange={set('maxDays')} />
        Tagen
      </label>
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
        <span className="dtt-cell dtt-cell-dauer" data-label="Anzeige-Dauer">{formatDisplayDays(topic)}</span>
        <span className="dtt-cell dtt-cell-regel" data-label="Rezepte-Regel">{formatRecipeRule(topic.recipeRule)}</span>
        <DeleteRowButton
          itemName={name}
          className="dtt-delete"
          onClick={(e) => { e.stopPropagation(); onDelete(topic); }}
        />
      </div>
    </div>
  );
}

function TopicEditor({ initial, allRecipes, cuisineOptions, categoryOptions, ingredientRows, onSave, onCancel, saving, error }) {
  const [form, setForm] = useState(initial);
  const [search, setSearch] = useState('');
  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));
  const allYear = !form.periodStart && !form.periodEnd;
  const rule = normalizeRecipeRule(form.recipeRule);
  const setRule = (patch) => set({ recipeRule: { ...rule, ...patch } });

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

      <label className="dtt-field">
        <span className="dtt-label">Anzeige-Dauer (in Tagen)</span>
        <input
          type="number"
          min="1"
          inputMode="numeric"
          value={form.displayDays ?? ''}
          placeholder="7"
          onChange={(e) => set({ displayDays: e.target.value })}
        />
        <p className="dtt-hint">Wie lange das Thema auf einer Liste bleibt, bevor neu gezogen wird. Leer = 7 Tage.</p>
      </label>

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

      <fieldset className="dtt-field dtt-rule">
        <legend className="dtt-label">Rezepte-Regel</legend>
        <p className="dtt-hint">
          Wählt zusätzlich zu den Rezepten oben weitere Rezepte aus. Verschiedene Kriterien gelten zusammen (UND);
          mehrere Werte beim Einschließen gelten als ODER. Zutaten suchst du per Tippen (unscharf, auch mit Tippfehlern) aus der Zutaten-Referenz.
        </p>
        <RuleFilter title="Zutat (ingredientID)" filter={rule.ingredientIds} searchRows={ingredientRows}
          onChange={(ingredientIds) => setRule({ ingredientIds })} />
        <RuleFilter title="Speisekategorie" filter={rule.mealCategories} options={categoryOptions}
          onChange={(mealCategories) => setRule({ mealCategories })} />
        <RuleFilter title="Kulinariktyp" filter={rule.cuisines} options={cuisineOptions}
          onChange={(cuisines) => setRule({ cuisines })} />
        <RuleRange title="Erstellt" range={rule.created} onChange={(created) => setRule({ created })} />
        <RuleRange title="Zuletzt gekocht" range={rule.lastCooked}
          onChange={(lastCooked) => setRule({ lastCooked })} />
        <label className="dtt-field">
          <span className="dtt-label">Erstellt und Zuletzt gekocht</span>
          <select value={rule.dateMode} onChange={(e) => setRule({ dateMode: e.target.value })}>
            <option value="all">müssen beide zutreffen</option>
            <option value="any">es genügt eines von beiden</option>
          </select>
        </label>
        <label className="dtt-field">
          <span className="dtt-label">Gilt für</span>
          <select value={rule.dateScope} onChange={(e) => setRule({ dateScope: e.target.value })}>
            <option value="all">Aktionen aller Nutzer</option>
            <option value="own">nur eigene Aktionen (Erstellt / Gekocht)</option>
          </select>
        </label>
        <p className="dtt-hint">
          „Nur eigene": Alle Treffer bleiben im Thema, ausgespielt werden sie aber nur an Nutzer, die das Rezept
          selbst erstellt bzw. gekocht haben. Von Hand ausgewählte Rezepte bekommen weiterhin alle.
        </p>
        <p className="dtt-hint">
          Gleiche Werte bei „mindestens" und „höchstens" bedeuten „genau vor n Tagen" (z. B. 365 = vor einem Jahr).
          Nie gekochte Rezepte erfüllen keine Bedingung bei „Zuletzt gekocht".
        </p>
      </fieldset>

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
 * Rezepte, Zeitraum, Anzeige-Dauer, Rezepte-Regel. Der Rotationsjob zieht daraus die aktuell relevanten
 * Themen (siehe utils/discoverTopics.js).
 */
function DiscoverTopicsTab({ currentUser, allRecipes = [] }) {
  const isAdmin = currentUser?.isAdmin === true || currentUser?.role === 'admin';
  const [topics, setTopics] = useState([]);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [listOptions, setListOptions] = useState({ cuisines: [], categories: [] });
  const nutritionRef = useOptionalNutritionReference();
  const { banners, pendingKeys, scheduleDelete, undoDelete } = useUndoableDelete();

  useEffect(() => {
    if (!isAdmin) return undefined;
    return subscribeToDiscoverTopics(setTopics);
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return undefined;
    let cancelled = false;
    getCustomLists()
      .then((lists) => {
        if (!cancelled) setListOptions({ cuisines: lists?.cuisineTypes || [], categories: lists?.mealCategories || [] });
      })
      .catch((e) => console.warn('Custom lists for discover rules not loaded:', e));
    return () => { cancelled = true; };
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
    setEditing(topic ? { ...emptyForm(), ...topic, recipeRule: normalizeRecipeRule(topic.recipeRule) } : emptyForm());
  };

  return (
    <div className="settings-section dtt">
      <h3>Für dich entdeckt</h3>
      <p className="dtt-intro">
        Themen für die Startseiten-Kachel. Der wöchentliche Rotationsjob wählt unter den Themen, deren
        Zeitraum heute gilt, eines aus und füllt die Listen mit bis zu 5 der zugehörigen Rezepte
        (von Hand gewählt oder per Rezepte-Regel). Das Thema bleibt so viele Tage, wie die Anzeige-Dauer vorgibt.
        Ist kein Thema relevant, bleiben die Listen unverändert.
      </p>

      {editing ? (
        <TopicEditor
          initial={editing}
          allRecipes={allRecipes}
          cuisineOptions={listOptions.cuisines}
          categoryOptions={listOptions.categories}
          ingredientRows={nutritionRef?.rows}
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
          <span role="columnheader">Anzeige-Dauer</span>
          <span role="columnheader">Rezepte-Regel</span>
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

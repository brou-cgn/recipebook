import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './PrintFormatScreen.css';
import TemplateFormatEditor from './TemplateFormatEditor';
import Button from '../Button';
import ConfirmDialog from '../ConfirmDialog';
import ChevronRightIcon from '../icons/ChevronRightIcon';
import useModalScrollLock from '../../hooks/useModalScrollLock';
import { isConvertedFreeFormat, selectPrintFormat, validatePrintFormats } from '../../utils/print/printFormats';
import { describeFormatRules, formatRuleScope, nextFreeLimit } from '../../utils/print/printFormatRules';
import { getRecipeImages } from '../../utils/print/printRecipe';

const isCatchAll = (format) => format.maxPhotos === null || format.maxPhotos === undefined;
const photoCountText = (n) => (n === 0 ? 'ohne Foto' : n === 1 ? '1 Foto' : `${n} Fotos`);

/**
 * Ein Druckformat im Vollfenster bearbeiten (Vorhaben Drucklayout, Entwurf C): oben die Leiste mit
 * Zurück, Name, Regel in Klartext und Speichern, darunter der Vorlagen-Editor, unten das Rezept der
 * Vorschau. Gespeichert wird nur dieses Format. Die Leiste bleibt beim Scrollen stehen, am Handy
 * nur „Zurück“ und „Speichern“ (PrintFormatScreen.css).
 *
 * Props:
 *   format          {object}   das Format beim Öffnen (ein neues ist noch nicht gespeichert)
 *   isNew           {boolean}  neu angelegt oder dupliziert, noch nicht in der Liste
 *   formats         {Array}    alle gespeicherten Formate (für Regel und Prüfung)
 *   recipes, users  {Array}    Rezepte für die Vorschau und ihre Autoren
 *   previewRecipeId {string}
 *   onPreviewRecipeChange {(id: string) => void}
 *   onSave          {(format) => Promise<object>} speichert und liefert das Format, wie es gespeichert ist
 *   onClose         {() => void}
 */
export default function PrintFormatScreen({
  format, isNew = false, formats, recipes = [], users = [],
  previewRecipeId = '', onPreviewRecipeChange, onSave, onClose,
}) {
  const [draft, setDraft] = useState(format);
  // Der Stand, mit dem „geändert“ verglichen wird: beim Öffnen, danach das zuletzt Gespeicherte
  const [baseline, setBaseline] = useState(() => JSON.stringify(format));
  const [unsaved, setUnsaved] = useState(isNew || isConvertedFreeFormat(format));
  const [limitText, setLimitText] = useState(isCatchAll(format) ? '' : String(format.maxPhotos));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [askDiscard, setAskDiscard] = useState(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const screenRef = useRef(null);
  const scrollRef = useRef(null);
  const nameRef = useRef(null);
  const titleId = useId();
  const nameId = useId();
  const ruleId = useId();
  const recipeId = useId();

  useModalScrollLock();

  // Beim Öffnen in den Editor springen, beim Schließen zurück zu dem Knopf, der ihn geöffnet hat
  // (ein neues Format beginnt im Namensfeld; sonst bekommt das Fenster den Fokus, damit am Handy
  // nicht gleich die Tastatur aufgeht). Solange das Fenster offen ist, ist die App dahinter für
  // Tastatur und Screenreader abgeschaltet (inert): Der Editor liegt als Portal neben #root.
  useEffect(() => {
    const opener = document.activeElement;
    const app = document.getElementById('root');
    const wasInert = app ? app.hasAttribute('inert') : true;
    if (!wasInert) app.setAttribute('inert', '');
    if (isNew) {
      nameRef.current?.focus();
      nameRef.current?.select();
    } else {
      screenRef.current?.focus();
    }
    return () => {
      if (!wasInert) app.removeAttribute('inert');
      if (opener && typeof opener.focus === 'function') opener.focus();
    };
  }, [isNew]);

  const others = useMemo(() => formats.filter((f) => f.id !== format.id), [formats, format.id]);
  // Die Liste, wie sie nach dem Speichern aussähe: das Format an seinem Platz, ein neues am Ende
  const list = useMemo(() => {
    const exists = formats.some((f) => f.id === format.id);
    return exists ? formats.map((f) => (f.id === format.id ? draft : f)) : [...formats, draft];
  }, [formats, format.id, draft]);
  const index = list.findIndex((f) => f.id === draft.id);

  const changed = JSON.stringify(draft) !== baseline;
  const limitValid = isCatchAll(draft) || /^\d+$/.test(limitText.trim());
  // Dieselbe Fotoanzahl wie ein anderes Format: validatePrintFormats meldet das am späteren der beiden
  // in der Liste, hier zählt es immer als Fehler dieses Formats.
  const sameLimit = isCatchAll(draft) ? null : others.find((f) => f.maxPhotos === draft.maxPhotos);
  const errors = useMemo(
    () => validatePrintFormats(list).filter((e) => (e.index === index && e.field !== 'maxPhotos') || e.index === -1),
    [list, index],
  );
  const nameErrors = errors.filter((e) => e.field === 'name');
  const otherErrors = errors.filter((e) => e.field !== 'name');
  const ruleError = sameLimit ? `Die Fotoanzahl ${draft.maxPhotos} ist bereits bei „${sameLimit.name}“ vergeben.` : null;
  const invalid = errors.length > 0 || !limitValid || !!sameLimit;
  const canSave = (changed || unsaved) && !invalid && !saving;

  // Vor dem Schließen des Fensters warnen, solange etwas nicht gespeichert ist
  useEffect(() => {
    if (!changed) return undefined;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [changed]);

  const update = (next) => { setDraft(next); setSaved(false); setError(null); };

  // Regel: „höchstens N Fotos“ oder „alle übrigen Rezepte“. Ein Format muss für den Rest gelten;
  // ist dieses das einzige dafür, lässt sich die Regel hier nicht ändern.
  const showRule = others.length > 0;
  const onlyRest = isCatchAll(draft) && !others.some(isCatchAll);
  const rules = describeFormatRules(list);
  const rule = rules[index];
  const scope = formatRuleScope(rule);
  const shadow = rule?.shadowedBy ? list.find((f) => f.id === rule.shadowedBy) : null;
  // Formate, die mit dieser Regel nie mehr gewählt würden (in der Liste steht dieses vor ihnen)
  const displaced = rules
    .filter((r) => r.kind === 'unused' && r.shadowedBy === draft.id)
    .map((r) => `„${list.find((f) => f.id === r.id)?.name}“`);
  const setMode = (mode) => {
    if (mode === 'rest') {
      update({ ...draft, maxPhotos: null });
      setLimitText('');
    } else {
      const limit = nextFreeLimit(others);
      update({ ...draft, maxPhotos: limit });
      setLimitText(String(limit));
    }
  };
  const setLimit = (text) => {
    setLimitText(text);
    setSaved(false);
    if (/^\d+$/.test(text.trim())) update({ ...draft, maxPhotos: parseInt(text.trim(), 10) });
  };

  const save = async () => {
    const sent = draft;
    setSaving(true);
    setError(null);
    try {
      const stored = await onSave(sent);
      setBaseline(JSON.stringify(stored));
      setUnsaved(false);
      // Wurde währenddessen weitergearbeitet, bleibt der neuere Stand stehen
      if (draftRef.current === sent) {
        setDraft(stored);
        setLimitText(isCatchAll(stored) ? '' : String(stored.maxPhotos));
        setSaved(true);
      }
    } catch (err) {
      setError(`Das Format konnte nicht gespeichert werden: ${err.message}`);
      // Am Handy scrollt die Leiste mit der Meldung mit dem Inhalt weg: zurück nach oben
      scrollRef.current?.scrollTo?.({ top: 0 });
    } finally {
      setSaving(false);
    }
  };

  const requestClose = () => {
    if (saving) return;
    if (changed) setAskDiscard(true);
    else onClose();
  };
  const quotedName = draft.name?.trim() ? `„${draft.name.trim()}“` : null;
  const discardMessage = unsaved && isNew
    ? `${quotedName || 'Das neue Format'} ist noch nicht gespeichert und geht verloren.`
    : `Die Änderungen${quotedName ? ` an ${quotedName}` : ''} sind noch nicht gespeichert und gehen verloren.`;

  const previewRecipe = recipes.find((r) => r.id === previewRecipeId) || null;
  const previewAuthor = previewRecipe ? users.find((u) => u.id === previewRecipe.authorId)?.vorname : undefined;
  const sortedRecipes = useMemo(
    () => [...recipes].sort((a, b) => (a.title || '').localeCompare(b.title || '', 'de')),
    [recipes],
  );
  const chosen = previewRecipe && showRule ? selectPrintFormat(list, getRecipeImages(previewRecipe).length) : null;

  // Neben „Speichern“: warum der Knopf gesperrt ist bzw. ob etwas offen ist. Am Handy stehen die
  // Fehler selbst oben bei Name und Regel und können weggescrollt sein.
  let status = null;
  if (!saving) {
    if (invalid) status = { text: 'Eingabe prüfen', kind: 'invalid' };
    else if (changed || unsaved) status = { text: 'Ungespeichert', kind: 'open' };
    else if (saved) status = { text: 'Gespeichert', kind: 'saved' };
  }

  return createPortal(
    <div
      ref={screenRef}
      className="pfs-screen"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-testid="print-format-screen"
    >
      <div className="pfs-scroll" ref={scrollRef}>
        <header className="pfs-bar">
          <Button className="pfs-back" onClick={requestClose} disabled={saving} aria-label="Zurück zu den Druckformaten">
            <span className="pfs-back-icon" aria-hidden="true"><ChevronRightIcon size={16} /></span>
            <span className="pfs-back-text">Druckformate</span>
          </Button>
          <h2 id={titleId} className="pfs-title">Druckformat bearbeiten</h2>

          <div className="pfs-field pfs-field--name">
            <label htmlFor={nameId} className="pfs-label">Name</label>
            <input
              ref={nameRef}
              id={nameId}
              type="text"
              className="pfs-name"
              value={draft.name}
              aria-invalid={nameErrors.length > 0}
              onChange={(e) => update({ ...draft, name: e.target.value })}
            />
            {nameErrors.map((e) => <p key={e.message} className="pf-error" role="alert">{e.message}</p>)}
          </div>

          {showRule && (
            <div className="pfs-field pfs-field--rule">
              <label htmlFor={ruleId} className="pfs-label">Gilt für</label>
              <div className="pfs-rule-row">
                <select
                  id={ruleId}
                  className="pfe-select pfs-rule-select"
                  value={isCatchAll(draft) ? 'rest' : 'limit'}
                  disabled={onlyRest}
                  onChange={(e) => setMode(e.target.value)}
                >
                  <option value="limit">Rezepte mit höchstens …</option>
                  <option value="rest">alle übrigen Rezepte</option>
                </select>
                {!isCatchAll(draft) && (
                  <>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      className="pfe-props-number pfs-limit"
                      aria-label="Höchste Fotoanzahl"
                      aria-invalid={!limitValid || !!ruleError}
                      value={limitText}
                      onChange={(e) => setLimit(e.target.value)}
                    />
                    <span className="pfs-limit-unit" aria-hidden="true">Fotos</span>
                  </>
                )}
              </div>
              {!limitValid && <p className="pf-error" role="alert">Bitte eine ganze Zahl ab 0 eingeben.</p>}
              {limitValid && ruleError && <p className="pf-error" role="alert">{ruleError}</p>}
              {limitValid && !ruleError && (
                <p className={`pfs-rule-effect${scope && displaced.length === 0 ? '' : ' pfs-rule-effect--unused'}`}>
                  {scope
                    ? `Dieses Format druckt ${scope}.`
                    : `Wird so nicht verwendet${shadow ? `: „${shadow.name}“ gilt bereits für dieselben Rezepte.` : '.'}`}
                  {displaced.length > 0 && ` ${displaced.join(', ')} ${displaced.length === 1 ? 'wird' : 'werden'} dadurch nicht mehr verwendet.`}
                  {onlyRest && ' Ein Format muss für alle übrigen Rezepte gelten; stelle zuerst ein anderes darauf um, um hier eine Fotoanzahl zu wählen.'}
                </p>
              )}
            </div>
          )}

          <div className="pfs-actions">
            {status && <span className={`pfs-status pfs-status--${status.kind}`} role="status">{status.text}</span>}
            <Button variant="primary" className="pfs-save" loading={saving} disabled={!canSave} onClick={save}>
              {saving ? 'Speichert …' : 'Speichern'}
            </Button>
          </div>
          {(error || otherErrors.length > 0) && (
            <div className="pfs-errors">
              {error && <p className="pf-error" role="alert">{error}</p>}
              {otherErrors.map((e) => <p key={e.message} className="pf-error" role="alert">{e.message}</p>)}
            </div>
          )}
        </header>

        <div className="pfs-body">
          <div className="pfs-content">
            <TemplateFormatEditor
              format={draft}
              onChange={update}
              previewRecipe={previewRecipe}
              authorName={previewAuthor}
            />
          </div>
        </div>
      </div>

      {sortedRecipes.length > 0 && (
        <footer className="pfs-footer">
          <label htmlFor={recipeId} className="pfs-label">Vorschau mit</label>
          <select
            id={recipeId}
            className="pfe-select pfs-recipe-select"
            value={previewRecipe ? previewRecipeId : ''}
            onChange={(e) => onPreviewRecipeChange(e.target.value)}
          >
            <option value="">Beispielrezept</option>
            {sortedRecipes.map((r) => (
              <option key={r.id} value={r.id}>{r.title} ({photoCountText(getRecipeImages(r).length)})</option>
            ))}
          </select>
          {chosen && (
            <span className={`pfs-chosen${chosen.id === draft.id ? ' pfs-chosen--this' : ''}`} role="status">
              {chosen.id === draft.id
                ? 'Dieses Rezept druckt mit diesem Format.'
                : `Dieses Rezept druckt mit „${chosen.name}“, nicht mit diesem Format.`}
            </span>
          )}
        </footer>
      )}

      {askDiscard && (
        <ConfirmDialog
          title="Änderungen verwerfen?"
          message={discardMessage}
          confirmLabel="Verwerfen"
          onConfirm={onClose}
          onCancel={() => setAskDiscard(false)}
        />
      )}
    </div>,
    document.body,
  );
}

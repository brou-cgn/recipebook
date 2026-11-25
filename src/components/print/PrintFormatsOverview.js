import React, { useMemo } from 'react';
import PrintFormatCard from './PrintFormatCard';
import Button from '../Button';
import { isConvertedFreeFormat, selectPrintFormat } from '../../utils/print/printFormats';
import { describeFormatRules, formatRuleOverview, formatRuleSentence } from '../../utils/print/printFormatRules';
import { getRecipeImages } from '../../utils/print/printRecipe';

const isCatchAll = (format) => format.maxPhotos === null || format.maxPhotos === undefined;
const photoCountText = (n) => (n === 0 ? 'ohne Foto' : n === 1 ? '1 Foto' : `${n} Fotos`);

/** Why a format cannot be removed; null when it can. */
export function deleteBlocker(formats, format) {
  if (formats.length <= 1) return 'Es muss mindestens ein Druckformat geben.';
  if (isCatchAll(format) && formats.filter(isCatchAll).length === 1) {
    return 'Dieses Format gilt für alle übrigen Rezepte. Ein solches Format muss es geben.';
  }
  return null;
}

/**
 * Übersicht der Druckformate (Einstellungen › Drucklayout): je Format eine Karte mit der Regel in
 * Klartext, dazu die Leiste „So wählt die App beim Drucken“ und die Probe mit einem Rezept.
 * Zeigt nur an; geladen und gespeichert wird in PrintFormatsSettings.
 *
 * Props:
 *   formats            {Array}    die Druckformate, wie sie gelten
 *   usingDefaults      {boolean}  es ist noch nichts gespeichert
 *   repairs            {string[]} was beim Laden korrigiert wurde (noch nicht gespeichert)
 *   saving             {boolean}  „Jetzt speichern“ läuft
 *   error              {string}   Meldung eines fehlgeschlagenen Speicherns
 *   recipes            {Array}    Rezepte für „Prüfen mit Rezept“
 *   checkRecipeId      {string}
 *   onCheckRecipeChange, onEdit, onDuplicate, onDelete, onCreate, onSaveNow {function}
 */
export default function PrintFormatsOverview({
  formats, usingDefaults = false, repairs = [], saving = false, error = null,
  recipes = [], checkRecipeId = '', onCheckRecipeChange,
  onEdit, onDuplicate, onDelete, onCreate, onSaveNow,
}) {
  const rules = useMemo(() => describeFormatRules(formats), [formats]);
  const several = formats.length > 1;
  const converted = formats.filter(isConvertedFreeFormat).length;
  const sortedRecipes = useMemo(
    () => [...recipes].sort((a, b) => (a.title || '').localeCompare(b.title || '', 'de')),
    [recipes],
  );
  const checkRecipe = recipes.find((r) => r.id === checkRecipeId) || null;
  const checkCount = checkRecipe ? getRecipeImages(checkRecipe).length : 0;
  const chosen = checkRecipe ? selectPrintFormat(formats, checkCount) : null;

  const ruleNote = (rule) => {
    if (rule.kind !== 'unused') return undefined;
    const other = formats.find((f) => f.id === rule.shadowedBy);
    return other
      ? `„${other.name}“ gilt bereits für dieselben Rezepte. Lege unter „Bearbeiten“ fest, für welche Rezepte dieses Format gelten soll.`
      : 'Lege unter „Bearbeiten“ fest, für welche Rezepte dieses Format gelten soll.';
  };

  return (
    <div className="settings-section pf-overview">
      <p className="section-description">
        Jedes Druckformat ist ein eigenes Blatt mit Vorlage, Papier und Schrift.
        {several
          ? ' Beim Drucken nimmt die App das Format, dessen Regel zur Fotoanzahl des Rezepts passt.'
          : ' Solange es nur dieses eine gibt, druckt die App jedes Rezept damit.'}
      </p>

      {usingDefaults && (
        <p className="pfe-hint" role="note">Es sind noch keine Druckformate gespeichert; die App druckt mit dem Standardformat.</p>
      )}
      {(converted > 0 || repairs.length > 0) && (
        <div className="pf-notice" role="note">
          {converted > 0 && (
            <p>
              {converted === 1
                ? 'Ein Format war ein freies Layout und wurde auf die Vorlage „Klassisch“ umgestellt.'
                : `${converted} Formate waren freie Layouts und wurden auf die Vorlage „Klassisch“ umgestellt.`}
              {' '}Bitte prüfen. Gespeichert wird die Umstellung mit dem nächsten Speichern.
            </p>
          )}
          {repairs.length > 0 && (
            <>
              <p>Die gespeicherten Formate passten nicht zusammen und wurden korrigiert:</p>
              <ul>{repairs.map((text) => <li key={text}>{text}</li>)}</ul>
            </>
          )}
          <Button variant="primary" loading={saving} onClick={onSaveNow}>
            {saving ? 'Speichert …' : 'Jetzt speichern'}
          </Button>
        </div>
      )}
      {error && <p className="pf-error" role="alert">{error}</p>}

      <ul className="pf-cards" aria-label="Druckformate">
        {formats.map((format, index) => {
          const rule = rules[index];
          const blocker = deleteBlocker(formats, format);
          return (
            <PrintFormatCard
              key={format.id}
              format={format}
              rule={several ? formatRuleSentence(rule) : undefined}
              ruleNote={several ? ruleNote(rule) : undefined}
              unused={rule.kind === 'unused'}
              active={several && chosen?.id === format.id}
              note={isConvertedFreeFormat(format) ? 'Aus einem freien Layout umgestellt, bitte prüfen.' : undefined}
              canDelete={!blocker}
              deleteHint={blocker || undefined}
              onEdit={() => onEdit(format)}
              onDuplicate={() => onDuplicate(format)}
              onDelete={() => onDelete(format)}
            />
          );
        })}
        <li className="pf-card pf-card--new">
          <button type="button" className="pf-card-new" onClick={onCreate}>
            <span className="pf-card-new-plus" aria-hidden="true">+</span>
            <span className="pf-card-new-title">Neues Format</span>
            <span className="pf-card-new-text">Mit einer Vorlage beginnen</span>
          </button>
        </li>
      </ul>

      {several && (
        <section className="pf-rules" aria-labelledby="pf-rules-title">
          <h3 id="pf-rules-title" className="pf-rules-title">So wählt die App beim Drucken</h3>
          <ol className="pf-rules-list">
            {formatRuleOverview(formats).map((entry) => (
              <li key={entry.id} className="pf-rules-item">
                <span className="pf-rules-range">{entry.label}</span>
                <span className="pf-rules-name">{entry.name}</span>
              </li>
            ))}
          </ol>
          {sortedRecipes.length > 0 && (
            <div className="pf-check">
              <label htmlFor="pf-check-recipe" className="pf-check-label">Prüfen mit Rezept</label>
              <select
                id="pf-check-recipe"
                className="pfe-select"
                value={checkRecipe ? checkRecipeId : ''}
                onChange={(e) => onCheckRecipeChange(e.target.value)}
              >
                <option value="">Rezept wählen</option>
                {sortedRecipes.map((r) => (
                  <option key={r.id} value={r.id}>{r.title} ({photoCountText(getRecipeImages(r).length)})</option>
                ))}
              </select>
              {chosen && (
                <p className="pf-check-result" role="status">
                  druckt mit <strong>{chosen.name}</strong>.
                </p>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

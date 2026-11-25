import React from 'react';
import PrintPage from './PrintPage';
import Button from '../Button';
import RowIconButton from '../RowIconButton';
import DeleteRowButton from '../DeleteRowButton';
import CopyIcon from '../icons/CopyIcon';
import TrashIcon from '../icons/TrashIcon';
import useSwipeToDelete from '../../hooks/useSwipeToDelete';
import { getPageSize } from '../../utils/print/printLayout';
import { SAMPLE_RECIPE } from '../../utils/print/printSampleRecipe';
import { describePaper, getTemplate } from '../../utils/print/printTemplates';

/** Höhe des Blatts in der Karte; die Breite folgt dem Seitenverhältnis des Formats. */
const PAPER_HEIGHT_PX = 168;

/**
 * Ein Druckformat als Karte der Übersicht: Miniatur des Blatts, Name, Regel in Klartext,
 * Vorlage und Papier, dazu Bearbeiten, Duplizieren und Entfernen (am Handy per Linksswipe).
 *
 * Props:
 *   format      {object}   das Druckformat
 *   rule        {string}   Regel als Satz („Für Rezepte mit 2 bis 3 Fotos“); fehlt, wenn es nur ein Format gibt
 *   ruleNote    {string}   Zusatz zur Regel, etwa warum das Format nicht verwendet wird
 *   unused      {boolean}  das Format wird beim Drucken nie gewählt
 *   active      {boolean}  das Format druckt das zur Prüfung gewählte Rezept
 *   note        {string}   Hinweis am Format (z. B. aus dem freien Layout umgestellt)
 *   canDelete   {boolean}
 *   deleteHint  {string}   warum das Format nicht entfernt werden kann
 *   onEdit, onDuplicate, onDelete {function}
 */
export default function PrintFormatCard({
  format, rule, ruleNote, unused = false, active = false, note,
  canDelete, deleteHint, onEdit, onDuplicate, onDelete,
}) {
  const { offset, isDeleteVisible, reset, handlers } = useSwipeToDelete({ disabled: !canDelete });
  const name = format.name || 'Format';
  const page = getPageSize(format);
  const paperWidth = Math.round((PAPER_HEIGHT_PX * page.widthCm) / page.heightCm);

  return (
    <li
      className={`pf-card${active ? ' pf-card--active' : ''}${offset < 0 ? ' pf-card--swiping' : ''}`}
      data-testid="print-format-card"
    >
      <div className="swipe-delete-background" aria-hidden={!isDeleteVisible}>
        {isDeleteVisible && (
          <button
            type="button"
            className="swipe-delete-action"
            onClick={() => { onDelete(); reset(); }}
            aria-label={`${name} entfernen`}
          >
            <span className="swipe-delete-icon-text"><TrashIcon /></span>
          </button>
        )}
      </div>
      <div
        className="pf-card-content"
        style={{ transform: `translateX(${offset}px)`, transition: 'transform 0.15s ease' }}
        {...handlers}
      >
        <div className="pf-card-thumb" aria-hidden="true">
          <div className="pf-card-paper" style={{ width: `min(100%, ${paperWidth}px)`, maxHeight: `${PAPER_HEIGHT_PX}px` }}>
            <PrintPage recipe={SAMPLE_RECIPE} format={format} authorName="Anna" mode="preview" embedded thumbnail />
          </div>
        </div>
        <div className="pf-card-text">
          <h3 className="pf-card-name">{name}</h3>
          {rule && <p className={`pf-card-rule${unused ? ' pf-card-rule--unused' : ''}`}>{rule}</p>}
          {ruleNote && <p className="pf-card-note">{ruleNote}</p>}
          <p className="pf-card-meta">Vorlage {getTemplate(format.template).label} · {describePaper(page)}</p>
          {active && <p className="pf-card-badge">Druckt das gewählte Rezept</p>}
          {note && <p className="pf-card-note" role="note">{note}</p>}
        </div>
        <div className="pf-card-actions delete-row-hover-target">
          <Button onClick={onEdit} aria-label={`${name} bearbeiten`}>Bearbeiten</Button>
          <span className="pf-card-spacer" />
          <RowIconButton label={`${name} duplizieren`} onClick={onDuplicate}><CopyIcon /></RowIconButton>
          <span className="pf-card-delete" title={canDelete ? undefined : deleteHint}>
            <DeleteRowButton itemName={name} onClick={onDelete} disabled={!canDelete} />
          </span>
        </div>
      </div>
    </li>
  );
}

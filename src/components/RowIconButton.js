import React from 'react';
import './RowIconButton.css';

/**
 * Symbol-Knopf ohne Text: in einer Listenzeile (Umbenennen, Bearbeiten, Verschieben) und als Schließen-Kreuz im
 * Kopf eines Dialogs (CloseThinIcon). Das neutrale Gegenstück zum DeleteRowButton (Tech-Check A8, Entscheidung vom
 * 23.11.2026). Gleiche Form, 28 × 28 px, rund, ohne Rahmen und Fläche; beim Darüberfahren und im Fokus eine graue
 * statt einer roten Tönung.
 *
 * `label` ist Tooltip und aria-label, etwa „<Name> umbenennen“ oder „Schließen“; das Symbol kommt als Kind
 * (PencilIcon, ArrowVerticalIcon, CloseThinIcon …). Nicht für Löschen (dafür DeleteRowButton) und nicht für
 * Aktionen mit Text (Button).
 */
const RowIconButton = React.forwardRef(function RowIconButton({ label, className = '', children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={`row-icon-button${className ? ` ${className}` : ''}`}
      aria-label={label}
      title={label}
      {...rest}
    >
      {children}
    </button>
  );
});

export default RowIconButton;

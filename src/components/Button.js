import React from 'react';
import './Button.css';

export const BUTTON_VARIANTS = ['primary', 'secondary', 'danger', 'danger-quiet', 'ghost'];

/**
 * Einheitlicher Knopf (Button-System, Tech-Check A8; Designvorschlag Entwurf B mit 8-px-Ecken).
 *
 * Rollen (`variant`):
 * - primary: die eine Aktion, die den Schritt abschließt (Speichern, Anlegen). Höchstens einer
 *   je Bildschirm oder Dialog. Orange, im Event-Bereich grün.
 * - secondary (Standard): Abbrechen, Zurück und alle weiteren Aktionen.
 * - danger: nur die Bestätigung in der Lösch-Rückfrage.
 * - danger-quiet: Löschen in einer Werkzeugleiste, das erst die Rückfrage öffnet.
 * - ghost: selten gebrauchte Aktionen ohne eigene Fläche (Zurücksetzen).
 *
 * Nicht für Zeilen-Löschen (DeleteRowButton), schwebende runde Knöpfe, Chips, Tabs und Links.
 * Die Höhe folgt der Bildschirmbreite (40 px, bis 768 px 48 px); `loading` sperrt den Knopf
 * und setzt aria-busy, der Text sagt dann, was gerade passiert („Speichert …“).
 */
const Button = React.forwardRef(function Button(
  { variant = 'secondary', icon = null, loading = false, fullWidth = false, type = 'button', className = '', disabled, children, ...rest },
  ref
) {
  const role = BUTTON_VARIANTS.includes(variant) ? variant : 'secondary';
  const classes = [
    'ui-button',
    `ui-button--${role}`,
    fullWidth ? 'ui-button--full' : '',
    loading ? 'ui-button--loading' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="ui-button__spinner" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
});

export default Button;

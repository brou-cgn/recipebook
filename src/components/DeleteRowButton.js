import React from 'react';
import './DeleteRowButton.css';
import CloseThinIcon from './icons/CloseThinIcon';
import { useTexte } from '../contexts/SpracheContext';
import allgemeinTexte from '../i18n/texte/allgemein';

// Unified row-delete action used everywhere an item can be removed from a
// list (guests, event drinks, selected recipes, ingredients, steps, ...).
// See DeleteRowButton.css for the resting/hover/active/focus states — the
// row it sits in should carry the `delete-row-hover-target` class so the
// icon can react to the row (not just the button) being hovered.
// Tooltip/aria-label is „<Name> entfernen" in the current language (nameEntfernen in allgemein.js,
// Mehrsprachigkeit PR 6g); the Wichtel participant page passes its own text as `label`.
function DeleteRowButton({ itemName, label: labelText, onClick, className = '', ...rest }) {
  const t = useTexte(allgemeinTexte);
  const label = labelText || t('nameEntfernen', { name: itemName });

  return (
    <button
      type="button"
      className={`delete-row-button${className ? ` ${className}` : ''}`}
      onClick={onClick}
      aria-label={label}
      title={label}
      {...rest}
    >
      <CloseThinIcon size={13} />
    </button>
  );
}

export default DeleteRowButton;

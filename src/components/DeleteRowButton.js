import React from 'react';
import './DeleteRowButton.css';
import CloseThinIcon from './icons/CloseThinIcon';

// Unified row-delete action used everywhere an item can be removed from a
// list (guests, event drinks, selected recipes, ingredients, steps, ...).
// See DeleteRowButton.css for the resting/hover/active/focus states — the
// row it sits in should carry the `delete-row-hover-target` class so the
// icon can react to the row (not just the button) being hovered.
function DeleteRowButton({ itemName, onClick, className = '', ...rest }) {
  const label = `${itemName} entfernen`;

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

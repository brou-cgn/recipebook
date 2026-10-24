import { useState } from 'react';

/**
 * Inline rename of a list row label: edit state, Enter/Escape/blur handling.
 * `onRename(oldLabel, trimmedNewLabel)` is only called for a changed, non-empty value.
 */
export default function useInlineRename(label, onRename) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(label);

  const start = () => {
    setEditValue(label);
    setIsEditing(true);
  };

  const confirm = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== label && onRename) {
      onRename(label, trimmed);
    }
    setIsEditing(false);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') confirm();
    else if (e.key === 'Escape') setIsEditing(false);
  };

  return { isEditing, editValue, setEditValue, start, confirm, onKeyDown };
}

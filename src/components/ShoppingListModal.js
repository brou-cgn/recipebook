import React, { useState, useEffect, useRef } from 'react';
import './ShoppingListModal.css';

function ShoppingListModal({ items, title, onClose, shareId, onEnableSharing, hideBringButton }) {
  const [listItems, setListItems] = useState(() =>
    items.map((text, index) => ({ id: index, text, checked: false }))
  );
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [bringLoading, setBringLoading] = useState(false);
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (closeButtonRef.current) {
      closeButtonRef.current.focus();
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (editingId !== null) {
          setEditingId(null);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, editingId]);

  const toggleChecked = (id) => {
    setListItems(prev =>
      prev.map(item => item.id === id ? { ...item, checked: !item.checked } : item)
    );
  };

  const startEditing = (id, currentText) => {
    setEditingId(id);
    setEditText(currentText);
  };

  const saveEdit = () => {
    if (editingId === null) return;
    setListItems(prev =>
      prev.map(item => item.id === editingId ? { ...item, text: editText } : item)
    );
    setEditingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const checkedCount = listItems.filter(i => i.checked).length;

  const handleBringExport = async () => {
    setBringLoading(true);
    try {
      let sid = shareId;
      if (!sid && onEnableSharing) {
        sid = await onEnableSharing();
      }
      if (!sid) {
        alert('Das Rezept muss zuerst geteilt werden, um es an Bring! zu übergeben.');
        return;
      }
      const exportUrl = `${window.location.origin}/bring-export?shareId=${encodeURIComponent(sid)}`;
      const bringUrl = `https://api.getbring.com/rest/bringrecipes/deeplink?url=${encodeURIComponent(exportUrl)}&source=web`;
      window.open(bringUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('Bring! export failed:', err);
      alert('Fehler beim Exportieren zu Bring!. Bitte versuchen Sie es erneut.');
    } finally {
      setBringLoading(false);
    }
  };

  return (
    <div className="shopping-list-overlay" onClick={onClose}>
      <div
        className="shopping-list-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Einkaufsliste"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shopping-list-header">
          <h2 className="shopping-list-title">🛒 Einkaufsliste</h2>
          <button
            ref={closeButtonRef}
            className="shopping-list-close"
            onClick={onClose}
            aria-label="Einkaufsliste schließen"
          >
            ✕
          </button>
        </div>

        {title && (
          <div className="shopping-list-subtitle">{title}</div>
        )}

        <div className="shopping-list-body">
          {listItems.length === 0 ? (
            <p className="shopping-list-empty">Keine Zutaten vorhanden.</p>
          ) : (
            <ul className="shopping-list-items">
              {listItems.map((item) => (
                <li key={item.id} className={`shopping-list-item${item.checked ? ' checked' : ''}`}>
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={() => toggleChecked(item.id)}
                    className="shopping-list-checkbox"
                    aria-label={item.text}
                  />
                  {editingId === item.id ? (
                    <input
                      type="text"
                      className="shopping-list-edit-input"
                      value={editText}
                      autoFocus
                      onChange={(e) => setEditText(e.target.value)}
                      onBlur={saveEdit}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit();
                        if (e.key === 'Escape') cancelEdit();
                      }}
                    />
                  ) : (
                    <span
                      className="shopping-list-item-text"
                      onDoubleClick={() => !item.checked && startEditing(item.id, item.text)}
                    >
                      {item.text}
                    </span>
                  )}
                  {editingId !== item.id && (
                    <button
                      className="shopping-list-edit-btn"
                      onClick={() => !item.checked && startEditing(item.id, item.text)}
                      aria-label="Zutat bearbeiten"
                      disabled={item.checked}
                      title="Bearbeiten"
                    >
                      ✎
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="shopping-list-footer">
          <span className="shopping-list-count">
            {checkedCount} / {listItems.length} erledigt
          </span>
          {!hideBringButton && <button
            className="shopping-list-bring-btn"
            onClick={handleBringExport}
            disabled={bringLoading || listItems.length === 0}
            title="Einkaufsliste an Bring! übergeben"
          >
            {bringLoading ? '…' : '🛍️ Bring!'}
          </button>}
          <button
            className="shopping-list-reset-btn"
            onClick={() => setListItems(prev => prev.map(i => ({ ...i, checked: false })))}
          >
            Zurücksetzen
          </button>
          <button
            className="shopping-list-close-btn"
            onClick={onClose}
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}

export default ShoppingListModal;

import React, { useState, useEffect } from 'react';
import './GroupCreateDialog.css';
import { LIST_KIND_OPTIONS } from '../utils/groupFirestore';

/**
 * Dialog for editing an existing private group's properties (name, listKind, targetListId).
 * @param {Object} props
 * @param {Object} props.group - The group to edit
 * @param {Function} props.onSave - Called with { name, listKind, targetListId?, newTargetListName? } when saving
 * @param {Function} props.onCancel - Called when dialog is dismissed
 * @param {Array}  props.privateLists - Existing private lists available as target lists (excludes current group)
 */
function GroupEditDialog({ group, onSave, onCancel, privateLists = [] }) {
  const [name, setName] = useState(group?.name || '');
  const [listKind, setListKind] = useState(group?.listKind || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Target list state (only used when listKind === 'interactive')
  const [targetListMode, setTargetListMode] = useState(() => {
    if (group?.listKind === 'interactive' && group?.targetListId) return 'select';
    return '';
  });
  const [targetListId, setTargetListId] = useState(group?.targetListId || '');
  const [newTargetListName, setNewTargetListName] = useState('');

  // Reset target list state when listKind changes away from 'interactive'
  useEffect(() => {
    if (listKind !== 'interactive') {
      setTargetListMode('');
      setTargetListId('');
      setNewTargetListName('');
    }
  }, [listKind]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Bitte gib einen Listennamen ein.');
      return;
    }
    if (!listKind) {
      setError('Bitte wähle eine Art der Liste aus.');
      return;
    }
    if (listKind === 'interactive') {
      if (!targetListMode) {
        setError('Bitte wähle eine Ziel-Liste aus oder lege eine neue an.');
        return;
      }
      if (targetListMode === 'select' && !targetListId) {
        setError('Bitte wähle eine bestehende Liste als Ziel aus.');
        return;
      }
      if (targetListMode === 'create' && !newTargetListName.trim()) {
        setError('Bitte gib einen Namen für die neue Ziel-Liste ein.');
        return;
      }
    }
    setSaving(true);
    try {
      const saveData = { name: name.trim(), listKind };
      if (listKind === 'interactive') {
        if (targetListMode === 'select') {
          saveData.targetListId = targetListId;
        } else if (targetListMode === 'create') {
          saveData.newTargetListName = newTargetListName.trim();
        }
      }
      await onSave(saveData);
    } catch (err) {
      setError('Fehler beim Speichern. Bitte erneut versuchen.');
      setSaving(false);
    }
  };

  const isInteractive = listKind === 'interactive';

  return (
    <div className="group-dialog-overlay" role="dialog" aria-modal="true" aria-label="Liste bearbeiten">
      <div className="group-dialog">
        <div className="group-dialog-header">
          <h2>Liste bearbeiten</h2>
          <button className="group-dialog-close" onClick={onCancel} aria-label="Schließen">×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="group-dialog-field">
            <label htmlFor="edit-group-name">Listenname *</label>
            <input
              id="edit-group-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z. B. Familie, Freunde, Team..."
              maxLength={80}
              autoFocus
            />
          </div>

          <div className="group-dialog-field">
            <label htmlFor="edit-group-list-kind">Art *</label>
            <select
              id="edit-group-list-kind"
              value={listKind}
              onChange={(e) => setListKind(e.target.value)}
              required
            >
              <option value="">– Bitte auswählen –</option>
              {LIST_KIND_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {isInteractive && (
            <div className="group-dialog-field">
              <label>Ziel-Liste *</label>
              <p className="group-dialog-hint">
                Interaktive Listen benötigen eine Ziel-Liste, in die Rezepte verschoben werden können.
              </p>
              <div className="group-target-list-options">
                <label className="group-target-list-option">
                  <input
                    type="radio"
                    name="editTargetListMode"
                    value="select"
                    checked={targetListMode === 'select'}
                    onChange={() => { setTargetListMode('select'); setTargetListId(''); setNewTargetListName(''); }}
                    disabled={privateLists.length === 0}
                  />
                  <span>Bestehende Liste wählen</span>
                </label>
                <label className="group-target-list-option">
                  <input
                    type="radio"
                    name="editTargetListMode"
                    value="create"
                    checked={targetListMode === 'create'}
                    onChange={() => { setTargetListMode('create'); setTargetListId(''); }}
                  />
                  <span>Neue Liste anlegen</span>
                </label>
              </div>

              {targetListMode === 'select' && (
                <select
                  id="edit-target-list-select"
                  value={targetListId}
                  onChange={(e) => setTargetListId(e.target.value)}
                  aria-label="Bestehende Liste auswählen"
                >
                  <option value="">– Bitte auswählen –</option>
                  {privateLists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name}
                    </option>
                  ))}
                </select>
              )}

              {targetListMode === 'create' && (
                <input
                  id="edit-new-target-list-name"
                  type="text"
                  value={newTargetListName}
                  onChange={(e) => setNewTargetListName(e.target.value)}
                  placeholder="Name der neuen Liste..."
                  maxLength={80}
                  aria-label="Name der neuen Ziel-Liste"
                />
              )}
            </div>
          )}

          {error && <p className="group-dialog-error">{error}</p>}

          <div className="group-dialog-actions">
            <button type="button" className="group-btn-secondary" onClick={onCancel} disabled={saving}>
              Abbrechen
            </button>
            <button type="submit" className="group-btn-primary" disabled={saving}>
              {saving ? 'Speichern...' : 'Speichern'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default GroupEditDialog;

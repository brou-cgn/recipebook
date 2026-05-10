import React, { useState, useEffect } from 'react';
import './GroupCreateDialog.css';
import { LIST_KIND_OPTIONS } from '../utils/groupFirestore';

/**
 * Dialog for creating a new private group.
 * @param {Object} props
 * @param {Array}  props.allUsers - All users available for member selection
 * @param {Object} props.currentUser - The current authenticated user
 * @param {Function} props.onSave - Called with { name, memberIds, memberRoles, listKind, targetListId?, newTargetListName? } when saving
 * @param {Function} props.onCancel - Called when dialog is dismissed
 * @param {Array}  props.privateLists - Existing private lists available as target lists (used when listKind is 'interactive')
 */
function GroupCreateDialog({ allUsers, currentUser, onSave, onCancel, privateLists = [] }) {
  const [name, setName] = useState('');
  const [listKind, setListKind] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Target list state (only used when listKind === 'interactive')
  const [targetListMode, setTargetListMode] = useState(''); // '' | 'select' | 'create'
  const [targetListId, setTargetListId] = useState('');
  const [newTargetListName, setNewTargetListName] = useState('');

  // Other users the owner can add as members
  const otherUsers = (allUsers || []).filter((u) => u.id !== currentUser?.id);

  const toggleMember = (userId) => {
    setSelectedMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  // When an existing list is selected as target, sync its members into the interactive list
  useEffect(() => {
    if (targetListMode === 'select' && targetListId) {
      const selectedList = privateLists.find((l) => l.id === targetListId);
      if (selectedList) {
        const membersFromList = (selectedList.memberIds || []).filter(
          (id) => id !== currentUser?.id
        );
        setSelectedMemberIds(membersFromList);
      }
    }
  }, [targetListMode, targetListId, privateLists, currentUser?.id]);

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
      // Owner is always a member; selectedMemberIds already excludes the owner
      const memberIds = [currentUser.id, ...selectedMemberIds];
      const saveData = { name: name.trim(), memberIds, memberRoles: {}, listKind };
      if (listKind === 'interactive') {
        if (targetListMode === 'select') {
          saveData.targetListId = targetListId;
        } else if (targetListMode === 'create') {
          saveData.newTargetListName = newTargetListName.trim();
        }
      }
      await onSave(saveData);
    } catch (err) {
      setError('Fehler beim Erstellen der Liste. Bitte erneut versuchen.');
      setSaving(false);
    }
  };

  const isInteractive = listKind === 'interactive';
  const membersAreFromSelectedList = isInteractive && targetListMode === 'select' && targetListId;

  return (
    <div className="group-dialog-overlay" role="dialog" aria-modal="true" aria-label="Liste erstellen">
      <div className="group-dialog">
        <div className="group-dialog-header">
          <h2>Neue Liste erstellen</h2>
          <button className="group-dialog-close" onClick={onCancel} aria-label="Schließen">×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="group-dialog-field">
            <label htmlFor="group-name">Listenname *</label>
            <input
              id="group-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z. B. Familie, Freunde, Team..."
              maxLength={80}
              autoFocus
            />
          </div>

          <div className="group-dialog-field">
            <label htmlFor="group-list-kind">Art *</label>
            <select
              id="group-list-kind"
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
                    name="targetListMode"
                    value="select"
                    checked={targetListMode === 'select'}
                    onChange={() => { setTargetListMode('select'); setTargetListId(''); }}
                    disabled={privateLists.length === 0}
                  />
                  <span>Bestehende Liste wählen</span>
                </label>
                <label className="group-target-list-option">
                  <input
                    type="radio"
                    name="targetListMode"
                    value="create"
                    checked={targetListMode === 'create'}
                    onChange={() => { setTargetListMode('create'); setTargetListId(''); }}
                  />
                  <span>Neue Liste anlegen</span>
                </label>
              </div>

              {targetListMode === 'select' && (
                <select
                  id="target-list-select"
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
                  id="new-target-list-name"
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

          {otherUsers.length > 0 && (
            <div className="group-dialog-field">
              <label>
                Mitglieder hinzufügen
                {membersAreFromSelectedList && (
                  <span className="group-dialog-hint-inline"> (aus gewählter Ziel-Liste übernommen)</span>
                )}
              </label>
              <div className="group-member-list">
                {otherUsers.map((user) => (
                  <label key={user.id} className="group-member-item">
                    <input
                      type="checkbox"
                      checked={selectedMemberIds.includes(user.id)}
                      onChange={() => toggleMember(user.id)}
                      disabled={membersAreFromSelectedList}
                    />
                    <span className="group-member-name">
                      {user.vorname} {user.nachname}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {error && <p className="group-dialog-error">{error}</p>}

          <div className="group-dialog-actions">
            <button type="button" className="group-btn-secondary" onClick={onCancel} disabled={saving}>
              Abbrechen
            </button>
            <button type="submit" className="group-btn-primary" disabled={saving}>
              {saving ? 'Erstellen...' : 'Liste erstellen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default GroupCreateDialog;

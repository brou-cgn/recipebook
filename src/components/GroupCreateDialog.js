import React, { useState } from 'react';
import './GroupCreateDialog.css';

/**
 * Dialog for creating a new private group.
 * @param {Object} props
 * @param {Array}  props.allUsers - All users available for member selection
 * @param {Object} props.currentUser - The current authenticated user
 * @param {Function} props.onSave - Called with { name, memberIds, memberRoles } when saving
 * @param {Function} props.onCancel - Called when dialog is dismissed
 */
function GroupCreateDialog({ allUsers, currentUser, onSave, onCancel }) {
  const [name, setName] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Other users the owner can add as members
  const otherUsers = (allUsers || []).filter((u) => u.id !== currentUser?.id);

  const toggleMember = (userId) => {
    setSelectedMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Bitte gib einen Listennamen ein.');
      return;
    }
    setSaving(true);
    try {
      // Owner is always a member; selectedMemberIds already excludes the owner
      const memberIds = [currentUser.id, ...selectedMemberIds];
      await onSave({ name: name.trim(), memberIds, memberRoles: {} });
    } catch (err) {
      setError('Fehler beim Erstellen der Liste. Bitte erneut versuchen.');
      setSaving(false);
    }
  };

  return (
    <div className="group-dialog-overlay" role="dialog" aria-modal="true" aria-label="Liste erstellen">
      <div className="group-dialog">
        <div className="group-dialog-header">
          <h2>Neue Liste erstellen</h2>
          <button className="group-dialog-close" onClick={onCancel} aria-label="Schließen">✕</button>
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

          {otherUsers.length > 0 && (
            <div className="group-dialog-field">
              <label>Mitglieder hinzufügen</label>
              <div className="group-member-list">
                {otherUsers.map((user) => (
                  <label key={user.id} className="group-member-item">
                    <input
                      type="checkbox"
                      checked={selectedMemberIds.includes(user.id)}
                      onChange={() => toggleMember(user.id)}
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

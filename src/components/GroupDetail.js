import React, { useState } from 'react';
import './GroupDetail.css';

/**
 * Displays details of a single group including members.
 * Owners can add/remove members and delete the group.
 * Members (and owners) can add recipes scoped to the group.
 *
 * @param {Object} props
 * @param {Object} props.group - The group object
 * @param {Array}  props.allUsers - All users (for resolving names)
 * @param {Object} props.currentUser - The current authenticated user
 * @param {Function} props.onBack - Navigate back to GroupList
 * @param {Function} props.onUpdateGroup - Called with (groupId, updates) to persist changes
 * @param {Function} props.onDeleteGroup - Called with groupId to delete the group
 * @param {Function} [props.onAddRecipe] - Called with groupId to open the recipe form
 */
function GroupDetail({ group, allUsers, currentUser, onBack, onUpdateGroup, onDeleteGroup, onAddRecipe }) {
  const [saving, setSaving] = useState(false);

  if (!group) return null;

  const isOwner = group.ownerId === currentUser?.id;
  const isPublic = group.type === 'public';
  const isMember = (group.memberIds || []).includes(currentUser?.id);

  const getMemberName = (userId) => {
    const user = (allUsers || []).find((u) => u.id === userId);
    if (!user) return userId;
    return `${user.vorname} ${user.nachname}`.trim();
  };

  const handleRemoveMember = async (userId) => {
    if (!isOwner || userId === group.ownerId) return;
    const updatedIds = (group.memberIds || []).filter((id) => id !== userId);
    const updatedRoles = { ...(group.memberRoles || {}) };
    delete updatedRoles[userId];
    setSaving(true);
    try {
      await onUpdateGroup(group.id, { memberIds: updatedIds, memberRoles: updatedRoles });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Liste "${group.name}" wirklich löschen?`)) return;
    await onDeleteGroup(group.id);
  };

  return (
    <div className="group-detail-container">
      <div className="group-detail-header">
        <button className="group-back-btn" onClick={onBack} aria-label="Zurück">
          ← Zurück
        </button>
        <div className="group-detail-title">
          <h2>{group.name}</h2>
          <span className={`group-type-badge ${isPublic ? 'public' : 'private'}`}>
            {isPublic ? 'Öffentlich' : 'Privat'}
          </span>
        </div>
        {isOwner && !isPublic && (
          <button
            className="group-delete-btn"
            onClick={handleDelete}
            disabled={saving}
            aria-label="Liste löschen"
          >
            Liste löschen
          </button>
        )}
        {onAddRecipe && (isOwner || isMember) && (
          <button
            className="group-add-recipe-btn"
            onClick={() => onAddRecipe(group.id)}
            aria-label="Rezept hinzufügen"
          >
            + Rezept hinzufügen
          </button>
        )}
      </div>

      <div className="group-detail-section">
        <h3>Mitglieder ({(group.memberIds || []).length})</h3>
        {(group.memberIds || []).length === 0 ? (
          <p className="group-empty-hint">Keine Mitglieder.</p>
        ) : (
          <ul className="group-member-list">
            {(group.memberIds || []).map((userId) => (
              <li key={userId} className="group-member-row">
                <span className="group-member-name">
                  {getMemberName(userId)}
                  {userId === group.ownerId && (
                    <span className="group-owner-badge"> (Besitzer)</span>
                  )}
                </span>
                {isOwner && !isPublic && userId !== group.ownerId && (
                  <button
                    className="group-remove-btn"
                    onClick={() => handleRemoveMember(userId)}
                    disabled={saving}
                    aria-label={`${getMemberName(userId)} entfernen`}
                  >
                    Entfernen
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default GroupDetail;

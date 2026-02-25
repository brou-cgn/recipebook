import React, { useState } from 'react';
import './GroupList.css';
import GroupCreateDialog from './GroupCreateDialog';

/**
 * Lists the groups the current user belongs to.
 * Provides a button to create a new private group.
 *
 * @param {Object} props
 * @param {Array}  props.groups - Groups visible to the current user
 * @param {Array}  props.allUsers - All users (for display purposes)
 * @param {Object} props.currentUser - The current authenticated user
 * @param {Function} props.onSelectGroup - Called when a group card is clicked
 * @param {Function} props.onCreateGroup - Called with group data to create a new group
 */
function GroupList({ groups, allUsers, currentUser, onSelectGroup, onCreateGroup }) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const getOwnerName = (group) => {
    if (!group.ownerId || !allUsers || allUsers.length === 0) return null;
    const owner = allUsers.find((u) => u.id === group.ownerId);
    if (!owner) return null;
    return owner.vorname;
  };

  const handleSaveGroup = async (groupData) => {
    await onCreateGroup(groupData);
    setIsDialogOpen(false);
  };

  const privateGroups = (groups || []).filter((g) => g.type === 'private');
  const publicGroup = (groups || []).find((g) => g.type === 'public');

  return (
    <div className="group-list-container">
      <div className="group-list-header">
        <h2>Meine Listen</h2>
        <button className="add-group-button" onClick={() => setIsDialogOpen(true)}>
          + Liste erstellen
        </button>
      </div>

      {publicGroup && currentUser?.isAdmin && (
        <div className="group-section">
          <h3 className="group-section-title">Systemgruppen</h3>
          <div className="group-grid">
            <div
              className="group-card group-card-public"
              onClick={() => onSelectGroup(publicGroup)}
            >
              <div className="group-card-content">
                <span className="group-type-indicator public">Öffentlich</span>
                <h3>{publicGroup.name}</h3>
                <p className="group-card-hint">Systemweite Gruppe für öffentliche Inhalte</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="group-section">
        {privateGroups.length === 0 ? (
          <div className="empty-state">
            <p>Noch keine privaten Listen!</p>
            <p className="empty-hint">
              Tippe auf „Liste erstellen", um Listen anzulegen.
            </p>
          </div>
        ) : (
          <div className="group-grid">
            {privateGroups.map((group) => {
              const ownerName = getOwnerName(group);
              const isOwner = group.ownerId === currentUser?.id;
              return (
                <div
                  key={group.id}
                  className="group-card"
                  onClick={() => onSelectGroup(group)}
                >
                  <div className="group-card-content">
                    <h3>{group.name}</h3>
                    <span className="group-type-indicator private">Privat</span>
                    <div className="group-card-meta">
                      <span>{(group.memberIds || []).length} Mitglied(er)</span>
                      {ownerName && (
                        <span className="group-card-owner">
                          {isOwner ? 'Du (Besitzer)' : ownerName}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {isDialogOpen && (
        <GroupCreateDialog
          allUsers={allUsers}
          currentUser={currentUser}
          onSave={handleSaveGroup}
          onCancel={() => setIsDialogOpen(false)}
        />
      )}
    </div>
  );
}

export default GroupList;

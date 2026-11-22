import React, { useState, useEffect } from 'react';
import './GroupList.css';
import GroupCreateDialog from './GroupCreateDialog';
import Button from './Button';
import { UnterseiteKopf } from './Unterseite';
import { useTexte } from '../contexts/SpracheContext';
import bereicheTexte from '../i18n/texte/bereiche';
import { getButtonIcons, DEFAULT_BUTTON_ICONS, getEffectiveIcon, getDarkModePreference } from '../utils/customLists';
import { isBase64Image } from '../utils/imageUtils';
import { LIST_KIND_OPTIONS } from '../utils/groupFirestore';

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
 * @param {Function} [props.onBack] - Zurück-Link oben links (zu „Chefkoch & mehr“ bzw. zur Startseite)
 * @param {boolean} [props.ausStartseite] - Von der Startseite geöffnet: Der Zurück-Link heißt „Küche“
 */
function GroupList({ groups, allUsers, currentUser, onSelectGroup, onCreateGroup, onBack, ausStartseite = false }) {
  const tB = useTexte(bereicheTexte);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [allButtonIcons, setAllButtonIcons] = useState({ ...DEFAULT_BUTTON_ICONS });
  const [isDarkMode, setIsDarkMode] = useState(getDarkModePreference);
  const [addFabPressed, setAddFabPressed] = useState(false);

  useEffect(() => {
    getButtonIcons().then((icons) => {
      setAllButtonIcons(icons);
    });
  }, []);

  useEffect(() => {
    const handler = (e) => setIsDarkMode(e.detail.isDark);
    window.addEventListener('darkModeChange', handler);
    return () => window.removeEventListener('darkModeChange', handler);
  }, []);

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
      <UnterseiteKopf
        onZurueck={onBack}
        zurueckText={ausStartseite ? tB('kueche') : undefined}
        aktionen={(
          <div className="group-list-actions">
            <Button variant="primary" className="add-group-button" onClick={() => setIsDialogOpen(true)}>
              + Liste erstellen
            </Button>
          </div>
        )}
      >
        <h2>Meine Mise en Place</h2>
      </UnterseiteKopf>

      {publicGroup && currentUser?.role === 'admin' && (
        <div className="group-section">
          <h3 className="group-section-title">Systemgruppen</h3>
          <div className="group-grid">
            <div className="group-card group-card-public">
              <div className="group-card-content">
                <span className="group-type-indicator public">Öffentlich</span>
                <h3>
                  <button type="button" className="group-card-knopf" onClick={() => onSelectGroup(publicGroup)}>
                    {publicGroup.name}
                  </button>
                </h3>
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
                <div key={group.id} className="group-card">
                  <div className="group-card-content">
                    <h3>
                      <button type="button" className="group-card-knopf" onClick={() => onSelectGroup(group)}>
                        {group.name}
                      </button>
                    </h3>
                    {group.listKind && (
                      <span className={`group-list-kind-indicator group-list-kind-indicator--${group.listKind}`}>
                        {LIST_KIND_OPTIONS.find((o) => o.value === group.listKind)?.label ?? group.listKind}
                      </span>
                    )}
                    {typeof group.description === 'string' && group.description.trim() && (
                      <p className="group-card-description">{group.description.trim()}</p>
                    )}
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
          privateLists={(groups || []).filter(
            (g) =>
              g.type === 'private' &&
              g.listKind !== 'interactive' &&
              (g.ownerId === currentUser?.id ||
                (Array.isArray(g.memberIds) && g.memberIds.includes(currentUser?.id)))
          )}
        />
      )}

      <button
        className={`add-group-fab-button${addFabPressed ? ' pressed' : ''}`}
        onClick={() => setIsDialogOpen(true)}
        onTouchStart={() => setAddFabPressed(true)}
        onTouchEnd={() => setAddFabPressed(false)}
        onTouchCancel={() => setAddFabPressed(false)}
        onMouseDown={() => setAddFabPressed(true)}
        onMouseUp={() => setAddFabPressed(false)}
        onMouseLeave={() => setAddFabPressed(false)}
        title="Liste erstellen"
        aria-label="Liste erstellen"
      >
        {isBase64Image(getEffectiveIcon(allButtonIcons, 'addRecipe', isDarkMode)) ? (
          <img src={getEffectiveIcon(allButtonIcons, 'addRecipe', isDarkMode)} alt="Liste erstellen" className="button-icon-image" draggable="false" />
        ) : (
          getEffectiveIcon(allButtonIcons, 'addRecipe', isDarkMode)
        )}
      </button>
    </div>
  );
}

export default GroupList;

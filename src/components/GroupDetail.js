import React, { useState, useEffect } from 'react';
import './GroupDetail.css';
import { getButtonIcons, DEFAULT_BUTTON_ICONS } from '../utils/customLists';
import { isBase64Image } from '../utils/imageUtils';

/**
 * Displays details of a single group including members and associated recipes.
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
 * @param {Array}  [props.recipes] - All recipes (filtered to this group's recipes)
 * @param {Function} [props.onSelectRecipe] - Called with a recipe when a tile is clicked
 */
function GroupDetail({ group, allUsers, currentUser, onBack, onUpdateGroup, onDeleteGroup, onAddRecipe, recipes, onSelectRecipe }) {
  const [saving, setSaving] = useState(false);
  const [backIcon, setBackIcon] = useState(DEFAULT_BUTTON_ICONS.privateListBack);

  useEffect(() => {
    const loadIcons = async () => {
      const icons = await getButtonIcons();
      setBackIcon(icons.privateListBack || DEFAULT_BUTTON_ICONS.privateListBack);
    };
    loadIcons();
  }, []);

  if (!group) return null;

  const isOwner = group.ownerId === currentUser?.id;
  const isPublic = group.type === 'public';
  const isMember = (group.memberIds || []).includes(currentUser?.id);

  const groupRecipes = recipes || [];

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
      <button className="group-back-icon-btn" onClick={onBack} aria-label="Zurück">
        {isBase64Image(backIcon) ? (
          <img src={backIcon} alt="Zurück" className="group-back-icon-img" />
        ) : (
          <span>{backIcon}</span>
        )}
      </button>
      <div className="group-detail-header">
        <div className="group-detail-title">
          <h2>{group.name}</h2>
          <span className={`group-type-badge ${isPublic ? 'public' : 'private'}`}>
            {isPublic ? 'Öffentlich' : 'Privat'}
          </span>
        </div>
        {onAddRecipe && (isOwner || isMember) && (
          <button
            className="group-add-recipe-btn"
            onClick={() => onAddRecipe(group.id)}
            aria-label={isPublic ? 'Rezept hinzufügen' : 'privates Rezept hinzufügen'}
          >
            {isPublic ? '+ Rezept hinzufügen' : '+ privates Rezept hinzufügen'}
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

      <div className="group-detail-section group-recipes-section">
        <h3>Rezepte ({groupRecipes.length})</h3>
        {groupRecipes.length === 0 ? (
          <p className="group-empty-hint">Noch keine Rezepte in dieser Liste.</p>
        ) : (
          <div className="group-recipe-grid">
            {groupRecipes.map((recipe) => (
              <div
                key={recipe.id}
                className="group-recipe-card"
                onClick={() => onSelectRecipe && onSelectRecipe(recipe)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && onSelectRecipe && onSelectRecipe(recipe)}
                aria-label={recipe.title}
              >
                {recipe.image && (
                  <div className="group-recipe-card-image">
                    <img src={recipe.image} alt={recipe.title} />
                  </div>
                )}
                <div className="group-recipe-card-content">
                  <h4>{recipe.title}</h4>
                  {recipe.description && (
                    <p className="group-recipe-card-description">{recipe.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {isOwner && !isPublic && (
        <div className="group-recipes-footer">
          <button
            className="group-delete-btn"
            onClick={handleDelete}
            disabled={saving}
            aria-label="Liste löschen"
          >
            Liste löschen
          </button>
        </div>
      )}
    </div>
  );
}

export default GroupDetail;

import React, { useState, useEffect } from 'react';
import { useLongPress } from '../utils/useLongPress';
import './GroupDetail.css';
import { getButtonIcons, DEFAULT_BUTTON_ICONS, getEffectiveIcon, getDarkModePreference } from '../utils/customLists';
import { isBase64Image } from '../utils/imageUtils';
import { isWaterIngredient, scaleIngredient } from '../utils/ingredientUtils';
import { sendGroupInvitation, LIST_KIND_OPTIONS } from '../utils/groupFirestore';
import ShoppingListModal from './ShoppingListModal';
import GroupEditDialog from './GroupEditDialog';
import RecipeCard from './RecipeCard';

const DEFAULT_PORTIONS = 4;

/**
 * Displays details of a single group including members and associated recipes.
 * Owners and members can add new members; only owners can remove members or delete the group.
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
 * @param {Array}  [props.privateLists] - Private lists available as target lists when editing an interactive list
 * @param {Function} [props.onEditGroupProperties] - Called with (groupId, editData) to save list property changes
 */
function GroupDetail({ group, allUsers, currentUser, onBack, onUpdateGroup, onDeleteGroup, onAddRecipe, recipes, onSelectRecipe, privateLists = [], onEditGroupProperties }) {
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('rezepte');
  const [backIcon, setBackIcon] = useState(DEFAULT_BUTTON_ICONS.privateListBack);
  const [shoppingListIcon, setShoppingListIcon] = useState(DEFAULT_BUTTON_ICONS.shoppingList || 'Einkauf');
  const [addMemberIcon, setAddMemberIcon] = useState(DEFAULT_BUTTON_ICONS.addGroupMember || '👤+');
  const [allButtonIcons, setAllButtonIcons] = useState({ ...DEFAULT_BUTTON_ICONS });
  const [isDarkMode, setIsDarkMode] = useState(getDarkModePreference);
  const [addPressed, setAddPressed] = useState(false);
  const [showShoppingListModal, setShowShoppingListModal] = useState(false);
  const [showPortionSelector, setShowPortionSelector] = useState(false);
  const [portionCounts, setPortionCounts] = useState({});
  const [showAddMember, setShowAddMember] = useState(false);
  const [addMemberIds, setAddMemberIds] = useState([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [addMemberError, setAddMemberError] = useState('');
  const [addMemberSuccess, setAddMemberSuccess] = useState('');
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editFabPressed, setEditFabPressed] = useState(false);
  const [deleteFabPressed, setDeleteFabPressed] = useState(false);
  const {
    activeId: portionMinusLongPressActiveId,
    triggeredRef: portionMinusLongPressTriggeredRef,
    start: handlePortionMinusPressStart,
    end: handlePortionMinusPressEnd,
  } = useLongPress();

  useEffect(() => {
    const loadIcons = async () => {
      const icons = await getButtonIcons();
      setAllButtonIcons(icons);
    };
    loadIcons();
  }, []);

  useEffect(() => {
    setBackIcon(getEffectiveIcon(allButtonIcons, 'privateListBack', isDarkMode) || DEFAULT_BUTTON_ICONS.privateListBack);
    setShoppingListIcon(getEffectiveIcon(allButtonIcons, 'shoppingList', isDarkMode) || DEFAULT_BUTTON_ICONS.shoppingList || 'Einkauf');
    setAddMemberIcon(getEffectiveIcon(allButtonIcons, 'addGroupMember', isDarkMode) || DEFAULT_BUTTON_ICONS.addGroupMember || '👤+');
  }, [allButtonIcons, isDarkMode]);

  useEffect(() => {
    const handler = (e) => setIsDarkMode(e.detail.isDark);
    window.addEventListener('darkModeChange', handler);
    return () => window.removeEventListener('darkModeChange', handler);
  }, []);

  useEffect(() => {
    if (!showPortionSelector) return;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setShowPortionSelector(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showPortionSelector]);

  if (!group) return null;

  const isOwner = group.ownerId === currentUser?.id;
  const isPublic = group.type === 'public';
  const isMember = (group.memberIds || []).includes(currentUser?.id);

  const groupRecipes = recipes || [];
  const addRecipeLabel = isPublic ? 'Rezept hinzufügen' : 'Privates Rezept hinzufügen';
  const addRecipeIcon = getEffectiveIcon(allButtonIcons, isPublic ? 'addRecipe' : 'addPrivateRecipe', isDarkMode);
  const editGroupIcon = getEffectiveIcon(allButtonIcons, 'editRecipe', isDarkMode);
  const deleteGroupIcon = getEffectiveIcon(allButtonIcons, 'deleteRecipe', isDarkMode);

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

  const handleEditSave = async (editData) => {
    if (onEditGroupProperties) {
      await onEditGroupProperties(group.id, editData);
    }
    setShowEditDialog(false);
  };

  const handleLeaveGroup = async () => {
    if (!window.confirm(`Liste "${group.name}" wirklich verlassen?`)) return;
    const updatedIds = (group.memberIds || []).filter((id) => id !== currentUser?.id);
    const updatedRoles = { ...(group.memberRoles || {}) };
    delete updatedRoles[currentUser?.id];
    setSaving(true);
    try {
      await onUpdateGroup(group.id, { memberIds: updatedIds, memberRoles: updatedRoles });
      onBack();
    } finally {
      setSaving(false);
    }
  };

  // Users that are not yet members of this group
  const nonMembers = (allUsers || []).filter(
    (u) => !(group.memberIds || []).includes(u.id) && u.id !== currentUser?.id
  );

  const toggleAddMemberId = (userId) => {
    setAddMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleAddMembers = async () => {
    setAddMemberError('');
    setAddMemberSuccess('');

    const emailTrimmed = inviteEmail.trim().toLowerCase();
    const hasSelections = addMemberIds.length > 0;
    const hasEmail = emailTrimmed.length > 0;

    if (!hasSelections && !hasEmail) {
      setAddMemberError('Bitte wähle mindestens ein Mitglied aus oder gib eine E-Mail-Adresse ein.');
      return;
    }

    if (hasEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      setAddMemberError('Bitte gib eine gültige E-Mail-Adresse ein.');
      return;
    }

    setSaving(true);
    try {
      const updatedMemberIds = [
        ...(group.memberIds || []),
        ...addMemberIds.filter((id) => !(group.memberIds || []).includes(id)),
      ];
      const updatedInvitedEmails = hasEmail
        ? [...new Set([...(group.invitedEmails || []), emailTrimmed])]
        : group.invitedEmails || [];

      await onUpdateGroup(group.id, {
        memberIds: updatedMemberIds,
        invitedEmails: updatedInvitedEmails,
      });

      setAddMemberIds([]);
      setInviteEmail('');
      setShowAddMember(false);

      if (hasEmail) {
        try {
          const inviteResult = await sendGroupInvitation(emailTrimmed);
          if (inviteResult.alreadyRegistered) {
            setAddMemberSuccess(`${emailTrimmed} ist bereits registriert und wurde zur Liste hinzugefügt.`);
          } else if (inviteResult.alreadyInvited) {
            setAddMemberSuccess(`Einladung an ${emailTrimmed} wurde gespeichert. Eine Einladungs-E-Mail wurde bereits früher versandt.`);
          } else {
            setAddMemberSuccess(`Einladung an ${emailTrimmed} wurde gespeichert und eine Einladungs-E-Mail versendet.`);
          }
        } catch (inviteErr) {
          console.error('Error sending invitation email:', inviteErr);
          setAddMemberSuccess(`Einladung an ${emailTrimmed} wurde gespeichert, aber die Einladungs-E-Mail konnte nicht versendet werden.`);
        }
      } else {
        setAddMemberSuccess('Mitglied(er) erfolgreich hinzugefügt.');
      }
    } catch (err) {
      setAddMemberError('Fehler beim Hinzufügen. Bitte erneut versuchen.');
    } finally {
      setSaving(false);
    }
  };

  const handleShoppingListClick = () => {
    setShowPortionSelector(true);
  };

  const getGroupShoppingListIngredients = () => {
    const ingredients = [];
    for (const recipe of groupRecipes) {
      const targetPortions = portionCounts[recipe.id] ?? (recipe.portionen || DEFAULT_PORTIONS);
      if (targetPortions === 0) continue;
      const recipePortions = recipe.portionen || DEFAULT_PORTIONS;
      const multiplier = targetPortions / recipePortions;
      for (const ing of (recipe.ingredients || [])) {
        const item = typeof ing === 'string' ? { type: 'ingredient', text: ing } : ing;
        if (item.type !== 'heading') {
          const text = typeof ing === 'string' ? ing : ing.text;
          if (!isWaterIngredient(text)) ingredients.push(multiplier !== 1 ? scaleIngredient(text, multiplier) : text);
        }
      }
    }
    return ingredients;
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
          {isPublic && (
            <span className="group-type-badge public">Öffentlich</span>
          )}
        </div>
        <div className="group-header-actions">
          {onAddRecipe && (isOwner || isMember) && !showPortionSelector && !showShoppingListModal && (isPublic || activeTab === 'rezepte') && (
            <button
              className={`add-icon-button ${addPressed ? 'pressed' : ''}`}
              onClick={() => onAddRecipe(group.id)}
              onTouchStart={() => setAddPressed(true)}
              onTouchEnd={() => setAddPressed(false)}
              onTouchCancel={() => setAddPressed(false)}
              onMouseDown={() => setAddPressed(true)}
              onMouseUp={() => setAddPressed(false)}
              onMouseLeave={() => setAddPressed(false)}
              title={addRecipeLabel}
              aria-label={addRecipeLabel}
            >
              {isBase64Image(addRecipeIcon) ? (
                <img src={addRecipeIcon} alt={addRecipeLabel} className="button-icon-image" draggable="false" />
              ) : (
                addRecipeIcon
              )}
            </button>
          )}
          {groupRecipes.length > 0 && (
            <button
              className="shopping-list-trigger-button"
              onClick={handleShoppingListClick}
              title="Einkaufsliste anzeigen"
              aria-label="Einkaufsliste öffnen"
            >
              {isBase64Image(shoppingListIcon) ? (
                <img src={shoppingListIcon} alt="Einkaufsliste" className="shopping-list-icon-img" />
              ) : (
                shoppingListIcon
              )}
            </button>
          )}
        </div>
      </div>

      {!isPublic && (
        <div className="group-detail-tab-bar" role="tablist">
          <button
            className={`group-detail-tab${activeTab === 'rezepte' ? ' active' : ''}`}
            onClick={() => setActiveTab('rezepte')}
            role="tab"
            aria-selected={activeTab === 'rezepte'}
          >
            Rezepte
          </button>
          <button
            className={`group-detail-tab${activeTab === 'einstellungen' ? ' active' : ''}`}
            onClick={() => setActiveTab('einstellungen')}
            role="tab"
            aria-selected={activeTab === 'einstellungen'}
          >
            Einstellungen
          </button>
        </div>
      )}

      {(isPublic || activeTab === 'rezepte') && (
        <div className="group-detail-section group-recipes-section">
          <h3>Rezepte ({groupRecipes.length})</h3>
          {groupRecipes.length === 0 ? (
            <p className="group-empty-hint">Noch keine Rezepte in dieser Liste.</p>
          ) : (
            <div className="recipe-grid group-recipe-grid">
              {groupRecipes.map((recipe) => (
                <RecipeCard
                  key={recipe.id}
                  recipe={recipe}
                  onClick={() => onSelectRecipe && onSelectRecipe(recipe)}
                  currentUser={currentUser}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {!isPublic && activeTab === 'einstellungen' && (
        <>
          <div className="group-detail-section group-info-section">
            <h3>Listeneinstellungen</h3>
            <dl className="group-info-list">
              <div className="group-info-row">
                <dt>Typ</dt>
                <dd>Privat</dd>
              </div>
              {group.listKind && (
                <div className="group-info-row">
                  <dt>Art</dt>
                  <dd>{LIST_KIND_OPTIONS.find((o) => o.value === group.listKind)?.label ?? group.listKind}</dd>
                </div>
              )}
              {group.targetListId && (
                <div className="group-info-row">
                  <dt>Ziel-Liste</dt>
                  <dd>{privateLists.find((l) => l.id === group.targetListId)?.name ?? group.targetListId}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="group-detail-section">
            <div className="group-section-header">
              <h3>Mitglieder ({(group.memberIds || []).length})</h3>
              {isOwner && (
                <button
                  className="group-add-member-icon-btn"
                  onClick={() => { setShowAddMember((v) => !v); setAddMemberError(''); setAddMemberSuccess(''); setAddMemberIds([]); setInviteEmail(''); }}
                  aria-label="Mitglied hinzufügen"
                  title="Mitglied hinzufügen"
                >
                  {isBase64Image(addMemberIcon) ? (
                    <img src={addMemberIcon} alt="Mitglied hinzufügen" className="button-icon-image" draggable="false" />
                  ) : (
                    <span>{addMemberIcon}</span>
                  )}
                </button>
              )}
            </div>
            {addMemberSuccess && (
              <p className="group-add-member-success" role="status">{addMemberSuccess}</p>
            )}
            {showAddMember && (
              <div className="group-add-member-panel">
                {nonMembers.length > 0 && (
                  <div className="group-dialog-field">
                    <label>Bestehende Nutzer</label>
                    <div className="group-add-member-list">
                      {nonMembers.map((user) => (
                        <label key={user.id} className="group-member-item">
                          <input
                            type="checkbox"
                            checked={addMemberIds.includes(user.id)}
                            onChange={() => toggleAddMemberId(user.id)}
                          />
                          <span className="group-member-name">
                            {user.vorname} {user.nachname}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <div className="group-dialog-field">
                  <label htmlFor="invite-email">Einladung per E-Mail</label>
                  <input
                    id="invite-email"
                    type="email"
                    className="group-invite-email-input"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="name@example.com"
                  />
                </div>
                {addMemberError && (
                  <p className="group-dialog-error" role="alert">{addMemberError}</p>
                )}
                <div className="group-add-member-actions">
                  <button
                    type="button"
                    className="group-btn-secondary"
                    onClick={() => { setShowAddMember(false); setAddMemberError(''); setAddMemberIds([]); setInviteEmail(''); }}
                    disabled={saving}
                  >
                    Abbrechen
                  </button>
                  <button
                    type="button"
                    className="group-btn-primary"
                    onClick={handleAddMembers}
                    disabled={saving}
                  >
                    {saving ? 'Speichern...' : 'Hinzufügen'}
                  </button>
                </div>
              </div>
            )}
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
                    {isOwner && userId !== group.ownerId && (
                      <button
                        className="group-remove-btn"
                        onClick={() => handleRemoveMember(userId)}
                        disabled={saving}
                        aria-label={`${getMemberName(userId)} entfernen`}
                      >
                        Entfernen
                      </button>
                    )}
                    {!isOwner && userId === currentUser?.id && (
                      <button
                        className="group-leave-btn"
                        onClick={handleLeaveGroup}
                        disabled={saving}
                        aria-label="Liste verlassen"
                      >
                        Austreten
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {isOwner && (
            <div className="group-recipes-footer">
              <button
                className="group-edit-btn"
                onClick={() => setShowEditDialog(true)}
                disabled={saving}
                aria-label="Liste bearbeiten"
              >
                Liste bearbeiten
              </button>
            </div>
          )}
        </>
      )}

      {isPublic && (
        <div className="group-detail-section">
          <div className="group-section-header">
            <h3>Mitglieder ({(group.memberIds || []).length})</h3>
          </div>
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
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {isOwner && !isPublic && activeTab === 'einstellungen' && !showPortionSelector && !showShoppingListModal && (
        <>
          <button
            className={`delete-fab-button${deleteFabPressed ? ' pressed' : ''}`}
            onClick={handleDelete}
            onTouchStart={() => setDeleteFabPressed(true)}
            onTouchEnd={() => setDeleteFabPressed(false)}
            onTouchCancel={() => setDeleteFabPressed(false)}
            onMouseDown={() => setDeleteFabPressed(true)}
            onMouseUp={() => setDeleteFabPressed(false)}
            onMouseLeave={() => setDeleteFabPressed(false)}
            title="Liste löschen"
            aria-label="Liste löschen"
            type="button"
            disabled={saving}
          >
            {isBase64Image(deleteGroupIcon) ? (
              <img src={deleteGroupIcon} alt="Löschen" className="button-icon-image" draggable="false" />
            ) : (
              deleteGroupIcon
            )}
          </button>
          <button
            className={`group-edit-fab-button${editFabPressed ? ' pressed' : ''}`}
            onClick={() => setShowEditDialog(true)}
            onTouchStart={() => setEditFabPressed(true)}
            onTouchEnd={() => setEditFabPressed(false)}
            onTouchCancel={() => setEditFabPressed(false)}
            onMouseDown={() => setEditFabPressed(true)}
            onMouseUp={() => setEditFabPressed(false)}
            onMouseLeave={() => setEditFabPressed(false)}
            title="Liste bearbeiten"
            aria-label="Liste bearbeiten"
            type="button"
          >
            {isBase64Image(editGroupIcon) ? (
              <img src={editGroupIcon} alt="Bearbeiten" className="button-icon-image" draggable="false" />
            ) : (
              editGroupIcon
            )}
          </button>
        </>
      )}
      {showEditDialog && (
        <GroupEditDialog
          group={group}
          privateLists={privateLists.filter((l) => l.id !== group.id)}
          onSave={handleEditSave}
          onCancel={() => setShowEditDialog(false)}
        />
      )}
      {showPortionSelector && (
        <div className="portion-selector-overlay" onClick={() => setShowPortionSelector(false)}>
          <div
            className="portion-selector-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Portionen auswählen"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="portion-selector-header">
              <h2 className="portion-selector-title">Portionen für Einkaufsliste</h2>
              <button
                className="portion-selector-close"
                onClick={() => setShowPortionSelector(false)}
                aria-label="Portionsauswahl schließen"
              >
                ×
              </button>
            </div>
            <div className="portion-selector-body">
              {groupRecipes.map((recipe) => {
                const current = portionCounts[recipe.id] ?? (recipe.portionen || DEFAULT_PORTIONS);
                return (
                  <div key={recipe.id} className="portion-selector-item">
                    <span className="portion-selector-recipe-name">{recipe.title}</span>
                    <div className="portion-selector-controls">
                      <button
                        className={`portion-selector-btn${portionMinusLongPressActiveId === recipe.id ? ' longpress-active' : ''}`}
                        onClick={() => {
                          if (portionMinusLongPressTriggeredRef.current) {
                            portionMinusLongPressTriggeredRef.current = false;
                            return;
                          }
                          setPortionCounts((prev) => ({
                            ...prev,
                            [recipe.id]: Math.max(0, current - 1)
                          }));
                        }}
                        onMouseDown={() => handlePortionMinusPressStart(recipe.id, () => setPortionCounts((prev) => ({ ...prev, [recipe.id]: 0 })))}
                        onMouseUp={handlePortionMinusPressEnd}
                        onMouseLeave={handlePortionMinusPressEnd}
                        onTouchStart={() => handlePortionMinusPressStart(recipe.id, () => setPortionCounts((prev) => ({ ...prev, [recipe.id]: 0 })))}
                        onTouchEnd={handlePortionMinusPressEnd}
                        onTouchCancel={handlePortionMinusPressEnd}
                        aria-label="Portionen verringern"
                        disabled={current === 0}
                      >
                        −
                      </button>
                      <span className="portion-selector-count">{current}</span>
                      <button
                        className="portion-selector-btn"
                        onClick={() => setPortionCounts((prev) => ({
                          ...prev,
                          [recipe.id]: current + 1
                        }))}
                        aria-label="Portionen erhöhen"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="portion-selector-footer">
              <button
                className="portion-selector-generate-btn"
                onClick={() => {
                  setShowPortionSelector(false);
                  setShowShoppingListModal(true);
                }}
              >
                Einkaufsliste erstellen
              </button>
            </div>
          </div>
        </div>
      )}
      {showShoppingListModal && (
        <ShoppingListModal
          items={getGroupShoppingListIngredients()}
          title={group.name}
          onClose={() => setShowShoppingListModal(false)}
          hideBringButton={true}
        />
      )}
    </div>
  );
}

export default GroupDetail;

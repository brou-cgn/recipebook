import React, { useState, useEffect } from 'react';
import './GroupCreateDialog.css';
import Button from './Button';
import { LIST_KIND_OPTIONS } from '../utils/groupFirestore';
import { listenArtText } from '../utils/listenArt';
import { useTexte } from '../contexts/SpracheContext';
import gruppenTexte from '../i18n/texte/gruppen';
import allgemeinTexte from '../i18n/texte/allgemein';
import useListenName from '../hooks/useListenName';

/**
 * Dialog for creating a new private group.
 * @param {Object} props
 * @param {Array}  props.allUsers - All users available for member selection
 * @param {Object} props.currentUser - The current authenticated user
 * @param {Function} props.onSave - Called with { name, description?, memberIds, memberRoles, listKind, targetListId?, newTargetListName? } when saving
 * @param {Function} props.onCancel - Called when dialog is dismissed
 * @param {Array}  props.privateLists - Existing private lists available as target lists (used when listKind is 'interactive')
 */
function GroupCreateDialog({ allUsers, currentUser, onSave, onCancel, privateLists = [] }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [listKind, setListKind] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Texte der Listen (Mehrsprachigkeit PR 6s)
  const t = useTexte(gruppenTexte);
  const tAllgemein = useTexte(allgemeinTexte);
  const listenName = useListenName();

  // Target list state (only used when listKind === 'interactive')
  const [targetListMode, setTargetListMode] = useState(''); // '' | 'select' | 'create'
  const [targetListId, setTargetListId] = useState('');
  const [newTargetListName, setNewTargetListName] = useState('');

  // Other users the owner can add as members (excluding hidden users)
  const otherUsers = (allUsers || []).filter((u) => u.id !== currentUser?.id && !u.versteckt);

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
      setError(t('fehlerName'));
      return;
    }
    if (!listKind) {
      setError(t('fehlerArt'));
      return;
    }
    if (listKind === 'interactive') {
      if (!targetListMode) {
        setError(t('fehlerZiel'));
        return;
      }
      if (targetListMode === 'select' && !targetListId) {
        setError(t('fehlerZielBestehend'));
        return;
      }
      if (targetListMode === 'create' && !newTargetListName.trim()) {
        setError(t('fehlerZielName'));
        return;
      }
    }
    setSaving(true);
    try {
      // Owner is always a member; selectedMemberIds already excludes the owner
      const memberIds = [currentUser.id, ...selectedMemberIds];
      const normalizedDescription = description.trim();
      const saveData = { name: name.trim(), memberIds, memberRoles: {}, listKind };
      if (normalizedDescription) {
        saveData.description = normalizedDescription;
      }
      if (listKind === 'interactive') {
        if (targetListMode === 'select') {
          saveData.targetListId = targetListId;
        } else if (targetListMode === 'create') {
          saveData.newTargetListName = newTargetListName.trim();
        } else if (targetListMode === 'self') {
          saveData.selfTargetList = true;
        }
      }
      await onSave(saveData);
    } catch (err) {
      setError(t('fehlerErstellen'));
      setSaving(false);
    }
  };

  const isInteractive = listKind === 'interactive';
  const membersAreFromSelectedList = isInteractive && targetListMode === 'select' && targetListId;

  return (
    <div className="group-dialog-overlay" role="dialog" aria-modal="true" aria-label={t('listeErstellen')}>
      <div className="group-dialog">
        <div className="group-dialog-header">
          <h2>{t('neueListe')}</h2>
          <button className="group-dialog-close" onClick={onCancel} aria-label={tAllgemein('schliessen')}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="group-dialog-field">
            <label htmlFor="group-name">{t('listenname')}</label>
            <input
              id="group-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('listennamePlatzhalter')}
              maxLength={80}
              autoFocus
            />
          </div>

          <div className="group-dialog-field">
            <label htmlFor="group-description">{t('beschreibung')}</label>
            <textarea
              id="group-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('beschreibungPlatzhalter')}
              maxLength={300}
              rows={3}
            />
          </div>

          <div className="group-dialog-field">
            <label htmlFor="group-list-kind">{t('art')}</label>
            <select
              id="group-list-kind"
              value={listKind}
              onChange={(e) => setListKind(e.target.value)}
              required
            >
              <option value="">{t('bitteAuswaehlen')}</option>
              {LIST_KIND_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {listenArtText(opt.value, t)}
                </option>
              ))}
            </select>
          </div>

          {isInteractive && (
            <div className="group-dialog-field">
              <label>{t('zielListe')}</label>
              <p className="group-dialog-hint">
                {t('zielListeHinweis')}
              </p>
              <div className="group-target-list-options">
                <label className="group-target-list-option">
                  <input
                    type="radio"
                    name="targetListMode"
                    value="select"
                    checked={targetListMode === 'select'}
                    onChange={() => { setTargetListMode('select'); setTargetListId(''); setNewTargetListName(''); }}
                    disabled={privateLists.length === 0}
                  />
                  <span>{t('bestehendeWaehlen')}</span>
                </label>
                <label className="group-target-list-option">
                  <input
                    type="radio"
                    name="targetListMode"
                    value="create"
                    checked={targetListMode === 'create'}
                    onChange={() => { setTargetListMode('create'); setTargetListId(''); }}
                  />
                  <span>{t('neueAnlegen')}</span>
                </label>
                <label className="group-target-list-option">
                  <input
                    type="radio"
                    name="targetListMode"
                    value="self"
                    checked={targetListMode === 'self'}
                    onChange={() => { setTargetListMode('self'); setTargetListId(''); setNewTargetListName(''); }}
                  />
                  <span>{t('dieseListe')}</span>
                </label>
              </div>

              {targetListMode === 'select' && (
                <select
                  id="target-list-select"
                  value={targetListId}
                  onChange={(e) => setTargetListId(e.target.value)}
                  aria-label={t('bestehendeAuswaehlen')}
                >
                  <option value="">{t('bitteAuswaehlen')}</option>
                  {privateLists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {listenName(list)}
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
                  placeholder={t('neueListePlatzhalter')}
                  maxLength={80}
                  aria-label={t('neueZielListe')}
                />
              )}
            </div>
          )}

          {otherUsers.length > 0 && (
            <div className="group-dialog-field">
              <label>
                {t('mitgliederHinzufuegen')}
                {membersAreFromSelectedList && (
                  <span className="group-dialog-hint-inline">{' '}{t('ausZielListe')}</span>
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
            <Button variant="secondary" onClick={onCancel} disabled={saving}>
              {tAllgemein('abbrechen')}
            </Button>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? t('erstellenLaeuft') : t('listeErstellen')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default GroupCreateDialog;

import React, { useState, useEffect, useRef } from 'react';
import './GroupCreateDialog.css';
import Button from './Button';
import { LIST_KIND_OPTIONS } from '../utils/groupFirestore';
import { listenArtText } from '../utils/listenArt';
import { useTexte } from '../contexts/SpracheContext';
import gruppenTexte from '../i18n/texte/gruppen';
import allgemeinTexte from '../i18n/texte/allgemein';
import useListenName from '../hooks/useListenName';

/**
 * Dialog for editing an existing private group's properties (name, description, listKind, targetListId).
 * @param {Object} props
 * @param {Object} props.group - The group to edit
 * @param {Function} props.onSave - Called with { name, description?, listKind, targetListId?, newTargetListName? } when saving
 * @param {Function} props.onCancel - Called when dialog is dismissed
 * @param {Array}  props.privateLists - Existing private lists available as target lists (includes the current group)
 */
function GroupEditDialog({ group, onSave, onCancel, privateLists = [] }) {
  const [name, setName] = useState(group?.name || '');
  const [description, setDescription] = useState(group?.description || '');
  const [listKind, setListKind] = useState(group?.listKind || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Texte der Listen (Mehrsprachigkeit PR 6s)
  const t = useTexte(gruppenTexte);
  const tAllgemein = useTexte(allgemeinTexte);
  const listenName = useListenName();

  // Target list state (only used when listKind === 'interactive')
  const [targetListMode, setTargetListMode] = useState(() => {
    if (group?.listKind === 'interactive' && group?.targetListId) return 'select';
    return '';
  });
  const [targetListId, setTargetListId] = useState(group?.targetListId || '');
  const [newTargetListName, setNewTargetListName] = useState('');

  const descriptionRef = useRef(null);

  // Textarea wächst mit dem Text
  useEffect(() => {
    const textarea = descriptionRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [description]);

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
      const normalizedDescription = description.trim();
      const hadExistingDescription = typeof group?.description === 'string' && group.description.trim() !== '';
      const saveData = { name: name.trim(), listKind };
      if (normalizedDescription || hadExistingDescription) {
        saveData.description = normalizedDescription;
      }
      if (listKind === 'interactive') {
        if (targetListMode === 'select') {
          saveData.targetListId = targetListId;
        } else if (targetListMode === 'create') {
          saveData.newTargetListName = newTargetListName.trim();
        }
      }
      await onSave(saveData);
    } catch (err) {
      setError(t('fehlerSpeichern'));
      setSaving(false);
    }
  };

  const isInteractive = listKind === 'interactive';

  return (
    <div className="group-dialog-overlay" role="dialog" aria-modal="true" aria-label={t('listeBearbeiten')}>
      <div className="group-dialog">
        <div className="group-dialog-header">
          <h2>{t('listeBearbeiten')}</h2>
          <button className="group-dialog-close" onClick={onCancel} aria-label={tAllgemein('schliessen')}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="group-dialog-field">
            <label htmlFor="edit-group-name">{t('listenname')}</label>
            <input
              id="edit-group-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('listennamePlatzhalter')}
              maxLength={80}
              autoFocus
            />
          </div>

          <div className="group-dialog-field">
            <label htmlFor="edit-group-description">{t('beschreibung')}</label>
            <textarea
              id="edit-group-description"
              ref={descriptionRef}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('beschreibungPlatzhalter')}
              maxLength={300}
              rows={3}
            />
          </div>

          <div className="group-dialog-field">
            <label htmlFor="edit-group-list-kind">{t('art')}</label>
            <select
              id="edit-group-list-kind"
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
                    name="editTargetListMode"
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
                    name="editTargetListMode"
                    value="create"
                    checked={targetListMode === 'create'}
                    onChange={() => { setTargetListMode('create'); setTargetListId(''); }}
                  />
                  <span>{t('neueAnlegen')}</span>
                </label>
              </div>

              {targetListMode === 'select' && (
                <select
                  id="edit-target-list-select"
                  value={targetListId}
                  onChange={(e) => setTargetListId(e.target.value)}
                  aria-label={t('bestehendeAuswaehlen')}
                >
                  <option value="">{t('bitteAuswaehlen')}</option>
                  {privateLists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.id === group?.id ? t('dieseListeName', { name: listenName(list) }) : listenName(list)}
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
                  placeholder={t('neueListePlatzhalter')}
                  maxLength={80}
                  aria-label={t('neueZielListe')}
                />
              )}
            </div>
          )}

          {error && <p className="group-dialog-error">{error}</p>}

          <div className="group-dialog-actions">
            <Button variant="secondary" onClick={onCancel} disabled={saving}>
              {tAllgemein('abbrechen')}
            </Button>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? t('speichernLaeuft') : tAllgemein('speichern')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default GroupEditDialog;

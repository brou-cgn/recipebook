import React, { useCallback, useEffect, useState } from 'react';
import './NetworkPage.css';
import DeleteRowButton from './DeleteRowButton';
import UndoSnackbar from './UndoSnackbar';
import FollowName from './FollowName';
import TrashIcon from './icons/TrashIcon';
import useUndoableDelete from '../hooks/useUndoableDelete';
import useSwipeToDelete from '../hooks/useSwipeToDelete';
import { UnterseiteKopf } from './Unterseite';
import {
  loadNetwork, respondToFollow, stopFollowing, removeFollower, ANONYMOUS_NAME,
} from '../utils/followFirestore';
import { useTexte } from '../contexts/SpracheContext';
import { erkannterText } from '../i18n/texte';
import netzwerkTexte, { FOLGEN_MELDUNGEN } from '../i18n/texte/netzwerk';
import chefkochTexte from '../i18n/texte/chefkochUndMehr';
import allgemeinTexte from '../i18n/texte/allgemein';

// Reiter und leere Listen; Texte in src/i18n/texte/netzwerk.js (Mehrsprachigkeit PR 6s)
const TABS = [
  { key: 'requests', label: 'anfragen' },
  { key: 'following', label: 'ichFolge' },
  { key: 'followers', label: 'follower' },
];

const EMPTY_TEXT = {
  requests: 'keineAnfragen',
  following: 'folgstNiemandem',
  followers: 'dirFolgtNiemand',
};

const EMPTY_NETWORK = { requests: [], following: [], followers: [], blocked: [] };

const withoutId = (rows, id) => rows.filter((row) => row.id !== id);

// Zeile mit Entfernen-Aktion: Desktop zeigt den DeleteRowButton, mobil gilt die
// Linksswipe-Geste (CLAUDE.md, Löschaktionen). Beide lösen dieselbe Entfernung aus.
function NetworkRemovableRow({ userId, name, note, onRemove }) {
  const { offset, isDeleteVisible, reset, handlers } = useSwipeToDelete();
  const tAllgemein = useTexte(allgemeinTexte);

  const handleSwipeRemove = (e) => {
    e.stopPropagation();
    onRemove();
    reset();
  };

  return (
    <li className={`network-row network-row--swipe delete-row-hover-target${isDeleteVisible ? ' swipe-delete-active' : ''}`}>
      <div className="swipe-delete-background" aria-hidden={!isDeleteVisible && offset === 0}>
        <button
          type="button"
          className="swipe-delete-action"
          onClick={handleSwipeRemove}
          aria-label={tAllgemein('nameEntfernen', { name })}
          tabIndex={isDeleteVisible ? 0 : -1}
        >
          <span className="swipe-delete-icon-text"><TrashIcon /></span>
        </button>
      </div>
      <div
        className="network-row-content"
        style={{ transform: `translateX(${offset}px)`, transition: 'transform 0.15s ease' }}
        onClick={() => { if (isDeleteVisible) reset(); }}
        {...handlers}
      >
        <FollowName userId={userId} name={name} className="network-row-name" fromNetwork />
        {note && <span className="network-row-note">{note}</span>}
        <DeleteRowButton className="network-row-delete" itemName={name} onClick={onRemove} />
      </div>
    </li>
  );
}

// Ausklappbarer Hinweis über den Anfragen: Wer „Annehmen“ tippt, willigt in die namentliche
// Anzeige ein (Datenschutz-Entwurf docs/vorhaben/follow-datenschutz.md). Der Text muss mit
// diesem Entwurf übereinstimmen, insbesondere Rückwirkung und Zeitfenster.
function FollowVisibilityInfo() {
  const [open, setOpen] = useState(false);
  const t = useTexte(netzwerkTexte);
  return (
    <div className="network-info">
      <button
        type="button"
        className="network-info-toggle"
        aria-expanded={open}
        aria-controls="network-info-body"
        onClick={() => setOpen((v) => !v)}
      >
        {t('wasWirdSichtbar')}
      </button>
      {open && (
        <div id="network-info-body" className="network-info-body">
          <p>
            {t('infoAnnehmen')}
          </p>
          <ul>
            <li>{t('infoRueckwirkend')}</li>
            <li>{t('infoEintraege')}</li>
            <li>{t('infoRueckschluesse')}</li>
            <li>{t('infoEntfernen')}</li>
          </ul>
        </div>
      )}
    </div>
  );
}

function NetworkPage({ currentUser, onBack }) {
  const uid = currentUser?.id;
  const [activeTab, setActiveTab] = useState('requests');
  const [network, setNetwork] = useState(EMPTY_NETWORK);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const { banners, pendingKeys, scheduleDelete, undoDelete } = useUndoableDelete();
  const t = useTexte(netzwerkTexte);
  const tChefkoch = useTexte(chefkochTexte);
  const tAllgemein = useTexte(allgemeinTexte);
  // Ohne Profil heißt eine Person „Ein Mitglied“ (ANONYMOUS_NAME); angezeigt in der geltenden Sprache
  const anzeigeName = (name) => (name === ANONYMOUS_NAME ? t('einMitglied') : name);

  const reload = useCallback(async () => {
    if (!uid) return;
    try {
      setNetwork(await loadNetwork(uid));
      setError(null);
    } catch (err) {
      console.error('Netzwerk nicht ladbar:', err);
      // Als Schlüssel, damit ein Sprachwechsel das Netzwerk nicht neu lädt
      setError({ schluessel: 'fehlerLaden' });
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => { reload(); }, [reload]);

  const respond = async (row, action) => {
    setBusyId(row.id);
    setError(null);
    try {
      await respondToFollow(row.id, action);
      await reload();
    } catch (err) {
      console.error('Antwort auf Follow-Anfrage fehlgeschlagen:', err);
      // Deutsche Meldung der Function über ihren Schlüssel (FOLGEN_MELDUNGEN), sonst, wie sie kommt
      setError(err?.message
        ? { text: erkannterText(netzwerkTexte, err.message, FOLGEN_MELDUNGEN, t) }
        : { schluessel: 'fehlerAktion' });
    } finally {
      setBusyId(null);
    }
  };

  // Folgen beenden bzw. Follower entfernen: die Zeile verschwindet sofort, gelöscht
  // wird erst nach dem Undo-Fenster (der Client kann eine Beziehung nicht neu anlegen).
  const removeRow = (listKey, row, mutate) => {
    const key = `${listKey}:${row.id}`;
    scheduleDelete({
      key,
      message: anzeigeName(row.name),
      onConfirm: () => {
        Promise.resolve().then(mutate).catch((err) => console.error('Follow entfernen fehlgeschlagen:', err));
      },
      onUndo: () => {},
    });
  };

  const visible = (listKey) => network[listKey].filter((row) => !pendingKeys.has(`${listKey}:${row.id}`));
  const lastBanner = banners[banners.length - 1];

  const renderRequest = (row) => (
    <li key={row.id} className="network-row">
      <FollowName userId={row.id} name={anzeigeName(row.name)} className="network-row-name" fromNetwork />
      <div className="network-row-actions">
        <button type="button" className="network-btn network-btn--primary" disabled={busyId === row.id}
          onClick={() => respond(row, 'accept')}>{t('annehmen')}</button>
        <button type="button" className="network-btn" disabled={busyId === row.id}
          onClick={() => respond(row, 'decline')}>{t('ablehnen')}</button>
        <button type="button" className="network-btn network-btn--quiet" disabled={busyId === row.id}
          onClick={() => respond(row, 'block')}>{t('blockieren')}</button>
      </div>
    </li>
  );

  const renderFollowing = (row) => (
    <NetworkRemovableRow
      key={row.id}
      userId={row.id}
      name={anzeigeName(row.name)}
      note={row.status === 'pending' ? t('angefragt') : null}
      onRemove={() => removeRow('following', row, () => stopFollowing(uid, row.id))}
    />
  );

  const renderFollower = (row) => (
    <NetworkRemovableRow
      key={row.id}
      userId={row.id}
      name={anzeigeName(row.name)}
      onRemove={() => removeRow('followers', row, () => removeFollower(uid, row.id))}
    />
  );

  const renderers = { requests: renderRequest, following: renderFollowing, followers: renderFollower };
  const rows = visible(activeTab);
  const blocked = visible('blocked');

  return (
    <div className="network-container">
      <UnterseiteKopf onZurueck={onBack}>
        <h2>{tChefkoch('meinNetzwerk')}</h2>
      </UnterseiteKopf>

      <div className="network-tabs" role="tablist">
        {/* Variante A: Reiter als Kennzahl-Kacheln; die Zahl ist Schmuck, der Name des Reiters bleibt */}
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`network-tab${activeTab === tab.key ? ' network-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <span className="network-tab-zahl" aria-hidden="true">{loading ? '–' : visible(tab.key).length}</span>
            <span className="network-tab-name">{t(tab.label)}</span>
          </button>
        ))}
      </div>

      <div className="network-page">
        {error && <p className="network-error" role="alert">{error.schluessel ? t(error.schluessel) : error.text}</p>}
        {loading ? (
          <p className="network-empty">{tAllgemein('laden')}</p>
        ) : (
          <>
            {activeTab === 'requests' && rows.length > 0 && <FollowVisibilityInfo />}
            {rows.length === 0 ? (
              <p className="network-empty">{t(EMPTY_TEXT[activeTab])}</p>
            ) : (
              <ul className="network-list">{rows.map(renderers[activeTab])}</ul>
            )}

            {activeTab === 'requests' && blocked.length > 0 && (
              <section className="network-blocked">
                <h3>{t('blockiert')}</h3>
                <ul className="network-list">
                  {blocked.map((row) => (
                    <li key={row.id} className="network-row">
                      <span className="network-row-name">{anzeigeName(row.name)}</span>
                      <button type="button" className="network-btn" disabled={busyId === row.id}
                        onClick={() => respond(row, 'unblock')}>{t('freigeben')}</button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>

      <UndoSnackbar
        itemName={lastBanner?.message}
        onUndo={() => lastBanner && undoDelete(lastBanner.id)}
      />
    </div>
  );
}

export default NetworkPage;

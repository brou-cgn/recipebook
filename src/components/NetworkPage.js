import React, { useCallback, useEffect, useRef, useState } from 'react';
import './NetworkPage.css';
import DeleteRowButton from './DeleteRowButton';
import UndoSnackbar from './UndoSnackbar';
import FollowName from './FollowName';
import TrashIcon from './icons/TrashIcon';
import useUndoableDelete from '../hooks/useUndoableDelete';
import useSwipeToDelete from '../hooks/useSwipeToDelete';
import { getButtonIcons, DEFAULT_BUTTON_ICONS, getEffectiveIcon, getDarkModePreference } from '../utils/customLists';
import { isBase64Image } from '../utils/imageUtils';
import {
  loadNetwork, respondToFollow, stopFollowing, removeFollower,
} from '../utils/followFirestore';

const TABS = [
  { key: 'requests', label: 'Anfragen' },
  { key: 'following', label: 'Ich folge' },
  { key: 'followers', label: 'Follower' },
];

const EMPTY_TEXT = {
  requests: 'Keine offenen Anfragen.',
  following: 'Du folgst noch niemandem.',
  followers: 'Dir folgt noch niemand.',
};

const EMPTY_NETWORK = { requests: [], following: [], followers: [], blocked: [] };

const withoutId = (rows, id) => rows.filter((row) => row.id !== id);

// Zeile mit Entfernen-Aktion: Desktop zeigt den DeleteRowButton, mobil gilt die
// Linksswipe-Geste (CLAUDE.md, Löschaktionen). Beide lösen dieselbe Entfernung aus.
function NetworkRemovableRow({ userId, name, note, onRemove }) {
  const { offset, isDeleteVisible, reset, handlers } = useSwipeToDelete();

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
          aria-label={`${name} entfernen`}
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
  return (
    <div className="network-info">
      <button
        type="button"
        className="network-info-toggle"
        aria-expanded={open}
        aria-controls="network-info-body"
        onClick={() => setOpen((v) => !v)}
      >
        Was wird sichtbar?
      </button>
      {open && (
        <div id="network-info-body" className="network-info-body">
          <p>
            Mit dem Annehmen zeigt die App dieser Person in „Für dich entdeckt“ Rezepte, die du
            gekocht oder angelegt hast, mit deinem Vornamen und einer groben Zeitangabe
            („Anna hat das gekocht · gestern“).
          </p>
          <ul>
            <li>Rückwirkend: Es zählen auch frühere Einträge aus dem Zeitfenster der Rubrik (derzeit bis zu 30 Tage).</li>
            <li>Verwendet werden deine „Gekocht am“-Einträge und deine angelegten Rezepte. Einzelne Einträge lassen sich nicht ausnehmen.</li>
            <li>Daraus lassen sich Rückschlüsse auf deine Ernährungsgewohnheiten ziehen.</li>
            <li>Du kannst Follower jederzeit entfernen. Bereits angezeigte Hinweise lassen sich nicht zurückholen.</li>
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
  const [buttonIcons, setButtonIcons] = useState({ ...DEFAULT_BUTTON_ICONS });
  const [isDarkMode, setIsDarkMode] = useState(getDarkModePreference);
  const closeBtnRef = useRef(null);

  useEffect(() => {
    getButtonIcons().then(setButtonIcons).catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e) => setIsDarkMode(e.detail.isDark);
    window.addEventListener('darkModeChange', handler);
    return () => window.removeEventListener('darkModeChange', handler);
  }, []);

  useEffect(() => {
    closeBtnRef.current?.blur();
  }, []);

  const closeIcon = getEffectiveIcon(buttonIcons, 'closeButtonDefaultImg', isDarkMode)
    || getEffectiveIcon(buttonIcons, 'closeButton', isDarkMode)
    || DEFAULT_BUTTON_ICONS.closeButtonDefaultImg;

  const reload = useCallback(async () => {
    if (!uid) return;
    try {
      setNetwork(await loadNetwork(uid));
      setError(null);
    } catch (err) {
      console.error('Netzwerk nicht ladbar:', err);
      setError('Das Netzwerk konnte nicht geladen werden.');
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
      setError(err?.message || 'Die Aktion ist fehlgeschlagen.');
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
      message: row.name,
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
      <FollowName userId={row.id} name={row.name} className="network-row-name" fromNetwork />
      <div className="network-row-actions">
        <button type="button" className="network-btn network-btn--primary" disabled={busyId === row.id}
          onClick={() => respond(row, 'accept')}>Annehmen</button>
        <button type="button" className="network-btn" disabled={busyId === row.id}
          onClick={() => respond(row, 'decline')}>Ablehnen</button>
        <button type="button" className="network-btn network-btn--quiet" disabled={busyId === row.id}
          onClick={() => respond(row, 'block')}>Blockieren</button>
      </div>
    </li>
  );

  const renderFollowing = (row) => (
    <NetworkRemovableRow
      key={row.id}
      userId={row.id}
      name={row.name}
      note={row.status === 'pending' ? 'Angefragt' : null}
      onRemove={() => removeRow('following', row, () => stopFollowing(uid, row.id))}
    />
  );

  const renderFollower = (row) => (
    <NetworkRemovableRow
      key={row.id}
      userId={row.id}
      name={row.name}
      onRemove={() => removeRow('followers', row, () => removeFollower(uid, row.id))}
    />
  );

  const renderers = { requests: renderRequest, following: renderFollowing, followers: renderFollower };
  const rows = visible(activeTab);
  const blocked = visible('blocked');

  return (
    <div className="network-container">
      <div className="network-header">
        <h2>Mein Netzwerk</h2>
        {onBack && (
          <button
            ref={closeBtnRef}
            type="button"
            className="app-close-button"
            onClick={onBack}
            aria-label="Mein Netzwerk schließen"
            title="Mein Netzwerk schließen"
          >
            {isBase64Image(closeIcon) ? (
              <img src={closeIcon} alt="Mein Netzwerk schließen" className="app-close-button-icon-img" />
            ) : (
              closeIcon
            )}
          </button>
        )}
      </div>

      <div className="network-page">
        <div className="network-tabs" role="tablist">
          {TABS.map((tab) => {
            const count = tab.key === 'requests' ? network.requests.length : 0;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                className={`network-tab${activeTab === tab.key ? ' network-tab--active' : ''}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}{count > 0 ? ` (${count})` : ''}
              </button>
            );
          })}
        </div>

        {error && <p className="network-error" role="alert">{error}</p>}
        {loading ? (
          <p className="network-empty">Wird geladen …</p>
        ) : (
          <>
            {activeTab === 'requests' && rows.length > 0 && <FollowVisibilityInfo />}
            {rows.length === 0 ? (
              <p className="network-empty">{EMPTY_TEXT[activeTab]}</p>
            ) : (
              <ul className="network-list">{rows.map(renderers[activeTab])}</ul>
            )}

            {activeTab === 'requests' && blocked.length > 0 && (
              <section className="network-blocked">
                <h3>Blockiert</h3>
                <ul className="network-list">
                  {blocked.map((row) => (
                    <li key={row.id} className="network-row">
                      <span className="network-row-name">{row.name}</span>
                      <button type="button" className="network-btn" disabled={busyId === row.id}
                        onClick={() => respond(row, 'unblock')}>Freigeben</button>
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

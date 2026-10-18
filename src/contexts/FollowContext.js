import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { subscribeMyFollows, requestToFollow, stopFollowing } from '../utils/followFirestore';
import '../components/UndoSnackbar.css';

// Eigene ausgehende Follows (Vorhaben docs/vorhaben/follow.md, PR 4). Ohne Provider
// oder ohne Freischaltung ist `enabled` false: Folgen-Buttons rendern dann nichts.
const INERT = { enabled: false, userId: null, statusOf: () => null, request: async () => {}, openProfile: null };
const FollowContext = createContext(INERT);

const NOTICE_MS = 6000;

export function FollowProvider({ userId, enabled, onOpenProfile, children }) {
  const active = Boolean(userId && enabled);
  const [statuses, setStatuses] = useState({});
  const [notice, setNotice] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!active) {
      setStatuses({});
      return undefined;
    }
    return subscribeMyFollows(userId, setStatuses, () => setStatuses({}));
  }, [active, userId]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const showNotice = useCallback((next) => {
    clearTimeout(timerRef.current);
    setNotice(next);
    timerRef.current = setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);

  const request = useCallback(async (followeeId, name) => {
    try {
      await requestToFollow(followeeId);
      showNotice({
        message: `Anfrage an ${name} gesendet`,
        undo: async () => {
          setNotice(null);
          try {
            await stopFollowing(userId, followeeId);
          } catch (err) {
            console.error('Anfrage zurückziehen fehlgeschlagen:', err);
          }
        },
      });
    } catch (err) {
      console.error('Follow-Anfrage fehlgeschlagen:', err);
      showNotice({ message: err?.message || 'Die Anfrage konnte nicht gesendet werden.' });
    }
  }, [userId, showNotice]);

  const value = useMemo(() => ({
    enabled: active,
    userId,
    statusOf: (id) => statuses[id] || null,
    request,
    openProfile: onOpenProfile || null,
  }), [active, userId, statuses, request, onOpenProfile]);

  return (
    <FollowContext.Provider value={value}>
      {children}
      {notice && (
        <div className="undo-snackbar" role="status">
          <span className="undo-snackbar-message">{notice.message}</span>
          {notice.undo && (
            <button type="button" className="undo-snackbar-action" onClick={notice.undo}>
              Rückgängig
            </button>
          )}
        </div>
      )}
    </FollowContext.Provider>
  );
}

export const useFollow = () => useContext(FollowContext);

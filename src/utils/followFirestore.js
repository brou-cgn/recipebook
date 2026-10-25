import { db, functions } from '../firebase';
import {
  collection, doc, query, where, limit, getDocs, getDoc, deleteDoc, onSnapshot,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

// Datenzugriff für Follow (Vorhaben docs/vorhaben/follow.md). Anfragen und
// Antworten laufen über Callables, nur Zurückziehen/Entfernen löscht direkt
// (firestore.rules: `follows` darf von beiden Seiten gelöscht werden).

const MAX_ROWS = 200;
const ANONYMOUS_NAME = 'Ein Mitglied';

export const followDocId = (followerId, followeeId) => `${followerId}_${followeeId}`;

/**
 * Anzeigename aus publicProfiles. `versteckt` betrifft nur Auswahllisten und
 * bleibt hier bewusst unberücksichtigt: Wer eine Anfrage stellt oder folgt,
 * wird mit Namen angezeigt.
 */
export const displayNameFromProfile = (profile) => {
  if (!profile) return ANONYMOUS_NAME;
  const name = [profile.vorname, profile.nachname]
    .filter((part) => typeof part === 'string' && part.trim())
    .join(' ')
    .trim();
  return name || ANONYMOUS_NAME;
};

/**
 * Offene Anfragen an den Nutzer: Zeilen der Inbox, zu denen es noch eine
 * 'pending'-Beziehung gibt. Zieht der Anfragende zurück, bleibt die Inbox-Zeile
 * stehen (Clients dürfen sie nicht löschen); ohne diese Prüfung zeigte die
 * Seite und das Badge eine Anfrage, die es nicht mehr gibt.
 * @param {Set<string>} inboxIds - followerIds aus users/{uid}/followInbox
 * @param {Array<{followerId: string, status: string}>} incoming - follows an den Nutzer
 * @return {string[]} followerIds
 */
export const openRequestIds = (inboxIds, incoming) => incoming
  .filter((f) => f.status === 'pending' && inboxIds.has(f.followerId))
  .map((f) => f.followerId);

/**
 * Beobachtet die offenen Anfragen an einen Nutzer.
 * @param {string} uid
 * @param {(followerIds: string[]) => void} onChange
 * @param {() => void} [onError]
 * @return {() => void} Abmelden
 */
export function subscribeOpenFollowRequests(uid, onChange, onError) {
  let inboxIds = new Set();
  let incoming = [];
  const emit = () => onChange(openRequestIds(inboxIds, incoming));
  const handleError = (err) => {
    console.error('Follow-Anfragen nicht lesbar:', err);
    if (onError) onError(err);
  };
  const unsubInbox = onSnapshot(
    query(collection(db, 'users', uid, 'followInbox'), limit(MAX_ROWS)),
    (snap) => {
      inboxIds = new Set(snap.docs.map((d) => d.id));
      emit();
    },
    handleError,
  );
  const unsubIncoming = onSnapshot(
    query(collection(db, 'follows'), where('followeeId', '==', uid), where('status', '==', 'pending'), limit(MAX_ROWS)),
    (snap) => {
      incoming = snap.docs.map((d) => d.data());
      emit();
    },
    handleError,
  );
  return () => {
    unsubInbox();
    unsubIncoming();
  };
}

async function loadNames(ids) {
  const entries = await Promise.all([...new Set(ids)].map(async (id) => {
    try {
      const snap = await getDoc(doc(db, 'publicProfiles', id));
      return [id, displayNameFromProfile(snap.exists() ? snap.data() : null)];
    } catch {
      return [id, ANONYMOUS_NAME];
    }
  }));
  return Object.fromEntries(entries);
}

/**
 * Lädt alles für die Netzwerk-Seite.
 * @return {Promise<{requests: Array, following: Array, followers: Array, blocked: Array}>}
 *   Jede Zeile: { id (UID der anderen Person), name, status? }
 */
export async function loadNetwork(uid) {
  const [outSnap, inSnap, inboxSnap, blockSnap] = await Promise.all([
    getDocs(query(collection(db, 'follows'), where('followerId', '==', uid), limit(MAX_ROWS))),
    getDocs(query(collection(db, 'follows'), where('followeeId', '==', uid), limit(MAX_ROWS))),
    getDocs(query(collection(db, 'users', uid, 'followInbox'), limit(MAX_ROWS))),
    getDocs(query(collection(db, 'users', uid, 'followBlocks'), limit(MAX_ROWS))),
  ]);
  const outgoing = outSnap.docs.map((d) => d.data());
  const incoming = inSnap.docs.map((d) => d.data());
  const inboxIds = new Set(inboxSnap.docs.map((d) => d.id));
  const requestIds = openRequestIds(inboxIds, incoming);
  const blockedIds = blockSnap.docs.map((d) => d.id);
  const followingRows = outgoing.map((f) => ({ id: f.followeeId, status: f.status }));
  const followerRows = incoming.filter((f) => f.status === 'accepted').map((f) => ({ id: f.followerId }));

  const names = await loadNames([
    ...requestIds, ...blockedIds,
    ...followingRows.map((r) => r.id), ...followerRows.map((r) => r.id),
  ]);
  const named = (rows) => rows.map((r) => ({ ...r, name: names[r.id] || ANONYMOUS_NAME }));
  return {
    requests: named(requestIds.map((id) => ({ id }))),
    following: named(followingRows),
    followers: named(followerRows),
    blocked: named(blockedIds.map((id) => ({ id }))),
  };
}

/**
 * Beobachtet die eigenen ausgehenden Beziehungen.
 * @param {string} uid
 * @param {(statuses: Object<string, string>) => void} onChange - followeeId -> 'pending' | 'accepted'
 * @param {() => void} [onError]
 * @return {() => void} Abmelden
 */
export function subscribeMyFollows(uid, onChange, onError) {
  return onSnapshot(
    query(collection(db, 'follows'), where('followerId', '==', uid), limit(MAX_ROWS)),
    (snap) => {
      const statuses = {};
      snap.docs.forEach((d) => { statuses[d.data().followeeId] = d.data().status; });
      onChange(statuses);
    },
    (err) => {
      console.error('Eigene Follows nicht lesbar:', err);
      if (onError) onError(err);
    },
  );
}

/** Stellt eine Follow-Anfrage (Callable requestFollow). */
export async function requestToFollow(followeeId) {
  const fn = httpsCallable(functions, 'requestFollow');
  const result = await fn({ followeeId });
  return result.data;
}

/** @param {'accept'|'decline'|'block'|'unblock'} action */
export async function respondToFollow(followerId, action) {
  const fn = httpsCallable(functions, 'respondFollow');
  const result = await fn({ followerId, action });
  return result.data;
}

/** Zieht eine Anfrage zurück bzw. beendet das Folgen (löscht das follows-Dokument). */
export function stopFollowing(uid, followeeId) {
  return deleteDoc(doc(db, 'follows', followDocId(uid, followeeId)));
}

/** Entfernt einen Follower (löscht das follows-Dokument von seiner Seite). */
export function removeFollower(uid, followerId) {
  return deleteDoc(doc(db, 'follows', followDocId(followerId, uid)));
}

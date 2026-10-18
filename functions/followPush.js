/**
 * Push bei neuer Follow-Anfrage (Vorhaben Follow, PR 2b).
 *
 * Der Gefolgte bekommt eine Data-Nachricht auf seine eigenen Geräte, wenn eine
 * Anfrage in seiner Inbox landet. Gleiche Regeln wie beim Push für "Für dich
 * entdeckt" (fuerDichEntdecktPush.js): nur mit Opt-in "Hintergrundaktualisierung"
 * und gespeichertem Token, best-effort, nie ein Fehler nach außen.
 *
 * Gesendet wird nur, wenn die Anfrage dem Gefolgten wirklich gezeigt wird (nicht
 * bei stiller Ablehnung oder Blockade) und nur einmal je Paar, solange die
 * Inbox-Zeile besteht. Der Name kommt aus publicProfiles; ein versteckter Nutzer
 * erscheint als "Jemand".
 */
const {sendDataPush} = require('./fuerDichEntdecktPush');

const ANONYMOUS_NAME = 'Jemand';

/**
 * @param {Object} info
 * @param {string} info.followerId
 * @param {string} [info.name] - Vorname des Anfragenden, leer für "Jemand"
 * @return {{title: string, body: string, notificationId: string}}
 */
const buildFollowPushText = ({followerId, name}) => ({
  title: 'Neue Follow-Anfrage',
  body: `${name || ANONYMOUS_NAME} möchte dir folgen.`,
  notificationId: `follow-request-${followerId}-${Date.now()}`,
});

/**
 * Vorname aus publicProfiles, außer der Nutzer ist versteckt.
 * @return {Promise<string>} Vorname oder leerer String
 */
const lookupFollowerName = async (db, followerId) => {
  try {
    const snap = await db.doc(`publicProfiles/${followerId}`).get();
    if (!snap.exists) return '';
    const profile = snap.data() || {};
    if (profile.versteckt === true) return '';
    return typeof profile.vorname === 'string' ? profile.vorname.trim() : '';
  } catch (err) {
    console.error('sendFollowRequestPush: Profil nicht lesbar:', err);
    return '';
  }
};

/**
 * @param {Object} admin - firebase-admin
 * @param {Object} db - admin.firestore()
 * @param {Object} info
 * @param {string} info.followerId - wer anfragt
 * @param {string} info.followeeId - wer die Anfrage bekommt
 * @return {Promise<number>} Zahl gesendeter Nachrichten
 */
const sendFollowRequestPush = async (admin, db, {followerId, followeeId}) => {
  if (!followerId || !followeeId) return 0;
  const name = await lookupFollowerName(db, followerId);
  const {title, body, notificationId} = buildFollowPushText({followerId, name});
  return sendDataPush(
      admin, db, followeeId,
      {title, body, notificationId, data: {type: 'follow_request'}},
      'sendFollowRequestPush: Versand fehlgeschlagen:',
  );
};

module.exports = {buildFollowPushText, lookupFollowerName, sendFollowRequestPush};

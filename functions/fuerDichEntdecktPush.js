/**
 * Push notification for a new "Fuer dich entdeckt" tile.
 *
 * When the rotation (see fuerDichEntdecktRotation.js, rotateFuerDichEntdecktList
 * in index.js) hands a list new recipes, its owner gets one data-only FCM
 * message on their own devices.
 *
 * Opt-in: only users with users/{uid}.backgroundUpdatesEnabled (setting
 * "Hintergrundaktualisierung", same switch as the import status push) and at
 * least one saved FCM token. Best-effort: never throws.
 */

/** Recipes of `nextIds` that the list did not hold before. */
const countNewRecipes = (previousIds, nextIds) => {
  const previous = new Set(Array.isArray(previousIds) ? previousIds : []);
  return [...new Set(nextIds || [])].filter((id) => !previous.has(id)).length;
};

/**
 * @param {Object} info
 * @param {string} info.listId
 * @param {string} [info.label] - topic description (tile title) or rubrik
 * @param {number} info.newCount - number of recipes new on the list
 * @return {{title: string, body: string, notificationId: string}}
 */
const buildPushText = ({listId, label, newCount}) => {
  const recipes = newCount === 1 ? '1 neues Rezept wartet' : `${newCount} neue Rezepte warten`;
  const body = label ? `${label}: ${recipes} auf dich.` : `${recipes} auf dich.`;
  return {
    title: 'Neu für dich entdeckt',
    body,
    notificationId: `fuer-dich-entdeckt-${listId}-${Date.now()}`,
  };
};

/**
 * @param {Object} admin - firebase-admin
 * @param {Object} db - admin.firestore()
 * @param {string} ownerId - owner of the list
 * @param {Object} info - see buildPushText (listId, label, newCount)
 * @return {Promise<number>} number of messages sent
 */
const sendFuerDichEntdecktPush = async (admin, db, ownerId, info) => {
  if (!ownerId || !(info.newCount > 0)) return 0;
  try {
    const userRef = db.collection('users').doc(ownerId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return 0;
    const userData = userSnap.data();
    if (!userData.backgroundUpdatesEnabled) return 0;
    const tokens = Array.isArray(userData.fcmTokens) ? userData.fcmTokens.filter(Boolean) : [];
    if (tokens.length === 0) return 0;

    const {title, body, notificationId} = buildPushText(info);
    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      data: {
        type: 'fuer_dich_entdeckt',
        title,
        body,
        icon: '/logo192.png',
        badge: '/favicon.ico',
        listId: info.listId,
        notificationId,
      },
      apns: {
        headers: {'apns-push-type': 'alert', 'apns-priority': '10'},
        payload: {aps: {'alert': {title, body}, 'sound': 'default', 'mutable-content': 1}},
      },
      webpush: {fcm_options: {link: '/'}},
    });

    const staleTokens = [];
    response.responses.forEach((resp, idx) => {
      if (
        !resp.success &&
        (resp.error?.code === 'messaging/registration-token-not-registered' ||
          resp.error?.code === 'messaging/invalid-registration-token')
      ) {
        staleTokens.push(tokens[idx]);
      }
    });
    if (staleTokens.length > 0) {
      await userRef.update({fcmTokens: tokens.filter((t) => !staleTokens.includes(t))});
    }
    return response.successCount || 0;
  } catch (err) {
    // No user data in the log (AGENTS.md), only the list.
    console.error(`sendFuerDichEntdecktPush: failed for list ${info.listId}:`, err);
    return 0;
  }
};

module.exports = {countNewRecipes, buildPushText, sendFuerDichEntdecktPush};

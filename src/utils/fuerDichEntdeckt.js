/**
 * "Für dich entdeckt" – persönliche, systemseitig angelegte interaktive Liste
 *
 * Jeder Nutzer mit der Berechtigung "Für dich entdeckt" (Funktionen nach
 * Berechtigung) bekommt genau eine private, interaktive Liste dieses Namens.
 * Sie ist der Datenträger für die gleichnamige Kachel auf der Startseite,
 * die in den Swipestapel (Tagesmenü) dieser Liste führt.
 *
 * - Feste Dokument-ID `fuerDichEntdeckt_<userId>`: das Anlegen ist idempotent,
 *   auch wenn mehrere Geräte gleichzeitig starten.
 * - Zielliste ist immer die Alltagsklassiker-Liste aus den persönlichen
 *   Einstellungen (`defaultEverydayClassicsListId`); ändert der Nutzer sie,
 *   zieht die Liste beim nächsten Abgleich nach.
 * - Ohne Berechtigung wird die Liste aus allen Ansichten ausgeblendet
 *   (nicht gelöscht) – Kachel und Liste hängen an derselben Einstellung.
 * - Die Liste startet leer (ohne recipeIds); befüllt wird sie später über
 *   die Themen-Logik.
 */

import { db } from '../firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { updateGroup } from './groupFirestore';

export const FUER_DICH_ENTDECKT_SYSTEM_KEY = 'fuerDichEntdeckt';
export const FUER_DICH_ENTDECKT_LIST_NAME = 'Für dich entdeckt';

export const getFuerDichEntdecktListId = (userId) => `${FUER_DICH_ENTDECKT_SYSTEM_KEY}_${userId}`;

export const isFuerDichEntdecktList = (group) =>
  Boolean(group) && group.systemKey === FUER_DICH_ENTDECKT_SYSTEM_KEY;

/**
 * Die "Für dich entdeckt"-Liste des Nutzers aus den geladenen Gruppen.
 * @returns {Object|null}
 */
export const findFuerDichEntdecktList = (groups, userId) => {
  if (!userId || !Array.isArray(groups)) return null;
  return groups.find((g) => isFuerDichEntdecktList(g) && g.ownerId === userId) || null;
};

/**
 * Blendet "Für dich entdeckt"-Listen aus, wenn der Nutzer die Berechtigung
 * nicht hat. Gibt bei Berechtigung das Array unverändert zurück.
 */
export const filterFuerDichEntdecktGroups = (groups, hasPermission) => {
  if (hasPermission || !Array.isArray(groups)) return groups;
  return groups.filter((g) => !isFuerDichEntdecktList(g));
};

/**
 * Entscheidet, was für den Nutzer zu tun ist: Liste anlegen, Zielliste
 * nachziehen oder nichts.
 * @returns {{ action: 'none' } | { action: 'create', listId: string, data: Object } | { action: 'updateTarget', listId: string, targetListId: string|null }}
 */
export const planFuerDichEntdecktSync = (groups, user) => {
  if (!user?.id || !user.fuerDichEntdeckt) return { action: 'none' };

  const desiredTargetListId = user.defaultEverydayClassicsListId || null;
  const existing = findFuerDichEntdecktList(groups, user.id);

  if (!existing) {
    return {
      action: 'create',
      listId: getFuerDichEntdecktListId(user.id),
      data: {
        type: 'private',
        name: FUER_DICH_ENTDECKT_LIST_NAME,
        description: '',
        ownerId: user.id,
        memberIds: [user.id],
        memberRoles: {},
        listKind: 'interactive',
        targetListId: desiredTargetListId,
        systemKey: FUER_DICH_ENTDECKT_SYSTEM_KEY,
      },
    };
  }

  if ((existing.targetListId || null) !== desiredTargetListId) {
    return { action: 'updateTarget', listId: existing.id, targetListId: desiredTargetListId };
  }

  return { action: 'none' };
};

/**
 * Führt den Abgleich aus planFuerDichEntdecktSync gegen Firestore aus.
 * @returns {Promise<string>} die ausgeführte Aktion
 */
export const syncFuerDichEntdecktList = async (groups, user) => {
  const plan = planFuerDichEntdecktSync(groups, user);
  if (plan.action === 'create') {
    // merge: läuft der Abgleich doppelt, bevor der Snapshot die neue Liste
    // enthält, bleiben bereits zugeordnete Rezepte (recipeIds) erhalten.
    await setDoc(doc(db, 'groups', plan.listId), {
      ...plan.data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } else if (plan.action === 'updateTarget') {
    await updateGroup(plan.listId, { targetListId: plan.targetListId });
  }
  return plan.action;
};

/**
 * Aufräumen beim Löschen eines Kontos: Kochtagebuch-Einträge (cookDates) und
 * nicht öffentliche Rezepte des Mitglieds. Aufgerufen vom Löschzweig von
 * syncPublicProfile (handlers/admin.js), neben followCleanup.js. Die Logik hängt
 * nur an `db` und `bucket`, damit sie ohne Emulator testbar ist.
 *
 * Rezepte (Entscheidung 25.10.2026, Tech-Check S23): Gelöscht werden nur Rezepte,
 * die nicht öffentlich sind, also Entwürfe (`isPrivate`) und Rezepte, die nur in
 * einer privaten Liste liegen. Öffentliche Rezepte bleiben unverändert bestehen.
 * Mit einem Rezept gehen seine Bewertungen, seine Bilder im Storage und alle
 * cookDates darauf (auch von anderen). Nicht aufgeräumt werden Verweise anderer
 * Nutzer auf das Rezept (Menüs, Favoriten, Events, abgeleitete Versionen).
 */

const BATCH_SIZE = 400;

const isUid = (value) => typeof value === 'string' && value.length > 0 && value.length <= 128 &&
  !value.includes('/');

/** Löscht alle Dokumente einer Sammlung mit `field == value`, in Batches. */
const deleteWhere = async (db, collection, field, value) => {
  const snap = await db.collection(collection).where(field, '==', value).get();
  const refs = snap.docs.map((doc) => doc.ref);
  for (let i = 0; i < refs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    refs.slice(i, i + BATCH_SIZE).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
  return refs.length;
};

/**
 * Löscht alle cookDates, die `uid` angelegt hat.
 * @param {Object} db - Firestore
 * @param {string} uid - Konto, das gelöscht wurde
 * @return {Promise<number>} Anzahl gelöschter Dokumente
 */
const deleteCookDatesOfUser = async (db, uid) => {
  if (!isUid(uid)) return 0;
  return deleteWhere(db, 'cookDates', 'userId', uid);
};

/** Ob ein Rezept für alle Mitglieder sichtbar ist (Regeln wie isVisibleToUser in fuerDichEntdecktRotation.js). */
const isPublicRecipe = (recipe, groupsById) => {
  if (recipe.isPrivate) return false;
  if (!recipe.groupId || recipe.publishedToPublic || recipe.groupType === 'public') return true;
  return groupsById.get(recipe.groupId)?.type === 'public';
};

/** Pfad eines Bildes im Storage aus seiner Download-URL, sonst null (fremde URL, base64). */
const storagePathOf = (url) => {
  if (typeof url !== 'string' || !url.includes('firebasestorage.googleapis.com')) return null;
  try {
    const match = new URL(url).pathname.match(/\/o\/(.+)/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
};

const imageUrlsOf = (recipe) => {
  const urls = Array.isArray(recipe.images) ? recipe.images.map((image) => image && image.url) : [];
  if (recipe.image) urls.push(recipe.image);
  return [...new Set(urls)];
};

/**
 * Löscht die nicht öffentlichen Rezepte von `uid` samt Bewertungen, Bildern und cookDates darauf.
 * Öffentliche Rezepte bleiben. Wirft, wenn eine Liste nicht lesbar ist: im Zweifel nichts löschen.
 * @param {Object} deps - {db: Firestore, bucket: Storage-Bucket}
 * @param {string} uid - Konto, das gelöscht wurde
 * @return {Promise<{deleted: number, kept: number}>}
 */
const deleteNonPublicRecipesOfUser = async ({db, bucket}, uid) => {
  if (!isUid(uid)) return {deleted: 0, kept: 0};
  const snap = await db.collection('recipes').where('authorId', '==', uid).get();
  const recipes = snap.docs.map((doc) => ({id: doc.id, ref: doc.ref, data: doc.data()}));

  const groupsById = new Map();
  for (const groupId of new Set(recipes.map((r) => r.data.groupId).filter(Boolean))) {
    const group = await db.doc(`groups/${groupId}`).get();
    if (group.exists) groupsById.set(groupId, group.data());
  }

  const doomed = recipes.filter((r) => !isPublicRecipe(r.data, groupsById));
  for (const recipe of doomed) {
    await deleteWhere(db, 'cookDates', 'recipeId', recipe.id);
    for (const url of imageUrlsOf(recipe.data)) {
      const path = storagePathOf(url);
      if (!path) continue;
      try {
        await bucket.file(path).delete({ignoreNotFound: true});
      } catch (err) {
        console.error(`Bild ${path} von Rezept ${recipe.id} nicht gelöscht:`, err);
      }
    }
    // Rezept samt Unterseite ratings
    await db.recursiveDelete(recipe.ref);
  }
  return {deleted: doomed.length, kept: recipes.length - doomed.length};
};

module.exports = {deleteCookDatesOfUser, deleteNonPublicRecipesOfUser, isPublicRecipe};

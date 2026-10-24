/**
 * "Für dich entdeckt": nightly rule search, rotation and the first fill of a
 * new list. Split out of index.js (Tech-Check F2).
 */

const {onSchedule} = require('firebase-functions/v2/scheduler');
const {onDocumentCreated} = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const {countNewRecipes, sendFuerDichEntdecktPush} = require('../fuerDichEntdecktPush');
const {isRotationDue, getProtectedRecipeIds, pruneExpiredCarriedRecipeIds, pruneStaleRecipeIds, pickRotationRecipeIds, getActiveTopics, normalizeRecipeRule, hasRecipeRule, ruleKey, computeRuleResult, recipeAvailableToUser, usesFollowedScope, buildAttribution, mergeRuleMatches, explainTopicExclusion, isVisibleToUser, pickTopic, SYSTEM_KEY: FUER_DICH_ENTDECKT_KEY} = require('../fuerDichEntdecktRotation');

/**
 * Applies the topics' `recipeRule`s: the matching recipes (visibility is
 * irrelevant, pending imports aside) are written into the topic's `recipeIds`
 * like hand-picked ones; `autoRecipeIds` records which entries the rule added so
 * that stale ones are dropped later (mergeRuleMatches). Topics without a rule
 * lose their earlier automatic entries. Loads cook dates only when a rule looks
 * at them. Shared by the nightly search and the rotation.
 * @param {Array<FirebaseFirestore.QueryDocumentSnapshot>} topicDocs
 * @param {Array<Object>} recipes
 * @return {Promise<Map<string, Object>>} topic id -> fields written to the topic
 */
const applyTopicRules = async (db, topicDocs, recipes) => {
  const updates = new Map();
  if (topicDocs.length === 0) return updates;
  const lastCookedByRecipe = new Map();
  const lastCookedByUser = new Map(); // recipeId -> userId -> latest cook date (ms)
  const needsCookDates = topicDocs.some((d) => {
    const {lastCooked} = normalizeRecipeRule(d.data().recipeRule);
    return lastCooked.minDays !== null || lastCooked.maxDays !== null;
  });
  if (needsCookDates) {
    const cookSnap = await db.collection('cookDates').get();
    cookSnap.docs.forEach((d) => {
      const {recipeId, userId, date} = d.data();
      const ms = date && typeof date.toMillis === 'function' ? date.toMillis() : null;
      if (!recipeId || ms === null) return;
      if (ms > (lastCookedByRecipe.get(recipeId) ?? -Infinity)) lastCookedByRecipe.set(recipeId, ms);
      if (userId) {
        const perUser = lastCookedByUser.get(recipeId) || new Map();
        if (ms > (perUser.get(userId) ?? -Infinity)) perUser.set(userId, ms);
        lastCookedByUser.set(recipeId, perUser);
      }
    });
  }
  const now = Date.now();
  for (const d of topicDocs) {
    const topic = d.data();
    const ruled = hasRecipeRule(topic.recipeRule);
    const {matches, owners, actors} = ruled ?
      computeRuleResult(topic.recipeRule, recipes, lastCookedByRecipe, now, lastCookedByUser) :
      {matches: [], owners: {}, actors: {}};
    const merged = mergeRuleMatches(topic, matches);
    // Scope 'own': who qualifies for each rule-added recipe (hand-picked ones are for everybody).
    const autoRecipeOwners = Object.fromEntries(
        merged.autoRecipeIds.filter((id) => owners[id]).map((id) => [id, owners[id]]));
    // Scopes 'own' / 'followed': what each actor did last (kind + time), for the attribution.
    const autoRecipeActors = Object.fromEntries(
        merged.autoRecipeIds.filter((id) => actors[id]).map((id) => [id, actors[id]]));
    const update = {
      recipeIds: merged.recipeIds,
      autoRecipeIds: merged.autoRecipeIds,
      autoRecipeOwners: Object.keys(autoRecipeOwners).length > 0 ?
        autoRecipeOwners : admin.firestore.FieldValue.delete(),
      autoRecipeActors: Object.keys(autoRecipeActors).length > 0 ?
        autoRecipeActors : admin.firestore.FieldValue.delete(),
      ruleMatchedFor: ruled ? ruleKey(topic.recipeRule) : admin.firestore.FieldValue.delete(),
      ruleMatchedAt: ruled ? admin.firestore.FieldValue.serverTimestamp() : admin.firestore.FieldValue.delete(),
      // legacy field of an earlier version (matches were stored separately)
      ruleRecipeIds: admin.firestore.FieldValue.delete(),
    };
    await d.ref.update(update);
    updates.set(d.id, {...update, ownersMap: autoRecipeOwners, actorsMap: autoRecipeActors, matchCount: matches.length, added: merged.autoRecipeIds.length});
  }
  return updates;
};

/**
 * Nightly rule search for the "Für dich entdeckt" topics (03:30, before the
 * rotation at 04:00): recipes matching a topic's `recipeRule` are added to its
 * `recipeIds` like hand-picked ones (see applyTopicRules). The topic's period is
 * irrelevant here - it only decides in rotateFuerDichEntdecktLists when the
 * topic is handed out.
 */
exports.refreshDiscoverTopicRuleMatches = onSchedule(
    {
      schedule: '30 3 * * *',
      timeZone: 'Europe/Berlin',
      timeoutSeconds: 300,
      maxInstances: 1,
    },
    async () => {
      const db = admin.firestore();
      const topicsSnap = await db.collection('discoverTopics').get();
      const docs = topicsSnap.docs.filter((d) =>
        hasRecipeRule(d.data().recipeRule) || d.data().autoRecipeIds !== undefined ||
        d.data().ruleRecipeIds !== undefined);
      if (docs.length === 0) {
        console.log('refreshDiscoverTopicRuleMatches: no topic with a rule');
        return;
      }
      const recipesSnap = await db.collection('recipes').get();
      const recipes = recipesSnap.docs.map((d) => ({id: d.id, ...d.data()}));
      const updates = await applyTopicRules(db, docs, recipes);
      updates.forEach((u, id) => console.log(
          `refreshDiscoverTopicRuleMatches: topic ${id}: ${u.matchCount} match(es) of ` +
          `${recipes.length} recipes, ${u.added} added to recipeIds`));
      console.log(`refreshDiscoverTopicRuleMatches: updated ${docs.length} topic(s)`);
    }
);

/**
 * Loads what a rotation needs: topics (with stale rule matches refreshed),
 * recipes, groups for the visibility check and the topics relevant today.
 * Shared by the weekly rotation and the rotation of a freshly created list.
 * @return {Promise<{recipes: Array<Object>, recipesById: Map, groupsById: Map, activeTopics: Array<Object>}>}
 */
const loadFuerDichEntdecktRotationContext = async (db) => {
  const [topicsSnap, recipesSnap, groupsSnap] = await Promise.all([
    db.collection('discoverTopics').get(),
    db.collection('recipes').get(),
    db.collection('groups').get(),
  ]);
  const groupsById = new Map(groupsSnap.docs.map((d) => [d.id, d.data()]));
  const recipes = recipesSnap.docs.map((d) => ({id: d.id, ...d.data()}));
  const topics = topicsSnap.docs.map((d) => ({id: d.id, ...d.data()}));

  // A rule created or changed after the nightly search (03:30) has not been
  // applied yet - do it now instead of leaving the topic without its recipes.
  const staleDocs = topicsSnap.docs.filter((d) => {
    const t = d.data();
    return hasRecipeRule(t.recipeRule) ?
      t.ruleMatchedFor !== ruleKey(t.recipeRule) :
      t.autoRecipeIds !== undefined || t.ruleRecipeIds !== undefined;
  });
  if (staleDocs.length > 0) {
    const updates = await applyTopicRules(db, staleDocs, recipes);
    updates.forEach((u, id) => {
      const topic = topics.find((t) => t.id === id);
      topic.recipeIds = u.recipeIds;
      topic.autoRecipeIds = u.autoRecipeIds;
      topic.autoRecipeOwners = u.ownersMap;
      topic.autoRecipeActors = u.actorsMap;
    });
  }

  const activeTopics = getActiveTopics(topics, recipes);
  topics
      .filter((t) => !activeTopics.some((a) => a.id === t.id))
      .forEach((t) => console.log(
          `rotateFuerDichEntdecktLists: topic ${t.id} skipped: ${explainTopicExclusion(t, recipes)}`));
  return {
    recipes,
    recipesById: new Map(recipes.map((r) => [r.id, r])),
    groupsById,
    activeTopics,
  };
};

/**
 * Rotates ONE "Für dich entdeckt" list: draws a topic that has at least one
 * recipe the list's owner may see and is available to them, and replaces the
 * list's recipes with up to 5 of it (valid 'kandidat' recipes stay).
 * Every list draws on its own, so different users usually get different
 * topics, and a topic without recipes for this owner is simply not a candidate.
 * With `notify` the owner gets a push for the recipes that are new on the list
 * (see sendFuerDichEntdecktPush); the first fill of a brand-new list passes
 * false, the user is in the app at that moment.
 * @return {Promise<boolean>} whether the list was rotated
 */
const rotateFuerDichEntdecktList = async (db, listDoc, context, now = Date.now(), notify = true) => {
  const {recipesById, groupsById, activeTopics} = context;
  const list = listDoc.data();
  // Visibility depends on the list's owner: only topics with at least one
  // recipe the owner may see take part, and only such recipes are drawn.
  const userDoc = await db.collection('users').doc(list.ownerId).get();
  const user = {id: list.ownerId, isAdmin: userDoc.exists && userDoc.data().role === 'admin'};
  // Topics with scope 'followed' hand out what the owner's accepted follows did.
  const followedUsed = activeTopics.some((t) => usesFollowedScope(t.recipeRule));
  const followedIds = new Set();
  if (followedUsed) {
    const followsSnap = await db.collection('follows')
        .where('followerId', '==', list.ownerId).where('status', '==', 'accepted').get();
    followsSnap.docs.forEach((d) => followedIds.add(d.data().followeeId));
  }
  const candidates = activeTopics
      .map((t) => ({
        ...t,
        usableRecipeIds: t.usableRecipeIds.filter((id) =>
          isVisibleToUser(recipesById.get(id), user, groupsById) &&
          recipeAvailableToUser(t, id, user.id, followedIds)),
      }))
      .filter((t) => t.usableRecipeIds.length > 0);
  const topic = pickTopic(candidates, list.themeId || null);
  if (!topic) {
    console.log(`rotateFuerDichEntdecktLists: list ${listDoc.id}: no topic with recipes visible to the owner`);
    return false;
  }
  // Recipes with a still valid 'kandidat' swipe flag of this list stay.
  const flagsSnap = await db.collection('recipeSwipeFlags')
      .where('listID', '==', listDoc.id).where('flag', '==', 'kandidat').get();
  const protectedIds = getProtectedRecipeIds(flagsSnap.docs.map((d) => d.data()), now);
  const recipeIds = pickRotationRecipeIds(topic.usableRecipeIds, list.recipeIds || [], protectedIds);
  // Kept only for their flag (not part of the new topic): removed again once it expires.
  const topicIds = new Set(topic.usableRecipeIds);
  const carriedRecipeIds = recipeIds.filter((id) => protectedIds.includes(id) && !topicIds.has(id));
  await listDoc.ref.update({
    recipeIds,
    carriedRecipeIds,
    description: topic.beschreibung || '',
    themeLabel: topic.rubrik || '',
    themeImage: topic.imageUrl || '',
    themeId: topic.id,
    rotatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  if (followedUsed) {
    // Private to the owner (rules: read by owner only, written by functions only).
    await db.doc(`users/${list.ownerId}/fuerDichEntdeckt/current`).set({
      listId: listDoc.id,
      themeId: topic.id,
      recipes: buildAttribution(topic, recipeIds, followedIds),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  if (notify) {
    await sendFuerDichEntdecktPush(admin, db, list.ownerId, {
      listId: listDoc.id,
      label: topic.beschreibung || topic.rubrik || '',
      newCount: countNewRecipes(list.recipeIds, recipeIds),
    });
  }
  return true;
};

/**
 * Weekly rotation of the personal "Für dich entdeckt" lists: every list whose
 * last rotation is a week old (or that never had one, or whose topic has run
 * out) loses all its recipes and gets up to 5 from a topic drawn from the
 * admin-maintained `discoverTopics` that is relevant today (period). Without
 * a relevant topic the lists stay as they are. Runs daily so that a missed run
 * is caught up within a day; `rotatedAt` keeps it to once a week. A new list is
 * filled right away by fillNewFuerDichEntdecktList; this run is its fallback.
 */
exports.rotateFuerDichEntdecktLists = onSchedule(
    {
      schedule: '0 4 * * *',
      timeZone: 'Europe/Berlin',
      timeoutSeconds: 300,
      maxInstances: 1,
    },
    async () => {
      const db = admin.firestore();
      const listsSnap = await db.collection('groups')
          .where('systemKey', '==', FUER_DICH_ENTDECKT_KEY).get();
      const context = await loadFuerDichEntdecktRotationContext(db);
      // Recipes outside the list's topic without a valid 'kandidat' flag leave
      // the tile (also old carry-overs that predate `carriedRecipeIds`, whose
      // flag documents may be gone). Unknown topic: only the carried recipes.
      for (const listDoc of listsSnap.docs) {
        const data = listDoc.data();
        const topic = context.activeTopics.find((t) => t.id === data.themeId) || null;
        const hasCarried = Array.isArray(data.carriedRecipeIds) && data.carriedRecipeIds.length > 0;
        if (!topic && !hasCarried) continue;
        const flagsSnap = await db.collection('recipeSwipeFlags')
            .where('listID', '==', listDoc.id).where('flag', '==', 'kandidat').get();
        const flagDocs = flagsSnap.docs.map((d) => d.data());
        const pruned = topic ?
          pruneStaleRecipeIds(data, topic, flagDocs) :
          pruneExpiredCarriedRecipeIds(data, flagDocs);
        if (pruned) await listDoc.ref.update(pruned);
      }
      if (context.activeTopics.length === 0) {
        console.log('rotateFuerDichEntdecktLists: no relevant topic, lists unchanged');
        return;
      }

      const now = Date.now();
      const dueLists = listsSnap.docs
          .filter((d) => isRotationDue(d.data(), now, context.activeTopics));
      if (dueLists.length === 0) {
        console.log('rotateFuerDichEntdecktLists: no list due');
        return;
      }

      let rotated = 0;
      for (const listDoc of dueLists) {
        if (await rotateFuerDichEntdecktList(db, listDoc, context, now)) rotated++;
      }
      console.log(`rotateFuerDichEntdecktLists: rotated ${rotated}/${dueLists.length} list(s)`);
    }
);

/**
 * Fills a freshly created "Für dich entdeckt" list right away, so that a new
 * user (the client creates the list on the first start with the permission)
 * sees recipes in the tile instead of waiting for the 04:00 run. If no topic
 * fits the owner, the list stays empty and the daily run retries it.
 */
exports.fillNewFuerDichEntdecktList = onDocumentCreated(
    {
      document: 'groups/{groupId}',
      region: 'us-central1',
      timeoutSeconds: 120,
    },
    async (event) => {
      const data = event.data ? event.data.data() : null;
      if (!data || data.systemKey !== FUER_DICH_ENTDECKT_KEY || !data.ownerId) return;
      const db = admin.firestore();
      const context = await loadFuerDichEntdecktRotationContext(db);
      if (context.activeTopics.length === 0) {
        console.log(`fillNewFuerDichEntdecktList: list ${event.params.groupId}: no relevant topic`);
        return;
      }
      // Re-read: the client may have written recipeIds/rotatedAt since the event.
      const listDoc = await db.collection('groups').doc(event.params.groupId).get();
      if (!listDoc.exists || !isRotationDue(listDoc.data(), Date.now(), context.activeTopics)) return;
      const filled = await rotateFuerDichEntdecktList(db, listDoc, context, Date.now(), false);
      console.log(`fillNewFuerDichEntdecktList: list ${event.params.groupId}: ${filled ? 'filled' : 'left empty'}`);
    }
);

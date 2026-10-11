/**
 * Weekly rotation of the personal "Für dich entdeckt" lists.
 *
 * Every list carrying systemKey 'fuerDichEntdeckt' (see
 * src/utils/fuerDichEntdeckt.js) gets, once a week, all of its recipes
 * removed and RECIPES_PER_ROTATION new ones for a current theme assigned.
 *
 * Themes are maintained by admins in Settings (collection `discoverTopics`,
 * see src/utils/discoverTopics.js): rubrik (-> themeLabel), beschreibung
 * (-> list description / tile title), relevante Rezepte (recipeIds) and an
 * optional yearly period (periodStart / periodEnd as 'MM-DD'; may wrap over
 * New Year; both empty = all year). Only topics whose period contains today
 * and that have at least one usable recipe take part in the rotation.
 * `rotatedAt` on the list document is the clock: a list without it (freshly
 * created) is rotated on the next run, otherwise once ROTATION_INTERVAL_MS
 * has passed. A list without `themeId` is also due, so a list rotated by an
 * older version switches to the topics on the next run.
 *
 * Pure functions only - the scheduled function in index.js does the I/O.
 */

const SYSTEM_KEY = 'fuerDichEntdeckt';
const RECIPES_PER_ROTATION = 5;

// Run is daily; a half-day tolerance keeps "every 7 days" from drifting to 8.
const ROTATION_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000 - 12 * 60 * 60 * 1000;

const TIME_ZONE = 'Europe/Berlin';

const toMillis = (value) => {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return typeof value === 'number' ? value : null;
};

/**
 * @param {Object} list
 * @param {number} [now]
 * @param {Array<Object>|null} [activeTopics] - when given, a list whose current
 *   topic (`themeId`) is no longer among them is due early, so an expired
 *   topic does not linger for the rest of the week.
 */
const isRotationDue = (list, now = Date.now(), activeTopics = null) => {
  if (!list || list.systemKey !== SYSTEM_KEY) return false;
  // Lists rotated before topics existed (no themeId) switch over on the next
  // run instead of waiting out the week.
  if (!list.themeId) return true;
  if (activeTopics && !activeTopics.some((topic) => topic.id === list.themeId)) return true;
  const last = toMillis(list.rotatedAt);
  return last === null || now - last >= ROTATION_INTERVAL_MS;
};

/** 'MM-DD' of the given moment in the app's time zone. */
const monthDayOf = (now = Date.now()) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE, month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(now));
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('month')}-${get('day')}`;
};

const MONTH_DAY = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/**
 * Whether `now` lies in the topic's yearly period. Both bounds are inclusive;
 * start > end means the period wraps over New Year (e.g. 12-15 .. 01-06).
 * No period (both empty) = all year; a half-set or malformed period never
 * matches, so a topic that is not finished cannot slip into the rotation.
 */
const isTopicInPeriod = (topic, now = Date.now()) => {
  const start = topic.periodStart || '';
  const end = topic.periodEnd || '';
  if (!start && !end) return true;
  if (!MONTH_DAY.test(start) || !MONTH_DAY.test(end)) return false;
  const today = monthDayOf(now);
  return start <= end ?
    today >= start && today <= end :
    today >= start || today <= end;
};

/**
 * Topics that may be rotated in right now: in period, with at least one
 * recipe that every user may see. Each result carries the usable recipe IDs.
 */
const getActiveTopics = (topics, recipes, now = Date.now()) => {
  const visible = new Set(recipes.filter(isPubliclyVisible).map((r) => r.id));
  return (topics || [])
      .filter((topic) => topic && topic.isActive !== false && isTopicInPeriod(topic, now))
      .map((topic) => ({
        ...topic,
        usableRecipeIds: (Array.isArray(topic.recipeIds) ? topic.recipeIds : [])
            .filter((id) => visible.has(id)),
      }))
      .filter((topic) => topic.usableRecipeIds.length > 0);
};

/**
 * Draws one topic at random. The list's previous topic is skipped when there
 * is an alternative, so consecutive weeks differ.
 * @return {Object|null}
 */
const pickTopic = (activeTopics, previousTopicId = null, random = Math.random) => {
  if (activeTopics.length === 0) return null;
  const others = activeTopics.filter((t) => t.id !== previousTopicId);
  const pool = others.length > 0 ? others : activeTopics;
  return pool[Math.floor(random() * pool.length)];
};

const ingredientText = (item) => {
  if (typeof item === 'string') return item;
  if (!item || typeof item !== 'object' || item.type === 'heading') return '';
  return [item.name, item.text, item.ingredient].filter(Boolean).join(' ');
};

/**
 * Recipes every user may see: no pending import, not private, not locked
 * to a group unless published to the public list / living in a public group.
 */
const isPubliclyVisible = (recipe) => {
  if (!recipe || recipe.isTemp || recipe.isPrivate) return false;
  return !recipe.groupId || recipe.publishedToPublic === true ||
    recipe.groupType === 'public';
};

const shuffle = (items, random) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

/**
 * Picks the recipe IDs for one list from a topic's usable recipes, in random
 * order. Recipes the list held last week are only used if there are not
 * enough others.
 * @param {string[]} candidateIds - the topic's usable recipe IDs
 * @param {string[]} previousIds - last week's recipeIds of this list
 * @param {function(): number} [random] - injectable for tests
 * @return {string[]}
 */
const pickRecipeIds = (candidateIds, previousIds = [], random = Math.random) => {
  const previous = new Set(previousIds);
  const unique = [...new Set(candidateIds)];
  const fresh = shuffle(unique.filter((id) => !previous.has(id)), random);
  const repeat = shuffle(unique.filter((id) => previous.has(id)), random);
  return [...fresh, ...repeat].slice(0, RECIPES_PER_ROTATION);
};

module.exports = {
  SYSTEM_KEY,
  RECIPES_PER_ROTATION,
  ROTATION_INTERVAL_MS,
  isRotationDue,
  isPubliclyVisible,
  isTopicInPeriod,
  getActiveTopics,
  pickTopic,
  pickRecipeIds,
};

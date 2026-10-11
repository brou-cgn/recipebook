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
 * `displayDays` of a topic sets how long it stays on a list (default 7 days).
 * `recipeRule` additionally selects recipes by ingredientID, meal category,
 * cuisine, creation date and last cook date (see matchesRecipeRule); rule
 * matches are added to the topic's hand-picked recipeIds. The search runs nightly at 03:30
 * (refreshDiscoverTopicRuleMatches in index.js) and stores `ruleRecipeIds` and
 * `ruleMatchedFor` on the topic; the rotation at 04:00 reads them and evaluates
 * rules whose matches are missing or stale itself.
 * `rotatedAt` on the list document is the clock: a list without it (freshly
 * created) is rotated on the next run, otherwise once the topic's display
 * duration has passed. A list without `themeId` is also due, so a list rotated by an
 * older version switches to the topics on the next run.
 *
 * Pure functions only - the scheduled function in index.js does the I/O.
 */

const SYSTEM_KEY = 'fuerDichEntdeckt';
const RECIPES_PER_ROTATION = 5;

// Run is daily; a half-day tolerance keeps "every 7 days" from drifting to 8.
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DISPLAY_DAYS = 7;
const RUN_TOLERANCE_MS = 12 * 60 * 60 * 1000;
const ROTATION_INTERVAL_MS = DEFAULT_DISPLAY_DAYS * DAY_MS - RUN_TOLERANCE_MS;

/** Display duration in whole days (>= 1); anything else falls back to 7. */
const getDisplayDays = (topic) => {
  const days = Number(topic && topic.displayDays);
  return Number.isInteger(days) && days >= 1 ? days : DEFAULT_DISPLAY_DAYS;
};

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
  if (last === null) return true;
  const topic = activeTopics && activeTopics.find((t) => t.id === list.themeId);
  const interval = topic ? getDisplayDays(topic) * DAY_MS - RUN_TOLERANCE_MS : ROTATION_INTERVAL_MS;
  return now - last >= interval;
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

const norm = (value) => String(value || '').trim().toLowerCase();

const toList = (value) => (Array.isArray(value) ? value : value ? [value] : [])
    .map(norm).filter(Boolean);

const cleanFilter = (filter) => ({
  include: toList(filter && filter.include),
  exclude: toList(filter && filter.exclude),
});

const cleanRange = (range) => {
  const num = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ?
    null : Math.max(0, Math.floor(Number(v))));
  return {minDays: num(range && range.minDays), maxDays: num(range && range.maxDays)};
};

/**
 * Normalised copy of a topic's `recipeRule`:
 *   ingredientIds / mealCategories / cuisines: {include: [], exclude: []}
 *     include = recipe has at least one of them, exclude = recipe has none
 *   created / lastCooked: {minDays, maxDays} = age in whole calendar days,
 *     both bounds inclusive, either may be null (open); minDays === maxDays
 *     is "exactly that many days ago". A recipe never cooked has no age and
 *     fails a lastCooked bound.
 *   dateMode: 'all' (default) = both date conditions must hold, 'any' = one
 *     is enough ("cooked or created exactly a year ago").
 */
const normalizeRecipeRule = (rule) => ({
  ingredientIds: cleanFilter(rule && rule.ingredientIds),
  mealCategories: cleanFilter(rule && rule.mealCategories),
  cuisines: cleanFilter(rule && rule.cuisines),
  created: cleanRange(rule && rule.created),
  lastCooked: cleanRange(rule && rule.lastCooked),
  dateMode: rule && rule.dateMode === 'any' ? 'any' : 'all',
});

const filterActive = (f) => f.include.length > 0 || f.exclude.length > 0;
const rangeActive = (r) => r.minDays !== null || r.maxDays !== null;

const hasRecipeRule = (rule) => {
  const r = normalizeRecipeRule(rule);
  return filterActive(r.ingredientIds) || filterActive(r.mealCategories) ||
    filterActive(r.cuisines) || rangeActive(r.created) || rangeActive(r.lastCooked);
};

const recipeIngredientIds = (recipe) => (Array.isArray(recipe.ingredients) ? recipe.ingredients : [])
    .map((item) => (item && typeof item === 'object' ? norm(item.ingredientID || item.ingredientId) : ''))
    .filter(Boolean);

const passesFilter = (filter, values) => {
  const set = new Set(values);
  if (filter.include.length > 0 && !filter.include.some((v) => set.has(v))) return false;
  return !filter.exclude.some((v) => set.has(v));
};

/** Calendar day number (days since epoch) of a moment in the app's time zone. */
const dayNumber = (ms) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return Math.round(Date.UTC(get('year'), get('month') - 1, get('day')) / DAY_MS);
};

const inAgeRange = (range, thenMs, now) => {
  if (thenMs === null) return false;
  const age = dayNumber(now) - dayNumber(thenMs);
  return (range.minDays === null || age >= range.minDays) &&
    (range.maxDays === null || age <= range.maxDays);
};

/**
 * Whether a recipe satisfies a topic's rule. Different criteria combine with
 * AND (date criteria per `dateMode`). An empty rule matches nothing, so a
 * topic without rule only uses its hand-picked recipes.
 * @param {Object} recipe
 * @param {Object} rule - raw `recipeRule`
 * @param {number|null} lastCookedMs - latest cook date of the recipe, if any
 * @param {number} [now]
 */
const matchesRecipeRule = (recipe, rule, lastCookedMs = null, now = Date.now()) => {
  if (!hasRecipeRule(rule)) return false;
  const r = normalizeRecipeRule(rule);
  if (!passesFilter(r.ingredientIds, recipeIngredientIds(recipe))) return false;
  if (!passesFilter(r.mealCategories, toList(recipe.speisekategorie))) return false;
  if (!passesFilter(r.cuisines, toList(recipe.kulinarik))) return false;

  const checks = [];
  if (rangeActive(r.created)) checks.push(inAgeRange(r.created, toMillis(recipe.createdAt), now));
  if (rangeActive(r.lastCooked)) checks.push(inAgeRange(r.lastCooked, lastCookedMs, now));
  if (checks.length === 0) return true;
  return r.dateMode === 'any' ? checks.some(Boolean) : checks.every(Boolean);
};

/** Stable key of a rule; stored next to its matches to detect stale results. */
const ruleKey = (rule) => JSON.stringify(normalizeRecipeRule(rule));

/**
 * Nightly rule search: IDs of all recipes matching the rule (visibility is
 * irrelevant here, see isAssignable / isVisibleToUser).
 * @param {Object} rule - raw `recipeRule`
 * @param {Array<Object>} recipes
 * @param {Map<string, number>} lastCookedByRecipe - recipeId -> latest cook date (ms)
 * @param {number} [now]
 * @return {string[]}
 */
const computeRuleMatches = (rule, recipes, lastCookedByRecipe = new Map(), now = Date.now()) =>
  recipes
      .filter(isAssignable)
      .filter((r) => matchesRecipeRule(r, rule, lastCookedByRecipe.get(r.id) ?? null, now))
      .map((r) => r.id);

/**
 * Topics that may be rotated in right now: enabled, in period, with at least
 * one recipe assigned to them (visibility is NOT checked here - it depends on
 * the user, see isVisibleToUser). Each result carries the usable recipe IDs:
 * the hand-picked ones plus those matching the topic's `recipeRule`.
 */
const getActiveTopics = (topics, recipes, now = Date.now()) => {
  const visible = new Set(recipes.filter(isAssignable).map((r) => r.id));
  return (topics || [])
      .filter((topic) => topic && topic.isActive !== false && isTopicInPeriod(topic, now))
      .map((topic) => {
        const picked = (Array.isArray(topic.recipeIds) ? topic.recipeIds : [])
            .filter((id) => visible.has(id));
        // Rule matches come from the nightly search (computeRuleMatches); they only
        // count while they were computed for the rule as it is now.
        const matched = hasRecipeRule(topic.recipeRule) &&
          topic.ruleMatchedFor === ruleKey(topic.recipeRule) &&
          Array.isArray(topic.ruleRecipeIds) ?
          topic.ruleRecipeIds.filter((id) => visible.has(id)) : [];
        return {...topic, usableRecipeIds: [...new Set([...picked, ...matched])]};
      })
      .filter((topic) => topic.usableRecipeIds.length > 0);
};

/**
 * Why a topic is not part of the rotation (for the log): inactive, no recipe
 * selection, hand-picked/rule recipes not publicly visible, or rule matches
 * missing/stale. Call only for topics that getActiveTopics dropped.
 */
const explainTopicExclusion = (topic, recipes, now = Date.now()) => {
  if (topic.isActive === false) return 'inactive';
  if (!isTopicInPeriod(topic, now)) return `outside period ${topic.periodStart || '?'}..${topic.periodEnd || '?'}`;
  const visible = new Set(recipes.filter(isAssignable).map((r) => r.id));
  const picked = Array.isArray(topic.recipeIds) ? topic.recipeIds : [];
  const ruled = hasRecipeRule(topic.recipeRule);
  if (picked.length === 0 && !ruled) return 'no recipeIds and no recipeRule';
  const parts = [];
  if (picked.length > 0) {
    parts.push(`${picked.filter((id) => visible.has(id)).length}/${picked.length} hand-picked recipes exist`);
  }
  if (ruled) {
    const stored = Array.isArray(topic.ruleRecipeIds) ? topic.ruleRecipeIds : [];
    const current = topic.ruleMatchedFor === ruleKey(topic.recipeRule);
    parts.push(`rule matches: ${current ? stored.filter((id) => visible.has(id)).length : 0}` +
      `${current ? '' : ' (stale)'}`);
  }
  return parts.join(', ');
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
 * Recipes that may be assigned to a topic: everything except pending imports.
 * Public/private/group status is deliberately ignored here.
 */
const isAssignable = (recipe) => Boolean(recipe) && !recipe.isTemp;

/**
 * Whether one user may see a recipe - same rules as the client
 * (subscribeToRecipes in src/utils/recipeFirestore.js): a recipe locked to a
 * group is visible to the group's members and to everybody once it is
 * published or lives in a public group; drafts (`isPrivate`) only to their
 * author and admins.
 * @param {Object} recipe
 * @param {{id: string, isAdmin?: boolean}} user
 * @param {Map<string, {type: string, memberIds: string[]}>} groupsById
 */
const isVisibleToUser = (recipe, user, groupsById = new Map()) => {
  if (!isAssignable(recipe)) return false;
  if (recipe.groupId && !recipe.publishedToPublic && !user.isAdmin) {
    const group = groupsById.get(recipe.groupId);
    const member = Boolean(group) && Array.isArray(group.memberIds) && group.memberIds.includes(user.id);
    const publicGroup = (group && group.type === 'public') || recipe.groupType === 'public';
    if (!member && !publicGroup) return false;
  }
  return !recipe.isPrivate || Boolean(user.isAdmin) || recipe.authorId === user.id;
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
  isAssignable,
  isVisibleToUser,
  isTopicInPeriod,
  getDisplayDays,
  DEFAULT_DISPLAY_DAYS,
  normalizeRecipeRule,
  hasRecipeRule,
  matchesRecipeRule,
  ruleKey,
  computeRuleMatches,
  getActiveTopics,
  explainTopicExclusion,
  pickTopic,
  pickRecipeIds,
};

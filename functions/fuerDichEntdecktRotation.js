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
 * matches are written into the topic's `recipeIds` like hand-picked recipes (see
 * mergeRuleMatches; `autoRecipeIds` marks the ones the rule added). The search runs
 * nightly at 03:30 (refreshDiscoverTopicRuleMatches in index.js, stores
 * `ruleMatchedFor`); the rotation at 04:00 re-runs it for rules changed since.
 * `rotatedAt` on the list document is the clock: a list without it (freshly
 * created) is rotated on the next run, otherwise once the topic's display
 * duration has passed. A list without `themeId` is also due, so a list rotated by an
 * older version switches to the topics on the next run.
 *
 * Recipes with a still valid recipeSwipeFlags 'kandidat' of the list (flag
 * 'kandidat', expiresAt in the future or empty) are not removed by the rotation
 * (getProtectedRecipeIds / pickRotationRecipeIds); they take slots of the 5.
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

// NFC: "ü" typed on macOS/iOS or imported can be a decomposed u + U+0308,
// which would not equal the composed character from the settings lists.
const norm = (value) => String(value || '').normalize('NFC').trim().toLowerCase();

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
 *   dateScope: 'all' (default) = the date conditions look at anybody's
 *     actions; 'own' = every user is judged by their own: "created" needs
 *     recipe.authorId === user, "lastCooked" uses that user's cook dates. All
 *     recipes stay in the topic, but only the users who qualify get them
 *     handed out (see recipeAvailableToUser).
 */
const normalizeRecipeRule = (rule) => ({
  ingredientIds: cleanFilter(rule && rule.ingredientIds),
  mealCategories: cleanFilter(rule && rule.mealCategories),
  cuisines: cleanFilter(rule && rule.cuisines),
  created: cleanRange(rule && rule.created),
  lastCooked: cleanRange(rule && rule.lastCooked),
  dateMode: rule && rule.dateMode === 'any' ? 'any' : 'all',
  dateScope: rule && rule.dateScope === 'own' ? 'own' : 'all',
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

/** Ingredient / category / cuisine criteria - independent of any user. */
const matchesContentFilters = (recipe, r) =>
  passesFilter(r.ingredientIds, recipeIngredientIds(recipe)) &&
  passesFilter(r.mealCategories, toList(recipe.speisekategorie)) &&
  passesFilter(r.cuisines, toList(recipe.kulinarik));

/**
 * Date criteria for one recipe. `createdOk` lets the caller veto the "created"
 * condition (scope 'own': the user must be the author).
 */
const matchesDateCriteria = (recipe, r, lastCookedMs, now, createdOk = true) => {
  const checks = [];
  if (rangeActive(r.created)) {
    checks.push(createdOk && inAgeRange(r.created, toMillis(recipe.createdAt), now));
  }
  if (rangeActive(r.lastCooked)) checks.push(inAgeRange(r.lastCooked, lastCookedMs, now));
  if (checks.length === 0) return true;
  return r.dateMode === 'any' ? checks.some(Boolean) : checks.every(Boolean);
};

/** Whether the rule's date conditions are judged per user (needs a date range to matter). */
const isOwnScoped = (rule) => {
  const r = normalizeRecipeRule(rule);
  return r.dateScope === 'own' && (rangeActive(r.created) || rangeActive(r.lastCooked));
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
  return matchesContentFilters(recipe, r) && matchesDateCriteria(recipe, r, lastCookedMs, now);
};

/**
 * Scope 'own': the users for whom a recipe satisfies the rule - the author
 * counts for "created", each cook-date owner for "lastCooked".
 * @param {Object} recipe
 * @param {Object} rule - raw `recipeRule`
 * @param {Map<string, number>} lastCookedByUser - userId -> latest cook date (ms) of this recipe
 * @param {number} [now]
 * @return {string[]}
 */
const ruleOwnersOfRecipe = (recipe, rule, lastCookedByUser = new Map(), now = Date.now()) => {
  const r = normalizeRecipeRule(rule);
  if (!hasRecipeRule(rule) || !matchesContentFilters(recipe, r)) return [];
  const candidates = new Set(lastCookedByUser.keys());
  if (recipe.authorId) candidates.add(recipe.authorId);
  return [...candidates].filter((userId) => matchesDateCriteria(
      recipe, r, lastCookedByUser.get(userId) ?? null, now, recipe.authorId === userId));
};

/**
 * Writes the rule matches into the topic's `recipeIds`, like hand-picked
 * recipes. `autoRecipeIds` remembers which entries the rule added (and did not
 * already exist as hand-picked), so a later run can drop those that no longer
 * match without touching the hand-picked ones. An empty `matches` list (rule
 * removed) removes all earlier automatic entries.
 * @param {Object} topic
 * @param {string[]} matches - recipe IDs matching the rule now
 * @return {{recipeIds: string[], autoRecipeIds: string[]}}
 */
const mergeRuleMatches = (topic, matches) => {
  const previousAuto = new Set(Array.isArray(topic.autoRecipeIds) ? topic.autoRecipeIds : []);
  const manual = (Array.isArray(topic.recipeIds) ? topic.recipeIds : [])
      .filter((id) => !previousAuto.has(id));
  const manualSet = new Set(manual);
  const added = [...new Set(matches)].filter((id) => !manualSet.has(id));
  return {recipeIds: [...manual, ...added], autoRecipeIds: added};
};

/** Stable key of a rule; stored next to its matches to detect stale results. */
const ruleKey = (rule) => JSON.stringify(normalizeRecipeRule(rule));

/**
 * Nightly rule search: IDs of all recipes matching the rule (visibility is
 * irrelevant here, see isAssignable / isVisibleToUser). With scope 'own' a
 * recipe matches when at least one user qualifies; computeRuleResult also
 * returns those users per recipe (`owners`, see ruleOwnersOfRecipe).
 * @param {Object} rule - raw `recipeRule`
 * @param {Array<Object>} recipes
 * @param {Map<string, number>} lastCookedByRecipe - recipeId -> latest cook date (ms)
 * @param {number} [now]
 * @param {Map<string, Map<string, number>>} [lastCookedByUser] - recipeId -> userId -> latest cook date (ms)
 * @return {string[]}
 */
const computeRuleMatches = (rule, recipes, lastCookedByRecipe = new Map(), now = Date.now(),
    lastCookedByUser = new Map()) =>
  computeRuleResult(rule, recipes, lastCookedByRecipe, now, lastCookedByUser).matches;

const computeRuleResult = (rule, recipes, lastCookedByRecipe = new Map(), now = Date.now(),
    lastCookedByUser = new Map()) => {
  const assignable = recipes.filter(isAssignable);
  if (!isOwnScoped(rule)) {
    return {
      matches: assignable
          .filter((r) => matchesRecipeRule(r, rule, lastCookedByRecipe.get(r.id) ?? null, now))
          .map((r) => r.id),
      owners: {},
    };
  }
  const owners = {};
  assignable.forEach((r) => {
    const users = ruleOwnersOfRecipe(r, rule, lastCookedByUser.get(r.id) || new Map(), now);
    if (users.length > 0) owners[r.id] = users.sort();
  });
  return {matches: Object.keys(owners), owners};
};

/**
 * Whether a topic's recipe may be handed to this user. Hand-picked recipes (and
 * every recipe of a rule with scope 'all') are for everybody; a recipe the rule
 * added under scope 'own' only goes to the users in `autoRecipeOwners`.
 * @param {Object} topic
 * @param {string} recipeId
 * @param {string} userId
 */
const recipeAvailableToUser = (topic, recipeId, userId) => {
  if (!isOwnScoped(topic.recipeRule)) return true;
  const auto = Array.isArray(topic.autoRecipeIds) ? topic.autoRecipeIds : [];
  if (!auto.includes(recipeId)) return true;
  const owners = topic.autoRecipeOwners && topic.autoRecipeOwners[recipeId];
  return Array.isArray(owners) && owners.includes(userId);
};

/**
 * Topics that may be rotated in right now: enabled, in period, with at least
 * one recipe assigned to them (visibility is NOT checked here - it depends on
 * the user, see isVisibleToUser). Each result carries the usable recipe IDs:
 * the topic's `recipeIds` (hand-picked plus those the rule added).
 */
const getActiveTopics = (topics, recipes, now = Date.now()) => {
  const visible = new Set(recipes.filter(isAssignable).map((r) => r.id));
  return (topics || [])
      .filter((topic) => topic && topic.isActive !== false && isTopicInPeriod(topic, now))
      .map((topic) => {
        // Rule matches are already part of recipeIds (see mergeRuleMatches).
        const picked = (Array.isArray(topic.recipeIds) ? topic.recipeIds : [])
            .filter((id) => visible.has(id));
        return {...topic, usableRecipeIds: [...new Set(picked)]};
      })
      .filter((topic) => topic.usableRecipeIds.length > 0);
};

/**
 * Why a topic is not part of the rotation (for the log): inactive, outside its
 * period, no recipes, or recipes that do not exist / are pending imports. Call only for topics that getActiveTopics dropped.
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
  if (ruled) parts.push('rule set, but no matching recipe');
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

/**
 * Recipe IDs a rotation must not remove from a list: those with a
 * recipeSwipeFlags document of this list that has flag 'kandidat' and whose
 * validity (expiresAt) has not run out. No expiresAt = never expires, so the
 * recipe stays until the document is deleted or its flag changes.
 * @param {Array<Object>} flagDocs - recipeSwipeFlags data of ONE list
 * @param {number} [now]
 * @return {string[]}
 */
const getProtectedRecipeIds = (flagDocs, now = Date.now()) => {
  const ids = new Set();
  (flagDocs || []).forEach((data) => {
    if (!data || data.flag !== 'kandidat' || !data.recipeID) return;
    const expiresAt = toMillis(data.expiresAt);
    if (expiresAt !== null && expiresAt <= now) return;
    ids.add(data.recipeID);
  });
  return [...ids];
};

/**
 * Recipe IDs of a rotation: protected recipes stay (even beyond the usual
 * RECIPES_PER_ROTATION), the remaining slots are filled with new picks.
 * @param {string[]} candidateIds - the topic's usable recipe IDs
 * @param {string[]} previousIds - the list's current recipeIds
 * @param {string[]} protectedIds - from getProtectedRecipeIds
 * @param {function(): number} [random]
 * @return {string[]}
 */
const pickRotationRecipeIds = (candidateIds, previousIds = [], protectedIds = [], random = Math.random) => {
  const previous = new Set(previousIds);
  const kept = [...new Set(protectedIds)].filter((id) => previous.has(id));
  const slots = Math.max(0, RECIPES_PER_ROTATION - kept.length);
  const keptSet = new Set(kept);
  const picked = pickRecipeIds(candidateIds.filter((id) => !keptSet.has(id)), previousIds, random)
      .slice(0, slots);
  return [...kept, ...picked];
};

module.exports = {
  SYSTEM_KEY,
  getProtectedRecipeIds,
  pickRotationRecipeIds,
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
  computeRuleResult,
  isOwnScoped,
  ruleOwnersOfRecipe,
  recipeAvailableToUser,
  mergeRuleMatches,
  getActiveTopics,
  explainTopicExclusion,
  pickTopic,
  pickRecipeIds,
};

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  matchesRecipeRule, computeRuleMatches, ruleKey,
  isRotationDue, isTopicInPeriod, getActiveTopics, pickTopic, pickRecipeIds,
  ROTATION_INTERVAL_MS,
} = require('./fuerDichEntdecktRotation');

const DAY = 24 * 60 * 60 * 1000;
const list = (rotatedAt, extra = {}) => ({
  systemKey: 'fuerDichEntdeckt', themeId: 't1', rotatedAt, ...extra,
});
// Noon UTC keeps the Berlin date identical to the UTC date.
const on = (iso) => Date.parse(`${iso}T12:00:00Z`);

test('rotation is due for a new list and after a week, not before', () => {
  const now = 100 * DAY;
  assert.equal(isRotationDue(list(undefined), now), true);
  assert.equal(isRotationDue(list(now - 6 * DAY), now), false);
  assert.equal(isRotationDue(list(now - ROTATION_INTERVAL_MS), now), true);
  assert.equal(isRotationDue({name: 'Andere Liste'}, now), false);
});

test('a list without themeId is due even if rotated recently', () => {
  const now = 100 * DAY;
  const old = {systemKey: 'fuerDichEntdeckt', themeLabel: 'Saison', rotatedAt: now - DAY};
  assert.equal(isRotationDue(old, now), true);
  assert.equal(isRotationDue({...old, themeId: 't1'}, now), false);
});

test('a list whose topic is no longer active is due early', () => {
  const now = 100 * DAY;
  const fresh = list(now - DAY);
  assert.equal(isRotationDue(fresh, now, [{id: 't1'}]), false);
  assert.equal(isRotationDue(fresh, now, [{id: 't2'}]), true);
});

test('rotatedAt may be a Firestore Timestamp', () => {
  const now = 100 * DAY;
  assert.equal(isRotationDue(list({toMillis: () => now - 8 * DAY}), now), true);
});

test('period: inside, outside, bounds inclusive', () => {
  const topic = {periodStart: '09-15', periodEnd: '11-30'};
  assert.equal(isTopicInPeriod(topic, on('2026-10-11')), true);
  assert.equal(isTopicInPeriod(topic, on('2026-09-15')), true);
  assert.equal(isTopicInPeriod(topic, on('2026-11-30')), true);
  assert.equal(isTopicInPeriod(topic, on('2026-09-14')), false);
  assert.equal(isTopicInPeriod(topic, on('2026-12-01')), false);
});

test('period may wrap over New Year', () => {
  const topic = {periodStart: '12-15', periodEnd: '01-06'};
  assert.equal(isTopicInPeriod(topic, on('2026-12-24')), true);
  assert.equal(isTopicInPeriod(topic, on('2027-01-03')), true);
  assert.equal(isTopicInPeriod(topic, on('2026-07-01')), false);
});

test('no period means all year, a half-set or malformed one never matches', () => {
  assert.equal(isTopicInPeriod({}, on('2026-07-01')), true);
  assert.equal(isTopicInPeriod({periodStart: '', periodEnd: ''}, on('2026-07-01')), true);
  assert.equal(isTopicInPeriod({periodStart: '07-01'}, on('2026-07-02')), false);
  assert.equal(isTopicInPeriod({periodStart: '13-01', periodEnd: '14-01'}, on('2026-07-02')), false);
});

test('the period uses the Berlin date, not UTC', () => {
  // 2026-12-31 23:30 UTC is already 1 January in Berlin.
  const now = Date.parse('2026-12-31T23:30:00Z');
  assert.equal(isTopicInPeriod({periodStart: '01-01', periodEnd: '01-01'}, now), true);
});

const recipes = [
  {id: 'a', title: 'Kürbissuppe'},
  {id: 'b', title: 'Kürbisrisotto'},
  {id: 'priv', title: 'Privat', isPrivate: true},
  {id: 'grp', title: 'Gruppe', groupId: 'g1'},
];

test('active topics: enabled with usable recipes, regardless of period', () => {
  const now = on('2026-10-11');
  const topics = [
    {id: 'ok', recipeIds: ['a', 'priv', 'gone'], periodStart: '09-01', periodEnd: '11-30'},
    {id: 'allYear', recipeIds: ['b']},
    {id: 'summer', recipeIds: ['a'], periodStart: '06-01', periodEnd: '08-31'},
    {id: 'off', recipeIds: ['a'], isActive: false},
    {id: 'onlyPrivate', recipeIds: ['priv', 'grp']},
    {id: 'empty', recipeIds: []},
    {id: 'missing'},
  ];
  const active = getActiveTopics(topics, recipes, now);
  assert.deepEqual(active.map((t) => t.id), ['ok', 'allYear', 'summer']);
  assert.deepEqual(active[0].usableRecipeIds, ['a']);
});

test('pickTopic avoids the previous topic when there is a choice', () => {
  const active = [{id: 'x'}, {id: 'y'}];
  for (const r of [0, 0.4, 0.99]) {
    assert.equal(pickTopic(active, 'x', () => r).id, 'y');
  }
  assert.equal(pickTopic([{id: 'x'}], 'x').id, 'x');
  assert.equal(pickTopic([], null), null);
});

const ids = Array.from({length: 7}, (_, i) => `t${i}`);

test('picks at most 5 recipes', () => {
  const picked = pickRecipeIds(ids, [], () => 0.5);
  assert.equal(picked.length, 5);
  assert.equal(new Set(picked).size, 5);
});

test('prefers recipes the list did not hold last week', () => {
  const picked = pickRecipeIds(ids, ['t0', 't1', 't2'], () => 0.5);
  assert.equal(picked.slice(0, 4).some((id) => ['t0', 't1', 't2'].includes(id)), false);
});

test('reuses last week\'s recipes when too few new ones exist', () => {
  const picked = pickRecipeIds(ids.slice(0, 5), ['t0', 't1'], () => 0.5);
  assert.equal(picked.length, 5);
});

test('fewer than 5 candidates gives all of them, duplicates removed', () => {
  assert.deepEqual(pickRecipeIds(['a', 'a', 'b'], [], () => 0.5).sort(), ['a', 'b']);
});

// ---- displayDays ----
test('displayDays of the list\'s topic sets the rotation interval', () => {
  const now = 100 * DAY;
  const l = list(now - 2 * DAY);
  assert.equal(isRotationDue(l, now, [{id: 't1', displayDays: 3}]), false);
  assert.equal(isRotationDue(l, now, [{id: 't1', displayDays: 2}]), true);
  assert.equal(isRotationDue(l, now, [{id: 't1', displayDays: 1}]), true);
  assert.equal(isRotationDue(list(now - 6 * DAY), now, [{id: 't1'}]), false);
  assert.equal(isRotationDue(list(now - 7 * DAY), now, [{id: 't1', displayDays: 'x'}]), true);
});

// ---- recipeRule ----
const NOW = on('2026-10-11');
const recipe = (extra = {}) => ({
  id: 'r', ingredients: [{ingredientID: 'Spargel', text: 'Spargel'}, 'Salz'],
  speisekategorie: ['Salate'], kulinarik: 'Weihnachtliche Küche',
  createdAt: {toMillis: () => on('2025-10-11')}, ...extra,
});

test('rule: ingredient include/exclude, case-insensitive', () => {
  assert.equal(matchesRecipeRule(recipe(), {ingredientIds: {include: ['spargel']}}, null, NOW), true);
  assert.equal(matchesRecipeRule(recipe(), {ingredientIds: {include: ['Tomate']}}, null, NOW), false);
  assert.equal(matchesRecipeRule(recipe(), {ingredientIds: {exclude: ['Spargel']}}, null, NOW), false);
  assert.equal(matchesRecipeRule(recipe(), {ingredientIds: {exclude: ['Tomate']}}, null, NOW), true);
});

test('rule: criteria combine with AND', () => {
  const rule = {ingredientIds: {include: ['Spargel']}, mealCategories: {include: ['Salate']}};
  assert.equal(matchesRecipeRule(recipe(), rule, null, NOW), true);
  assert.equal(matchesRecipeRule(recipe({speisekategorie: ['Desserts']}), rule, null, NOW), false);
  const dessert = {mealCategories: {include: ['Desserts']}, cuisines: {include: ['Weihnachtliche Küche']}};
  assert.equal(matchesRecipeRule(recipe({speisekategorie: 'Desserts'}), dessert, null, NOW), true);
  assert.equal(matchesRecipeRule(recipe(), dessert, null, NOW), false);
});

test('rule: not cooked for more than 180 and less than 400 days', () => {
  const rule = {lastCooked: {minDays: 181, maxDays: 399}};
  assert.equal(matchesRecipeRule(recipe(), rule, NOW - 200 * DAY, NOW), true);
  assert.equal(matchesRecipeRule(recipe(), rule, NOW - 100 * DAY, NOW), false);
  assert.equal(matchesRecipeRule(recipe(), rule, NOW - 500 * DAY, NOW), false);
  assert.equal(matchesRecipeRule(recipe(), rule, null, NOW), false);
});

test('rule: exactly a year ago, cooked or created', () => {
  const rule = {created: {minDays: 365, maxDays: 365}, lastCooked: {minDays: 365, maxDays: 365}, dateMode: 'any'};
  assert.equal(matchesRecipeRule(recipe(), rule, null, NOW), true); // created 2025-10-11
  assert.equal(matchesRecipeRule(recipe({createdAt: null}), rule, on('2025-10-11'), NOW), true);
  assert.equal(matchesRecipeRule(recipe({createdAt: null}), rule, on('2025-10-12'), NOW), false);
  assert.equal(matchesRecipeRule(recipe(), {...rule, dateMode: 'all'}, null, NOW), false);
});

test('an empty rule matches nothing', () => {
  assert.equal(matchesRecipeRule(recipe(), {}, null, NOW), false);
  assert.equal(matchesRecipeRule(recipe(), undefined, null, NOW), false);
});

test('computeRuleMatches only returns publicly visible recipes', () => {
  const recipes = [recipe({id: 'a'}), recipe({id: 'b', isPrivate: true})];
  assert.deepEqual(computeRuleMatches({ingredientIds: {include: ['Spargel']}}, recipes, new Map(), NOW), ['a']);
});

test('getActiveTopics merges stored rule matches, but only for the current rule', () => {
  const rule = {ingredientIds: {include: ['Spargel']}};
  const recipes = [{id: 'a'}, {id: 'b'}, {id: 'c', isPrivate: true}];
  const topic = {id: 't', recipeIds: ['a'], recipeRule: rule, ruleRecipeIds: ['b', 'c'], ruleMatchedFor: ruleKey(rule)};
  assert.deepEqual(getActiveTopics([topic], recipes, NOW)[0].usableRecipeIds, ['a', 'b']);
  const stale = {...topic, recipeRule: {ingredientIds: {include: ['Tomate']}}};
  assert.deepEqual(getActiveTopics([stale], recipes, NOW)[0].usableRecipeIds, ['a']);
  const removed = {...topic, recipeRule: undefined};
  assert.deepEqual(getActiveTopics([removed], recipes, NOW)[0].usableRecipeIds, ['a']);
});

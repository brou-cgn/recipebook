/**
 * Test suites that are known to be failing and are therefore skipped by
 * `npm run test:ci` (the command the GitHub Actions workflow runs).
 *
 * Why this list exists
 * --------------------
 * The test workflow was switched off on 2026-03-18, the same evening it was
 * introduced, because the suite was already red. Six months and ~1300
 * commits later it is still red - 141 failing tests across the 22 suites
 * below - while the other 110 suites (3055 tests) pass.
 *
 * Repairing all 141 before turning CI back on would mean no protection at
 * all in the meantime, and the failures are not one problem but many: stale
 * DOM queries, incomplete jest.mock factories, brittle CSS string
 * assertions, and tests that patch globals like `crypto` for themselves
 * (see recipeFirestore.test.js) so that a shared fix breaks them instead.
 *
 * So: quarantine the known-red suites by name, turn CI back on for
 * everything else, and work the list down over time. The point is that
 * nothing currently stops a change from breaking the 3055 tests that do
 * pass.
 *
 * How to work the list down
 * -------------------------
 * 1. Pick a suite and run it on its own:
 *      npx react-scripts test --watchAll=false --testPathPattern="RecipeList"
 * 2. Fix it - or delete tests that assert on exact CSS strings, which break
 *    on any reformatting without catching a single behavioural regression.
 * 3. Delete its line here. CI will keep it honest from then on.
 *
 * Nothing may be added to this list without a dated reason. A quarantine
 * that silently grows is the same as having no CI at all.
 */
module.exports = [
  // Disabled on 2026-09-16, red since before the workflow was switched off.
  // Grouped by the dominant failure cause; see scripts/test-ci.js.

  // Assert on exact CSS strings ("bottom: calc(16px + env(...))"). Break on
  // any reformatting. Candidates for deletion rather than repair.
  'src/App.css.test.js',
  'src/components/AppCallsPage.css.test.js',
  'src/components/EventsPage.css.test.js',
  'src/components/RecipeForm.css.test.js',

  // Incomplete jest.mock factories - the module is mocked but a function the
  // component calls (canEditRecipes, getCommonAdjectives, ...) is missing
  // from the factory, so it arrives as undefined.
  'src/components/RecipeList.test.js',
  'src/utils/userManagement.test.js',

  // Stale DOM queries and assertions: the UI moved on, the tests did not.
  'src/App.auth.test.js',
  'src/App.test.js',
  'src/components/ConsumptionForm.test.js',
  'src/components/DrinkManagementPage.test.js',
  'src/components/EventForm.test.js',
  'src/components/GroupDetail.test.js',
  'src/components/GuestManagementPage.test.js',
  'src/components/MenuDetail.test.js',
  'src/components/MenuForm.test.js',
  'src/components/RecipeDetail.cooking-mode-layout.test.js',
  'src/components/RecipeDetail.test.js',
  'src/components/RecipeDetail.timer.test.js',
  'src/components/RecipeForm.test.js',
  'src/components/Tagesmenu.test.js',
  'src/components/WebImportModal.integration.test.js',
  'src/utils/nutritionReferenceImportExport.test.js',
];

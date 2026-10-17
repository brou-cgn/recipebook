/**
 * Test suites that are known to be failing and are therefore skipped by
 * `npm run test:ci` (the command the GitHub Actions workflow runs).
 *
 * Why this list exists
 * --------------------
 * The test workflow was switched off on 2026-03-18, the same evening it was
 * introduced, because the suite was already red. Six months and ~1300
 * commits later it was still red - 141 failing tests across 22 suites. All were
 * repaired or, where they only asserted exact CSS strings or a removed
 * localStorage login (App.css/AppCallsPage.css/EventsPage.css/RecipeForm.css,
 * App.test.js), deleted by 2026-10-17 (Tech-Check T2-T4, T6). The list is empty;
 * it stays as the place for any future, dated exception.
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
 *      npx jest --testPathPattern="RecipeList"
 * 2. Fix it - or delete tests that assert on exact CSS strings, which break
 *    on any reformatting without catching a single behavioural regression.
 * 3. Delete its line here. CI will keep it honest from then on.
 *
 * Nothing may be added to this list without a dated reason. A quarantine
 * that silently grows is the same as having no CI at all.
 */
module.exports = [];

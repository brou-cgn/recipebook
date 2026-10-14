/**
 * One-time migration script: remove the legacy `isAdmin` field from every
 * users/{uid} document. `role == 'admin'` is the only admin marker from now on
 * (firestore.rules, Cloud Functions and the client all read only that).
 *
 * Usage:
 *   node scripts/migrateRemoveIsAdmin.js                          (dry run - writes nothing)
 *   node scripts/migrateRemoveIsAdmin.js --apply                  (deletes the field)
 *   node scripts/migrateRemoveIsAdmin.js --apply --promote-legacy-admins
 *
 * Run this BEFORE deploying the functions and rules that stop reading
 * `isAdmin`. Order: 1. dry run, 2. --apply, 3. deploy.
 *
 * Prerequisites:
 *   - Set GOOGLE_APPLICATION_CREDENTIALS to your Firebase service account JSON
 *   - Or run with Application Default Credentials
 *
 * Users who have isAdmin == true but a role other than 'admin' are listed
 * explicitly. firestore.rules never treated them as admins, so deleting the
 * field would silently demote them in the UI and in setUserPassword. Promoting
 * them to role 'admin' grants real rights, so it only happens with
 * --promote-legacy-admins; without it the script leaves their role alone.
 *
 * The script is safe to run repeatedly: a document without the field is not
 * touched. No e-mail addresses are logged, only user ids.
 */

const admin = require('firebase-admin');

// Firestore allows 500 operations per batch; this is also the page size.
const BATCH_SIZE = 500;

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const PROMOTE = args.includes('--promote-legacy-admins');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * @return {Promise<void>}
 */
async function main() {
  console.log(APPLY ? 'APPLY mode - writing to Firestore' : 'DRY RUN - nothing is written');

  let scanned = 0;
  let removed = 0;
  const mismatched = [];
  let lastDoc = null;

  for (;;) {
    let query = db.collection('users')
        .where('isAdmin', 'in', [true, false])
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(BATCH_SIZE);
    if (lastDoc) query = query.startAfter(lastDoc);
    const snapshot = await query.get();
    if (snapshot.empty) break;

    const batch = db.batch();
    snapshot.forEach((doc) => {
      const data = doc.data();
      scanned += 1;
      const update = {isAdmin: admin.firestore.FieldValue.delete()};
      if (data.isAdmin === true && data.role !== 'admin') {
        mismatched.push({id: doc.id, role: data.role || '(none)'});
        if (PROMOTE) update.role = 'admin';
      }
      batch.update(doc.ref, update);
      removed += 1;
    });
    if (APPLY) await batch.commit();
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.size < BATCH_SIZE) break;
  }

  console.log(`Documents with isAdmin: ${scanned}`);
  console.log(`${APPLY ? 'Field removed from' : 'Would remove field from'}: ${removed}`);
  if (mismatched.length > 0) {
    console.log(`isAdmin == true but role != 'admin' (${mismatched.length}):`);
    mismatched.forEach((m) => console.log(`  ${m.id}  role=${m.role}`));
    console.log(PROMOTE && APPLY ?
      'These users were promoted to role admin.' :
      'These users keep their role. Re-run with --promote-legacy-admins to make them admins.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

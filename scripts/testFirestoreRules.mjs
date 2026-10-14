// Prüft die Lesezugriffe auf /recipes in firestore.rules gegen den Firestore-Emulator.
// Lauf: firebase emulators:exec --only firestore "node scripts/testFirestoreRules.mjs"
// (braucht Java und @firebase/rules-unit-testing; läuft bewusst nicht in npm run test:ci)
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, query, where, setDoc } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'rules-test',
  firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
});

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'users/member'), { role: 'read', email: 'm@example.com' });
  await setDoc(doc(db, 'recipes/private1'), { title: 'Privat', isPrivate: true, shareId: 'abc' });
  await setDoc(doc(db, 'recipes/shared1'), { title: 'Geteilt', shareId: 'def' });
});

const anon = env.authenticatedContext('guest1', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const member = env.authenticatedContext('member', { firebase: { sign_in_provider: 'password' } }).firestore();
const out = env.unauthenticatedContext().firestore();

const cases = [
  ['Gast liest privates Rezept', () => assertFails(getDoc(doc(anon, 'recipes/private1')))],
  ['Gast listet Rezepte', () => assertFails(getDocs(collection(anon, 'recipes')))],
  ['Gast listet per shareId-Bereich', () => assertFails(getDocs(query(collection(anon, 'recipes'), where('shareId', '>=', ''))))],
  ['Abgemeldet liest geteiltes Rezept', () => assertFails(getDoc(doc(out, 'recipes/shared1')))],
  ['Abgemeldet listet per shareId-Bereich', () => assertFails(getDocs(query(collection(out, 'recipes'), where('shareId', '>=', ''))))],
  ['Gast liest Nutzerprofile', () => assertFails(getDocs(collection(anon, 'users')))],
  ['Mitglied liest Rezept', () => assertSucceeds(getDoc(doc(member, 'recipes/shared1')))],
  ['Mitglied listet Rezepte', () => assertSucceeds(getDocs(collection(member, 'recipes')))],
];

let failed = 0;
for (const [name, run] of cases) {
  try { await run(); console.log('OK   ', name); } catch (e) { failed++; console.log('FEHLER', name, '-', e.message.split('\n')[0]); }
}
await env.cleanup();
process.exit(failed ? 1 : 0);

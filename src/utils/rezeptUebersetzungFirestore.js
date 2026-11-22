/**
 * Lesen der Inhaltsübersetzung eines Rezepts (Vorhaben Mehrsprachigkeit, PR 4). Geschrieben wird
 * rezeptUebersetzungen nur von der Cloud Function (firestore.rules).
 */
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * @param {string} recipeId
 * @returns {Promise<Object|null>} Daten der Übersetzung oder null, wenn es keine gibt
 */
export async function ladeRezeptUebersetzung(recipeId) {
  if (!recipeId) return null;
  const snap = await getDoc(doc(db, 'rezeptUebersetzungen', recipeId));
  return snap.exists() ? snap.data() : null;
}

import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';

/**
 * Saves a resolved shopping list to Firestore and returns a new shareId.
 * @param {string} title - Title of the shopping list (menu or recipe name)
 * @param {string[]} items - Array of ingredient strings (already resolved)
 * @returns {Promise<string>} The generated shareId
 */
export const createSharedShoppingList = async (title, items) => {
  const shareId = crypto.randomUUID();
  const createdAt = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(createdAt.toMillis() + 24 * 60 * 60 * 1000);

  await addDoc(collection(db, 'shoppingLists'), {
    shareId,
    title,
    items,
    createdAt: serverTimestamp(),
    expiresAt,
  });

  return shareId;
};

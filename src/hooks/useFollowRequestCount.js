import { useEffect, useState } from 'react';
import { subscribeOpenFollowRequests } from '../utils/followFirestore';

/**
 * Anzahl offener Follow-Anfragen für das Badge am Tab "Chefkoch". Ohne Flag
 * `follow` wird nichts abonniert.
 * @param {string|undefined} uid
 * @param {boolean} enabled
 * @return {number}
 */
export default function useFollowRequestCount(uid, enabled) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!uid || !enabled) {
      setCount(0);
      return undefined;
    }
    return subscribeOpenFollowRequests(uid, (ids) => setCount(ids.length), () => setCount(0));
  }, [uid, enabled]);
  return count;
}

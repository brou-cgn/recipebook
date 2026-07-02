import { useState, useCallback } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

function useAtelierOnboarding(currentUser) {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [loading, setLoading] = useState(false);

  /**
   * Fires on every Atelier-tab click.
   * The check is asynchronous: navigation happens immediately, and if the
   * onboarding has not been completed yet the overlay is shown on top.
   * Returns a Promise that resolves to true when onboarding is shown,
   * or false when it is already done / not needed.
   */
  const triggerOnboarding = useCallback(async () => {
    if (!currentUser?.id) return false;
    setLoading(true);
    try {
      const userRef = doc(db, 'users', currentUser.id);
      const snap = await getDoc(userRef);
      if (snap.exists() && snap.data().atelierOnboardingCompleted === true) {
        setLoading(false);
        return false;
      }
      setShowOnboarding(true);
      setLoading(false);
      return true;
    } catch (err) {
      console.error('useAtelierOnboarding: Firestore check failed', err);
      setLoading(false);
      return false;
    }
  }, [currentUser]);

  const completeOnboarding = useCallback(async () => {
    setShowOnboarding(false);
    if (!currentUser?.id) return;
    try {
      const userRef = doc(db, 'users', currentUser.id);
      await updateDoc(userRef, { atelierOnboardingCompleted: true });
    } catch (err) {
      console.error('useAtelierOnboarding: Firestore update failed', err);
    }
  }, [currentUser]);

  return { showOnboarding, loading, triggerOnboarding, completeOnboarding };
}

export default useAtelierOnboarding;

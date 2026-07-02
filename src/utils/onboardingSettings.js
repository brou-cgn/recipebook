import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const ONBOARDING_SETTINGS_REF = ['appSettings', 'onboarding'];

export function shouldShowOnboardingOverlay(currentUser, onboardingTestmodeActive) {
  return Boolean(onboardingTestmodeActive && currentUser?.onboardingTestmode);
}

export async function getOnboardingTestmodeActive() {
  try {
    const snapshot = await getDoc(doc(db, ...ONBOARDING_SETTINGS_REF));
    return snapshot.exists() ? snapshot.data()?.testmodeActive === true : false;
  } catch (error) {
    console.error('Error getting onboarding settings:', error);
    return false;
  }
}

export async function saveOnboardingTestmodeActive(value) {
  await setDoc(
    doc(db, ...ONBOARDING_SETTINGS_REF),
    { testmodeActive: Boolean(value) },
    { merge: true }
  );
}

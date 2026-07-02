jest.mock('../firebase', () => ({
  db: {},
}));

const mockDoc = jest.fn();
const mockGetDoc = jest.fn();
const mockSetDoc = jest.fn();

jest.mock('firebase/firestore', () => ({
  doc: (...args) => mockDoc(...args),
  getDoc: (...args) => mockGetDoc(...args),
  setDoc: (...args) => mockSetDoc(...args),
}));

import {
  getOnboardingTestmodeActive,
  saveOnboardingTestmodeActive,
  shouldShowOnboardingOverlay,
} from './onboardingSettings';

describe('onboardingSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDoc.mockReturnValue({ path: 'appSettings/onboarding' });
  });

  test('returns false when no onboarding settings document exists', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => false,
    });

    await expect(getOnboardingTestmodeActive()).resolves.toBe(false);
  });

  test('returns stored onboarding testmode flag', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ testmodeActive: true }),
    });

    await expect(getOnboardingTestmodeActive()).resolves.toBe(true);
  });

  test('persists onboarding testmode flag with merge', async () => {
    await saveOnboardingTestmodeActive(true);

    expect(mockSetDoc).toHaveBeenCalledWith(
      { path: 'appSettings/onboarding' },
      { testmodeActive: true },
      { merge: true }
    );
  });

  test('only shows onboarding when global mode and user permission are enabled', () => {
    expect(shouldShowOnboardingOverlay({ onboardingTestmode: true }, true)).toBe(true);
    expect(shouldShowOnboardingOverlay({ onboardingTestmode: false }, true)).toBe(false);
    expect(shouldShowOnboardingOverlay({ onboardingTestmode: true }, false)).toBe(false);
    expect(shouldShowOnboardingOverlay({ onboardingTestmode: false }, false)).toBe(false);
  });
});

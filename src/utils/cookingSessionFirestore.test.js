const mockSetDoc = jest.fn(() => Promise.resolve());
const mockOnSnapshot = jest.fn();

jest.mock('../firebase', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({
  doc: (_db, col, id) => `${col}/${id}`,
  setDoc: (...args) => mockSetDoc(...args),
  onSnapshot: (...args) => mockOnSnapshot(...args),
  serverTimestamp: () => 'SERVER_TS',
}));

import { getCookingDeviceId, saveCookingSession, subscribeCookingSession } from './cookingSessionFirestore';

describe('cookingSessionFirestore', () => {
  beforeEach(() => {
    mockSetDoc.mockClear();
    mockOnSnapshot.mockReset();
    localStorage.clear();
  });

  it('merkt sich die Geräte-Kennung', () => {
    const id = getCookingDeviceId();
    expect(id).toMatch(/^d_/);
    expect(getCookingDeviceId()).toBe(id);
  });

  it('schreibt bereinigt unter cookingSessions/{uid}', async () => {
    await saveCookingSession('u1', {
      recipes: [{ id: 'a', stepIndex: 2 }, { id: '', stepIndex: 1 }, { id: 'b', stepIndex: -3 }, null],
      activeRecipeId: 'a',
    });
    expect(mockSetDoc).toHaveBeenCalledWith('cookingSessions/u1', {
      recipes: [{ id: 'a', stepIndex: 2 }, { id: 'b', stepIndex: 0 }],
      activeRecipeId: 'a',
      deviceId: getCookingDeviceId(),
      updatedAt: 'SERVER_TS',
    });
  });

  it('liefert null ohne Dokument und sonst die bereinigten Daten', () => {
    const cb = jest.fn();
    mockOnSnapshot.mockImplementation((_ref, _opts, next) => {
      next({ exists: () => false });
      next({
        exists: () => true,
        metadata: { hasPendingWrites: true },
        data: () => ({ recipes: [{ id: 'a', stepIndex: 1 }], activeRecipeId: 'a', deviceId: 'x', updatedAt: { toMillis: () => 42 } }),
      });
      return () => {};
    });
    subscribeCookingSession('u1', cb);
    expect(cb).toHaveBeenNthCalledWith(1, null);
    expect(cb).toHaveBeenNthCalledWith(2, {
      recipes: [{ id: 'a', stepIndex: 1 }], activeRecipeId: 'a', deviceId: 'x', updatedAtMs: 42, hasPendingWrites: true,
    });
  });
});

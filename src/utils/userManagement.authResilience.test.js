/**
 * A failed profile read must not look like a sign-out.
 *
 * onAuthStateChange reports the user by calling back with the Firestore
 * profile, and App.js turns a null profile into currentUser = null — which
 * unmounts every page and takes the whole Events module (events, guests,
 * drinks) down with it. The profile read failing is not the same thing as the
 * account being gone, and on a resumed iOS PWA it is the far more likely of
 * the two.
 */

jest.mock('../firebase', () => ({ auth: {}, db: {}, functions: {} }));
jest.mock('./appCallsFirestore', () => ({ logAppCall: jest.fn() }));

const mockGetDoc = jest.fn();
let authCallback = null;

jest.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  signInAnonymously: jest.fn(),
  updatePassword: jest.fn(),
  reauthenticateWithCredential: jest.fn(),
  EmailAuthProvider: { credential: jest.fn() },
  sendPasswordResetEmail: jest.fn(),
  onAuthStateChanged: (_auth, cb) => { authCallback = cb; return jest.fn(); },
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  collection: jest.fn(),
  getDoc: (...args) => mockGetDoc(...args),
  setDoc: jest.fn(),
  getDocs: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  arrayUnion: jest.fn(),
  arrayRemove: jest.fn(),
}));

jest.mock('firebase/functions', () => ({ httpsCallable: jest.fn() }));

import { onAuthStateChange } from './userManagement';

const profileSnapshot = (data, { fromCache = false } = {}) => ({
  exists: () => !!data,
  data: () => data,
  id: data?.id,
  metadata: { fromCache },
});

const signIn = async (uid = 'u1') => {
  const callback = jest.fn();
  onAuthStateChange(callback);
  await authCallback({ uid, isAnonymous: false });
  return callback;
};

describe('onAuthStateChange profile-read resilience', () => {
  beforeEach(() => {
    authCallback = null;
    mockGetDoc.mockReset();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    sessionStorage.clear();
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  it('reports the user when the profile loads', async () => {
    mockGetDoc.mockResolvedValue(profileSnapshot({ id: 'u1', vorname: 'Ben', role: 'admin' }));
    const callback = await signIn();
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1', role: 'admin' }));
  });

  it('retries a failing profile read instead of taking the first error as the answer', async () => {
    mockGetDoc
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValue(profileSnapshot({ id: 'u1', vorname: 'Ben', role: 'admin' }));

    const callback = await signIn();

    expect(mockGetDoc).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1' }));
  });

  it('keeps the known user rather than signalling a sign-out when the read never succeeds', async () => {
    mockGetDoc.mockResolvedValue(profileSnapshot({ id: 'u1', vorname: 'Ben', role: 'admin' }));
    await signIn();

    mockGetDoc.mockRejectedValue(new Error('network down'));
    const callback = await signIn();

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1' }));
    expect(callback).not.toHaveBeenCalledWith(null);
  });

  it('does not accept an uncached "document missing" answer from the local cache as proof the account is gone', async () => {
    mockGetDoc
      .mockResolvedValueOnce(profileSnapshot(null, { fromCache: true }))
      .mockResolvedValue(profileSnapshot({ id: 'u1', vorname: 'Ben', role: 'admin' }));

    const callback = await signIn();

    expect(mockGetDoc).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1' }));
  });

  it('still reports a genuinely deleted account as signed out', async () => {
    mockGetDoc.mockResolvedValue(profileSnapshot(null, { fromCache: false }));
    const callback = await signIn('u-deleted');
    expect(callback).toHaveBeenCalledWith(null);
  });
});

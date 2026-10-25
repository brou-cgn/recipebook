import { openRequestIds, displayNameFromProfile, followDocId } from './followFirestore';

jest.mock('../firebase', () => ({ db: {}, functions: {} }));

describe('followFirestore', () => {
  test('openRequestIds ignoriert Inbox-Zeilen ohne offene Beziehung (zurückgezogen)', () => {
    const inbox = new Set(['anna', 'ben']);
    const incoming = [
      { followerId: 'anna', status: 'pending' },
      { followerId: 'cleo', status: 'pending' },
      { followerId: 'ben', status: 'accepted' },
    ];
    expect(openRequestIds(inbox, incoming)).toEqual(['anna']);
  });

  test('openRequestIds liefert nichts bei leerer Inbox', () => {
    expect(openRequestIds(new Set(), [{ followerId: 'anna', status: 'pending' }])).toEqual([]);
  });

  test('displayNameFromProfile: Name, anonym nur bei fehlendem Profil oder Namen, versteckt zählt nicht', () => {
    expect(displayNameFromProfile({ vorname: 'Anna', nachname: 'Berg' })).toBe('Anna Berg');
    expect(displayNameFromProfile({ vorname: 'Anna' })).toBe('Anna');
    expect(displayNameFromProfile({ vorname: 'Anna', versteckt: true })).toBe('Anna');
    expect(displayNameFromProfile({ versteckt: false })).toBe('Ein Mitglied');
    expect(displayNameFromProfile(null)).toBe('Ein Mitglied');
  });

  test('followDocId', () => {
    expect(followDocId('a', 'b')).toBe('a_b');
  });
});

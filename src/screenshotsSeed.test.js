/**
 * scripts/screenshots/seed.js schreibt Testdaten über die REST-Schnittstelle des
 * Firestore-Emulators. toValue übersetzt JS-Werte in dessen Format.
 */
const { toValue, ACCOUNT } = require('../scripts/screenshots/seed');

describe('Screenshot-Testdaten (seed.js)', () => {
  it('übersetzt Werte ins Format der Firestore-REST-Schnittstelle', () => {
    expect(toValue('Linsen')).toEqual({ stringValue: 'Linsen' });
    expect(toValue(4)).toEqual({ integerValue: '4' });
    expect(toValue(2.5)).toEqual({ doubleValue: 2.5 });
    expect(toValue(true)).toEqual({ booleanValue: true });
    expect(toValue(null)).toEqual({ nullValue: null });
    expect(toValue(new Date('2026-11-20T18:00:00Z'))).toEqual({ timestampValue: '2026-11-20T18:00:00.000Z' });
    expect(toValue({ guests: { adults: 18 }, tags: ['Thai'] })).toEqual({
      mapValue: {
        fields: {
          guests: { mapValue: { fields: { adults: { integerValue: '18' } } } },
          tags: { arrayValue: { values: [{ stringValue: 'Thai' }] } },
        },
      },
    });
  });

  it('nutzt ein erkennbares Testkonto', () => {
    expect(ACCOUNT.email).toMatch(/@example\.com$/);
  });
});

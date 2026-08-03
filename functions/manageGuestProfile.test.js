const test = require('node:test');
const assert = require('node:assert/strict');

const { _internal } = require('./manageGuestProfile');

test('validateProfile accepts valid payload', () => {
  const profile = _internal.validateProfile({
    vorname: 'Max',
    nachname: 'Mustermann',
    email: 'Max@Example.com',
    kind: true,
    alkoholischeGetränke: false,
    bevorzugteGetränke: ['wein', 'wein', 'wasser'],
    präferenzFaktor: 0.75,
  });

  assert.equal(profile.vorname, 'Max');
  assert.equal(profile.nachname, 'Mustermann');
  assert.equal(profile.email, 'max@example.com');
  assert.equal(profile.kind, true);
  assert.equal(profile.alkoholischeGetränke, false);
  assert.deepEqual(profile.bevorzugteGetränke, ['wein', 'wasser']);
  assert.equal(profile.präferenzFaktor, 0.75);
});

test('validateProfile persists bevorzugteKategorien', () => {
  const profile = _internal.validateProfile({
    vorname: 'Erika',
    nachname: 'Muster',
    bevorzugteKategorien: ['wein', 'wein_rotwein', 'wein_rotwein'],
    präferenzFaktor: 0.5,
  });

  assert.deepEqual(profile.bevorzugteKategorien, ['wein', 'wein_rotwein']);
});

test('validateProfile returns empty bevorzugteKategorien when not provided', () => {
  const profile = _internal.validateProfile({
    vorname: 'Test',
    nachname: 'User',
    präferenzFaktor: 0,
  });

  assert.deepEqual(profile.bevorzugteKategorien, []);
});

test('validateProfile rejects invalid preference factor', () => {
  assert.throws(() => {
    _internal.validateProfile({
      vorname: 'Max',
      nachname: 'Mustermann',
      präferenzFaktor: 0.6,
    });
  });
});

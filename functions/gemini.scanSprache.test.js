// Foto-Scan und Primärsprache Deutsch (Tech-Check F23, Mehrsprachigkeit PR 6r): Abbildung der KI-Antwort und
// Regel zur Sprache.
const test = require('node:test');
const assert = require('node:assert/strict');
const {rezeptAusAntwort, scanSpracheRegel} = require('./shared/gemini');

test('rezeptAusAntwort liest die deutschen Felder des Antwortschemas', () => {
  const rezept = rezeptAusAntwort({
    titel: 'Rührei',
    title: 'Scrambled eggs',
    portionen: 2,
    zubereitungszeit: 10,
    kategorie: 'Frühstück',
    zutaten: ['4 Eier'],
    zubereitung: ['Eier verquirlen.'],
    notizen: 'Heiß servieren.',
  }, '{}', undefined);
  assert.equal(rezept.title, 'Rührei');
  assert.equal(rezept.servings, 2);
  assert.equal(rezept.prepTime, 10);
  assert.equal(rezept.category, 'Frühstück');
  assert.deepEqual(rezept.steps, ['Eier verquirlen.']);
  assert.equal(rezept.notes, 'Heiß servieren.');
  assert.equal(rezept.ingredients.length, 1);
  assert.equal(rezept.provider, 'gemini');
  assert.equal(rezept.rawResponse, '{}');
});

test('rezeptAusAntwort nimmt englische Feldnamen nur als Rückfall', () => {
  const rezept = rezeptAusAntwort({title: 'Scrambled eggs', servings: 1, steps: ['Whisk the eggs.']}, '{}', undefined);
  assert.equal(rezept.title, 'Scrambled eggs');
  assert.equal(rezept.servings, 1);
  assert.deepEqual(rezept.steps, ['Whisk the eggs.']);
  assert.deepEqual(rezept.ingredients, []);
});

test('scanSpracheRegel verlangt Deutsch und nennt die Auswahl English als Hinweis', () => {
  assert.match(scanSpracheRegel('de'), /immer auf Deutsch zurück/);
  assert.doesNotMatch(scanSpracheRegel('de'), /laut Auswahl/);
  assert.match(scanSpracheRegel('en'), /laut Auswahl auf Englisch/);
  assert.match(scanSpracheRegel('en'), /übersetze es ins Deutsche/);
  // Unbekannte Werte bekommen keinen Hinweis, nur die Regel
  assert.doesNotMatch(scanSpracheRegel(undefined), /laut Auswahl/);
});

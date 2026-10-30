const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {GEMINI_MODEL, geminiGenerateContentRequest} = require('./shared/geminiConfig');

test('geminiGenerateContentRequest: Key im Header, nicht in der URL', () => {
  const {url, headers} = geminiGenerateContentRequest('geheimer-key');
  assert.ok(url.endsWith(`/models/${GEMINI_MODEL}:generateContent`));
  assert.ok(!url.includes('geheimer-key'));
  assert.equal(headers['x-goog-api-key'], 'geheimer-key');
  assert.equal(headers['Content-Type'], 'application/json');
});

// Tech-Check F16: das Modell steht nur in shared/geminiConfig.js.
test('kein Gemini-Modellname außerhalb von shared/geminiConfig.js', () => {
  const files = (dir) => fs.readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : files(full);
    return entry.name.endsWith('.js') && !entry.name.endsWith('.test.js') ? [full] : [];
  });
  const offenders = files(__dirname)
      .filter((file) => !file.endsWith(path.join('shared', 'geminiConfig.js')))
      .filter((file) => /['"`]gemini-\d/.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(__dirname, file));
  assert.deepEqual(offenders, []);
});

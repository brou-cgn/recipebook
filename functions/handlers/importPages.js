/**
 * importPages: aus index.js ausgelagert (Tech-Check F2).
 */

const {onRequest} = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

/**
 * Cloud Function: Render a temporary recipe import as structured HTML.
 *
 * GET /recipeImportPage?token=<importId>
 *
 * No authentication required – the random token acts as a capability URL.
 * Returns HTML with the raw text and JSON-LD structured data.
 * Returns 404 if not found, 410 if expired.
 */
exports.recipeImportPage = onRequest(
    {maxInstances: 10, cors: true, invoker: 'public'},
    async (req, res) => {
      if (req.method !== 'GET') {
        res.status(405).send('Method not allowed. Use GET.');
        return;
      }

      const token = req.query.token;
      if (!token) {
        res.status(400).send('Missing token parameter');
        return;
      }

      const db = admin.firestore();
      let importData;
      try {
        const importDoc = await db.collection('imports').doc(token).get();
        if (!importDoc.exists) {
          res.status(404).send('Import not found');
          return;
        }
        importData = importDoc.data();
      } catch (err) {
        console.error('recipeImportPage: Firestore error:', err);
        res.status(500).send('Internal server error');
        return;
      }

      if (importData.expiresAt < Date.now()) {
        res.status(410).send('Import expired');
        return;
      }

      const rawText = importData.rawText || '';

      // Derive a title from the first non-empty line of the raw text
      const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
      const title = lines[0] || 'Rezept-Import';

      const escape = (s) => String(s)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');

      // JSON.stringify does not escape '<', so a text containing "</script>"
      // would break out of the JSON-LD block (Tech-Check F6). \u003c is the
      // same character for JSON parsers but inert for the HTML parser;
      // U+2028/2029 are escaped for older script parsers.
      const jsonLd = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Recipe',
        'name': title,
        'description': rawText,
      })
          .replace(/</g, '\\u003c')
          .replace(/\u2028/g, '\\u2028')
          .replace(/\u2029/g, '\\u2029');

      const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<script type="application/ld+json">${jsonLd}</script>
</head>
<body>
<h1>${escape(title)}</h1>
<pre>${escape(rawText)}</pre>
</body>
</html>`;

      res.set('Cache-Control', 'no-store');
      res.status(200).send(html);
    },
);

/**
 * Minimal HTML snippet used as test input for the daily AI importer test.
 * Kept small to minimise API cost. Contains a clearly structured recipe so
 * the AI can extract all required fields reliably. Served over real HTTP by
 * importerTestFixturePage below so the nightly test can fetch it through the
 * exact same fetchRecipeHtml callable real users hit — instead of holding it
 * only in memory and skipping the network fetch entirely.
 */
const IMPORTER_TEST_HTML = `<!DOCTYPE html>
<html lang="de">
<head><title>Testrezept: Rührei</title></head>
<body>
<h1>Rührei</h1>
<p>Für 2 Personen. Zubereitungszeit: 10 Minuten. Schwierigkeit: 1</p>
<h2>Zutaten</h2>
<ul>
  <li>4 Eier</li>
  <li>2 Esslöffel Butter</li>
  <li>1 Prise Salz</li>
</ul>
<h2>Zubereitung</h2>
<ol>
  <li>Eier in einer Schüssel verquirlen und mit Salz würzen.</li>
  <li>Butter in einer Pfanne bei mittlerer Hitze schmelzen.</li>
  <li>Eimasse hineingeben und unter ständigem Rühren stocken lassen.</li>
  <li>Vom Herd nehmen und sofort servieren.</li>
</ol>
</body>
</html>`;

/**
 * Public HTTP endpoint that serves IMPORTER_TEST_HTML as a real, fetchable
 * page. Exists solely as a stable fixture for dailyAiImporterTest below, so
 * that test can exercise the real fetchRecipeHtml callable's network fetch
 * (headers, redirects, timeout, content-type check) against an actual HTTP
 * round trip instead of an unrelated third-party page or an in-memory string.
 */
exports.importerTestFixturePage = onRequest(
    {cors: false, region: 'us-central1', invoker: 'public'},
    (_req, res) => {
      res.set('Cache-Control', 'no-store');
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.status(200).send(IMPORTER_TEST_HTML);
    },
);

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

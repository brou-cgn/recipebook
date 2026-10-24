/**
 * sharing: aus index.js ausgelagert (Tech-Check F2).
 */

const {onCall, onRequest, HttpsError} = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const crypto = require('crypto');
const sharp = require('sharp');
const {isVisibleToUser} = require('../fuerDichEntdecktRotation');
const {authorizeListPush} = require('../listPushGuard');
const {ALLOWED_ORIGINS, escapeHtml} = require('../shared/common');

/**
 * Recursively resolves an ingredient string that may contain a #recipe:... link.
 * Returns an array of plain ingredient strings (no recipe links).
 * @param {object} db - Firestore instance
 * @param {string} ingText - Ingredient text, possibly a recipe link
 * @param {Set} visited - Set of already-visited recipe IDs (prevents infinite recursion)
 * @return {Promise<string[]>}
 */
const resolveIngredientText = async (db, ingText, visited) => {
  const match = ingText.match(/^[^#]*#recipe:([^:]+):/);
  if (!match) return [ingText];
  const recipeId = match[1];
  if (visited.has(recipeId)) return [];
  visited.add(recipeId);
  const doc = await db.collection('recipes').doc(recipeId).get();
  if (!doc.exists) return [];
  const linkedData = doc.data();
  const result = [];
  for (const ing of (linkedData.ingredients || [])) {
    const text = typeof ing === 'string' ? ing : ing.text;
    if (ing && typeof ing === 'object' && ing.type === 'heading') continue;
    const resolved = await resolveIngredientText(db, text, visited);
    result.push(...resolved);
  }
  return result;
};

/**
 * Resolves a raw ingredients array (strings and objects) into a flat array of
 * plain ingredient strings, expanding any #recipe:... links recursively.
 * @param {object} db - Firestore instance
 * @param {Array} rawIngredients
 * @return {Promise<string[]>}
 */
const resolveIngredients = async (db, rawIngredients) => {
  const result = [];
  for (const ing of rawIngredients) {
    if (typeof ing === 'object' && ing !== null && ing.type === 'heading') continue;
    const text = typeof ing === 'string' ? ing : ing.text;
    const resolved = await resolveIngredientText(db, text, new Set());
    result.push(...resolved);
  }
  return result;
};

// A single parenthetical group, e.g. "(Type 405)" in "200 g Mehl (Type 405)".
const PARENTHETICAL_REGEX = /\(([^()]*)\)/g;

/**
 * Moves everything in parentheses out of the ingredient name and appends it as
 * a comma-separated suffix: "200 g Mehl (Type 405)" -> "200 g Mehl, Type 405".
 * Bring! parses that suffix into its "Menge/Beschreibung" field, whereas a
 * parenthesis left in place becomes part of the item name.
 * The client already does this (and additionally strips the configured
 * adjectives/ignored terms) before POSTing an Einkaufsliste; this covers the
 * fallback paths that render a recipe's or menu's ingredients directly. Lines
 * without parentheses are returned unchanged, so running it twice is a no-op.
 * @param {string} ingredient
 * @return {string}
 */
const moveParentheticalsToSpec = (ingredient) => {
  const str = String(ingredient);
  // Cheap guard so lines without parentheses keep their exact spacing.
  if (!str.includes('(')) return str;

  const specs = [];
  const base = str
      .replace(PARENTHETICAL_REGEX, (_match, content) => {
        const trimmed = content.trim();
        if (trimmed) specs.push(trimmed);
        return ' ';
      })
      // Removing a group can leave double spaces or a space before punctuation
      // ("Zwiebel (klein), gewürfelt" -> "Zwiebel , gewürfelt").
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.;:])/g, '$1')
      .trim();

  // A line that is nothing but a parenthetical has no name left to keep.
  if (!base) return str;
  return specs.length > 0 ? `${base}, ${specs.join(', ')}` : base;
};

/**
 * Helper to build and send the Bring!-compatible HTML response.
 * Ingredient lines are normalized with moveParentheticalsToSpec first.
 * @param {object} res - Express response object
 * @param {string} title
 * @param {string[]} rawIngredients
 */
const sendBringHtml = (res, title, rawIngredients) => {
  const recipeIngredients = rawIngredients.map(moveParentheticalsToSpec);
  const escape = (s) => String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    'name': title,
    'recipeIngredient': recipeIngredients,
  });

  const escapedTitle = escape(title);
  const liItems = recipeIngredients.map((i) => `<li>${escape(i)}</li>`).join('');

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapedTitle}</title>
<script type="application/ld+json">${jsonLd}</script>
</head>
<body>
<h1>${escapedTitle}</h1>
<ul>${liItems}</ul>
</body>
</html>`;

  res.set('Cache-Control', 'public, max-age=300');
  res.status(200).send(html);
};

/**
 * HTTP function to serve Schema.org Recipe HTML for Bring! deeplink integration.
 * Accepts ?shareId=<id> and returns an HTML page with structured Recipe JSON-LD
 * so the Bring! shopping list app can parse the ingredients.
 *
 * POST with { shareId, items }: saves items to Firestore and returns { exportId }.
 * GET with ?shareId=<id>&exportId=<id>: loads items from Firestore and renders HTML.
 * GET with ?shareId=<id> only: falls back to loading all ingredients from the recipe.
 */
const BRING_EXPORT_TTL_MS = 10 * 60 * 1000; // 10 minutes

exports.bringRecipeExport = onRequest(
    {region: 'us-central1', invoker: 'public'},
    async (req, res) => {
      const origin = req.headers.origin;
      const hasOrigin = typeof origin === 'string' && origin.length > 0;
      const isAllowedOrigin = hasOrigin && ALLOWED_ORIGINS.includes(origin);

      // Handle CORS preflight
      if (req.method === 'OPTIONS') {
        res.set('Vary', 'Origin');
        res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        if (!hasOrigin) {
          res.status(204).send('');
          return;
        }
        if (hasOrigin && !isAllowedOrigin) {
          res.status(403).send('Forbidden origin');
          return;
        }
        res.set('Access-Control-Allow-Origin', origin);
        res.status(204).send('');
        return;
      }

      if (hasOrigin) {
        if (!isAllowedOrigin) {
          res.status(403).send('Forbidden origin');
          return;
        }
        res.set('Vary', 'Origin');
        res.set('Access-Control-Allow-Origin', origin);
      }

      // Handle POST: save pre-resolved items to Firestore, return exportId.
      if (req.method === 'POST') {
        // req.body may be empty when proxied through Firebase Hosting rewrite –
        // fall back to parsing req.rawBody (Buffer) if necessary.
        let parsedBody = req.body;
        if (!parsedBody || (typeof parsedBody === 'object' && Object.keys(parsedBody).length === 0)) {
          try {
            const raw = req.rawBody;
            if (raw) {
              parsedBody = JSON.parse(raw.toString('utf8'));
            }
          } catch (e) {
            console.error('Failed to parse rawBody:', e);
          }
        }
        const {shareId, items} = parsedBody || {};
        if (!shareId || !Array.isArray(items)) {
          res.status(400).send('Missing shareId or items');
          return;
        }
        try {
          const db = admin.firestore();
          const exportRef = db.collection('bringExports').doc();
          await exportRef.set({
            shareId,
            items,
            expiresAt: Date.now() + BRING_EXPORT_TTL_MS,
          });
          res.status(200).json({exportId: exportRef.id});
        } catch (error) {
          console.error('bringRecipeExport POST error:', error);
          res.status(500).send('Internal server error');
        }
        return;
      }

      const shareId = req.query.shareId;
      if (!shareId) {
        res.status(400).send('Missing shareId parameter');
        return;
      }

      // If exportId is provided, load pre-resolved items from Firestore.
      if (req.query.exportId) {
        try {
          const db = admin.firestore();
          const exportDoc = await db.collection('bringExports')
              .doc(req.query.exportId).get();
          if (!exportDoc.exists) {
            res.status(404).send('Export not found or expired');
            return;
          }
          const exportData = exportDoc.data();
          if (exportData.expiresAt < Date.now()) {
            res.status(410).send('Export expired');
            return;
          }
          if (exportData.shareId !== shareId) {
            res.status(403).send('Forbidden');
            return;
          }
          let title = 'Rezept';
          const recipeSnap = await db.collection('recipes')
              .where('shareId', '==', shareId).limit(1).get();
          if (!recipeSnap.empty) {
            title = recipeSnap.docs[0].data().title || title;
          } else {
            const menuSnap = await db.collection('menus')
                .where('shareId', '==', shareId).limit(1).get();
            if (!menuSnap.empty) {
              title = menuSnap.docs[0].data().name || title;
            }
          }
          sendBringHtml(res, title, exportData.items.map(String));
        } catch (error) {
          console.error('bringRecipeExport error (exportId path):', error);
          res.status(500).send('Internal server error');
        }
        return;
      }

      try {
        const db = admin.firestore();
        const recipesRef = db.collection('recipes');
        const snapshot = await recipesRef
            .where('shareId', '==', shareId)
            .limit(1)
            .get();

        if (snapshot.empty) {
          // No recipe found – try the menus collection
          const menusRef = db.collection('menus');
          const menuSnapshot = await menusRef
              .where('shareId', '==', shareId)
              .limit(1)
              .get();

          if (menuSnapshot.empty) {
            res.status(404).send('Recipe not found');
            return;
          }

          const menu = menuSnapshot.docs[0].data();
          const title = menu.name || 'Menü';

          // Collect all unique recipe IDs from sections (new) or recipeIds (legacy)
          let recipeIds = [];
          if (menu.sections && Array.isArray(menu.sections)) {
            const idSet = new Set();
            for (const section of menu.sections) {
              if (Array.isArray(section.recipeIds)) {
                for (const id of section.recipeIds) {
                  idSet.add(id);
                }
              }
            }
            recipeIds = Array.from(idSet);
          } else if (Array.isArray(menu.recipeIds)) {
            recipeIds = [...new Set(menu.recipeIds)];
          }

          // Load all referenced recipes, resolve recipe links, and combine ingredients
          const recipeIngredients = [];
          for (const recipeId of recipeIds) {
            const recipeDoc = await db.collection('recipes').doc(recipeId).get();
            if (!recipeDoc.exists) continue;
            const recipeData = recipeDoc.data();
            const resolved = await resolveIngredients(db, recipeData.ingredients || []);
            recipeIngredients.push(...resolved);
          }

          sendBringHtml(res, title, recipeIngredients);
          return;
        }

        const recipe = snapshot.docs[0].data();
        const title = recipe.title || 'Rezept';
        const recipeIngredients = await resolveIngredients(db, recipe.ingredients || []);

        sendBringHtml(res, title, recipeIngredients);
      } catch (error) {
        console.error('bringRecipeExport error:', error);
        res.status(500).send('Internal server error');
      }
    },
);

/**
 * Regular expression that matches known social media crawler User-Agent strings.
 * Used by shareRecipe to decide whether to serve OG meta-tag HTML or redirect.
 */
const CRAWLER_UA_REGEX =
  /bot|crawler|spider|crawling|facebookexternalhit|whatsapp|twitterbot|telegrambot|linkedinbot|slackbot|discordbot|pinterest/i;

/**
 * Allowed UUID v4 pattern for shareId values stored by crypto.randomUUID().
 * Rejects any shareId that doesn't look like a UUID, preventing path traversal
 * and other injection attempts before the value reaches Firestore or HTML output.
 */
const SHARE_ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_SHARED_RECIPE_IDS = 100;

/** Fallback OG image URL used when no recipe thumbnail and no custom app logo exist. */
const STATIC_FALLBACK_LOGO_URL = 'https://broubook.web.app/logo512.png';

/**
 * Decode a recipe reference from ingredient text.
 * Format: [quantity] #recipe:{recipeId}:{recipeName}
 * Returns null if text is not a recipe link.
 */
function decodeRecipeLink(ingredient) {
  if (!ingredient || typeof ingredient !== 'string') {
    return null;
  }
  const match = ingredient.match(/^([^#]*?)\s*#recipe:([^:]+):(.+)$/);
  if (match) {
    const quantityPrefix = match[1].trim();
    return {
      recipeId: match[2],
      recipeName: match[3],
      quantityPrefix: quantityPrefix || null,
    };
  }
  return null;
}

/**
 * Generates an HTML page with dynamic Open Graph meta-tags for a recipe.
 * Regular browsers are redirected immediately to the React app via meta-refresh
 * and a script tag. Social media crawlers read the meta-tags and stop.
 *
 * @param {Object} recipe - Firestore recipe data
 * @param {string} shareId - The share identifier (validated UUID)
 * @param {string} functionUrl - Canonical URL of this page (used for og:url)
 * @param {string} defaultLogoUrl - Fallback image URL when the recipe has no thumbnail
 * @return {string} Full HTML document
 */
function generateRecipeShareHtml(recipe, shareId, functionUrl, defaultLogoUrl = STATIC_FALLBACK_LOGO_URL) {
  const title = escapeHtml(recipe.title || 'Rezept');
  const description = escapeHtml(
      recipe.description ||
      (Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0
        ? recipe.ingredients.slice(0, 5).map((i) => {
            const text = typeof i === 'object' && i !== null && i.text ? i.text : String(i);
            const recipeLink = decodeRecipeLink(text);
            if (recipeLink) {
              return recipeLink.quantityPrefix
                ? `${recipeLink.quantityPrefix} ${recipeLink.recipeName}`
                : recipeLink.recipeName;
            }
            return text;
          }).join(', ')
        : 'Ein leckeres Rezept aus brouBook'),
  );

  // ALWAYS use thumbnail for sharing - never send original image
  // Only use thumbnail if it's a valid HTTP(S) URL, not Base64
  const rawImage = recipe.imageThumbnail &&
                   (recipe.imageThumbnail.startsWith('http://') ||
                    recipe.imageThumbnail.startsWith('https://'))
                   ? recipe.imageThumbnail
                   : '';

  const imageUrl = escapeHtml(
      rawImage || defaultLogoUrl,
  );
  const canonicalUrl = escapeHtml(functionUrl);
  // Derive the app base URL from the canonical function URL so the redirect
  // always targets the same Firebase Hosting domain that served the share link.
  // e.g. https://project.web.app/share/<id> → https://project.web.app/
  const parsedUrl = new URL(functionUrl);
  const appBaseUrl = `${parsedUrl.protocol}//${parsedUrl.host}/`;
  // shareId is a validated UUID so it is safe to interpolate directly.
  const appUrl = `${appBaseUrl}#share/${shareId}`;

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${imageUrl}">
  <meta http-equiv="refresh" content="0;url=${escapeHtml(appUrl)}">
  <title>${title} - brouBook</title>
</head>
<body>
  <p>Wird weitergeleitet&#8230;</p>
  <script>window.location.href = ${JSON.stringify(appUrl)};</script>
</body>
</html>`;
}

/**
 * HTTPS function that serves dynamic Open Graph meta-tags for recipe share links.
 *
 * - Social media crawlers (Facebook, WhatsApp, Twitter, etc.) receive an HTML
 *   page with og:title, og:description, og:image and og:url populated from the
 *   shared recipe's Firestore document.
 * - Regular browsers are redirected immediately to the React app.
 *
 * Firebase Hosting rewrites /share/** to this function, giving share URLs of
 * the form: https://<project>.web.app/share/<shareId>
 */
exports.shareRecipe = onRequest(
    {cors: false, region: 'us-central1', invoker: 'public'},
    async (req, res) => {
      // Extract shareId from the URL path (/share/<shareId>) or query string.
      const pathParts = req.path.replace(/^\/+/, '').split('/');
      const shareId = (
        pathParts[pathParts.length - 1] ||
        req.query.id ||
        ''
      ).trim();

      // Validate that shareId matches the UUID v4 format used by crypto.randomUUID().
      if (!shareId || !SHARE_ID_REGEX.test(shareId)) {
        res.status(400).send('Invalid or missing share ID');
        return;
      }

      const userAgent = req.get('user-agent') || '';
      const isCrawler = CRAWLER_UA_REGEX.test(userAgent);

      const canonicalUrl = `${req.protocol}://${req.hostname}/share/${shareId}`;

      if (!isCrawler) {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.redirect(302, `${req.protocol}://${req.hostname}/#share/${shareId}`);
        return;
      }

      try {
        const db = admin.firestore();
        const snapshot = await db
            .collection('recipes')
            .where('shareId', '==', shareId)
            .limit(1)
            .get();

        if (snapshot.empty) {
          res.status(404).send('Rezept nicht gefunden');
          return;
        }

        const recipeDoc = snapshot.docs[0];
        const recipe = recipeDoc.data();

        // Lazy thumbnail generation: if no thumbnail exists, or if it's Base64
        // (which doesn't work in Open Graph meta-tags for WhatsApp/Facebook),
        // generate a new thumbnail and upload it to Firebase Storage as a
        // public URL.
        const needsThumbnailGeneration =
          !recipe.imageThumbnail ||
          recipe.imageThumbnail.startsWith('data:image/');

        if (needsThumbnailGeneration && recipe.image) {
          try {
            let thumbnailBuffer;

            if (recipe.image.startsWith('data:image/')) {
              // Base64 image → convert to buffer and resize
              const matches =
                recipe.image.match(/^data:image\/\w+;base64,(.+)$/s);
              if (matches) {
                const imageBuffer = Buffer.from(matches[1], 'base64');
                thumbnailBuffer = await sharp(imageBuffer)
                    .resize(1200, 630, {fit: 'inside', withoutEnlargement: true})
                    .jpeg({quality: 80})
                    .toBuffer();
              }
            } else if (
              recipe.image.startsWith(
                  'https://firebasestorage.googleapis.com/') ||
              recipe.image.startsWith('https://storage.googleapis.com/')
            ) {
              // Storage URL → download and resize
              const response = await fetch(recipe.image);
              if (!response.ok) {
                throw new Error(
                    `shareRecipe: failed to fetch image (${response.status})`);
              }
              const arrayBuffer = await response.arrayBuffer();
              const imageBuffer = Buffer.from(arrayBuffer);

              thumbnailBuffer = await sharp(imageBuffer)
                  .resize(1200, 630, {fit: 'inside', withoutEnlargement: true})
                  .jpeg({quality: 80})
                  .toBuffer();
            }

            // Upload thumbnail to Firebase Storage and get public URL
            if (thumbnailBuffer) {
              const bucket = admin.storage().bucket();
              const fileName =
                `thumbnails/${recipeDoc.id}_${crypto.randomUUID()}.jpg`;
              const file = bucket.file(fileName);

              await file.save(thumbnailBuffer, {
                metadata: {
                  contentType: 'image/jpeg',
                  cacheControl: 'public, max-age=31536000',
                },
              });

              // Make the file publicly accessible
              await file.makePublic();

              // Get the public URL
              const publicUrl =
                `https://storage.googleapis.com/${bucket.name}/${fileName}`;

              // Save the public URL to Firestore
              await recipeDoc.ref.update({imageThumbnail: publicUrl});
              recipe.imageThumbnail = publicUrl;

              console.log(
                  `Generated thumbnail for recipe ${recipeDoc.id}: ${publicUrl}`);
            }
          } catch (thumbErr) {
            console.warn('shareRecipe: thumbnail generation failed:', thumbErr);
          }
        }

        // Load the custom app logo URL from settings (uploaded via the Settings UI).
        // Fall back to the static logo if no custom logo has been configured.
        let defaultLogoUrl = STATIC_FALLBACK_LOGO_URL;
        try {
          const settingsDoc = await db.doc('settings/app').get();
          const settingsData = settingsDoc.data();
          if (settingsData?.appLogoImageUrl) {
            defaultLogoUrl = settingsData.appLogoImageUrl;
          }
        } catch (settingsErr) {
          console.warn('shareRecipe: failed to load settings for logo fallback:', settingsErr);
        }

        const html = generateRecipeShareHtml(recipe, shareId, canonicalUrl, defaultLogoUrl);
        res.status(200).set('Content-Type', 'text/html; charset=utf-8').send(html);
      } catch (error) {
        console.error('shareRecipe: error loading recipe:', error);
        res.status(500).send('Fehler beim Laden des Rezepts');
      }
    },
);

/**
 * Validate shareId format for public share endpoints.
 * @param {string} shareId - Share UUID to validate
 * @throws {HttpsError} Throws invalid-argument when shareId is missing/invalid
 */
function assertValidShareId(shareId) {
  if (!shareId || !SHARE_ID_REGEX.test(shareId)) {
    throw new HttpsError('invalid-argument', 'Ungültige shareId');
  }
}

/**
 * Collect all recipe IDs referenced by a menu (sections + legacy recipeIds).
 * @param {Object} menuData - Menu document data
 * @return {Set<string>} Unique recipe IDs referenced by the menu
 */
function collectRecipeIdsFromMenu(menuData) {
  const recipeIds = new Set();

  if (Array.isArray(menuData?.sections)) {
    menuData.sections.forEach((section) => {
      if (Array.isArray(section?.recipeIds)) {
        section.recipeIds.forEach((recipeId) => {
          if (typeof recipeId === 'string' && recipeId.trim()) {
            recipeIds.add(recipeId.trim());
          }
        });
      }
    });
  }

  if (Array.isArray(menuData?.recipeIds)) {
    menuData.recipeIds.forEach((recipeId) => {
      if (typeof recipeId === 'string' && recipeId.trim()) {
        recipeIds.add(recipeId.trim());
      }
    });
  }

  return recipeIds;
}

exports.getSharedRecipeByShareId = onCall(
    {region: 'us-central1', cors: ALLOWED_ORIGINS, invoker: 'public'},
    async (request) => {
      const shareId = typeof request.data?.shareId === 'string' ?
        request.data.shareId.trim() : '';
      assertValidShareId(shareId);

      const snapshot = await admin.firestore()
          .collection('recipes')
          .where('shareId', '==', shareId)
          .limit(1)
          .get();

      if (snapshot.empty) {
        throw new HttpsError('not-found', 'Rezept nicht gefunden');
      }

      const recipeDoc = snapshot.docs[0];
      return {recipe: {id: recipeDoc.id, ...recipeDoc.data()}};
    },
);

exports.getSharedMenuByShareId = onCall(
    {region: 'us-central1', cors: ALLOWED_ORIGINS, invoker: 'public'},
    async (request) => {
      const shareId = typeof request.data?.shareId === 'string' ?
        request.data.shareId.trim() : '';
      assertValidShareId(shareId);

      const snapshot = await admin.firestore()
          .collection('menus')
          .where('shareId', '==', shareId)
          .limit(1)
          .get();

      if (snapshot.empty) {
        throw new HttpsError('not-found', 'Menü nicht gefunden');
      }

      const menuDoc = snapshot.docs[0];
      return {menu: {id: menuDoc.id, ...menuDoc.data()}};
    },
);

exports.getSharedRecipesByIds = onCall(
    {region: 'us-central1', cors: ALLOWED_ORIGINS, invoker: 'public'},
    async (request) => {
      const shareId = typeof request.data?.shareId === 'string' ?
        request.data.shareId.trim() : '';
      assertValidShareId(shareId);

      const requestedRecipeIds = request.data?.recipeIds;
      if (!Array.isArray(requestedRecipeIds)) {
        throw new HttpsError('invalid-argument', 'recipeIds muss ein Array sein');
      }

      if (requestedRecipeIds.length > MAX_SHARED_RECIPE_IDS) {
        throw new HttpsError(
            'invalid-argument',
            `Maximal ${MAX_SHARED_RECIPE_IDS} recipeIds erlaubt`,
        );
      }

      const invalidRecipeId = requestedRecipeIds.find(
          (recipeId) => typeof recipeId !== 'string' || !recipeId.trim(),
      );
      if (invalidRecipeId !== undefined) {
        throw new HttpsError(
            'invalid-argument',
            'recipeIds muss ein Array aus nicht-leeren Strings sein',
        );
      }

      const uniqueRequestedRecipeIds = [...new Set(
          requestedRecipeIds.map((recipeId) => recipeId.trim()),
      )];
      if (uniqueRequestedRecipeIds.length === 0) {
        return {recipes: []};
      }

      const db = admin.firestore();
      const menuSnapshot = await db
          .collection('menus')
          .where('shareId', '==', shareId)
          .limit(1)
          .get();
      if (menuSnapshot.empty) {
        throw new HttpsError('not-found', 'Menü nicht gefunden');
      }

      const allowedRecipeIds = collectRecipeIdsFromMenu(menuSnapshot.docs[0].data());
      const authorizedRecipeIds = uniqueRequestedRecipeIds.filter(
          (recipeId) => allowedRecipeIds.has(recipeId),
      );
      if (authorizedRecipeIds.length === 0) {
        return {recipes: []};
      }

      const recipeSnaps = await Promise.all(
          authorizedRecipeIds.map((recipeId) => db.collection('recipes').doc(recipeId).get()),
      );
      const recipes = recipeSnaps
          .filter((snap) => snap.exists)
          .map((snap) => ({id: snap.id, ...snap.data()}));

      return {recipes};
    },
);

/**
 * Cloud Function: recipes for anonymous guests.
 *
 * Anonymous guests may not read /recipes directly (see firestore.rules): the
 * rules cannot express "public, not a draft, not locked to a list", so a guest
 * client would otherwise have to download every recipe and filter in the
 * browser. The filter runs here instead (isVisibleToUser, the same rule the
 * client and the Für-dich-entdeckt rotation use) and only visible recipes
 * leave the server. Registered members keep reading Firestore directly.
 */
exports.getGuestRecipes = onCall(
    {region: 'us-central1', cors: ALLOWED_ORIGINS},
    async (request) => {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Anmeldung erforderlich');
      }
      if (request.auth.token?.firebase?.sign_in_provider !== 'anonymous') {
        throw new HttpsError('permission-denied', 'Nur für Gäste');
      }

      const db = admin.firestore();
      const [recipeSnap, groupSnap] = await Promise.all([
        db.collection('recipes').get(),
        db.collection('groups').where('type', '==', 'public').get(),
      ]);
      const groupsById = new Map(
          groupSnap.docs.map((d) => [d.id, {type: 'public', memberIds: []}]),
      );
      const guest = {id: request.auth.uid, isAdmin: false};

      const recipes = recipeSnap.docs
          .map((d) => ({id: d.id, ...d.data()}))
          .filter((recipe) => isVisibleToUser(recipe, guest, groupsById));
      return {recipes};
    },
);

/**
 * Cloud Function: Notify private-list members about a new or added recipe.
 *
 * Called by the client after a recipe is created in (or added to) a private
 * list.  Looks up the list members, fetches their FCM tokens from Firestore,
 * and sends a push notification to every member except the actor.
 *
 * Input data:
 *   - groupId  {string}            Firestore ID of the private list
 *   - recipeId {string}            Firestore ID of the recipe
 *   - actorId  {string}            Firestore ID of the user who acted
 *   - action   {'created'|'added'} Whether the recipe was newly created or added
 *
 * Returns: { success: boolean, sent: number }
 */
exports.notifyPrivateListMembers = onCall(
    {maxInstances: 10},
    async (request) => {
      const callerAuth = request.auth;
      if (!callerAuth) {
        throw new HttpsError(
            'unauthenticated',
            'Sie müssen angemeldet sein.',
        );
      }

      const {groupId, recipeId, actorId, action} = request.data;

      if (!groupId || !recipeId || !actorId) {
        throw new HttpsError(
            'invalid-argument',
            'groupId, recipeId und actorId sind erforderlich.',
        );
      }

      const db = admin.firestore();

      // 1. Load the group to get member list
      const groupSnap = await db.collection('groups').doc(groupId).get();
      if (!groupSnap.exists) {
        throw new HttpsError('not-found', 'Gruppe nicht gefunden.');
      }
      const groupData = groupSnap.data();

      if (groupData.type !== 'private') {
        // Only send notifications for private lists
        return {success: true, sent: 0};
      }

      // Nur Mitglieder der Liste dürfen Pushes auslösen, und nur als sie selbst
      // (Tech-Check S18); Tageslimit je Aufrufer.
      await authorizeListPush(db, HttpsError, {
        auth: callerAuth, actorId, action, groupData,
      });

      // Collect all member IDs (owner + memberIds), excluding the actor
      const ownerIdEntry = groupData.ownerId ? [groupData.ownerId] : [];
      const memberIds = Array.isArray(groupData.memberIds)
        ? groupData.memberIds
        : [];
      const allMemberIds = [...new Set([...ownerIdEntry, ...memberIds])].filter(
          (id) => id !== actorId,
      );

      if (allMemberIds.length === 0) {
        return {success: true, sent: 0};
      }

      // 2. Load the recipe title for the notification body
      let recipeTitle = 'Ein Rezept';
      try {
        const recipeSnap = await db.collection('recipes').doc(recipeId).get();
        if (recipeSnap.exists) {
          recipeTitle = recipeSnap.data().title || recipeTitle;
        }
      } catch (recipeErr) {
        console.warn(
            'notifyPrivateListMembers: could not load recipe title',
            recipeErr,
        );
      }

      // 3. Collect FCM tokens for the relevant members
      const tokenFetches = allMemberIds.map((uid) =>
        db.collection('users').doc(uid).get(),
      );
      const userSnaps = await Promise.all(tokenFetches);

      const tokens = [];
      userSnaps.forEach((snap) => {
        if (!snap.exists) return;
        const userData = snap.data();
        if (Array.isArray(userData.fcmTokens)) {
          tokens.push(...userData.fcmTokens.filter(Boolean));
        }
      });

      if (tokens.length === 0) {
        return {success: true, sent: 0};
      }

      // 4. Build the notification payload
      const listName = groupData.name || 'einer privaten Liste';
      const actionLabel =
        action === 'created' ? 'erstellt' : 'hinzugefügt';
      const notificationTitle = `Neues Rezept in „${listName}"`;
      const notificationBody = `„${recipeTitle}" wurde ${actionLabel}.`;
      const notificationPayload = {
        data: {
          title: notificationTitle,
          body: notificationBody,
          icon: '/logo192.png',
          badge: '/favicon.ico',
          groupId,
          recipeId,
          action: action || 'added',
          notificationId: `${groupId}-${recipeId}-${Date.now()}`,
        },
        apns: {
          headers: {
            'apns-push-type': 'alert',
            'apns-priority': '10',
          },
          payload: {
            aps: {
              alert: {
                title: notificationTitle,
                body: notificationBody,
              },
              sound: 'default',
              'mutable-content': 1,
            },
          },
        },
        webpush: {
          fcm_options: {
            link: '/',
          },
        },
      };

      // 5. Send notifications in batches (FCM sendEachForMulticast limit: 500)
      const BATCH_SIZE = 500;
      let sentCount = 0;
      const staleTokens = [];

      for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
        const batch = tokens.slice(i, i + BATCH_SIZE);
        try {
          const response = await admin.messaging().sendEachForMulticast({
            tokens: batch,
            ...notificationPayload,
          });

          sentCount += response.successCount;

          // Collect tokens that are no longer valid
          response.responses.forEach((resp, idx) => {
            if (
              !resp.success &&
              (resp.error?.code ===
                'messaging/registration-token-not-registered' ||
                resp.error?.code === 'messaging/invalid-registration-token')
            ) {
              staleTokens.push(batch[idx]);
            }
          });
        } catch (sendErr) {
          console.error(
              'notifyPrivateListMembers: batch send error',
              sendErr,
          );
        }
      }

      // 6. Remove stale tokens from Firestore (best-effort, non-blocking)
      if (staleTokens.length > 0) {
        const removePromises = userSnaps.map(async (snap) => {
          if (!snap.exists) return;
          const userData = snap.data();
          if (!Array.isArray(userData.fcmTokens)) return;
          const updatedTokens = userData.fcmTokens.filter(
              (t) => !staleTokens.includes(t),
          );
          if (updatedTokens.length !== userData.fcmTokens.length) {
            await snap.ref.update({fcmTokens: updatedTokens});
          }
        });
        await Promise.allSettled(removePromises);
      }

      console.log(
          `notifyPrivateListMembers: sent ${sentCount} notification(s) ` +
          `for recipe ${recipeId} in group ${groupId}`,
      );
      return {success: true, sent: sentCount};
    },
);

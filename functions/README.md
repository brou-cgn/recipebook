# Firebase Cloud Functions for RecipeBook

This directory contains Firebase Cloud Functions that provide secure server-side functionality for the RecipeBook app.

## Functions

### addRecipeViaAPI

An HTTP endpoint that lets external tools – such as an **Apple Shortcut** – create recipes directly in Firestore without going through the RecipeBook UI.

**Features:**
- ✅ Authentication: Firebase ID Token (Bearer) required
- ✅ Authorisation: user must have role `edit` or `admin`
- ✅ Accepts both German and English field names (compatible with AI/Shortcut output)
- ✅ Input validation with descriptive error messages
- ✅ CORS enabled
- ✅ Automatically sets `authorId`, `createdAt`, `updatedAt`
- ✅ Increments user's `recipe_count`

**Request:**

```
POST https://<region>-<project-id>.cloudfunctions.net/addRecipeViaAPI
Content-Type: application/json
Authorization: Bearer <Firebase ID Token>
```

**Body (JSON) – supported field names:**

| Field | Alias(es) | Type | Required | Description |
|-------|-----------|------|----------|-------------|
| `title` | `titel` | string | ✅ | Recipe title |
| `ingredients` | `zutaten` | string[] | ✅ | List of ingredients |
| `steps` | `zubereitung` | string[] | ✅ | Preparation steps |
| `portionen` | `servings`, `portions` | number | – | Number of servings |
| `kochdauer` | `cookTime`, `prepTime`, `zubereitungszeit` | number | – | Cooking time in minutes |
| `schwierigkeit` | `difficulty` | number (1–5) | – | Difficulty level; must be 1–5 if provided |
| `speisekategorie` | `category`, `kategorie` | string | – | Meal category |
| `kulinarik` | `cuisine`, `kulinarisch` | string \| string[] | – | Cuisine type(s) |
| `tags` | – | string \| string[] | – | Tags (comma-separated string or array) |
| `notizen` | `notes` | string | – | Additional notes |

**Example request body:**

```json
{
  "title": "Spaghetti Carbonara",
  "portionen": 4,
  "kochdauer": 30,
  "schwierigkeit": 2,
  "kulinarik": ["Italienisch"],
  "speisekategorie": "Hauptgericht",
  "tags": ["klassisch", "pasta"],
  "ingredients": [
    "400 g Spaghetti",
    "200 g Guanciale",
    "4 Eigelb",
    "100 g Pecorino Romano",
    "Schwarzer Pfeffer",
    "Salz"
  ],
  "steps": [
    "Wasser in einem großen Topf zum Kochen bringen und salzen.",
    "Guanciale in Würfel schneiden und bei mittlerer Hitze knusprig braten.",
    "Eigelb mit geriebenem Pecorino und Pfeffer verrühren.",
    "Spaghetti bissfest kochen, etwas Kochwasser auffangen.",
    "Pasta zum Guanciale geben, von der Hitze nehmen.",
    "Ei-Käse-Mischung unterrühren, mit Nudelwasser cremig rühren und sofort servieren."
  ],
  "notizen": "Pfanne unbedingt von der Hitze nehmen, bevor die Eier hinzugefügt werden."
}
```

**Success response (200):**

```json
{
  "success": true,
  "recipeId": "abc123xyz"
}
```

**Error responses:**

| Status | Reason |
|--------|--------|
| 400 | Missing or invalid fields |
| 401 | Missing, invalid, or expired token |
| 403 | User not found or insufficient role |
| 405 | Wrong HTTP method (only POST allowed) |
| 500 | Firestore write error |

---

#### Getting a Firebase ID Token

The Firebase ID Token is a short-lived JWT. You can obtain it in the app or via the [Firebase Auth REST API](https://firebase.google.com/docs/reference/rest/auth):

```bash
curl -X POST \
  'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=<WEB_API_KEY>' \
  -H 'Content-Type: application/json' \
  -d '{"email":"your@email.com","password":"yourpassword","returnSecureToken":true}'
```

The `idToken` field in the response is your Bearer token (valid for 1 hour).

---

#### Apple Shortcut – Example Setup

1. **Sign in once** to get a token (use "Get Contents of URL" action with the REST endpoint above).
2. **Store the token** in a Shortcut variable or a text field.
3. **Send the recipe** with a "Get Contents of URL" action:
   - Method: `POST`
   - URL: `https://us-central1-<project-id>.cloudfunctions.net/addRecipeViaAPI`
   - Headers: `Authorization: Bearer <token>`, `Content-Type: application/json`
   - Body: JSON with the recipe fields listed above.
4. **Check the result**: the response contains `recipeId` if successful.

> **Tip:** Use OpenAI / AI Actions in your Shortcut to extract and structure the recipe text before sending it to this endpoint. Replace the "Create Note" step with a "Get Contents of URL" POST action.

---

### scanRecipeWithAI

A secure proxy for Google Gemini Vision API that provides AI-powered recipe recognition.

**Features:**
- ✅ Authentication: Only logged-in users can access
- ✅ Rate limiting: 1000 scans/day for admins, 20/day for users, 5/day for guests
- ✅ Input validation: Max 5MB images, only image MIME types
- ✅ Error handling: User-friendly error messages
- ✅ Secure: API key stored as Firebase secret

### calculateNutritionFromOpenFoodFacts

A server-side proxy for the [OpenFoodFacts](https://world.openfoodfacts.org/) API that
calculates per-portion nutritional values for all ingredients in a recipe.

**Features:**
- ✅ Authentication: Only logged-in users can access
- ✅ No API key required – OpenFoodFacts is an open database
- ✅ Parses ingredient strings (e.g. "500 g Mehl", "2 EL Olivenöl", "4 Eier")
- ✅ Returns kalorien, protein, fett, kohlenhydrate, zucker (davon Zucker), ballaststoffe, salz per portion
- ✅ Partial results + per-ingredient feedback when some items are not found
- ✅ Fallback: user can always edit values manually

**Input:**
```json
{
  "ingredients": ["500 g Spaghetti", "200 g Guanciale", "4 Eigelb"],
  "portionen": 4
}
```

**Output:**
```json
{
  "naehrwerte": {
    "kalorien": 520,
    "protein": 22.5,
    "fett": 18.3,
    "kohlenhydrate": 68.1,
    "zucker": 2.4,
    "ballaststoffe": 3.1,
    "salz": 1.2
  },
  "details": [
    { "ingredient": "500 g Spaghetti", "name": "Spaghetti", "found": true, "product": "Spaghetti n°5", "amountG": 500 },
    { "ingredient": "4 Eigelb", "name": "Eigelb", "found": false, "error": "Nicht gefunden" }
  ],
  "foundCount": 2,
  "totalCount": 3
}
```

**Data source:** [OpenFoodFacts](https://world.openfoodfacts.org/) – Open Database License (ODbL)

## Setup

### 1. Install Dependencies

```bash
cd functions
npm install
```

### 2. Set API Key Secret

```bash
firebase functions:secrets:set GEMINI_API_KEY
```

When prompted, enter your Gemini API key from https://aistudio.google.com/

### 3. Deploy

```bash
# Deploy all functions
firebase deploy --only functions

# Or deploy specific function
firebase deploy --only functions:scanRecipeWithAI
```

## Local Development

Use the Firebase Functions Emulator for local testing:

```bash
# Start emulator
firebase emulators:start --only functions

# The function will be available at:
# http://localhost:5001/YOUR_PROJECT_ID/us-central1/scanRecipeWithAI
```

## Environment Variables

The function uses Firebase Secrets for secure API key storage:

- `GEMINI_API_KEY` - Google Gemini Vision API key (required)

## Rate Limiting

Rate limits are enforced using Firestore:

- Collection: `aiScanLimits`
- Document format: `{userId}_{date}`
- Fields:
  - `userId`: User ID
  - `date`: Date (YYYY-MM-DD)
  - `count`: Number of scans
  - `isAuthenticated`: Boolean
  - `isAdmin`: Boolean

**Rate limit tiers:**
- Admin users: 1000 scans per day
- Authenticated users: 20 scans per day
- Guest/anonymous users: 5 scans per day

### Setting Admin Custom Claims

To give a user admin privileges and higher rate limits, set a custom claim using the Firebase Admin SDK:

```javascript
const admin = require('firebase-admin');

// Set admin claim for a user
await admin.auth().setCustomUserClaims(uid, { admin: true });
```

Or create a simple Node.js script:

```javascript
// set-admin.js
const admin = require('firebase-admin');

// Initialize with your service account
// Requires GOOGLE_APPLICATION_CREDENTIALS environment variable
// or running in a GCP environment with default credentials
admin.initializeApp({
  credential: admin.credential.applicationDefault()
});

const userId = process.argv[2];
if (!userId) {
  console.error('Usage: node set-admin.js USER_ID');
  process.exit(1);
}

admin.auth().setCustomUserClaims(userId, { admin: true })
  .then(() => console.log(`Admin claim set for user: ${userId}`))
  .catch(err => console.error('Error:', err));
```

Run with: `node set-admin.js USER_UID_HERE`

**Note:** Users need to sign out and sign back in for custom claims to take effect.

## Error Codes

The function returns these error codes:

- `unauthenticated` - User must be logged in
- `resource-exhausted` - Rate limit exceeded
- `invalid-argument` - Invalid image data
- `failed-precondition` - API key not configured
- `internal` - Gemini API error

## Placeholder System

The AI prompt stored in Firestore supports two placeholders that are replaced at runtime before the prompt is sent to Gemini:

- `{{CUISINE_TYPES}}` – replaced with the configured cuisine types (one per line, prefixed with `- `)
- `{{MEAL_CATEGORIES}}` – replaced with the configured meal categories (one per line, prefixed with `- `)

This ensures the dynamic lists appear **inline** in the prompt where Gemini can clearly see them, rather than being appended at the end.

If no lists are passed by the client (e.g. when `getCustomLists` fails), sensible default lists are used as a fallback so the function always produces valid output.

The Cloud Function logs the number of items used for each placeholder:

```
Using AI prompt with replaced placeholders
Cuisine types: 10 items
Meal categories: 8 items
```

## Testing

The function is automatically tested by the frontend tests in `src/utils/aiOcrService.test.js`.

For manual testing with the emulator:

```bash
# Start emulator
firebase emulators:start --only functions

# In another terminal, test with curl
curl -X POST http://localhost:5001/YOUR_PROJECT_ID/us-central1/scanRecipeWithAI \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ID_TOKEN" \
  -d '{"data":{"imageBase64":"data:image/jpeg;base64,...","language":"de"}}'
```

## Security

- ✅ API key never exposed to frontend
- ✅ Authentication required
- ✅ Rate limiting prevents abuse
- ✅ Input validation prevents attacks
- ✅ Firestore rules protect rate limit data

## Monitoring

View function logs:

```bash
firebase functions:log
```

Or in Firebase Console:
- Functions → Dashboard → View logs

## Cost Estimation

- Firebase Functions: Free tier includes 2M invocations/month
- Gemini API: Free tier includes generous quota
- Firestore: Minimal reads/writes for rate limiting

Typical costs for moderate usage (<1000 scans/month): **$0/month**

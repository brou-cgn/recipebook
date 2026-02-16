# Firebase Cloud Functions for RecipeBook

This directory contains Firebase Cloud Functions that provide secure server-side functionality for the RecipeBook app.

## Functions

### scanRecipeWithAI

A secure proxy for Google Gemini Vision API that provides AI-powered recipe recognition.

**Features:**
- ✅ Authentication: Only logged-in users can access
- ✅ Rate limiting: 1000 scans/day for admins, 20/day for users, 5/day for guests
- ✅ Input validation: Max 5MB images, only image MIME types
- ✅ Error handling: User-friendly error messages
- ✅ Secure: API key stored as Firebase secret

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

Or use the Firebase CLI:

```bash
# Using Firebase Admin SDK in a Node.js script
node -e "
const admin = require('firebase-admin');
admin.initializeApp();
admin.auth().setCustomUserClaims('USER_UID_HERE', { admin: true })
  .then(() => console.log('Admin claim set successfully'))
  .catch(err => console.error('Error:', err));
"
```

**Note:** Users need to sign out and sign back in for custom claims to take effect.

## Error Codes

The function returns these error codes:

- `unauthenticated` - User must be logged in
- `resource-exhausted` - Rate limit exceeded
- `invalid-argument` - Invalid image data
- `failed-precondition` - API key not configured
- `internal` - Gemini API error

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

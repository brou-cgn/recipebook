/**
 * importVideo: aus index.js ausgelagert (Tech-Check F2).
 */

const {onRequest} = require('firebase-functions/v2/https');
const {onObjectFinalized} = require('firebase-functions/v2/storage');
const admin = require('firebase-admin');
const {ALLOWED_ORIGINS} = require('../shared/common');
const {finalizeImportJobBackground, failImportJobBackground, runImportFromVideoSource} = require('../shared/importJobs');
const {geminiApiKey, shortcutApiKey} = require('../shared/secrets');
const {authenticateShortcutRequest, enforceShortcutPin, enforceShortcutAiLimit} = require('../shared/shortcutAuth');

/**
 * Default Firebase Storage bucket for the broubook project.
 * Must be provided explicitly for firebase-functions v7+ storage triggers,
 * since the SDK now validates the bucket name at module load time.
 */
const STORAGE_BUCKET = 'broubook.firebasestorage.app';

/** Storage path prefix for Shortcut-uploaded Reel videos awaiting transcription. */
const VIDEO_IMPORT_STORAGE_PREFIX = 'pending-video-imports';

/**
 * Cloud Function: Issue a signed upload URL for a Shortcut-provided Reel
 * video (see docs/setup/apple-shortcut.md). This exists because Instagram's
 * anti-bot detection blocks our Puppeteer scraper (scrapeInstagramReel) from
 * a meaningful share of requests — a video the user already saved to their
 * own device sidesteps that entirely, at the cost of one extra manual step
 * (saving the video first). The video is uploaded straight to Storage via
 * the signed URL (never through this function's own request body) so a
 * multi-minute Reel doesn't run into Cloud Functions' ~32MB HTTP request
 * limit. processVideoImportUpload (Storage trigger, below) picks the file up
 * once the PUT completes and deletes it again once processing finishes.
 *
 * Input (POST JSON body): { pin, language?, audioOnly? }
 * Returns: { success: true, jobId, uploadUrl } — uploadUrl accepts a single
 * PUT with Content-Type matching what was requested (video/mp4, or
 * audio/mp4 when audioOnly is true), valid for 10 minutes. audioOnly lets
 * the Shortcut send just the extracted audio track instead of the full
 * video — only the soundtrack is ever transcribed (see
 * transcribeVideoWithGemini), so this cuts the upload size drastically for
 * Reels whose video track would otherwise blow past MAX_REEL_VIDEO_SIZE.
 */
exports.getVideoUploadUrl = onRequest(
    {
      maxInstances: 10,
      memory: '256MiB',
      timeoutSeconds: 30,
      secrets: [shortcutApiKey],
      invoker: 'public',
    },
    async (req, res) => {
      const origin = req.headers.origin;
      if (origin && ALLOWED_ORIGINS.includes(origin)) {
        res.set('Access-Control-Allow-Origin', origin);
        res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.set(
            'Access-Control-Allow-Headers',
            'Content-Type, X-Api-Key, X-User-Email',
        );
        if (req.method === 'OPTIONS') {
          res.status(204).send('');
          return;
        }
      } else if (req.method === 'OPTIONS') {
        res.status(403).send('');
        return;
      }

      if (req.method !== 'POST') {
        res.status(405).json({success: false, error: 'Method not allowed. Use POST.'});
        return;
      }

      // Shortcut authentication: API key + user email + role (see authenticateShortcutRequest)
      const auth = await authenticateShortcutRequest(req, res, 'getVideoUploadUrl');
      if (!auth) return;
      const {userId, db} = auth;

      let body = req.body;
      if (!body || (typeof body === 'object' && Object.keys(body).length === 0)) {
        try {
          const raw = req.rawBody;
          if (raw) body = JSON.parse(raw.toString('utf8'));
        } catch (_) {
          res.status(400).json({success: false, error: 'Invalid JSON body'});
          return;
        }
      }

      const {pin} = body || {};
      const language = ['de', 'en'].includes(body?.language) ? body.language : 'de';
      const caption = typeof body?.caption === 'string' ? body.caption.slice(0, 10000) : '';
      const audioOnly = body?.audioOnly === true;
      const extension = audioOnly ? 'm4a' : 'mp4';
      const contentType = audioOnly ? 'audio/mp4' : 'video/mp4';

      if (!(await enforceShortcutPin(res, userId, pin))) return;

      // The upload is transcribed with Gemini (processVideoImportUpload), so
      // issuing the URL counts against the same daily quota as the other
      // Gemini-backed Shortcut endpoints.
      if (!(await enforceShortcutAiLimit(res, auth))) return;

      try {
        const jobRef = db.collection('recipes').doc();
        const storagePath = `${VIDEO_IMPORT_STORAGE_PREFIX}/${userId}/${jobRef.id}.${extension}`;

        // importStatus is 'awaiting_upload', not 'queued' – processShortcutImportJob
        // (the Firestore trigger for the 'web' shortcut flow above) only acts on
        // importStatus:'queued' and would otherwise try to process this job before
        // any video has actually been uploaded. processVideoImportUpload picks it
        // up once the file lands in Storage instead.
        await jobRef.set({
          title: 'Rezept-Import',
          authorId: userId,
          isTemp: true,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          importStatus: 'awaiting_upload',
          importProgress: 0,
          importHeartbeatAt: Date.now(),
          importOrigin: 'shortcut',
          importSource: {type: 'video', storagePath, language, caption, mimeType: contentType},
        });

        const bucket = admin.storage().bucket();
        const [uploadUrl] = await bucket.file(storagePath).getSignedUrl({
          version: 'v4',
          action: 'write',
          expires: Date.now() + 10 * 60 * 1000,
          contentType,
        });

        console.log(`getVideoUploadUrl: issued upload URL for user ${userId}, job ${jobRef.id}`);
        res.status(200).json({success: true, jobId: jobRef.id, uploadUrl});
      } catch (err) {
        console.error(`getVideoUploadUrl: failed to prepare upload for user ${userId}:`, err);
        res.status(500).json({success: false, error: 'Video-Upload konnte nicht vorbereitet werden.'});
      }
    },
);

/**
 * Storage trigger: processes a Reel video (or, when getVideoUploadUrl issued
 * an audioOnly upload URL, just its audio track) once a Shortcut finishes
 * uploading it to the signed URL from getVideoUploadUrl (path
 * pending-video-imports/{userId}/{jobId}.mp4 or .m4a). Transcribes it and
 * runs the transcript through the normal recipe-extraction step, then
 * deletes the upload from Storage regardless of outcome — it has already
 * served its purpose and shouldn't linger (cost, and it's the user's
 * personal upload).
 */
exports.processVideoImportUpload = onObjectFinalized(
    {
      bucket: STORAGE_BUCKET,
      region: 'us-central1',
      secrets: [geminiApiKey],
      memory: '512MiB',
      timeoutSeconds: 120,
    },
    async (event) => {
      const filePath = event.data.name;
      if (!filePath || !filePath.startsWith(`${VIDEO_IMPORT_STORAGE_PREFIX}/`)) {
        return;
      }

      const match = filePath.match(
          new RegExp(`^${VIDEO_IMPORT_STORAGE_PREFIX}/([^/]+)/([^/]+)\\.(?:mp4|m4a)$`),
      );
      if (!match) {
        console.warn(`processVideoImportUpload: unexpected path ${filePath}, ignoring`);
        return;
      }
      const [, userId, jobId] = match;

      const db = admin.firestore();
      const jobRef = db.collection('recipes').doc(jobId);
      const bucket = admin.storage().bucket(event.data.bucket);
      const file = bucket.file(filePath);

      const steps = [];
      let jobData = null;
      try {
        const jobSnap = await jobRef.get();
        if (!jobSnap.exists) {
          console.warn(`processVideoImportUpload: job ${jobId} not found, discarding upload`);
          return;
        }
        jobData = jobSnap.data();
        if (jobData.importStatus !== 'awaiting_upload' || jobData.authorId !== userId) {
          // Already processed (or redriven by recoverStuckImportJobs), or a
          // path/user mismatch – don't reprocess or clobber that outcome.
          return;
        }

        await jobRef.update({
          importStatus: 'processing',
          importHeartbeatAt: Date.now(),
          importAttempts: 1,
        });

        const apiKey = geminiApiKey.value();
        if (!apiKey) {
          const error = new Error('AI service not configured. Please contact administrator.');
          error.code = 'failed-precondition';
          throw error;
        }

        const language = jobData.importSource?.language || 'de';
        const caption = jobData.importSource?.caption || '';
        const result = await runImportFromVideoSource({storagePath: filePath, language, caption}, {apiKey, steps});
        await finalizeImportJobBackground(jobId, userId, result, {steps, source: {type: 'video', storagePath: filePath}});
      } catch (error) {
        console.error(`processVideoImportUpload: job ${jobId} failed`, error);
        await failImportJobBackground(
            jobId, userId, error,
            {steps, source: jobData?.importSource || {type: 'video', storagePath: filePath}},
        );
      } finally {
        await file.delete().catch((delErr) => {
          console.warn(`processVideoImportUpload: failed to delete ${filePath}:`, delErr.message || delErr);
        });
      }
    },
);

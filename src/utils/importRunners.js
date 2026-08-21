import {
  isRecipeImportPageUrl,
  parseRecipeImportPage,
  isInstagramUrl,
  importInstagramReel,
  importRecipeFromUrl,
  captureWebsiteScreenshot,
} from './webImportService';
import { buildRecipeFromAiResult } from './ocrParser';
import { recognizeRecipeWithAI, scanRecipesWithAI } from './aiOcrService';

// Max number of images processed at the same time during a multi-image
// import/scan. Images are independent OCR calls, so processing several in
// parallel cuts total wait time roughly to (image count / concurrency)
// instead of the sum of every individual call, while staying under the
// per-user rate limit.
const BATCH_CONCURRENCY = 3;

// Runs recipe-import recognition for a single URL (web page or Instagram
// post/reel/IGTV) and returns the resulting recipe (no id yet). Passed as
// the `run` function to enqueueImportJob() from WebImportModal, and
// reconstructed identically by RecipeImportQueueContext when restarting a
// job whose importSource was persisted to Firestore.
//
// jobMeta ({jobId, authorId}), when supplied by RecipeImportQueueContext,
// lets the Cloud Function write its result directly to the queued temp
// recipe document — so the import still finishes even if this tab is
// closed before the call returns. See RecipeImportQueueContext for how
// jobMeta is threaded through.
export async function runWebImport(normalizedUrl, authorId, onProgress, jobMeta) {
  let result;

  if (isInstagramUrl(normalizedUrl)) {
    // Instagram path (post, reel, or IGTV) – extract caption and page text with Puppeteer + Gemini
    result = await importInstagramReel(normalizedUrl, onProgress, jobMeta);
  } else if (isRecipeImportPageUrl(normalizedUrl)) {
    // Direct HTML parsing path – no screenshot or AI needed
    result = await parseRecipeImportPage(normalizedUrl, onProgress, jobMeta);
  } else {
    // Multi-step import: JSON-LD → Text+Gemini → Screenshot+Vision
    result = await importRecipeFromUrl(normalizedUrl, onProgress, jobMeta);
  }

  return buildRecipeFromAiResult(result, authorId, normalizedUrl);
}

function mergeUniversalAiResults(results) {
  const validResults = results.filter(r => !r.error);
  if (validResults.length === 0) {
    throw new Error('Keine gültigen OCR-Ergebnisse gefunden');
  }

  const merged = { ...validResults[0] };

  const allIngredients = validResults.flatMap(r => r.ingredients || []);
  const seenIngredients = new Set();
  merged.ingredients = allIngredients.filter(ing => {
    const key = ing.toLowerCase().trim();
    if (seenIngredients.has(key)) return false;
    seenIngredients.add(key);
    return true;
  });

  merged.steps = validResults.flatMap(r => r.steps || []);

  const allTags = validResults.flatMap(r => r.tags || []);
  merged.tags = [...new Set(allTags)];

  const allNotes = validResults
    .map(r => r.notes)
    .filter(n => n && n.trim())
    .join('\n\n');
  merged.notes = allNotes || merged.notes;

  merged.servings = merged.servings || validResults.find(r => r.servings)?.servings;
  merged.prepTime = merged.prepTime || validResults.find(r => r.prepTime)?.prepTime;
  merged.cookTime = merged.cookTime || validResults.find(r => r.cookTime)?.cookTime;
  merged.difficulty = merged.difficulty || validResults.find(r => r.difficulty)?.difficulty;
  merged.cuisine = merged.cuisine || validResults.find(r => r.cuisine)?.cuisine;
  merged.category = merged.category || validResults.find(r => r.category)?.category;

  return merged;
}

// Runs recognition for a combination of images/text/url and returns the
// merged recipe. Passed as the `run` function to enqueueImportJob() from
// UniversalImportModal, and reconstructed identically on restart.
//
// jobMeta ({jobId, authorId}) lets the underlying Cloud Function call write
// its result directly to the queued temp recipe document, so the import
// survives this tab being closed mid-run. That's only safe when exactly one
// content leg (url XOR text XOR images) was submitted — with several legs,
// the final recipe only exists after mergeUniversalAiResults() below runs
// client-side, so soleLegMeta stays null and none of them finalize the job.
export async function runUniversalImport({ images, text, url }, onProgress, jobMeta) {
  const results = [];
  const legCount = (url.trim() ? 1 : 0) + (text.trim() ? 1 : 0) + (images.length > 0 ? 1 : 0);
  const soleLegMeta = legCount === 1 ? jobMeta : null;

  if (url.trim()) {
    const screenshotBase64 = await captureWebsiteScreenshot(url.trim(), (prog) => {
      onProgress(Math.round(prog * 0.5), 'Lade Website...');
    });
    onProgress(50, 'Analysiere Website...');
    try {
      const result = await recognizeRecipeWithAI(screenshotBase64, {
        language: 'de',
        provider: 'gemini',
        onProgress: (prog) => onProgress(50 + Math.round(prog * 0.5)),
        jobMeta: soleLegMeta,
      });
      results.push(result);
    } catch (err) {
      results.push({ error: err.message });
    }
  }

  if (text.trim()) {
    onProgress(0, 'Analysiere Text...');
    // Create a simple canvas image with the text for Gemini to extract from
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = Math.min(4000, Math.max(600, text.split('\n').length * 24 + 80));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000000';
    ctx.font = '18px Arial, sans-serif';
    const lines = text.split('\n');
    let y = 40;
    for (const line of lines) {
      const words = line.split(' ');
      let currentLine = '';
      for (const word of words) {
        const testLine = currentLine + (currentLine ? ' ' : '') + word;
        if (ctx.measureText(testLine).width > 760 && currentLine) {
          ctx.fillText(currentLine, 20, y);
          y += 26;
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) {
        ctx.fillText(currentLine, 20, y);
        y += 26;
      }
    }
    const textImageBase64 = canvas.toDataURL('image/png');
    try {
      const result = await recognizeRecipeWithAI(textImageBase64, {
        language: 'de',
        provider: 'gemini',
        onProgress: (prog) => onProgress(prog),
        jobMeta: soleLegMeta,
      });
      results.push(result);
    } catch (err) {
      results.push({ error: err.message });
    }
  }

  if (images.length === 1) {
    onProgress(0, 'Analysiere Bild...');
    try {
      const result = await recognizeRecipeWithAI(images[0], {
        language: 'de',
        provider: 'gemini',
        onProgress: (prog) => onProgress(prog),
        jobMeta: soleLegMeta,
      });
      results.push(result);
    } catch (err) {
      results.push({ error: err.message });
    }
  } else if (images.length > 1 && soleLegMeta) {
    // Sole leg, several images: run the whole batch (concurrent OCR + merge)
    // server-side in one call so it can still finalize the job if this tab
    // closes before every image finishes — see scanRecipesWithAI.
    try {
      const merged = await scanRecipesWithAI(images, 'de', onProgress, soleLegMeta);
      results.push(merged);
    } catch (err) {
      results.push({ error: err.message });
    }
  } else if (images.length > 1) {
    const imageResults = new Array(images.length);
    const progressPerImage = new Array(images.length).fill(0);

    const updateOverallProgress = () => {
      const sum = progressPerImage.reduce((a, b) => a + b, 0);
      onProgress(Math.round(sum / images.length), `Analysiere ${images.length} Bilder...`);
    };

    let nextIndex = 0;
    const processNext = async () => {
      while (nextIndex < images.length) {
        const i = nextIndex++;
        try {
          const result = await recognizeRecipeWithAI(images[i], {
            language: 'de',
            provider: 'gemini',
            onProgress: (progress) => {
              progressPerImage[i] = progress;
              updateOverallProgress();
            }
          });
          imageResults[i] = result;
        } catch (err) {
          imageResults[i] = { error: err.message };
        }
        progressPerImage[i] = 100;
        updateOverallProgress();
      }
    };

    const workerCount = Math.min(BATCH_CONCURRENCY, images.length);
    await Promise.all(Array.from({ length: workerCount }, processNext));

    results.push(...imageResults);
  }

  const merged = mergeUniversalAiResults(results);
  return buildRecipeFromAiResult(merged, '', url.trim());
}

// Runs AI OCR on a batch of images and returns the merged recipe. Passed as
// the `run` function to enqueueImportJob() from OcrScanModal, and
// reconstructed identically on restart.
//
// A single image is scanned directly so the one Cloud Function call can
// finalize the queued job (jobMeta) server-side on its own. Several images
// are handed to the scanRecipesWithAI batch function instead, which runs the
// concurrent per-image OCR and the merge server-side in one call — both
// paths survive this tab being closed before the scan finishes.
export async function runPhotoScanImport(images, language, onProgress, jobMeta) {
  if (images.length === 1) {
    const result = await recognizeRecipeWithAI(images[0], {
      language,
      provider: 'gemini',
      onProgress,
      jobMeta,
    });
    return buildRecipeFromAiResult(result);
  }

  const merged = await scanRecipesWithAI(images, language, onProgress, jobMeta);
  return buildRecipeFromAiResult(merged);
}

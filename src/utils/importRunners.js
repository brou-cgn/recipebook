import {
  isRecipeImportPageUrl,
  parseRecipeImportPage,
  isInstagramUrl,
  importInstagramReel,
  importRecipeFromUrl,
  captureWebsiteScreenshot,
} from './webImportService';
import { buildRecipeFromAiResult } from './ocrParser';
import { recognizeRecipeWithAI } from './aiOcrService';

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
export async function runWebImport(normalizedUrl, authorId, onProgress) {
  let result;

  if (isInstagramUrl(normalizedUrl)) {
    // Instagram path (post, reel, or IGTV) – extract caption and page text with Puppeteer + Gemini
    result = await importInstagramReel(normalizedUrl, onProgress);
  } else if (isRecipeImportPageUrl(normalizedUrl)) {
    // Direct HTML parsing path – no screenshot or AI needed
    result = await parseRecipeImportPage(normalizedUrl, onProgress);
  } else {
    // Multi-step import: JSON-LD → Text+Gemini → Screenshot+Vision
    result = await importRecipeFromUrl(normalizedUrl, onProgress);
  }

  return buildRecipeFromAiResult(result, authorId);
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
export async function runUniversalImport({ images, text, url }, onProgress) {
  const results = [];

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
      });
      results.push(result);
    } catch (err) {
      results.push({ error: err.message });
    }
  }

  if (images.length > 0) {
    const imageResults = new Array(images.length);
    const progressPerImage = new Array(images.length).fill(0);

    const updateOverallProgress = () => {
      const sum = progressPerImage.reduce((a, b) => a + b, 0);
      onProgress(Math.round(sum / images.length), images.length === 1 ? 'Analysiere Bild...' : `Analysiere ${images.length} Bilder...`);
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
  return buildRecipeFromAiResult(merged);
}

// Remove duplicate strings using Levenshtein similarity
function stringSimilarity(s1, s2) {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.length === 0) return 1.0;
  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(s1, s2) {
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

function removeDuplicates(items) {
  if (!items || items.length === 0) return [];
  const unique = [];
  for (const item of items) {
    const normalized = item.toLowerCase().trim();
    const isDuplicate = unique.some(existing =>
      stringSimilarity(existing.toLowerCase().trim(), normalized) > 0.8
    );
    if (!isDuplicate) {
      unique.push(item);
    }
  }
  return unique;
}

// Combine multiple per-image AI OCR results into one recipe
function mergePhotoAiResults(results) {
  const validResults = results.filter(r => !r.error);
  if (validResults.length === 0) {
    throw new Error('Keine gültigen OCR-Ergebnisse gefunden');
  }

  const merged = { ...validResults[0] };

  const allIngredients = validResults.flatMap(r => r.ingredients || []);
  merged.ingredients = removeDuplicates(allIngredients);

  const allSteps = validResults.flatMap(r => r.steps || []);
  merged.steps = removeDuplicates(allSteps);

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

// Runs AI OCR on a batch of images (concurrently, up to BATCH_CONCURRENCY at
// once) and returns the merged recipe. Passed as the `run` function to
// enqueueImportJob() from OcrScanModal, and reconstructed identically on
// restart.
export async function runPhotoScanImport(images, language, onProgress) {
  const total = images.length;
  const results = new Array(total);
  const progressPerImage = new Array(total).fill(0);

  const updateOverall = () => {
    const sum = progressPerImage.reduce((a, b) => a + b, 0);
    onProgress(Math.round(sum / total));
  };

  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < total) {
      const i = nextIndex++;
      try {
        const result = await recognizeRecipeWithAI(images[i], {
          language,
          provider: 'gemini',
          onProgress: (progress) => {
            progressPerImage[i] = progress;
            updateOverall();
          },
        });
        results[i] = result;
      } catch (err) {
        results[i] = { error: err.message };
      }
      progressPerImage[i] = 100;
      updateOverall();
    }
  };

  const workerCount = Math.min(BATCH_CONCURRENCY, total);
  await Promise.all(Array.from({ length: workerCount }, worker));

  const merged = mergePhotoAiResults(results);
  return buildRecipeFromAiResult(merged);
}

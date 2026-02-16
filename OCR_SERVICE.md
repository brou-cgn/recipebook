# OCR Service Documentation

## Overview
Client-side OCR (Optical Character Recognition) service for RecipeBook using Tesseract.js. Supports German and English text recognition with offline PWA capability.

## Features
- ✅ Client-side processing (no server required)
- ✅ Offline support in PWA mode (after initial language data load)
- ✅ German (`deu`) and English (`eng`) language support
- ✅ Progress tracking (0-100%)
- ✅ Image preprocessing (grayscale, contrast enhancement)
- ✅ Crop support via react-image-crop integration
- ✅ Automatic language detection

## Installation
Dependencies are already installed:
```bash
npm install tesseract.js react-image-crop
```

## API Reference

### `initOcrWorker(lang)`
Initialize OCR worker for specified language.

**Parameters:**
- `lang` (string): Language code - `'eng'` for English or `'deu'` for German

**Returns:** `Promise<void>`

**Example:**
```javascript
import { initOcrWorker } from './utils/ocrService';

await initOcrWorker('eng'); // Initialize English
await initOcrWorker('deu'); // Initialize German
```

### `recognizeText(imageBase64, lang, onProgress)`
Perform OCR on a base64-encoded image.

**Parameters:**
- `imageBase64` (string): Base64 encoded image (data URL)
- `lang` (string): Language code - `'eng'` or `'deu'`
- `onProgress` (function, optional): Callback function that receives progress (0-100)

**Returns:** `Promise<Object>` with:
- `text` (string): Recognized text
- `confidence` (number): Recognition confidence (0-100)
- `words` (array): Individual word details
- `lines` (array): Line details
- `paragraphs` (array): Paragraph details

**Example:**
```javascript
import { recognizeText } from './utils/ocrService';

const result = await recognizeText(
  imageBase64, 
  'eng',
  (progress) => console.log(`Progress: ${progress}%`)
);

console.log('Text:', result.text);
console.log('Confidence:', result.confidence);
```

### `recognizeTextAuto(imageBase64, onProgress)`
Automatic language detection - tries English first, then German if confidence is low.

**Parameters:**
- `imageBase64` (string): Base64 encoded image
- `onProgress` (function, optional): Progress callback

**Returns:** `Promise<Object>` with all OCR results plus:
- `detectedLanguage` (string): Detected language (`'eng'` or `'deu'`)

**Example:**
```javascript
import { recognizeTextAuto } from './utils/ocrService';

const result = await recognizeTextAuto(imageBase64);
console.log('Detected language:', result.detectedLanguage);
console.log('Text:', result.text);
```

### `preprocessImage(imageBase64)`
Preprocess image for better OCR accuracy (grayscale + contrast enhancement).

**Parameters:**
- `imageBase64` (string): Original base64 image

**Returns:** `Promise<string>` - Preprocessed base64 image

**Example:**
```javascript
import { preprocessImage } from './utils/ocrService';

const preprocessed = await preprocessImage(originalImage);
```

### `processCroppedImage(imageBase64, crop)`
Extract a cropped region from an image for OCR.

**Parameters:**
- `imageBase64` (string): Original base64 image
- `crop` (object): Crop coordinates `{x, y, width, height}`

**Returns:** `Promise<string>` - Cropped base64 image

**Example:**
```javascript
import { processCroppedImage } from './utils/ocrService';

const cropped = await processCroppedImage(imageBase64, {
  x: 10,
  y: 10,
  width: 100,
  height: 100
});
```

### `terminateWorker()`
Clean up and terminate the OCR worker to free resources.

**Returns:** `Promise<void>`

**Example:**
```javascript
import { terminateWorker } from './utils/ocrService';

await terminateWorker();
```

### `getWorkerStatus()`
Get current worker initialization status.

**Returns:** `Object` with:
- `isInitialized` (boolean): Whether worker is initialized
- `currentLanguage` (string|null): Current language or null

**Example:**
```javascript
import { getWorkerStatus } from './utils/ocrService';

const status = getWorkerStatus();
console.log('Initialized:', status.isInitialized);
console.log('Language:', status.currentLanguage);
```

## Usage Example - React Component

```javascript
import React, { useState } from 'react';
import { recognizeTextAuto, terminateWorker } from '../utils/ocrService';

function OCRDemo() {
  const [text, setText] = useState('');
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);

  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setLoading(true);
    setProgress(0);

    try {
      // Convert file to base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        const imageBase64 = e.target.result;

        // Perform OCR with auto language detection
        const result = await recognizeTextAuto(imageBase64, (p) => {
          setProgress(p);
        });

        setText(result.text);
        setLoading(false);

        // Optional: Clean up worker to free memory
        // Note: If performing multiple OCR operations, consider keeping
        // the worker alive and only terminating when component unmounts
        // await terminateWorker();
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('OCR failed:', error);
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>OCR Demo</h2>
      <input 
        type="file" 
        accept="image/*" 
        onChange={handleImageUpload}
        disabled={loading}
      />
      {loading && <div>Progress: {progress}%</div>}
      {text && (
        <div>
          <h3>Recognized Text:</h3>
          <pre>{text}</pre>
        </div>
      )}
    </div>
  );
}

export default OCRDemo;
```

## Integration with Existing Utils

The OCR service integrates with existing image utilities:

```javascript
import { fileToBase64, isValidImageSource } from './imageUtils';
import { recognizeText } from './ocrService';

// Example: OCR from uploaded file
async function performOCR(file) {
  // Convert file to base64 using existing utility
  const imageBase64 = await fileToBase64(file);
  
  // Validate image source
  if (!isValidImageSource(imageBase64)) {
    throw new Error('Invalid image');
  }
  
  // Perform OCR
  const result = await recognizeText(imageBase64, 'eng');
  return result.text;
}
```

## Performance Notes

1. **First Load:** Language data is downloaded on first use (~2-4MB per language)
2. **Offline Mode:** After first load, works completely offline in PWA mode
3. **Processing Time:** Depends on image size and complexity (typically 2-10 seconds)
4. **Image Preprocessing:** Automatically applied to improve accuracy

## Best Practices

1. **Image Quality:** Higher quality images yield better results
2. **Text Size:** Larger text is recognized more accurately
3. **Contrast:** High contrast between text and background improves recognition
4. **Worker Management:** 
   - For single OCR operation: Call `terminateWorker()` after completion
   - For multiple operations: Keep worker alive and terminate only when done with all operations
   - Component unmount: Always terminate worker in cleanup function
5. **Error Handling:** Wrap OCR calls in try-catch blocks
6. **Progress Feedback:** Use progress callbacks for better UX

## Testing

Run OCR service tests:
```bash
npm test -- --testPathPattern=ocrService
```

All 25 tests should pass, covering:
- Worker initialization
- Text recognition
- Image preprocessing
- Cropping functionality
- Language switching
- Error handling

## Troubleshooting

### Issue: Low recognition accuracy
**Solution:** 
- Ensure good image quality
- Use preprocessing function
- Try different language settings
- Crop to text region only

### Issue: Slow performance
**Solution:**
- Reduce image size before processing
- Use cropping to focus on relevant areas
- Ensure worker is initialized before batch processing

### Issue: Worker initialization fails
**Solution:**
- Check internet connection (for first load)
- Verify language code is valid (`'eng'` or `'deu'`)
- Check browser console for errors

## Browser Compatibility

Works in all modern browsers that support:
- Web Workers
- Canvas API
- FileReader API
- ES6+ JavaScript

Tested on:
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## Future Enhancements

Potential improvements:
- [ ] Additional language support (French, Spanish, etc.)
- [ ] Batch processing multiple images
- [ ] Custom preprocessing options
- [ ] OCR result caching
- [x] Text extraction optimization for recipe formats (see `ocrParser.js`)

## Recipe Parser Integration

The OCR service integrates with the recipe parser to convert recognized text into structured recipe data:

```javascript
import { recognizeText } from './utils/ocrService';
import { parseOcrText } from './utils/ocrParser';
import { parseRecipeData } from './utils/recipeImport';

async function extractRecipeFromImage(imageBase64, language = 'eng') {
  // Step 1: Perform OCR to extract text
  const ocrResult = await recognizeText(imageBase64, language);
  
  // Step 2: Parse OCR text into structured recipe data
  const lang = language === 'deu' ? 'de' : 'en';
  const recipeData = parseOcrText(ocrResult.text, lang);
  
  // Step 3: Validate and normalize recipe data
  const validatedRecipe = parseRecipeData(recipeData);
  
  return {
    recipe: validatedRecipe,
    confidence: ocrResult.confidence,
    rawText: ocrResult.text
  };
}

// Usage example:
const result = await extractRecipeFromImage(imageBase64, 'deu');
console.log('Recipe:', result.recipe);
console.log('Title:', result.recipe.title);
console.log('Ingredients:', result.recipe.ingredients);
console.log('Steps:', result.recipe.steps);
```

For more details on the recipe parser, see the `ocrParser.js` documentation.

## OCR Parser - Text Recognition Improvements

### Smart Bullet Point Handling

The OCR parser now intelligently filters out standalone bullet points that don't contain text. This prevents false step/ingredient entries from OCR artifacts.

**Example:**
```
Input OCR text:
-
200g Mehl
•
2 Eier
*

Output:
ingredients: ["200g Mehl", "2 Eier"]
```

### Intelligent Step Merging

Recipe preparation steps are now merged intelligently based on:
1. **Numbering** (1., 2., 3., etc.) - Always starts a new step
2. **Sentence Endings** (. ! ?) - Starts a new step for non-numbered lines
3. **Line Continuation** - Lines without sentence endings are merged with the current step

This reduces false step subdivisions caused by line breaks in OCR text.

**Example 1: Numbered Steps with Multiple Lines**
```
Input OCR text:
1. Den Backofen auf 180°C
Ober-/Unterhitze vorheizen.
Ein Backblech mit
Backpapier auslegen.
2. In einer Schüssel Mehl
und Zucker vermischen

Output:
steps: [
  "Den Backofen auf 180°C Ober-/Unterhitze vorheizen. Ein Backblech mit Backpapier auslegen.",
  "In einer Schüssel Mehl und Zucker vermischen"
]
```

**Example 2: Non-Numbered Steps with Sentence Endings**
```
Input OCR text:
Preheat the oven to 180°C.
Mix flour and sugar together.
Bake for 20 minutes.

Output:
steps: [
  "Preheat the oven to 180°C.",
  "Mix flour and sugar together.",
  "Bake for 20 minutes."
]
```

**Example 3: Multi-Line Steps Without Numbering or Punctuation**
```
Input OCR text:
Preheat the oven and
prepare the baking sheet
Mix all ingredients

Output:
steps: [
  "Preheat the oven and prepare the baking sheet Mix all ingredients"
]

Note: Without sentence endings or numbering, ALL lines are merged into a single step.
This is a limitation of pure text-based parsing without semantic understanding.

BEST PRACTICE: Always use proper punctuation to separate steps:

Input with periods (recommended):
Preheat the oven and prepare the baking sheet.
Mix all ingredients.

Output:
steps: [
  "Preheat the oven and prepare the baking sheet.",
  "Mix all ingredients."
]

Or use numbering:

Input with numbering (recommended):
1. Preheat the oven and prepare the baking sheet
2. Mix all ingredients

Output:
steps: [
  "Preheat the oven and prepare the baking sheet",
  "Mix all ingredients"
]
```

### Best Practices for OCR Quality

To get the best results when scanning recipes:

1. **Use Clear Images**: High contrast between text and background
2. **Good Lighting**: Avoid shadows and glare
3. **Proper Formatting**: 
   - Number your steps (1., 2., 3.)
   - End sentences with punctuation (., !, ?)
   - Use clear section headers (Zutaten, Zubereitung, Ingredients, Instructions)
4. **Crop Carefully**: Focus on the recipe text area to reduce noise
5. **Review Before Import**: Always check and edit OCR results before importing

### Supported Text Patterns

**Section Headers:**
- German: `Zutaten`, `Zubereitung`, `Anleitung`, `Schritte`
- English: `Ingredients`, `Instructions`, `Directions`, `Steps`, `Preparation`, `Method`

**List Markers:**
- Bullet points: `-`, `*`, `•`
- Numbering: `1.`, `2)`, `3.`, etc.

**Properties:**
- Servings: `Portionen: 4`, `Servings: 4`, `für 8 Personen`
- Time: `Kochdauer: 30`, `Zeit: 45`, `Time: 60`
- Difficulty: `Schwierigkeit: 3`, `Difficulty: 2`
- Cuisine: `Kulinarik: Italienisch`, `Cuisine: Italian`
- Category: `Kategorie: Hauptgericht`, `Category: Main Course`

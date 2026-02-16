# OcrScanModal Component

## Overview
The `OcrScanModal` component provides a complete OCR (Optical Character Recognition) workflow for scanning recipes from images. It supports both camera capture and file upload, with text editing capabilities.

## Features
- 📷 **Camera Capture**: Use device camera to photograph recipes (requires camera permissions)
- 📁 **File Upload**: Upload image files (JPG, PNG)
- 🌍 **Multi-language**: Support for German (Deutsch) and English
- 📊 **Progress Indicator**: Real-time OCR progress bar
- ✏️ **Text Editing**: Review and edit recognized text before importing
- 🔄 **Workflow Steps**: Upload → Scan → Edit → Import

## Usage

### Basic Integration

```jsx
import React, { useState } from 'react';
import OcrScanModal from './components/OcrScanModal';

function MyComponent() {
  const [showOcrModal, setShowOcrModal] = useState(false);

  const handleOcrImport = (recipe) => {
    console.log('Imported recipe:', recipe);
    // Process the recipe data
    // recipe contains: title, ingredients, steps, portionen, etc.
    setShowOcrModal(false);
  };

  return (
    <div>
      <button onClick={() => setShowOcrModal(true)}>
        Rezept scannen
      </button>

      {showOcrModal && (
        <OcrScanModal
          onImport={handleOcrImport}
          onCancel={() => setShowOcrModal(false)}
        />
      )}
    </div>
  );
}
```

### Integration with RecipeForm

You can integrate it alongside the existing `RecipeImportModal`:

```jsx
import RecipeImportModal from './RecipeImportModal';
import OcrScanModal from './OcrScanModal';

function RecipeForm({ onSave }) {
  const [showImportModal, setShowImportModal] = useState(false);
  const [showOcrModal, setShowOcrModal] = useState(false);

  const handleImport = (recipe) => {
    // Populate form with imported data
    setTitle(recipe.title);
    setIngredients(recipe.ingredients);
    setSteps(recipe.steps);
    // ... set other fields
    setShowImportModal(false);
    setShowOcrModal(false);
  };

  return (
    <div>
      <button onClick={() => setShowImportModal(true)}>
        Text importieren
      </button>
      <button onClick={() => setShowOcrModal(true)}>
        Rezept scannen
      </button>

      {showImportModal && (
        <RecipeImportModal
          onImport={handleImport}
          onCancel={() => setShowImportModal(false)}
        />
      )}

      {showOcrModal && (
        <OcrScanModal
          onImport={handleImport}
          onCancel={() => setShowOcrModal(false)}
        />
      )}
    </div>
  );
}
```

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `onImport` | `(recipe: Object) => void` | Yes | Callback function called when user accepts the OCR result. Receives parsed recipe object. |
| `onCancel` | `() => void` | Yes | Callback function called when user cancels the modal. |

## Recipe Object Structure

The `onImport` callback receives a recipe object with the following structure:

```javascript
{
  title: string,           // Recipe title
  image: string,           // Base64 image (empty string)
  portionen: number,       // Number of servings (default: 4)
  kulinarik: Array,        // Cuisine types (empty array)
  schwierigkeit: number,   // Difficulty level 1-5 (default: 3)
  kochdauer: number,       // Cooking time in minutes (default: 30)
  speisekategorie: string, // Meal category (empty string)
  ingredients: Array,      // List of ingredients
  steps: Array            // List of preparation steps
}
```

## Workflow Steps

1. **Upload Step**
   - User can start camera or upload file
   - Camera requires browser permission
   - Accepts JPG and PNG files
   - Language selection (German/English)

2. **Scan Step**
   - OCR processing with Tesseract.js
   - Progress bar shows completion percentage
   - Automatic transition to edit step

3. **Edit Step**
   - Displays recognized text in editable textarea
   - User can correct OCR errors
   - Option to start new scan
   - "Übernehmen" (Accept) button parses text into recipe

## Dependencies

The component relies on these packages (already included in package.json):
- `tesseract.js` - OCR processing

And these utility modules:
- `../utils/ocrService` - OCR worker management
- `../utils/ocrParser` - Text parsing into recipe structure
- `../utils/imageUtils` - Image file handling

## Browser Compatibility

- **Camera**: Requires `getUserMedia` API support
  - Modern browsers (Chrome, Firefox, Safari, Edge)
  - HTTPS required for camera access
  - Mobile devices: works on both iOS and Android

- **File Upload**: Works in all modern browsers

## Mobile Considerations

- Camera access defaults to rear camera (`facingMode: 'environment'`)
- Responsive design adapts to mobile screens
- Tested on iOS Safari and Chrome Android

## Performance Notes

- OCR processing is done client-side (no server required)
- First OCR run downloads language data (~2-4MB per language)
- Language data is cached for offline use
- Processing time depends on image size and device performance
- Image preprocessing improves OCR accuracy

## Styling

The component uses `OcrScanModal.css` which follows the same design patterns as `RecipeImportModal.css`:
- Modal overlay with centered content
- Responsive design for mobile and desktop
- Consistent button styles
- Progress indicators
- Error message displays

## Testing

The component includes comprehensive tests in `OcrScanModal.test.js`:
- Modal rendering
- Camera and file upload workflows
- Language selection
- OCR processing
- Text editing
- Error handling

Run tests with:
```bash
npm test OcrScanModal.test.js
```

## Example Use Cases

1. **Cookbook Scanning**: Scan recipes from physical cookbooks
2. **Recipe Cards**: Digitize handwritten recipe cards
3. **Magazine Recipes**: Extract recipes from food magazines
4. **Screen Captures**: Import recipes from screenshots

## Troubleshooting

**Camera not working?**
- Check browser permissions
- Ensure HTTPS connection (required for camera API)
- Try file upload instead

**OCR not accurate?**
- Ensure good lighting and image quality
- Edit recognized text before importing
- Try different language setting

**Text parsing issues?**
- Review and edit the OCR text before importing
- The parser looks for sections: "Zutaten"/"Ingredients" and "Zubereitung"/"Instructions"
- Ensure recipe follows a standard format

## Future Enhancements

Potential improvements for future versions:
- Auto-rotate image detection
- Image quality enhancement filters
- Batch scanning multiple recipes
- Recipe template selection
- Export original image with recipe
- History of scanned recipes

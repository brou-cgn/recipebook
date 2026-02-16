# OCR Classification and Validation - User Guide

## Overview

The OCR process has been enhanced with automatic classification and validation features. These improvements help ensure higher quality recipe recognition by:

1. **Automatic Classification**: Intelligently identifies whether text should be ingredients or preparation steps
2. **Validation**: Checks if key recipe components are properly recognized
3. **User Feedback**: Provides clear warnings and suggestions for improving recognition quality

## Key Features

### 1. Automatic Text Classification

The system can automatically classify text into ingredients or preparation steps when section headers are missing or unclear.

**How it works:**
- Detects quantities and units (200g, 2 EL, 1 cup) → likely ingredient
- Detects action verbs (mischen, kochen, mix, bake) → likely preparation step
- Uses keyword matching for common food items and cooking equipment
- Supports German and English recipes

**Example:**
```
Input text without headers:
200g Mehl
2 Eier
Mehl und Eier vermengen
In den Ofen geben

Result:
Ingredients: ["200g Mehl", "2 Eier"]
Steps: ["Mehl und Eier vermengen", "In den Ofen geben"]
```

### 2. Validation and Quality Checking

Every OCR result is automatically validated to check if essential recipe components were detected:

**Checked Components:**
- ✓ Recipe title
- ✓ Cuisine type (Kulinarik)
- ✓ Number of servings (Portionen)
- ✓ Cooking time (Zubereitungsdauer)
- ✓ Ingredients list
- ✓ Preparation steps

**Quality Score:**
- **85-100%**: Excellent - All components detected
- **70-84%**: Good - Most components detected
- **50-69%**: Moderate - Some components missing
- **Below 50%**: Poor - Many components missing

### 3. Visual Feedback in UI

When scanning a recipe, you'll see:

**Color-Coded Quality Indicators:**
- 🟢 **Green**: High quality (85%+) - all good!
- 🟡 **Yellow**: Moderate quality (50-84%) - some warnings
- 🔴 **Red**: Low quality (<50%) - needs attention

**Warnings and Suggestions:**
The system provides specific feedback about missing components:
```
⚠️ Hinweise:
• Portionenanzahl nicht erkannt (Standard: 4 verwendet)
• Kulinarik nicht erkannt

💡 Verbesserungsvorschläge:
• Fügen Sie eine Zeile hinzu wie "Portionen: 4" oder "für 4 Personen"
• Fügen Sie eine Zeile hinzu wie "Kulinarik: Italienisch"
```

## Usage Examples

### Basic Recipe Scanning

1. **Upload or photograph** a recipe
2. **Crop** the image (optional)
3. **Scan** - the OCR will recognize the text
4. **Review** the validation feedback
5. **Edit** if needed
6. **Import** the recipe

### Handling Low Quality Results

If you see a red validation warning:

1. **Review the warnings** to understand what's missing
2. **Edit the text** to add missing information
3. **Re-scan** with better image quality if needed
4. **Force import** if you want to proceed anyway (click "Trotzdem übernehmen")

### Best Practices for Better Recognition

**Image Quality:**
- Use good lighting
- Ensure text is clearly visible
- Hold camera steady
- Use high resolution images

**Recipe Format:**
- Include section headers ("Zutaten", "Zubereitung")
- List quantities with units (200g, 2 EL, 1 cup)
- Use numbered or bulleted lists
- Include metadata (Portionen: 4, Zeit: 30 Min)

**Example of Well-Formatted Recipe:**
```
Spaghetti Carbonara

Portionen: 4
Kochdauer: 30
Kulinarik: Italienisch

Zutaten:
- 400g Spaghetti
- 200g Pancetta
- 4 Eier
- 100g Parmesan

Zubereitung:
1. Nudeln in Salzwasser kochen
2. Pancetta in einer Pfanne anbraten
3. Eier mit Parmesan verquirlen
4. Nudeln abgießen und mit Pancetta mischen
5. Ei-Mischung unterrühren
```

## Technical Details

### For Developers

The OCR system consists of three main utilities:

1. **ocrValidation.js**
   - `validateOcrResult(recipe)` - Validates a parsed recipe
   - `getValidationSummary(validation, lang)` - Generates human-readable summary
   - `isValidationAcceptable(validation, minScore)` - Checks if quality meets threshold

2. **ocrClassifier.js**
   - `classifyLine(line, lang)` - Classifies a single line
   - `classifyText(lines, lang)` - Classifies multiple lines
   - `autoClassifyText(text, lang)` - Auto-classifies full text

3. **ocrParser.js** (Enhanced)
   - `parseOcrText(text, lang)` - Basic parsing
   - `parseOcrTextWithValidation(text, lang)` - Parsing + validation
   - `parseOcrTextWithClassification(text, lang)` - Parsing + auto-classification
   - `parseOcrTextSmart(text, lang)` - Recommended: combines all features

### Code Example

```javascript
import { parseOcrTextSmart } from './utils/ocrParser';

// Parse OCR text with validation
const result = parseOcrTextSmart(ocrText, 'de');

// Check validation
if (result.validation.score < 70) {
  console.log('Quality warnings:', result.validation.warnings);
  console.log('Suggestions:', result.validation.suggestions);
}

// Use the recipe
const recipe = result.recipe;
```

## Multilingual Support

The system supports both German and English:

**German Keywords:**
- Zutaten, Zubereitung, Portionen, Kochdauer, Kulinarik
- Mehl, Zucker, Eier, Butter, etc.
- mischen, kochen, backen, etc.

**English Keywords:**
- Ingredients, Instructions, Servings, Time, Cuisine
- flour, sugar, eggs, butter, etc.
- mix, cook, bake, etc.

## Troubleshooting

**Q: The system didn't detect my ingredients section**
A: Try adding a clear "Zutaten:" or "Ingredients:" header

**Q: Some ingredients are classified as steps**
A: Ensure ingredients include quantities (200g, 2 cups) - this helps classification

**Q: The validation score is low despite good OCR**
A: Add missing metadata like Portionen, Kochdauer, Kulinarik to improve the score

**Q: Can I import despite low quality?**
A: Yes! Click "Trotzdem übernehmen" to force import, then edit manually

## Future Enhancements

Potential improvements being considered:
- AI-powered classification using machine learning
- Image quality pre-check before scanning
- Automatic recipe correction suggestions
- Support for more languages
- OCR confidence scoring per field

## Feedback

If you encounter issues or have suggestions for improvement, please report them in the issue tracker.

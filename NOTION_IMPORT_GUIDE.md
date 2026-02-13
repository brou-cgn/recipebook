# Notion Recipe Import Guide

This guide explains how to import recipes from Notion into RecipeBook.

## Overview

RecipeBook now supports importing recipes directly from Notion in multiple formats:

- **Notion Markdown Export** (recommended)
- **JSON format**
- **CSV format** (for Notion database exports)

The import feature automatically detects the format and parses the recipe structure.

## Supported Formats

### 1. Notion Markdown Export (Recommended)

This is the easiest and most reliable method.

#### How to Export from Notion:

1. Open your recipe in Notion
2. Click the "..." menu (top right)
3. Select "Export"
4. Choose "Markdown & CSV"
5. Download the export
6. Open the `.md` file in a text editor
7. Copy the entire content
8. Paste it into the RecipeBook import dialog

#### Example Notion Markdown Structure:

```markdown
# Pizza Bianco al Tartufo

**Portionen:** 4
**Kulinarik:** Italienisch
**Schwierigkeit:** 3
**Kochdauer:** 45 Minuten
**Speisekategorie:** Hauptgericht

## Zutaten

- 500g Pizzateig
- 200g Mozzarella
- 100g Ricotta
- 50g Parmesan
- 2 EL Trüffelöl
- Salz, Pfeffer

## Zubereitung

1. Ofen auf 250°C vorheizen
2. Pizzateig ausrollen
3. Mozzarella, Ricotta und Parmesan verteilen
4. Mit Salz und Pfeffer würzen
5. 10-12 Minuten backen
6. Mit Trüffelöl beträufeln und servieren
```

### 2. JSON Format

For programmatic imports or if you prefer structured data.

#### Example JSON Structure:

```json
{
  "title": "Pizza Bianco al Tartufo",
  "portionen": 4,
  "kulinarik": ["Italienisch"],
  "schwierigkeit": 3,
  "kochdauer": 45,
  "speisekategorie": "Hauptgericht",
  "ingredients": [
    "500g Pizzateig",
    "200g Mozzarella",
    "100g Ricotta",
    "50g Parmesan",
    "2 EL Trüffelöl",
    "Salz, Pfeffer"
  ],
  "steps": [
    "Ofen auf 250°C vorheizen",
    "Pizzateig ausrollen",
    "Mozzarella, Ricotta und Parmesan verteilen",
    "Mit Salz und Pfeffer würzen",
    "10-12 Minuten backen",
    "Mit Trüffelöl beträufeln und servieren"
  ]
}
```

### 3. CSV Format

For Notion database exports.

#### Example CSV:

```csv
Name,Portionen,Kulinarik,Schwierigkeit,Kochdauer,Speisekategorie
Pizza Bianco al Tartufo,4,Italienisch,3,45,Hauptgericht
```

Note: CSV format only supports metadata. You'll need to add ingredients and steps separately.

## Supported Fields

The parser recognizes these field names (in both German and English):

### Recipe Metadata

| Field | Aliases | Description | Type |
|-------|---------|-------------|------|
| **title** | name, rezept | Recipe name | string |
| **portionen** | servings, portions | Number of servings | number (default: 4) |
| **kulinarik** | cuisine, küche | Cuisine type(s) | string or array |
| **schwierigkeit** | difficulty | Difficulty level | number 1-5 (default: 3) |
| **kochdauer** | cookingTime, zeit, time | Cooking time in minutes | number (default: 30) |
| **speisekategorie** | category, type, kategorie | Meal category | string |
| **image** | foto, photo, bild | Image URL | string |

### Recipe Content

| Field | Aliases | Description |
|-------|---------|-------------|
| **ingredients** | zutaten, ingredienti | List of ingredients |
| **steps** | schritte, zubereitung, instructions, directions | Preparation steps |

## Structuring Your Notion Recipe

### Best Practices

1. **Use a clear title** as the first heading (# Title)
2. **Use properties** for metadata (Portionen, Kulinarik, etc.)
3. **Use section headings** for ingredients and steps:
   - `## Zutaten` or `## Ingredients`
   - `## Zubereitung` or `## Instructions`
4. **Use bullet lists** (-) for ingredients
5. **Use numbered lists** (1., 2., 3.) for steps

### Supported Section Headings

The parser recognizes these section headings (case-insensitive):

**For Ingredients:**
- Zutaten (German)
- Ingredients (English)
- Ingredienti (Italian)
- Ingrédients (French)

**For Steps:**
- Zubereitung (German)
- Anleitung (German)
- Schritte (German)
- Steps (English)
- Instructions (English)
- Directions (English)
- Preparation (English)

## Property Formats

### Multiple Values (Kulinarik)

You can specify multiple cuisine types:

```markdown
**Kulinarik:** Italienisch, Mediterran
```

Or in JSON:
```json
"kulinarik": ["Italienisch", "Mediterran"]
```

### Cooking Time

The parser extracts numbers from time fields:

```markdown
**Kochdauer:** 45 Minuten
```

becomes: `kochdauer: 45`

### Difficulty Levels

Difficulty is clamped to the range 1-5:
- 1 = Very Easy
- 2 = Easy
- 3 = Medium (default)
- 4 = Hard
- 5 = Very Hard

### Image URLs

You can provide image URLs in various formats:

```markdown
**Bild:** https://example.com/image.jpg
```

Or Markdown image syntax:
```markdown
**Image:** ![Alt text](https://example.com/image.jpg)
```

## Import Process

1. **Navigate** to the recipe form (click "Add Recipe")
2. **Click** the "📥 Importieren" button
3. **Paste** your Notion content (Markdown, JSON, or CSV)
4. **Click** "Importieren"
5. **Review** the imported data in the form
6. **Edit** if needed
7. **Save** the recipe

## Troubleshooting

### Missing Ingredients or Steps

**Problem:** Recipe imports but ingredients or steps are empty.

**Solution:** 
- Check that you're using recognized section headings (see list above)
- Make sure ingredients are in a bullet list (- or *)
- Make sure steps are in a numbered list (1., 2., 3.) or bullet list

### Title Not Detected

**Problem:** Recipe title is missing after import.

**Solution:**
- Make sure the first line starts with `# Title`
- Or include `Name: Recipe Title` in your properties

### Metadata Not Parsed

**Problem:** Portionen, Schwierigkeit, etc. are not imported correctly.

**Solution:**
- Use the format: `**Property:** Value` or `Property: Value`
- Check spelling (use German or English names from the table above)
- For tables, ensure headers match supported field names

### Format Not Recognized

**Problem:** "Format konnte nicht erkannt werden" error.

**Solution:**
- JSON must start with `{` or `[`
- Markdown must contain `#` headings or `:` properties
- CSV must have comma-separated headers and values

## Advanced: Table Format

Notion database exports can include tables:

```markdown
| Property | Value |
|----------|-------|
| Portionen | 4 |
| Schwierigkeit | 3 |
| Kochdauer | 45 |
```

The parser will extract these properties automatically.

## Example Workflow

### From Notion to RecipeBook:

1. **In Notion**, create a recipe with this structure:
   ```
   # My Amazing Recipe
   
   Portionen: 4
   Schwierigkeit: 3
   
   ## Zutaten
   - Ingredient 1
   - Ingredient 2
   
   ## Zubereitung
   1. Step 1
   2. Step 2
   ```

2. **Copy** the entire page content (Ctrl+A, Ctrl+C)

3. **In RecipeBook**:
   - Click "Add Recipe"
   - Click "📥 Importieren"
   - Paste the content
   - Click "Importieren"

4. **Done!** The recipe is now imported and ready to save.

## Limitations

- Direct URL import from Notion is not yet supported
- CSV format requires ingredients/steps to be added separately
- Complex Notion features (databases, linked pages) are not fully supported
- Images must be provided as URLs (embedded images need to be uploaded separately)

## Future Enhancements

Planned improvements:
- Direct Notion API integration
- Support for Notion databases with linked recipes
- Automatic image download from Notion
- Bulk import of multiple recipes

## Questions?

If you encounter issues or have suggestions, please open an issue on the GitHub repository.

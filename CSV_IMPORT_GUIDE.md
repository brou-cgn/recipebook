# CSV Import Feature

## Overview

The CSV import feature allows users to import multiple recipes at once from a CSV file. This is useful for bulk importing recipes from spreadsheets or other sources.

## How to Use

1. Navigate to "Neues Rezept" (New Recipe) form
2. Click the "Import" button
3. In the import dialog, click on "📄 CSV-Datei hochladen (Bulk-Import)"
4. Select your CSV file
5. Review the preview showing how many recipes were found
6. Click "Importieren" to complete the import
7. All recipes will be imported and marked as private

## CSV Format

### Required Columns

- **Name**: Recipe title (required)
- **Zutat1** to **Zutat31**: Ingredients (at least one required)
- **Zubereitungsschritt1** to **Zubereitungsschritt27**: Preparation steps (at least one required)

### Optional Columns

- **Erstellt am**: Creation date (format: YYYY-MM-DD)
- **Erstellt von**: Author name
- **Kulinarik**: Cuisine types (comma-separated, e.g., "Italienisch,Klassisch")
- **Speisenkategorie**: Meal categories (comma-separated, e.g., "Hauptgericht,Vegetarisch")
- **Portionen**: Portion size with unit (e.g., "4 Portionen", "6 Personen")
- **Zubereitung**: Cooking time in minutes
- **Schwierigkeit**: Difficulty level (1-5 stars)

### Special Formatting

#### Headers for Ingredients and Steps

Items starting with `###` are treated as section headers:

```csv
Zutat1,Zutat2,Zutat3
###Teig,500g Mehl,200ml Wasser
```

This creates:
- A heading "Teig"
- Regular ingredients "500g Mehl" and "200ml Wasser"

Same applies to preparation steps.

## Example CSV

**Comma-delimited example:**

```csv
Name,Erstellt am,Erstellt von,Kulinarik,Speisenkategorie,Portionen,Zubereitung,Schwierigkeit,Zutat1,Zutat2,Zutat3,Zubereitungsschritt1,Zubereitungsschritt2
Spaghetti Carbonara,2024-01-15,Max Mustermann,"Italienisch,Klassisch",Hauptgericht,4 Portionen,30,3,400g Spaghetti,200g Speck,4 Eier,Nudeln kochen,Sauce zubereiten
Pizza Margherita,2024-01-16,Anna Müller,Italienisch,"Hauptgericht,Vegetarisch",2 Portionen,25,2,###Teig,300g Mehl,Hefe,Teig zubereiten,Backen
```

**Semicolon-delimited example:**

```csv
Name;Erstellt am;Erstellt von;Kulinarik;Speisenkategorie;Portionen;Zubereitung;Schwierigkeit;Zutat1;Zutat2;Zutat3;Zubereitungsschritt1;Zubereitungsschritt2
Spaghetti Carbonara;2024-01-15;Max Mustermann;Italienisch, Klassisch;Hauptgericht;4 Portionen;30;3;400g Spaghetti;200g Speck;4 Eier;Nudeln kochen;Sauce zubereiten
Pizza Margherita;2024-01-16;Anna Müller;Italienisch;Hauptgericht, Vegetarisch;2 Portionen;25;2;###Teig;300g Mehl;Hefe;Teig zubereiten;Backen
```

## Field Mapping

| CSV Column | Recipe Field | Type | Notes |
|------------|--------------|------|-------|
| Name | title | String | Required |
| Erstellt am | createdAtStr | String | Stored as string for reference |
| Erstellt von | authorName | String | Stored for reference; actual authorId is current user |
| Kulinarik | kulinarik | Array | Split by comma |
| Speisenkategorie | speisekategorie | Array | Split by comma |
| Portionen | portionen, portionUnitId | Number, String | Parsed to extract number and unit |
| Zubereitung | kochdauer | Number | In minutes |
| Schwierigkeit | schwierigkeit | Number | 1-5 range |
| Zutat1-31 | ingredients | Array | Objects with {type, text} |
| Zubereitungsschritt1-27 | steps | Array | Objects with {type, text} |

## Privacy

All recipes imported via CSV are automatically marked as **private** (`isPrivate: true`). This ensures that bulk imports don't accidentally expose personal recipes.

## Error Handling

- If some recipes in the CSV file fail to import, the import will continue with the valid recipes
- A summary will show how many recipes succeeded and which ones failed
- Failed recipes will display the recipe title and error message
- Common errors:
  - Missing recipe name
  - No ingredients
  - No preparation steps
  - Invalid CSV format

## Technical Details

- **File Format**: CSV (`.csv` extension)
- **Character Encoding**: UTF-8 recommended (UTF-8 BOM is automatically detected and removed)
- **Delimiter Support**: Both comma (`,`) and semicolon (`;`) delimiters are supported with automatic detection
- **Quote Handling**: Supports quoted values for fields containing delimiters
- **Escape Sequences**: Supports `""` for literal quotes within quoted fields
- **Maximum Fields**: 31 ingredients, 27 preparation steps
- **Validation**: Validates file extension and MIME type before processing
- **Step Numbering**: Automatic numbering (e.g., "1. ", "2) ", "3 - ") is automatically stripped from preparation steps during import
- **Category Images**: If category images are configured in settings, they will be automatically applied to recipes based on their meal category

### Delimiter Detection

The CSV parser automatically detects whether your file uses commas or semicolons as delimiters by analyzing the header row. This means you can use either format:

**Comma-delimited CSV:**
```csv
Name,Portionen,Zutat1,Zubereitungsschritt1
Spaghetti Carbonara,4,400g Spaghetti,Nudeln kochen
```

**Semicolon-delimited CSV:**
```csv
Name;Portionen;Zutat1;Zubereitungsschritt1
Spaghetti Carbonara;4;400g Spaghetti;Nudeln kochen
```

**Note**: When using comma-separated values within fields (e.g., for Kulinarik or Speisenkategorie), commas are always used to separate multiple values, regardless of the main CSV delimiter:

```csv
Name;Kulinarik;Zutat1;Zubereitungsschritt1
Pizza Margherita;"Italienisch, Vegetarisch";300g Mehl;Teig zubereiten
```

## Implementation Files

- **Parser**: `src/utils/csvBulkImport.js`
- **Tests**: `src/utils/csvBulkImport.test.js`
- **UI Component**: `src/components/RecipeImportModal.js`
- **Handler**: `src/App.js` - `handleBulkImportRecipes()`

# Scripts Directory

This directory contains utility scripts for managing recipe data.

## updateRecipeCreationDates.js

Script to update recipe creation dates in Firestore based on the `ImportDatum.csv` file.

**Usage:**
```bash
node scripts/updateRecipeCreationDates.js
```

**Prerequisites:**
- Firebase service account key (`serviceAccountKey.json`) in the root directory
- `ImportDatum.csv` file in the root directory

See [IMPORTDATUM_GUIDE.md](../IMPORTDATUM_GUIDE.md) for detailed instructions.

## csvParser.js

Pure JavaScript module for parsing the `ImportDatum.csv` file. Used by `updateRecipeCreationDates.js`.

**Features:**
- Parses semicolon-separated CSV files
- Validates German date format (DD.MM.YYYY)
- Skips invalid entries
- No external dependencies

**Exports:**
- `parseCSV(filePath)` - Parse CSV file and return array of recipe data

## migrateNutritionReferenceApprovedAt.js

One-time migration for `nutritionReferences`: sets `approvedAt` for entries with status `Freigegeben` where the field is still missing.

**Usage:**
```bash
node scripts/migrateNutritionReferenceApprovedAt.js [--dry-run]
```

## audit-functions-invoker.sh

Auditiert Gen2 Functions, zugehörige Cloud-Run-Services und `roles/run.invoker` Bindings.

**Usage:**
```bash
./scripts/audit-functions-invoker.sh <PROJECT_ID> [REGION]
```

## fix-callable-invoker.sh

Nicht-destruktiver IAM-Fix für callable (`onCall`) Functions in Gen2.
Ergänzt fehlende Invoker-Principal(s), ohne bestehende Bindings zu löschen.

**Usage:**
```bash
./scripts/fix-callable-invoker.sh <PROJECT_ID> [REGION] [FUNCTIONS|all-callables]
```

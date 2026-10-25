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

See [IMPORTDATUM_GUIDE.md](../docs/archive/IMPORTDATUM_GUIDE.md) for detailed instructions.

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

## migrateRemoveIsAdmin.js

One-time migration: removes the legacy `isAdmin` field from all `users` documents. `role == 'admin'` is the only admin marker. Must run **before** deploying the functions and rules that no longer read `isAdmin`. Users with `isAdmin: true` but another role are listed; they are only promoted with `--promote-legacy-admins`.

**Usage:**
```bash
node scripts/migrateRemoveIsAdmin.js                 # dry run
node scripts/migrateRemoveIsAdmin.js --apply         # remove the field
node scripts/migrateRemoveIsAdmin.js --apply --promote-legacy-admins
```

## audit-functions-invoker.sh

Auditiert Gen2 Functions, zugehörige Cloud-Run-Services und `roles/run.invoker` Bindings.
Wertet zusätzlich die Annotation `run.googleapis.com/invoker-iam-disabled` aus und meldet je Service, ob er öffentlich erreichbar ist (`allUsers` oder Prüfung abgeschaltet). Services ohne beides liefern bei Browser-Aufrufen 403. Der Hinweis ist zugleich die Warnung, dass Callables auch ohne `allUsers` öffentlich sein können, wenn die Prüfung abgeschaltet ist.

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

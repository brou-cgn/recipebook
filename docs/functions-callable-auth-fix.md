# Callable Functions (Gen2): 401 "access token could not be verified" beheben

## Symptom / Root Cause

Bei Aufrufen von Firebase `httpsCallable(...)` auf Gen2 Functions (z. B. `scanRecipeWithAI`) kann ein HTTP 401 auftreten:

- `The request was not authorized to invoke this service.`
- `The access token could not be verified.`

Das ist typischerweise **kein OCR-/Gemini-Inhaltsfehler**, sondern ein **Invoker/IAM-Setup-Problem** am zugrunde liegenden Cloud-Run-Service.

## Wichtig: `onRequest` vs `onCall`

- `onRequest`:
  - klassischer HTTP-Endpunkt
  - für öffentliche Endpunkte kann `allUsers` + `roles/run.invoker` korrekt sein
- `onCall`:
  - wird über Firebase SDK + Callable-Protokoll aufgerufen
  - **nicht pauschal** mit `allUsers` öffnen
  - benötigt funktionierende Firebase/Functions-Service-Principal-Berechtigungen auf Cloud Run

Darum ist `allUsers` für `onCall` **nicht** der Standard-Fix.

## Diagnose

1. Gen2 Functions + Cloud Run + Invoker prüfen:

```bash
./scripts/audit-functions-invoker.sh <PROJECT_ID> [REGION]
```

2. Für betroffene callable Function (`scanRecipeWithAI`) prüfen:
- existiert der zugehörige Cloud-Run-Service?
- enthält `roles/run.invoker` die erwarteten Service-Principal(s)?

## Fix anwenden (nicht-destruktiv)

Für `scanRecipeWithAI`:

```bash
./scripts/fix-callable-invoker.sh <PROJECT_ID> [REGION]
```

Für mehrere callable Functions:

```bash
./scripts/fix-callable-invoker.sh <PROJECT_ID> [REGION] scanRecipeWithAI,processHtmlWithAI
```

Für alle in `functions/index.js` gefundenen `onCall` Exports:

```bash
./scripts/fix-callable-invoker.sh <PROJECT_ID> [REGION] all-callables
```

### Was das Script macht

- liest aktuelle IAM-Policy je Service
- ergänzt fehlende `roles/run.invoker`-Bindings für erwartete Firebase/Functions-Service-Principal(s)
- entfernt **keine** bestehenden Bindings (idempotent, nicht-destruktiv)

Standardmäßig ergänzt es:

- `serviceAccount:service-<PROJECT_NUMBER>@gcf-admin-robot.iam.gserviceaccount.com`
- `serviceAccount:service-<PROJECT_NUMBER>@gcp-sa-cloudfunctions.iam.gserviceaccount.com`

Optional zusätzliche Principal(s):

```bash
EXTRA_INVOKER_MEMBERS='serviceAccount:...,...' ./scripts/fix-callable-invoker.sh <PROJECT_ID>
```

## Verifikation

1. IAM erneut auditieren:

```bash
./scripts/audit-functions-invoker.sh <PROJECT_ID> [REGION]
```

2. Frontend testen:
- OCR-Scan über `httpsCallable(functions, 'scanRecipeWithAI')`
- Erwartung: kein 401 "access token could not be verified"

3. Bei Fehlern im Frontend prüfen, ob klare Auth-/Invoker-Meldung statt generischem `internal` erscheint.

## Rollback

Da das Fix-Script nur ergänzt, ist Rollback selektiv:

```bash
gcloud run services remove-iam-policy-binding <SERVICE_NAME> \
  --region <REGION> \
  --project <PROJECT_ID> \
  --member='serviceAccount:service-<PROJECT_NUMBER>@gcf-admin-robot.iam.gserviceaccount.com' \
  --role='roles/run.invoker'

gcloud run services remove-iam-policy-binding <SERVICE_NAME> \
  --region <REGION> \
  --project <PROJECT_ID> \
  --member='serviceAccount:service-<PROJECT_NUMBER>@gcp-sa-cloudfunctions.iam.gserviceaccount.com' \
  --role='roles/run.invoker'
```

Danach erneut auditieren und callable Verhalten validieren.

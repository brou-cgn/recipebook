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

## Realer Vorfall: `fetchRecipeHtml` (31.08.2026)

Der nächtliche `dailyAiImporterTest` meldete für `fetchRecipeHtml` denselben 401
(„The request was not authorized to invoke this service. The access token
could not be verified."), sichtbar im Log-Explorer als `POST 401  0 ms` mit
`0 ms` Dauer — d. h. der Request wurde von Cloud Run abgewiesen, bevor er den
Funktionscode überhaupt erreichte.

**Wichtige Erkenntnis:** Der oben beschriebene Fix mit `fix-callable-invoker.sh`
(ergänzt nur `gcf-admin-robot` + `gcp-sa-cloudfunctions` als
`roles/run.invoker`-Members) hat **allein nicht ausgereicht**. Erst der
Vergleich mit einer funktionierenden Funktion (`scanRecipeWithAI`) zeigte den
eigentlichen Unterschied: `scanRecipeWithAI` trug die Annotation
`run.googleapis.com/invoker-iam-disabled: 'true'` auf dem Cloud-Run-Service —
`fetchRecipeHtml` nicht. Dieses Flag schaltet die IAM-Invoker-Prüfung für den
Service komplett ab (echter „public access", keine Header-Validierung mehr);
ohne dieses Flag prüft Cloud Run den `Authorization`-Header weiterhin als
IAM-Token, und ein Firebase-ID-Token besteht diese Prüfung nie — unabhängig
davon, welche einzelnen Service-Accounts als Invoker eingetragen sind.

Der Befehl, der das Problem tatsächlich behoben hat:

```bash
gcloud functions add-invoker-policy-binding fetchRecipeHtml \
  --gen2 \
  --region=us-central1 \
  --project=<PROJECT_ID> \
  --member=allUsers
```

Das setzt `allUsers` als `roles/run.invoker`-Member (sichtbar in
`gcloud run services get-iam-policy`). Zur Kontrolle, ob eine Funktion aktuell
öffentlich ist, per Annotation prüfen:

```bash
gcloud run services describe <SERVICE_NAME> \
  --region=<REGION> --project=<PROJECT_ID> \
  --format="value(metadata.annotations['run.googleapis.com/invoker-iam-disabled'])"
```

**Nach dem Setzen von `allUsers` kann es mehrere Minuten dauern**, bis die
Änderung an der tatsächlich prüfenden Ebene (Google Front End) ankommt — ein
sofortiger erneuter Testlauf kann fälschlich noch denselben 401 zeigen. Vor
weiterer Fehlersuche 3–5 Minuten warten und erneut testen.

**Empfehlung:** Bei künftigen 401-„access token could not be verified"-Fällen
zuerst `gcloud functions add-invoker-policy-binding <NAME> --gen2 --member=allUsers`
probieren (offizieller Cloud-Functions-Gen2-Befehl für öffentliche
HTTP-Functions) statt nur `fix-callable-invoker.sh` — Letzteres ergänzt zwar
nützliche Service-Account-Bindings, deckt aber nicht zwangsläufig den Fall ab,
in dem der Funktion schlicht die public-invoker-Freigabe fehlt.

Test jederzeit manuell anstoßbar, ohne auf 6 Uhr zu warten:

```bash
gcloud scheduler jobs run firebase-schedule-dailyAiImporterTest-us-central1 \
  --project=<PROJECT_ID> --location=<REGION>
```

Ergebnis kommt wie gewohnt per E-Mail an die Admin-Adressen.

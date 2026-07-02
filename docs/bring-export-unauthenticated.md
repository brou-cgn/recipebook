# Bring!-Export: 403 unauthenticated beheben

## Problemursache

Der Endpoint `/bring-export` wird aus dem Frontend ohne `Authorization`-Header aufgerufen.  
Bei Cloud Functions (2nd gen) läuft der HTTP-Endpoint auf Cloud Run. Wenn der zugrunde liegende Cloud-Run-Service nicht für öffentliche Aufrufe freigegeben ist (`allUsers` + `roles/run.invoker`), antwortet Cloud Run mit:

- `403`
- `The request was not authenticated... Empty Authorization header value`

## IAM-Fix (Variante 1: öffentlich + Hardening)

### Schnell über Script

```bash
./scripts/enable-bring-export-public.sh <PROJECT_ID> [REGION] [SERVICE_NAME]
```

- `PROJECT_ID`: Pflicht (fällt auf `gcloud config get-value project` zurück, falls gesetzt)
- `REGION`: optional, Default `us-central1`
- `SERVICE_NAME`: optional (wird sonst über Function-Label `bringRecipeExport` ermittelt)

Das Script führt intern aus:

```bash
gcloud run services add-iam-policy-binding <service> \
  --region <region> \
  --project <project> \
  --member="allUsers" \
  --role="roles/run.invoker"
```

### Manuell

```bash
gcloud run services add-iam-policy-binding <service> \
  --region us-central1 \
  --project <project-id> \
  --member="allUsers" \
  --role="roles/run.invoker"
```

## Verifikation

1. IAM prüfen:

```bash
gcloud run services get-iam-policy <service> --region us-central1 --project <project-id>
```

2. Endpoint testen (bewusst ohne `shareId`, erwartet **400** statt **403**):

```bash
curl -i -X POST "https://<your-host>/bring-export" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Erwartung:
- Kein `403 unauthenticated` mehr
- Stattdessen `400 Missing shareId or items` aus der Funktion

3. Browser-Checks (Hardening):
- erlaubte Origin (`ALLOWED_ORIGINS`) -> normaler Ablauf
- fremde Origin -> `403 Forbidden origin`

## Rollback

```bash
gcloud run services remove-iam-policy-binding <service> \
  --region us-central1 \
  --project <project-id> \
  --member="allUsers" \
  --role="roles/run.invoker"
```

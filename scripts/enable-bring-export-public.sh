#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${1:-$(gcloud config get-value project 2>/dev/null || true)}"
REGION="${2:-us-central1}"
SERVICE_NAME="${3:-}"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "❌ PROJECT_ID fehlt."
  echo "Usage: $0 <PROJECT_ID> [REGION] [SERVICE_NAME]"
  exit 1
fi

if [[ -z "${SERVICE_NAME}" ]]; then
  mapfile -t MATCHED_SERVICES < <(gcloud run services list \
    --project "${PROJECT_ID}" \
    --region "${REGION}" \
    --filter 'metadata.labels.goog-cloudfunctions-function-name=bringRecipeExport' \
    --format 'value(metadata.name)')
  if [[ "${#MATCHED_SERVICES[@]}" -eq 1 ]]; then
    SERVICE_NAME="${MATCHED_SERVICES[0]}"
  elif [[ "${#MATCHED_SERVICES[@]}" -gt 1 ]]; then
    echo "❌ Mehrere passende Services gefunden:"
    printf ' - %s\n' "${MATCHED_SERVICES[@]}"
    echo "Bitte SERVICE_NAME als 3. Parameter übergeben."
    exit 1
  fi
fi

if [[ -z "${SERVICE_NAME}" ]]; then
  echo "❌ Cloud-Run-Service für bringRecipeExport nicht gefunden."
  echo "Bitte SERVICE_NAME als 3. Parameter übergeben."
  echo "Usage: $0 <PROJECT_ID> [REGION] [SERVICE_NAME]"
  exit 1
fi

echo "ℹ️ Verwende Service: ${SERVICE_NAME} (region=${REGION}, project=${PROJECT_ID})"

gcloud run services add-iam-policy-binding "${SERVICE_NAME}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --member="allUsers" \
  --role="roles/run.invoker"

SERVICE_URL="$(gcloud run services describe "${SERVICE_NAME}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format 'value(status.url)')"

echo ""
echo "✅ IAM-Freigabe gesetzt: allUsers -> roles/run.invoker"
echo ""
echo "Verifikation:"
echo "1) Policy prüfen:"
echo "   gcloud run services get-iam-policy ${SERVICE_NAME} --region ${REGION} --project ${PROJECT_ID}"
echo "2) Endpoint prüfen (sollte 400 statt 403 liefern):"
echo "   curl -i -X POST '${SERVICE_URL}' -H 'Content-Type: application/json' -d '{}'"
echo "3) Hosting-Rewrite prüfen:"
echo "   curl -i -X POST 'https://<your-host>/bring-export' -H 'Content-Type: application/json' -d '{}'"

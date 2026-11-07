#!/usr/bin/env bash
# Legt in Cloud Monitoring eine Mail-Warnung an, sobald Cloud Functions abstürzen
# (Tech-Check F18, Punkt 4). Einmalig in der Cloud Shell ausführen; erneutes
# Ausführen aktualisiert die Warnung statt eine zweite anzulegen.
#
# Warum außerhalb des App-Codes: Beim firebase-admin-Ausfall (31.10. und
# 06.11.2026) fiel jede Function aus, die admin.firestore() nutzt. Eine Warnung,
# die selbst im Functions-Code läuft, wäre mit ausgefallen. Diese hier wertet nur
# die Logs aus, die Google ohnehin schreibt.
#
# Was auslöst (bewusst eng, damit die Warnung nicht im Rauschen untergeht –
# der Code hat rund 90 console.error für erwartete, abgefangene Fehler):
#   - eine Function-Anfrage endet mit HTTP 5xx (geplante Jobs, die scheitern,
#     Callables mit internem Fehler, Abstürze)
#   - ein ungefangener Fehler ("Unhandled error", "is not a function")
# Höchstens eine Mail pro Stunde; der Vorfall schließt sich nach 24 h ohne neue
# Treffer von selbst.
#
# Usage: ./scripts/setup-function-error-alert.sh <MAIL_ADRESSE> [PROJECT_ID]
set -euo pipefail

EMAIL="${1:-}"
PROJECT_ID="${2:-$(gcloud config get-value project 2>/dev/null || true)}"
POLICY_NAME="Cloud Functions: Absturz oder HTTP 5xx"
CHANNEL_NAME="Function-Fehler per Mail"

if [[ -z "${EMAIL}" || -z "${PROJECT_ID}" ]]; then
  echo "Usage: $0 <MAIL_ADRESSE> [PROJECT_ID]"
  exit 1
fi
if ! command -v gcloud >/dev/null 2>&1; then
  echo "❌ gcloud CLI wurde nicht gefunden (Cloud Shell nutzen)."
  exit 2
fi

echo "ℹ️ Projekt ${PROJECT_ID}, Mail an ${EMAIL}"
gcloud services enable monitoring.googleapis.com logging.googleapis.com --project="${PROJECT_ID}"

# --- Benachrichtigungskanal (Mail) wiederverwenden oder anlegen ---------------
channel="$(gcloud alpha monitoring channels list --project="${PROJECT_ID}" \
  --filter="type=\"email\" AND labels.email_address=\"${EMAIL}\"" \
  --format='value(name)' | head -n1)"
if [[ -z "${channel}" ]]; then
  channel="$(gcloud alpha monitoring channels create --project="${PROJECT_ID}" \
    --display-name="${CHANNEL_NAME}" --type=email \
    --channel-labels="email_address=${EMAIL}" --format='value(name)')"
  echo "✅ Mail-Kanal angelegt: ${channel}"
  echo "   Google schickt ggf. eine Bestätigungsmail – bitte bestätigen."
else
  echo "ℹ️ Mail-Kanal vorhanden: ${channel}"
fi

# --- Warnregel -----------------------------------------------------------------
policy_file="$(mktemp --suffix=.json)"
trap 'rm -f "${policy_file}"' EXIT
cat > "${policy_file}" <<JSON
{
  "displayName": "${POLICY_NAME}",
  "combiner": "OR",
  "conditions": [
    {
      "displayName": "Function-Anfrage mit 5xx oder ungefangener Fehler",
      "conditionMatchedLog": {
        "filter": "(resource.type=\"cloud_run_revision\" OR resource.type=\"cloud_function\") AND ((log_id(\"run.googleapis.com/requests\") AND httpRequest.status>=500) OR (severity>=ERROR AND (textPayload:\"Unhandled error\" OR jsonPayload.message:\"Unhandled error\" OR textPayload:\"is not a function\" OR jsonPayload.message:\"is not a function\")))"
      }
    }
  ],
  "alertStrategy": {
    "notificationRateLimit": {"period": "3600s"},
    "autoClose": "86400s"
  },
  "notificationChannels": ["${channel}"],
  "documentation": {
    "mimeType": "text/markdown",
    "content": "Eine Cloud Function ist abgestürzt oder hat HTTP 5xx geliefert. In Cloud Logging nach der Function filtern (resource.labels.service_name) und den ersten Fehler lesen. Bekannter Fall: 'admin.firestore is not a function' = firebase-admin-Major ohne Code-Umstellung (Tech-Check F18)."
  }
}
JSON

existing="$(gcloud alpha monitoring policies list --project="${PROJECT_ID}" \
  --filter="displayName=\"${POLICY_NAME}\"" --format='value(name)' | head -n1)"
if [[ -n "${existing}" ]]; then
  gcloud alpha monitoring policies update "${existing}" --project="${PROJECT_ID}" \
    --policy-from-file="${policy_file}" >/dev/null
  echo "✅ Warnregel aktualisiert: ${existing}"
else
  created="$(gcloud alpha monitoring policies create --project="${PROJECT_ID}" \
    --policy-from-file="${policy_file}" --format='value(name)')"
  echo "✅ Warnregel angelegt: ${created}"
fi

echo
echo "Test: In der Logs-Explorer-Suche den Filter aus der Regel einfügen – die"
echo "Treffer vom 31.10. und 07.11.2026 (admin.firestore is not a function) müssen erscheinen."

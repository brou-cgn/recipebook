#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${1:-$(gcloud config get-value project 2>/dev/null || true)}"
REGION="${2:-us-central1}"
FUNCTIONS_ARG="${3:-scanRecipeWithAI}"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "❌ PROJECT_ID fehlt."
  echo "Usage: $0 <PROJECT_ID> [REGION] [FUNCTIONS|all-callables]"
  exit 1
fi

if ! command -v gcloud >/dev/null 2>&1; then
  echo "❌ gcloud CLI wurde nicht gefunden."
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
FUNCTIONS_INDEX="${REPO_ROOT}/functions/index.js"

PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
if [[ -z "${PROJECT_NUMBER}" ]]; then
  echo "❌ PROJECT_NUMBER konnte nicht ermittelt werden."
  exit 3
fi

if [[ "${FUNCTIONS_ARG}" == "all-callables" ]]; then
  if [[ ! -f "${FUNCTIONS_INDEX}" ]]; then
    echo "❌ ${FUNCTIONS_INDEX} nicht gefunden."
    exit 4
  fi

  mapfile -t FUNCTIONS < <(
    sed -n 's/^exports\.\([A-Za-z0-9_]*\)[[:space:]]*=[[:space:]]*onCall\(.*/\1/p' "${FUNCTIONS_INDEX}" | sort -u
  )
else
  IFS=',' read -r -a FUNCTIONS <<< "${FUNCTIONS_ARG}"
fi

if [[ "${#FUNCTIONS[@]}" -eq 0 ]]; then
  echo "❌ Keine callable Functions ausgewählt."
  exit 5
fi

REQUIRED_MEMBERS=(
  "serviceAccount:service-${PROJECT_NUMBER}@gcf-admin-robot.iam.gserviceaccount.com"
  "serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-cloudfunctions.iam.gserviceaccount.com"
)

if [[ -n "${EXTRA_INVOKER_MEMBERS:-}" ]]; then
  IFS=',' read -r -a EXTRA_MEMBERS <<< "${EXTRA_INVOKER_MEMBERS}"
  for extra in "${EXTRA_MEMBERS[@]}"; do
    trimmed="$(echo "${extra}" | xargs)"
    if [[ -n "${trimmed}" ]]; then
      REQUIRED_MEMBERS+=("${trimmed}")
    fi
  done
fi

echo "ℹ️ Fixe callable Invoker IAM (project=${PROJECT_ID}, region=${REGION})"
echo "ℹ️ Funktionen: ${FUNCTIONS[*]}"
echo "ℹ️ Erwartete Principal(s):"
for member in "${REQUIRED_MEMBERS[@]}"; do
  echo "  - ${member}"
done

resolve_service_for_function() {
  local function_name="$1"
  mapfile -t matched_services < <(gcloud run services list \
    --project "${PROJECT_ID}" \
    --region "${REGION}" \
    --filter "metadata.labels.goog-cloudfunctions-function-name=${function_name}" \
    --format 'value(metadata.name)')

  if [[ "${#matched_services[@]}" -eq 0 ]]; then
    return 1
  fi

  if [[ "${#matched_services[@]}" -gt 1 ]]; then
    echo "❌ Mehrere Services für ${function_name} gefunden: ${matched_services[*]}" >&2
    return 2
  fi

  echo "${matched_services[0]}"
}

status=0
for function_name in "${FUNCTIONS[@]}"; do
  echo ""
  echo "--- ${function_name} ---"

  if ! service_name="$(resolve_service_for_function "${function_name}")"; then
    rc=$?
    if [[ ${rc} -eq 1 ]]; then
      echo "❌ Kein Cloud-Run-Service für ${function_name} gefunden."
    else
      echo "❌ Service-Auflösung fehlgeschlagen für ${function_name}."
    fi
    status=6
    continue
  fi

  echo "Service: ${service_name}"

  policy_file="$(mktemp)"
  if ! gcloud run services get-iam-policy "${service_name}" \
    --region "${REGION}" \
    --project "${PROJECT_ID}" \
    --format=json > "${policy_file}"; then
    echo "❌ IAM Policy konnte nicht gelesen werden."
    rm -f "${policy_file}"
    status=7
    continue
  fi

  mapfile -t current_invokers < <(python - "${policy_file}" <<'PY'
import json
import sys

with open(sys.argv[1], 'r', encoding='utf-8') as fh:
    policy = json.load(fh)

for binding in policy.get('bindings', []):
    if binding.get('role') == 'roles/run.invoker':
        for member in binding.get('members') or []:
            print(member)
PY
)
  rm -f "${policy_file}"

  for member in "${REQUIRED_MEMBERS[@]}"; do
    if printf '%s\n' "${current_invokers[@]}" | grep -Fxq "${member}"; then
      echo "✅ Bereits vorhanden: ${member}"
      continue
    fi

    echo "➕ Ergänze Binding: ${member}"
    gcloud run services add-iam-policy-binding "${service_name}" \
      --region "${REGION}" \
      --project "${PROJECT_ID}" \
      --member "${member}" \
      --role "roles/run.invoker" >/dev/null
  done

  echo "Aktuelle run.invoker Member:"
  gcloud run services get-iam-policy "${service_name}" \
    --region "${REGION}" \
    --project "${PROJECT_ID}" \
    --format='flattened(bindings[].members)' \
    --filter='bindings.role=roles/run.invoker' | sed 's/^/  /'
done

echo ""
if [[ ${status} -eq 0 ]]; then
  echo "✅ Callable Invoker Fix abgeschlossen (idempotent, nicht-destruktiv)."
else
  echo "⚠️ Callable Invoker Fix mit Fehlern beendet (exit=${status})."
fi

exit ${status}

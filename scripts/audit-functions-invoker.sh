#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${1:-$(gcloud config get-value project 2>/dev/null || true)}"
REGION="${2:-us-central1}"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "❌ PROJECT_ID fehlt."
  echo "Usage: $0 <PROJECT_ID> [REGION]"
  exit 1
fi

if ! command -v gcloud >/dev/null 2>&1; then
  echo "❌ gcloud CLI wurde nicht gefunden."
  exit 2
fi

echo "ℹ️ Prüfe Gen2 Functions/Invoker (project=${PROJECT_ID}, region=${REGION})"

tmp_functions="$(mktemp)"
gcloud functions list \
  --gen2 \
  --regions="${REGION}" \
  --project="${PROJECT_ID}" \
  --format=json > "${tmp_functions}"

python - "${tmp_functions}" <<'PY'
import json
import sys

path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as fh:
    functions = json.load(fh)

if not functions:
    print('⚠️ Keine Gen2 Functions in der Region gefunden.')
    raise SystemExit(0)

print(f"Gefundene Gen2 Functions: {len(functions)}")
print()
print("FUNCTION\tSERVICE\tURL")

for fn in functions:
    fn_name = fn.get('name', '').split('/')[-1]
    service_ref = ((fn.get('serviceConfig') or {}).get('service') or '')
    service_name = service_ref.split('/')[-1] if service_ref else ''
    url = ((fn.get('serviceConfig') or {}).get('uri') or '')
    print(f"{fn_name}\t{service_name}\t{url}")
PY

echo ""
echo "--- roles/run.invoker je Cloud Run Service ---"

python - "${tmp_functions}" <<'PY' | while IFS=$'\t' read -r function_name service_name; do
import json
import sys

path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as fh:
    functions = json.load(fh)

for fn in functions:
    fn_name = fn.get('name', '').split('/')[-1]
    service_ref = ((fn.get('serviceConfig') or {}).get('service') or '')
    service_name = service_ref.split('/')[-1] if service_ref else ''
    if fn_name and service_name:
        print(f"{fn_name}\t{service_name}")
PY
  if [[ -z "${service_name}" ]]; then
    continue
  fi

  echo ""
  echo "Function: ${function_name}"
  echo "Service : ${service_name}"

  tmp_policy="$(mktemp)"
  if ! gcloud run services get-iam-policy "${service_name}" \
    --region "${REGION}" \
    --project "${PROJECT_ID}" \
    --format=json > "${tmp_policy}"; then
    echo "  ❌ IAM Policy konnte nicht gelesen werden."
    rm -f "${tmp_policy}"
    continue
  fi

  members="$(python - "${tmp_policy}" <<'PY'
import json
import sys

with open(sys.argv[1], 'r', encoding='utf-8') as fh:
    policy = json.load(fh)

bindings = policy.get('bindings', [])
invoker_members = []
for binding in bindings:
    if binding.get('role') == 'roles/run.invoker':
        invoker_members.extend(binding.get('members') or [])

if not invoker_members:
    print('-')
else:
    for m in sorted(set(invoker_members)):
        print(m)
PY
)"

  while IFS= read -r member; do
    if [[ -n "${member}" ]]; then
      echo "  - ${member}"
    fi
  done <<< "${members}"

  rm -f "${tmp_policy}"
done

rm -f "${tmp_functions}"

echo ""
echo "✅ Audit abgeschlossen."

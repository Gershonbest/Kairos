#!/usr/bin/env bash
#
# One-shot deploy for the Kairos Bookings frontend + backend on Render.
#
# Render deploys from git, so there are two supported modes:
#
#   1. Git mode (default, simplest):
#        ./scripts/deploy-render.sh
#      Pushes the current branch; Render auto-deploys both services
#      (autoDeploy: true in render.yaml).
#
#   2. API mode (trigger without pushing, e.g. redeploy same commit):
#        export RENDER_API_KEY=rnd_xxx
#        export RENDER_BACKEND_SERVICE_ID=srv-xxx
#        export RENDER_FRONTEND_SERVICE_ID=srv-yyy
#        ./scripts/deploy-render.sh --api
#
# Find service IDs in the Render dashboard URL: .../web/srv-xxxxxxxx
#
set -euo pipefail

MODE="git"
if [[ "${1:-}" == "--api" ]]; then
  MODE="api"
fi

trigger_api_deploy() {
  local service_id="$1"
  local label="$2"
  echo "==> Triggering Render deploy for ${label} (${service_id})"
  curl --fail --silent --show-error \
    -X POST "https://api.render.com/v1/services/${service_id}/deploys" \
    -H "Authorization: Bearer ${RENDER_API_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"clearCache": "do_not_clear"}' \
    >/dev/null
  echo "    queued."
}

if [[ "${MODE}" == "api" ]]; then
  : "${RENDER_API_KEY:?Set RENDER_API_KEY}"
  : "${RENDER_BACKEND_SERVICE_ID:?Set RENDER_BACKEND_SERVICE_ID}"
  : "${RENDER_FRONTEND_SERVICE_ID:?Set RENDER_FRONTEND_SERVICE_ID}"

  trigger_api_deploy "${RENDER_BACKEND_SERVICE_ID}" "backend"
  trigger_api_deploy "${RENDER_FRONTEND_SERVICE_ID}" "frontend"
  echo "==> Both deploys queued. Track progress in the Render dashboard."
  exit 0
fi

# Git mode
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
echo "==> Deploying via git push (branch: ${BRANCH})"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "    You have uncommitted changes. Commit them first so Render deploys them:"
  echo "      git add -A && git commit -m 'Deploy' "
  exit 1
fi

git push origin "${BRANCH}"
echo "==> Pushed. Render will auto-deploy kairos-backend and kairos-frontend."
echo "    Track progress in the Render dashboard."

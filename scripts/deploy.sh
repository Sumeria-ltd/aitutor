#!/usr/bin/env bash
#
# The body of `make deploy`: one command that takes the checked-out commit to GCP.
#
#   apps/api  → a container image in Artifact Registry → the Cloud Run service
#   apps/web  → built with the project's Firebase config → Firebase Hosting, which rewrites
#               /api/** to that Cloud Run service so web and API share one origin
#
# It is the same command on a laptop and in .github/workflows/deploy.yml. Nothing here is
# specific to GitHub Actions; the workflow only arranges credentials (by Workload Identity
# Federation — no key is stored anywhere) and then calls `make deploy`.
#
# Every setting is an environment variable, named in .env.example. Nothing is read from a
# file that is not in the repository. The one-time project setup — APIs, service accounts,
# the identity pool, Firestore, the Firebase link — is scripts/gcp-bootstrap.sh, not this.
#
# Credentials: whatever `gcloud auth` and Application Default Credentials resolve to. On a
# laptop that is your user; in the workflow it is the deployer service account.
set -euo pipefail

cd "$(dirname "$0")/.."

# --- settings ----------------------------------------------------------------------------
: "${GOOGLE_CLOUD_PROJECT:?GOOGLE_CLOUD_PROJECT is required (the GCP project ID)}"
GCP_REGION="${GCP_REGION:-europe-west1}"
CLOUD_RUN_SERVICE="${CLOUD_RUN_SERVICE:-aitutor-api}"
ARTIFACT_REPOSITORY="${ARTIFACT_REPOSITORY:-aitutor}"
RUNTIME_SERVICE_ACCOUNT="${RUNTIME_SERVICE_ACCOUNT:-aitutor-api@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com}"
FIREBASE_TOOLS_VERSION="${FIREBASE_TOOLS_VERSION:-15.5.1}"

SHA="$(git rev-parse HEAD)"
SHORT="$(git rev-parse --short HEAD)"
IMAGE="${GCP_REGION}-docker.pkg.dev/${GOOGLE_CLOUD_PROJECT}/${ARTIFACT_REPOSITORY}/api:${SHA}"

firebase() { npx --yes "firebase-tools@${FIREBASE_TOOLS_VERSION}" "$@"; }

step() { printf '\n==> %s\n' "$*"; }
die()  { printf 'deploy: %s\n' "$*" >&2; exit 1; }

# --- preflight ---------------------------------------------------------------------------
step "Preflight"
for tool in gcloud docker node npm git; do
  command -v "$tool" >/dev/null 2>&1 || die "$tool is not installed"
done
gcloud auth print-access-token >/dev/null 2>&1 \
  || die "gcloud has no credential; run 'gcloud auth login' (or let the workflow's auth step provide one)"

# firebase.json hard-codes the Cloud Run target because Hosting cannot read environment
# variables. Refuse to deploy if it has drifted from the settings this script is using.
node -e '
  const h = JSON.parse(require("fs").readFileSync("firebase.json", "utf8")).hosting;
  const run = (h.rewrites || []).map(r => r.run).find(Boolean);
  if (!run) throw new Error("firebase.json has no Cloud Run rewrite");
  const [service, region] = process.argv.slice(1);
  if (run.serviceId !== service || run.region !== region)
    throw new Error(`firebase.json rewrites to ${run.serviceId} in ${run.region}; deploying ${service} in ${region}`);
' "$CLOUD_RUN_SERVICE" "$GCP_REGION"

if [ -n "$(git status --porcelain)" ]; then
  echo "note: the working tree is dirty; the image is tagged with HEAD ($SHORT) but contains the dirty tree" >&2
fi

echo "project   $GOOGLE_CLOUD_PROJECT"
echo "region    $GCP_REGION"
echo "commit    $SHA"
echo "image     $IMAGE"

# --- api: build, push, deploy --------------------------------------------------------------
step "Build the API image"
docker build --platform linux/amd64 --tag "$IMAGE" .

step "Push to Artifact Registry"
gcloud auth configure-docker "${GCP_REGION}-docker.pkg.dev" --quiet
docker push "$IMAGE"

step "Deploy $CLOUD_RUN_SERVICE to Cloud Run"
gcloud run deploy "$CLOUD_RUN_SERVICE" \
  --project "$GOOGLE_CLOUD_PROJECT" \
  --region "$GCP_REGION" \
  --image "$IMAGE" \
  --platform managed \
  --service-account "$RUNTIME_SERVICE_ACCOUNT" \
  --allow-unauthenticated \
  --port 8080 \
  --cpu 1 --memory 512Mi \
  --min-instances 0 --max-instances 3 \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=${GOOGLE_CLOUD_PROJECT}" \
  --labels "commit=${SHORT}" \
  --quiet

API_URL="$(gcloud run services describe "$CLOUD_RUN_SERVICE" \
  --project "$GOOGLE_CLOUD_PROJECT" --region "$GCP_REGION" --format 'value(status.url)')"
echo "api       $API_URL"

# --- web: configure, build, deploy ---------------------------------------------------------
step "Read the Firebase web config from the project"
# Not a secret — this is what the browser receives — but it is not committed either: the
# secret scan in scripts/check-deployable.sh treats an AIza… key in the tree as a leak, and
# reading it here keeps the project the single source of truth.
SDK_JSON="$(firebase apps:sdkconfig WEB --project "$GOOGLE_CLOUD_PROJECT" --json)"
eval "$(printf '%s' "$SDK_JSON" | node -e '
  const r = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const c = (r.result && r.result.sdkConfig) || r.sdkConfig || r;
  for (const [k, v] of [["VITE_FIREBASE_API_KEY", c.apiKey], ["VITE_FIREBASE_AUTH_DOMAIN", c.authDomain], ["VITE_FIREBASE_PROJECT_ID", c.projectId]]) {
    if (!v) throw new Error(`sdkconfig has no value for ${k}`);
    console.log(`export ${k}=${JSON.stringify(v)}`);
  }
')"
[ "$VITE_FIREBASE_PROJECT_ID" = "$GOOGLE_CLOUD_PROJECT" ] \
  || die "Firebase web app belongs to $VITE_FIREBASE_PROJECT_ID, not $GOOGLE_CLOUD_PROJECT"

step "Build the web app"
# Same origin as the API, through the Hosting rewrite; the app's default is already "".
export VITE_API_ORIGIN=""
npm run build --workspace @aitutor/web

step "Deploy to Firebase Hosting"
firebase deploy --only hosting --project "$GOOGLE_CLOUD_PROJECT" --non-interactive \
  --message "commit ${SHA}"

WEB_URL="https://${GOOGLE_CLOUD_PROJECT}.web.app"

# --- smoke: the deployed origin answers ----------------------------------------------------
step "Smoke"
# Not the acceptance criteria — those are re-run by hand against this URL and recorded on
# the Deployment page. This only proves the two halves are wired: the API answers through
# the Hosting rewrite (401, because no token was sent), and the web shell is served.
api_code="$(curl -sS -o /dev/null -w '%{http_code}' "${WEB_URL}/api/me" || echo 000)"
web_code="$(curl -sS -o /dev/null -w '%{http_code}' "${WEB_URL}/" || echo 000)"
echo "GET ${WEB_URL}/api/me → $api_code (expect 401)"
echo "GET ${WEB_URL}/      → $web_code (expect 200)"
[ "$api_code" = "401" ] || die "the API is not answering through Hosting"
[ "$web_code" = "200" ] || die "the web app is not being served"

# --- report ------------------------------------------------------------------------------
step "Deployed"
echo "web       $WEB_URL"
echo "api       $API_URL  (also ${WEB_URL}/api)"
echo "commit    $SHA"
echo "image     $IMAGE"

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  { echo "web_url=$WEB_URL"; echo "api_url=$API_URL"; echo "image=$IMAGE"; } >> "$GITHUB_OUTPUT"
fi
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "### Deployed \`$SHORT\`"
    echo
    echo "| | |"
    echo "|---|---|"
    echo "| web | $WEB_URL |"
    echo "| api | $API_URL |"
    echo "| image | \`$IMAGE\` |"
    echo "| commit | \`$SHA\` |"
    echo
    echo "Smoke: \`/api/me\` → $api_code, \`/\` → $web_code. The spec's ACCEPT lines are"
    echo "re-verified by hand against the web URL and recorded on the Deployment page."
  } >> "$GITHUB_STEP_SUMMARY"
fi

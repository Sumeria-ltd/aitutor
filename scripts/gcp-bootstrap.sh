#!/usr/bin/env bash
#
# One-time setup of a GCP project so that `make deploy` (scripts/deploy.sh) can run against
# it — from a laptop with an owner's credentials, and from .github/workflows/deploy.yml with
# no stored credential at all.
#
# Run it once per project as a project owner, and again whenever something below changes;
# every step checks before it creates, so re-running is safe and brings the project back in
# line. It creates:
#
#   APIs                 Cloud Run, Artifact Registry, IAM, STS, Firebase, Identity Toolkit,
#                        Hosting, Firestore, Billing budgets, Monitoring, Error Reporting
#   Artifact Registry    one Docker repository for the API image
#   Service accounts     aitutor-api      — what the Cloud Run service runs as; Firestore and
#                                           Firebase Auth only (Vertex comes with 0004+)
#                        github-deployer  — what the workflow becomes; deploy-only roles
#   Identity federation  a pool and an OIDC provider trusting GitHub Actions tokens from THIS
#                        repository, on main or an rc-* tag, and nothing else — this is what
#                        makes a stored key unnecessary
#   Firebase             the project linked to Firebase, one web app, the Hosting site,
#                        Auth with email-link sign-in enabled
#   Firestore            the (default) database, native mode, in the region — permanent
#   Budget               a monthly ceiling (in the billing account's own currency) with alerts
#                        at 50 / 90 / 100 % to a named person
#
# It never touches application code, never prints a credential, and needs no secret input.
set -euo pipefail

cd "$(dirname "$0")/.."

# --- settings ----------------------------------------------------------------------------
: "${GOOGLE_CLOUD_PROJECT:?GOOGLE_CLOUD_PROJECT is required (the GCP project ID)}"
GCP_REGION="${GCP_REGION:-europe-west1}"
ARTIFACT_REPOSITORY="${ARTIFACT_REPOSITORY:-aitutor}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-$(git remote get-url origin | sed -E 's#^(git@github\.com:|https://github\.com/)##; s#\.git$##')}"
BUDGET_AMOUNT="${BUDGET_AMOUNT:-}"                # monthly ceiling, in the billing account's currency
BUDGET_RECIPIENT="${BUDGET_RECIPIENT:-}"          # an email; empty skips the budget step
FIREBASE_TOOLS_VERSION="${FIREBASE_TOOLS_VERSION:-15.5.1}"

P="$GOOGLE_CLOUD_PROJECT"
RUNTIME_SA="aitutor-api@${P}.iam.gserviceaccount.com"
DEPLOYER_SA="github-deployer@${P}.iam.gserviceaccount.com"
POOL="github"
PROVIDER="github-actions"

firebase() { npx --yes "firebase-tools@${FIREBASE_TOOLS_VERSION}" "$@"; }
step() { printf '\n==> %s\n' "$*"; }
ok()   { printf '    ok    %s\n' "$*"; }
made() { printf '    made  %s\n' "$*"; }
die()  { printf 'bootstrap: %s\n' "$*" >&2; exit 1; }

# --- preflight ---------------------------------------------------------------------------
step "Preflight"
command -v gcloud >/dev/null || die "gcloud is not installed"
command -v npx >/dev/null || die "node/npx is not installed"
gcloud auth print-access-token >/dev/null 2>&1 || die "gcloud has no credential; run 'gcloud auth login'"
NUM="$(gcloud projects describe "$P" --format 'value(projectNumber)')" || die "cannot read project $P"
BILLING="$(gcloud billing projects describe "$P" --format 'value(billingAccountName)')"
[ -n "$BILLING" ] || die "project $P has no billing account; attach one first"
echo "project      $P ($NUM)"
echo "region       $GCP_REGION"
echo "repository   $GITHUB_REPOSITORY"
echo "billing      $BILLING"

# --- APIs --------------------------------------------------------------------------------
step "APIs"
gcloud services enable --project "$P" \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  cloudresourcemanager.googleapis.com \
  firebase.googleapis.com \
  firebasehosting.googleapis.com \
  identitytoolkit.googleapis.com \
  firestore.googleapis.com \
  cloudbilling.googleapis.com \
  billingbudgets.googleapis.com \
  monitoring.googleapis.com \
  logging.googleapis.com \
  clouderrorreporting.googleapis.com
ok "enabled"

# --- Artifact Registry -------------------------------------------------------------------
step "Artifact Registry"
if gcloud artifacts repositories describe "$ARTIFACT_REPOSITORY" --project "$P" --location "$GCP_REGION" >/dev/null 2>&1; then
  ok "$ARTIFACT_REPOSITORY exists in $GCP_REGION"
else
  gcloud artifacts repositories create "$ARTIFACT_REPOSITORY" --project "$P" --location "$GCP_REGION" \
    --repository-format docker --description "AITutor container images" --quiet
  made "$ARTIFACT_REPOSITORY in $GCP_REGION"
fi

# --- service accounts --------------------------------------------------------------------
ensure_sa() { # id, display name
  if gcloud iam service-accounts describe "$1@${P}.iam.gserviceaccount.com" --project "$P" >/dev/null 2>&1; then
    ok "$1 exists"
  else
    gcloud iam service-accounts create "$1" --project "$P" --display-name "$2" --quiet
    made "$1"
  fi
}
grant() { # member, role  (project-level; add-iam-policy-binding is idempotent)
  gcloud projects add-iam-policy-binding "$P" --member "$1" --role "$2" --condition None --quiet >/dev/null
  ok "$2 → ${1#serviceAccount:}"
}

step "Runtime service account (what Cloud Run runs as)"
ensure_sa aitutor-api "AITutor API (Cloud Run runtime)"
grant "serviceAccount:$RUNTIME_SA" roles/datastore.user        # Firestore
grant "serviceAccount:$RUNTIME_SA" roles/firebaseauth.admin    # verify tokens, revoke sessions

step "Deployer service account (what the workflow becomes)"
ensure_sa github-deployer "GitHub Actions deployer"
grant "serviceAccount:$DEPLOYER_SA" roles/run.admin
grant "serviceAccount:$DEPLOYER_SA" roles/artifactregistry.writer
grant "serviceAccount:$DEPLOYER_SA" roles/firebasehosting.admin
grant "serviceAccount:$DEPLOYER_SA" roles/firebase.viewer                  # apps:sdkconfig
grant "serviceAccount:$DEPLOYER_SA" roles/serviceusage.serviceUsageConsumer
# Deploying a Cloud Run service that runs as aitutor-api means acting as it — on that one
# account, not every account in the project.
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" --project "$P" \
  --member "serviceAccount:$DEPLOYER_SA" --role roles/iam.serviceAccountUser --quiet >/dev/null
ok "roles/iam.serviceAccountUser on $RUNTIME_SA → github-deployer"

# --- Workload Identity Federation ----------------------------------------------------------
step "Workload Identity Federation (GitHub Actions → github-deployer, no key)"
if gcloud iam workload-identity-pools describe "$POOL" --project "$P" --location global >/dev/null 2>&1; then
  ok "pool $POOL exists"
else
  gcloud iam workload-identity-pools create "$POOL" --project "$P" --location global \
    --display-name "GitHub Actions" --quiet
  made "pool $POOL"
fi

# Only tokens minted for this repository, for a run on main or on a release-candidate tag,
# may become the deployer. A run on any other branch fails to authenticate — which is the
# same rule deploy.yml enforces, kept here so the workflow file is not the only guard.
CONDITION="assertion.repository == \"${GITHUB_REPOSITORY}\" && (assertion.ref == \"refs/heads/main\" || assertion.ref.startsWith(\"refs/tags/rc-\"))"
MAPPING="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref,attribute.repository_owner=assertion.repository_owner"
if gcloud iam workload-identity-pools providers describe "$PROVIDER" --project "$P" --location global \
     --workload-identity-pool "$POOL" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers update-oidc "$PROVIDER" --project "$P" --location global \
    --workload-identity-pool "$POOL" --attribute-mapping "$MAPPING" --attribute-condition "$CONDITION" --quiet
  ok "provider $PROVIDER exists; mapping and condition synced"
else
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" --project "$P" --location global \
    --workload-identity-pool "$POOL" --display-name "GitHub Actions OIDC" \
    --issuer-uri "https://token.actions.githubusercontent.com" \
    --attribute-mapping "$MAPPING" --attribute-condition "$CONDITION" --quiet
  made "provider $PROVIDER"
fi

PRINCIPAL="principalSet://iam.googleapis.com/projects/${NUM}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${GITHUB_REPOSITORY}"
gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER_SA" --project "$P" \
  --member "$PRINCIPAL" --role roles/iam.workloadIdentityUser --quiet >/dev/null
ok "roles/iam.workloadIdentityUser on github-deployer → $GITHUB_REPOSITORY"

# --- Firebase ----------------------------------------------------------------------------
step "Firebase"
if firebase projects:list --json 2>/dev/null | node -e '
     const r = JSON.parse(require("fs").readFileSync(0, "utf8"));
     process.exit((r.result || []).some(p => p.projectId === process.argv[1]) ? 0 : 1)' "$P"; then
  ok "$P is a Firebase project"
else
  firebase projects:addfirebase "$P" >/dev/null
  made "linked $P to Firebase"
fi

if firebase apps:list WEB --project "$P" --json 2>/dev/null | node -e '
     const r = JSON.parse(require("fs").readFileSync(0, "utf8"));
     process.exit((r.result || []).length > 0 ? 0 : 1)'; then
  ok "a web app is registered"
else
  firebase apps:create WEB aitutor-web --project "$P" >/dev/null
  made "web app aitutor-web"
fi

if firebase hosting:sites:list --project "$P" --json 2>/dev/null | node -e '
     const r = JSON.parse(require("fs").readFileSync(0, "utf8"));
     process.exit(((r.result && r.result.sites) || []).length > 0 ? 0 : 1)'; then
  ok "a Hosting site exists"
else
  firebase hosting:sites:create "$P" --project "$P" >/dev/null
  made "Hosting site $P (https://${P}.web.app)"
fi

# Firebase Auth: email-link sign-in is the only method the product uses (spec 0001).
TOKEN="$(gcloud auth print-access-token)"
idp() { # method, path, [body]
  curl -sS -X "$1" "https://identitytoolkit.googleapis.com/$2" \
    -H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: $P" \
    -H "Content-Type: application/json" ${3:+-d "$3"}
}
if idp GET "admin/v2/projects/${P}/config" | grep -q '"name"'; then
  ok "Auth is initialised"
else
  idp POST "v2/projects/${P}/identityPlatform:initializeAuth" '{}' >/dev/null
  made "initialised Auth"
fi
idp PATCH "admin/v2/projects/${P}/config?updateMask=signIn.email" \
  '{"signIn":{"email":{"enabled":true,"passwordRequired":false}}}' \
  | node -e '
    const c = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const e = c.signIn && c.signIn.email;
    if (!e || !e.enabled || e.passwordRequired) { console.error(JSON.stringify(c)); process.exit(1); }'
ok "email-link sign-in enabled (email enabled, password not required)"

# --- Firestore ---------------------------------------------------------------------------
step "Firestore"
if gcloud firestore databases describe --project "$P" --database '(default)' >/dev/null 2>&1; then
  ok "(default) database exists: $(gcloud firestore databases describe --project "$P" --database '(default)' --format 'value(locationId,type)')"
else
  gcloud firestore databases create --project "$P" --database '(default)' \
    --location "$GCP_REGION" --type firestore-native --edition standard --quiet >/dev/null
  made "(default) database, native, $GCP_REGION"
fi

# --- Budget ------------------------------------------------------------------------------
step "Budget"
if [ -z "$BUDGET_RECIPIENT" ] || [ -z "$BUDGET_AMOUNT" ]; then
  echo "    --    BUDGET_RECIPIENT or BUDGET_AMOUNT is empty; skipping. The platform checklist calls this mandatory."
else
  ACCOUNT="${BILLING#billingAccounts/}"
  # A budget is denominated in the billing account's currency, whatever it is; anything else
  # is rejected as INVALID_ARGUMENT with no further explanation.
  CURRENCY="$(gcloud billing accounts describe "$ACCOUNT" --format 'value(currencyCode)')"
  # The Monitoring API's filter wants its literals quoted.
  CHANNEL="$(gcloud beta monitoring channels list --project "$P" \
    --filter "type=\"email\" AND labels.email_address=\"${BUDGET_RECIPIENT}\"" --format 'value(name)' | head -1)"
  if [ -n "$CHANNEL" ]; then
    ok "notification channel → $BUDGET_RECIPIENT exists"
  else
    CHANNEL="$(gcloud beta monitoring channels create --project "$P" --type email \
      --display-name "AITutor cost alert → ${BUDGET_RECIPIENT}" \
      --channel-labels "email_address=${BUDGET_RECIPIENT}" --format 'value(name)')"
    made "notification channel → $BUDGET_RECIPIENT"
  fi
  NAME="aitutor ${P}"
  if [ -n "$(gcloud billing budgets list --billing-account "$ACCOUNT" --filter "displayName=\"${NAME}\"" --format 'value(name)')" ]; then
    ok "budget \"$NAME\" exists (edit the amount in the console if it should change)"
  else
    gcloud billing budgets create --billing-account "$ACCOUNT" --display-name "$NAME" \
      --budget-amount "${BUDGET_AMOUNT}${CURRENCY}" \
      --filter-projects "projects/${NUM}" \
      --threshold-rule percent=0.5 --threshold-rule percent=0.9 --threshold-rule percent=1.0 \
      --notifications-rule-monitoring-notification-channels "$CHANNEL" --quiet >/dev/null
    made "budget \"$NAME\": ${BUDGET_AMOUNT} ${CURRENCY}/month, alerts at 50/90/100 % → $BUDGET_RECIPIENT"
  fi
fi

# --- what the workflow needs -----------------------------------------------------------------
step "GitHub Actions variables (repository → Settings → Secrets and variables → Actions → Variables)"
WIP="projects/${NUM}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}"
cat <<EOF
    GOOGLE_CLOUD_PROJECT             $P
    GCP_REGION                       $GCP_REGION
    GCP_WORKLOAD_IDENTITY_PROVIDER   $WIP
    GCP_DEPLOYER_SERVICE_ACCOUNT     $DEPLOYER_SA

None of these is a secret. Set them with:

    gh variable set GOOGLE_CLOUD_PROJECT           --body "$P"
    gh variable set GCP_REGION                     --body "$GCP_REGION"
    gh variable set GCP_WORKLOAD_IDENTITY_PROVIDER --body "$WIP"
    gh variable set GCP_DEPLOYER_SERVICE_ACCOUNT   --body "$DEPLOYER_SA"
EOF
if [ "${1:-}" = "--set-github-vars" ]; then
  command -v gh >/dev/null || die "gh is not installed"
  gh variable set GOOGLE_CLOUD_PROJECT           --body "$P"
  gh variable set GCP_REGION                     --body "$GCP_REGION"
  gh variable set GCP_WORKLOAD_IDENTITY_PROVIDER --body "$WIP"
  gh variable set GCP_DEPLOYER_SERVICE_ACCOUNT   --body "$DEPLOYER_SA"
  ok "set on $GITHUB_REPOSITORY"
fi

echo
echo "Bootstrap complete for $P."

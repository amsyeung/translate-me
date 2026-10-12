# Publishing to the Chrome Web Store

Merging to `main` releases automatically:

1. **Version bump.** `release-it` bumps the version from the [conventional commits](https://www.conventionalcommits.org/) since the last tag (`fix:` → patch, `feat:` → minor), updates `CHANGELOG.md` and `manifest.json`, then commits and tags `vX.Y.Z`. If there are only `docs:`/`chore:` commits, nothing is released.
2. **GitHub release.** The extension is built and the zip is attached to a GitHub release.
3. **Chrome Web Store.** The zip is uploaded and submitted for review. This step only runs once the setup below is done; until then it is skipped, not failed.

GitHub never stores a Google secret. Each run exchanges GitHub's short-lived OIDC token for a 15-minute Google access token, through Workload Identity Federation.

## One-time setup

### 1. Google Cloud

Use a dedicated project, e.g. `translate-me-publish`, so the publishing identity is separate from anything else.

1. **Enable APIs** (*APIs & Services → Library*):
   - **Chrome Web Store API**
   - **IAM Service Account Credentials API**
2. **Create a service account** (*IAM & Admin → Service accounts → Create*), e.g. `cws-publisher`.
   - **Grant it no roles:** skip the *Permissions* step.
   - Copy its email: `cws-publisher@PROJECT_ID.iam.gserviceaccount.com`.
3. **Let GitHub Actions use it.** Run this in [Cloud Shell](https://shell.cloud.google.com), replacing `PROJECT_ID`:

   ```bash
   PROJECT_ID=translate-me-publish
   SA=cws-publisher@$PROJECT_ID.iam.gserviceaccount.com
   REPO=amsyeung/translate-me
   PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')

   gcloud iam workload-identity-pools create github \
     --project=$PROJECT_ID --location=global --display-name="GitHub Actions"

   # Only this repository may use the pool.
   gcloud iam workload-identity-pools providers create-oidc translate-me \
     --project=$PROJECT_ID --location=global --workload-identity-pool=github \
     --display-name="translate-me" \
     --issuer-uri="https://token.actions.githubusercontent.com" \
     --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
     --attribute-condition="assertion.repository == '$REPO'"

   gcloud iam service-accounts add-iam-policy-binding $SA --project=$PROJECT_ID \
     --role=roles/iam.workloadIdentityUser \
     --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$REPO"

   # Print the value for GCP_WORKLOAD_IDENTITY_PROVIDER:
   echo "projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/translate-me"
   ```

### 2. Chrome Web Store Developer Dashboard

1. Make sure **2-Step Verification** is on for the Google account that owns the extension.
2. Go to *Account* and add the service account email under **Service account**. A publisher can have only one.
3. On the same page, copy your **Publisher ID**.

### 3. GitHub repository

*Settings → Secrets and variables → Actions → **Variables** tab.* These are not secrets; none of them grants access by itself.

| Variable | Value |
| --- | --- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | the `projects/…/providers/translate-me` line printed above |
| `GCP_SERVICE_ACCOUNT` | `cws-publisher@PROJECT_ID.iam.gserviceaccount.com` |
| `CWS_PUBLISHER_ID` | from the dashboard |
| `CWS_EXTENSION_ID` | `fkoepnkpnaebnedkdnljkcdchljfoadi` |

**Recommended:** in *Settings → Environments*, open **`chrome-web-store`** (it's created on the first run, or create it yourself) and add yourself as a **required reviewer**. Every store submission then waits for you to click *Approve* in the Actions run.

### 4. Check it works

*Actions → Chrome Web Store → Run workflow*, with mode **`status`**. This changes nothing. It prints the published version and review state, which proves the credentials work.

## Running by hand

The same workflow (*Actions → Chrome Web Store → Run workflow*) can:

- **`status`**: show the current store state.
- **`upload`**: upload a build as a draft without submitting it. Useful to check the store accepts the package.
- **`publish`**: upload and submit for review.

The store rejects an upload whose `manifest.json` version isn't higher than the current one, so re-running an old tag fails.

Locally, with an access token from `gcloud auth print-access-token --impersonate-service-account=$SA --scopes=https://www.googleapis.com/auth/chromewebstore` (your user needs *Service Account Token Creator* on the service account for this):

```bash
CWS_ACCESS_TOKEN=… CWS_PUBLISHER_ID=… CWS_EXTENSION_ID=fkoepnkpnaebnedkdnljkcdchljfoadi node scripts/publish-cws.mjs status
```

## What still needs a person

- **Google's review.** It usually takes hours to a few days, and you'll get an email.
- **Store listing changes.** Description, screenshots and privacy answers can't be changed through the API. Update them in the dashboard, especially when permissions change.
- **Visibility.** If you change visibility in the dashboard, publish once by hand before the API can publish again.

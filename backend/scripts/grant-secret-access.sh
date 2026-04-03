# Grant Cloud Run access to Secret Manager secrets

# Your project and the default Compute Engine service account Cloud Run uses:
PROJECT_ID=coral-antonym-286617
SA_EMAIL=${PROJECT_ID}-compute@developer.gserviceaccount.com

# Grant Secret Manager Secret Accessor at project level (all secrets in the project):
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/secretmanager.secretAccessor"

# Or grant access only to specific secrets (tighter):
# gcloud secrets add-iam-policy-binding AUTH_JWT_SECRET \
#   --member="serviceAccount:${SA_EMAIL}" \
#   --role="roles/secretmanager.secretAccessor" \
#   --project=$PROJECT_ID
# gcloud secrets add-iam-policy-binding AUTH_GOOGLE_CLIENT_SECRET \
#   --member="serviceAccount:${SA_EMAIL}" \
#   --role="roles/secretmanager.secretAccessor" \
#   --project=$PROJECT_ID

"""One-off test: does Vertex AI accept application/json as file_uri input?

Run from backend dir: python scripts/test_vertex_json_input.py
Uses app settings (GCP_PROJECT_ID, GCS_BUCKET_NAME, VERTEX_AI_LOCATION) and ADC.
"""

from __future__ import annotations

import json
import os
import sys

# Ensure backend app is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from google import genai
from google.genai import types
from google.cloud import storage

from app.core.config import settings


def main() -> None:
    # Match app's Vertex env setup
    os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "true")
    if settings.gcp_project_id and not os.environ.get("GOOGLE_CLOUD_PROJECT"):
        os.environ["GOOGLE_CLOUD_PROJECT"] = settings.gcp_project_id
    if settings.vertex_ai_location and not os.environ.get("GOOGLE_CLOUD_LOCATION"):
        os.environ["GOOGLE_CLOUD_LOCATION"] = settings.vertex_ai_location

    bucket_name = settings.gcs_bucket_name or "d-done"
    blob_path = "vertex-json-test/payload.json"
    gcs_uri = f"gs://{bucket_name}/{blob_path}"

    # Upload minimal JSON to GCS
    payload = {"text": "Hello from JSON.", "page": 1}
    client = storage.Client(project=settings.gcp_project_id or None)
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(blob_path)
    blob.upload_from_string(
        json.dumps(payload),
        content_type="application/json",
    )
    print(f"Uploaded JSON to {gcs_uri}")

    # Call Vertex with file_uri + application/json
    genai_client = genai.Client()
    try:
        response = genai_client.models.generate_content(
            model=settings.gemini_flash_model,
            contents=[
                types.Part.from_uri(file_uri=gcs_uri, mime_type="application/json"),
                types.Part.from_text(
                    text="What is the value of 'text' in this JSON? One short sentence."
                ),
            ],
            config=types.GenerateContentConfig(max_output_tokens=64),
        )
        print("SUCCESS: Vertex accepted application/json file_uri")
        print("Response:", (response.text or "").strip())
    except Exception as e:
        print("FAILED: Vertex rejected or error")
        print(f"Exception type: {type(e).__name__}")
        print(f"Exception: {e}")
        # Try to surface HTTP status
        if hasattr(e, "status_code"):
            print(f"Status code: {e.status_code}")
        if hasattr(e, "message"):
            print(f"Message: {e.message}")
        for attr in ("details", "grpc_message", "code"):
            if hasattr(e, attr):
                print(f"{attr}: {getattr(e, attr)}")
    finally:
        try:
            blob.delete()
        except Exception:
            pass


if __name__ == "__main__":
    main()

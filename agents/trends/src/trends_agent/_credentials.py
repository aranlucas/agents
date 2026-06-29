"""Credential bootstrap for Trends BigQuery access."""

import json
import os
import tempfile


def bootstrap_gcp_credentials() -> None:
    creds_json = os.getenv("GOOGLE_APPLICATION_CREDENTIALS_JSON")
    if not creds_json:
        return
    with tempfile.NamedTemporaryFile(delete=False, suffix=".json", mode="w") as tmp:
        tmp.write(creds_json)
        tmp_name = tmp.name
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = tmp_name
    project = json.loads(creds_json).get("project_id", "")
    os.environ.setdefault("GOOGLE_CLOUD_PROJECT", project)

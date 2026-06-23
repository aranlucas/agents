import json
import os
import tempfile


def _bootstrap_gcp_credentials() -> None:
    creds_json = os.getenv("GOOGLE_APPLICATION_CREDENTIALS_JSON")
    if not creds_json:
        return
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".json", mode="w")
    tmp.write(creds_json)
    tmp.flush()
    tmp.close()
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = tmp.name
    project = json.loads(creds_json).get("project_id", "")
    os.environ.setdefault("GOOGLE_CLOUD_PROJECT", project)


_bootstrap_gcp_credentials()

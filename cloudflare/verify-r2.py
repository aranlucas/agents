"""Round-trip smoke test for the R2 artifact service.

Reads CF_ACCOUNT_ID, CF_R2_BUCKET_NAME, CF_R2_ACCESS_KEY_ID,
CF_R2_SECRET_ACCESS_KEY from the environment, saves a small artifact,
loads it back, asserts the content matches, then deletes it.

Usage:
    uv run python cloudflare/verify-r2.py
"""

import asyncio
import os

from google.genai import types


async def main() -> None:
    account_id = os.environ["CF_ACCOUNT_ID"]
    bucket = os.environ["CF_R2_BUCKET_NAME"]

    from google.adk_community.artifacts.s3_artifact_service import S3ArtifactService

    svc = S3ArtifactService(
        bucket_name=bucket,
        aws_configs={
            "endpoint_url": f"https://{account_id}.r2.cloudflarestorage.com",
            "region_name": "auto",
            "aws_access_key_id": os.environ["CF_R2_ACCESS_KEY_ID"],
            "aws_secret_access_key": os.environ["CF_R2_SECRET_ACCESS_KEY"],
        },
    )

    app, user, session = "_verify", "_verify", "_verify"
    filename = "smoke-test.txt"
    content = "hello r2"

    print(f"Saving artifact to s3://{bucket} ...")
    version = await svc.save_artifact(
        app_name=app,
        user_id=user,
        session_id=session,
        filename=filename,
        artifact=types.Part.from_text(text=content),
    )

    print(f"Loading version {version} ...")
    part = await svc.load_artifact(
        app_name=app, user_id=user, session_id=session, filename=filename
    )
    if part is None or part.text != content:
        msg = f"unexpected: {part}"
        raise RuntimeError(msg)

    print("Cleaning up ...")
    await svc.delete_artifact(
        app_name=app, user_id=user, session_id=session, filename=filename
    )

    print("✅ R2 artifact service works correctly.")


asyncio.run(main())

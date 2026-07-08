"""FastAPI DI wiring for shared ADK services.

All agents consume a single ``AgentServices`` bundle created at gateway startup.
Tests can call ``create_agent_services()`` for a fresh set or construct
``AgentServices(...)`` with mocked dependencies.
"""

import os
import warnings
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request
from google.adk.artifacts.base_artifact_service import BaseArtifactService
from google.adk.artifacts.in_memory_artifact_service import InMemoryArtifactService
from google.adk.auth.credential_service.base_credential_service import (
    BaseCredentialService,
)
from google.adk.auth.credential_service.in_memory_credential_service import (
    InMemoryCredentialService,
)
from google.adk.memory.base_memory_service import BaseMemoryService
from google.adk.memory.in_memory_memory_service import InMemoryMemoryService
from google.adk.sessions import BaseSessionService
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from .session_service import (
    create_d1_session_service,
    create_session_service,
    get_database_url,
    get_sqlite_db_path,
)

# ADK marks every credential service as @experimental but there is no stable
# alternative. Suppress the UserWarning at our instantiation site.
warnings.filterwarnings(
    "ignore", message=".*InMemoryCredentialService.*", category=UserWarning
)
warnings.filterwarnings(
    "ignore", message=".*BaseCredentialService.*", category=UserWarning
)


@dataclass
class AgentServices:
    session_service: BaseSessionService
    artifact_service: BaseArtifactService
    memory_service: BaseMemoryService
    credential_service: BaseCredentialService
    engine: AsyncEngine


def _build_engine() -> AsyncEngine:
    url = get_database_url() or f"sqlite+aiosqlite:///{get_sqlite_db_path()}"
    return create_async_engine(
        url,
        pool_size=1,
        max_overflow=2,
        pool_pre_ping=True,
    )


def _create_r2_artifact_service() -> BaseArtifactService:
    from ._s3_artifact_service import S3ArtifactService

    account_id = os.environ["CF_ACCOUNT_ID"]
    return S3ArtifactService(
        bucket_name=os.environ["CF_R2_BUCKET_NAME"],
        aws_configs={
            "endpoint_url": f"https://{account_id}.r2.cloudflarestorage.com",
            "region_name": "auto",
            "aws_access_key_id": os.environ["CF_R2_ACCESS_KEY_ID"],
            "aws_secret_access_key": os.environ["CF_R2_SECRET_ACCESS_KEY"],
        },
    )


def create_agent_services() -> AgentServices:
    session_service = (
        create_d1_session_service()
        if os.getenv("CF_D1_DATABASE_ID")
        else create_session_service()
    )
    artifact_service: BaseArtifactService = (
        _create_r2_artifact_service()
        if os.getenv("CF_R2_BUCKET_NAME")
        else InMemoryArtifactService()
    )
    return AgentServices(
        session_service=session_service,
        artifact_service=artifact_service,
        memory_service=InMemoryMemoryService(),
        credential_service=InMemoryCredentialService(),
        engine=_build_engine(),
    )


async def get_agent_services(request: Request) -> AgentServices:
    return request.app.state.services


AgentServicesDep = Annotated[AgentServices, Depends(get_agent_services)]
"""
Use in path operations to access shared ADK services::

    @app.get("/health")
    async def health(services: AgentServicesDep):
        ...
"""

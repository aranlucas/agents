"""FastAPI DI wiring for shared ADK services.

All agents consume a single ``AgentServices`` bundle created during the
gateway's FastAPI lifespan.  Tests can call ``create_agent_services()`` for
a fresh set or construct ``AgentServices(...)`` with mocked dependencies.
"""

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

from .session_service import create_session_service


@dataclass
class AgentServices:
    session_service: BaseSessionService
    artifact_service: BaseArtifactService
    memory_service: BaseMemoryService
    credential_service: BaseCredentialService


def create_agent_services() -> AgentServices:
    return AgentServices(
        session_service=create_session_service(),
        artifact_service=InMemoryArtifactService(),
        memory_service=InMemoryMemoryService(),
        credential_service=InMemoryCredentialService(),
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

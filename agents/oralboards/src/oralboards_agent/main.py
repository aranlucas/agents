"""Oral Boards Examiner Agent - grounded pediatric dentistry mock exams."""

import json
import logging
import os
import re
import sqlite3
import time
from importlib import resources
from pathlib import Path

from ag_ui_adk import ADKAgent, AGUIToolset, add_adk_fastapi_endpoint
from ag_ui_adk.config import PredictStateMapping
from agents_shared.session_service import (
    SessionServiceContainer,
    create_session_service,
)
from agents_shared.tools import shared_after_tool_callback
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from google.adk.agents import LlmAgent
from google.adk.agents.callback_context import CallbackContext
from google.adk.artifacts.in_memory_artifact_service import InMemoryArtifactService
from google.adk.auth.credential_service.in_memory_credential_service import (
    InMemoryCredentialService,
)
from google.adk.memory.in_memory_memory_service import InMemoryMemoryService
from google.adk.models import LlmRequest, LlmResponse
from google.adk.models.lite_llm import LiteLlm
from google.adk.tools import ToolContext
from opentelemetry import trace
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk.resources import Resource

load_dotenv()

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logging.getLogger("google.adk").setLevel(logging.DEBUG)
logging.getLogger("litellm").setLevel(logging.DEBUG)
logging.getLogger("ag_ui_adk").setLevel(logging.DEBUG)

log = logging.getLogger("oralboards_agent")

CLERK_USER_ID_HEADER = "x-clerk-user-id"
VALID_COLLECTIONS = {"abpd", "aapd", "cody"}


def _default_db_path() -> Path:
    package_db = resources.files("oralboards_agent").joinpath("data/search.sqlite")
    if package_db.is_file():
        return Path(str(package_db))
    return Path(__file__).resolve().parents[2] / "data" / "search.sqlite"


DB_PATH = Path(os.getenv("ORALBOARDS_SEARCH_DB", str(_default_db_path())))

_railway_domain = os.getenv("RAILWAY_PUBLIC_DOMAIN")
AGENT_PUBLIC_URL = os.getenv("AGENT_PUBLIC_URL") or (
    f"https://{_railway_domain}" if _railway_domain else "http://localhost:8005"
)


def _validate_db() -> str:
    if not DB_PATH.exists():
        message = f"Oral boards search DB missing: {DB_PATH}"
        log.error(message)
        return message

    try:
        with _connect() as conn:
            conn.execute("select 1 from documents limit 1").fetchone()
            conn.execute("select 1 from documents_fts limit 1").fetchone()
    except sqlite3.Error as exc:
        message = f"Oral boards search DB unreadable: {exc}"
        log.exception(message)
        return message

    return ""


def _connect() -> sqlite3.Connection:
    uri = f"file:{DB_PATH}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    conn.row_factory = sqlite3.Row
    return conn


DB_STARTUP_ERROR = _validate_db()


def extract_identity_state(request) -> dict:
    return {"user_id": request.headers.get(CLERK_USER_ID_HEADER) or "anonymous"}


async def extract_oralboards_identity_state(request, _input_data) -> dict:
    return extract_identity_state(request)


def _setup_otel() -> None:
    if not os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT"):
        return

    from google.adk.telemetry.setup import maybe_set_otel_providers

    resource = Resource.create(
        {
            "service.name": os.getenv("RAILWAY_SERVICE_NAME", "oralboards-agent"),
            "service.version": os.getenv("RAILWAY_GIT_COMMIT_SHA", "dev"),
            "deployment.environment": os.getenv("RAILWAY_ENVIRONMENT_NAME", "local"),
            "railway.project.id": os.getenv("RAILWAY_PROJECT_ID", ""),
            "railway.service.id": os.getenv("RAILWAY_SERVICE_ID", ""),
        },
    )
    maybe_set_otel_providers(otel_resource=resource)
    SQLAlchemyInstrumentor().instrument()


_setup_otel()
tracer = trace.get_tracer("oralboards-agent")


_DEFAULT_STATE: dict = {
    "case": "",
    "case_sources": [],
    "phase": "idle",
    "transcript": [],
    "score_card": "",
    "status": "idle",
}


def _clean_query(query: str) -> str:
    cleaned = re.sub(r'["*]', " ", query).strip()
    return re.sub(r"\s+", " ", cleaned)


def search_docs(query: str, collection: str = "") -> dict:
    """Search bundled oral-board source documents with FTS5/BM25."""
    clean = _clean_query(query)
    if not clean:
        return {"results": [], "error": ""}
    if collection and collection not in VALID_COLLECTIONS:
        return {"results": [], "error": f"unknown collection: {collection}"}

    collection_clause = "and d.collection = ?" if collection else ""
    params: list[str] = [clean]
    if collection:
        params.append(collection)

    sql = f"""
        select
          d.id as docid,
          documents_fts.filepath as filepath,
          d.title as title,
          d.collection as collection,
          snippet(documents_fts, 2, '[', ']', '...', 24) as snippet
        from documents_fts
        join documents d on d.collection || '/' || d.path = documents_fts.filepath
        where documents_fts match ?
          and d.active = 1
          {collection_clause}
        order by bm25(documents_fts)
        limit 10
    """
    try:
        with _connect() as conn:
            rows = conn.execute(sql, params).fetchall()
    except sqlite3.Error as exc:
        return {"results": [], "error": str(exc)}

    return {
        "results": [
            {
                "docid": row["docid"],
                "filepath": row["filepath"],
                "title": row["title"],
                "snippet": row["snippet"],
                "collection": row["collection"],
            }
            for row in rows
        ],
        "error": "",
    }


def read_doc(filepath: str) -> dict:
    """Read a full markdown document body by filepath from the bundled DB."""
    collection, _, path = filepath.partition("/")
    if not path:
        collection = ""
        path = filepath

    sql = """
        select d.id as docid, d.collection, d.path as filepath, d.title, c.doc as body
        from documents d
        join content c on c.hash = d.hash
        where d.path = ?
          and (? = '' or d.collection = ?)
          and d.active = 1
        limit 1
    """
    try:
        with _connect() as conn:
            row = conn.execute(sql, [path, collection, collection]).fetchone()
    except sqlite3.Error as exc:
        return {"error": str(exc)}

    if row is None:
        return {"error": "not found"}

    return {
        "error": "",
        "docid": row["docid"],
        "collection": row["collection"],
        "filepath": f"{row['collection']}/{row['filepath']}",
        "title": row["title"],
        "body": row["body"],
    }


def set_case(tool_context: ToolContext, case: str, sources: list[dict]) -> dict:
    """Write the grounded case vignette and source provenance to shared state."""
    tool_context.state["case"] = case
    tool_context.state["case_sources"] = sources
    tool_context.state["phase"] = "presenting"
    tool_context.state["status"] = "presenting"
    return {"ok": True, "length": len(case), "source_count": len(sources)}


def set_phase(tool_context: ToolContext, phase: str) -> dict:
    """Set the current oral-exam phase."""
    tool_context.state["phase"] = phase
    tool_context.state["status"] = phase
    return {"ok": True, "phase": phase}


def append_exchange(
    tool_context: ToolContext,
    question: str,
    answer: str,
    feedback: str,
    citations: list[dict],
) -> dict:
    """Append one examiner question, candidate answer, and cited feedback."""
    transcript = list(tool_context.state.get("transcript") or [])
    transcript.append(
        {
            "question": question,
            "answer": answer,
            "feedback": feedback,
            "citations": citations,
        },
    )
    tool_context.state["transcript"] = transcript
    tool_context.state["phase"] = "feedback"
    tool_context.state["status"] = "feedback"
    return {"ok": True, "count": len(transcript)}


def set_score_card(tool_context: ToolContext, markdown: str) -> dict:
    """Write the final cited score card to shared state."""
    tool_context.state["score_card"] = markdown
    tool_context.state["phase"] = "complete"
    tool_context.state["status"] = "complete"
    return {"ok": True, "length": len(markdown)}


def on_before_agent(callback_context: CallbackContext) -> None:
    """Initialize missing oral-boards state keys on every turn."""
    for key, default in _DEFAULT_STATE.items():
        if key not in callback_context.state:
            callback_context.state[key] = default


def before_model_modifier(
    callback_context: CallbackContext,
    llm_request: LlmRequest,
) -> LlmResponse | None:
    state = {
        key: callback_context.state.get(key, default)
        for key, default in _DEFAULT_STATE.items()
    }
    try:
        state_json = json.dumps(state, indent=2, default=str)
    except (TypeError, ValueError):
        state_json = "{}"

    db_notice = (
        f"\n\nSOURCE DATABASE ERROR: {DB_STARTUP_ERROR}\n"
        "Do not conduct an exam until the database is available."
        if DB_STARTUP_ERROR
        else ""
    )
    prefix = f"Current oral-boards state:\n{state_json}{db_notice}\n\n"
    original = llm_request.config.system_instruction or ""
    llm_request.config.system_instruction = prefix + str(original)
    return None


_INSTRUCTION = """\
You are an ABPD Oral Clinical Exam practice examiner for pediatric dentistry.

The UI canvas is the source of truth. Never paste a vignette, transcript, or
score card into chat when a state tool can write it.

## Grounding rules
Every clinical claim in the case, feedback, and scoring must come from retrieved
source documents. Before presenting a case, call search_docs and read_doc over
the bundled oral-board sources. Use cody for case style and aapd/abpd for
guidelines, exam structure, scoring, and clinical support.

If retrieval has no coverage for the requested topic, say the source set does
not cover it and offer adjacent topics found through search_docs. Do not fill in
clinical content from model memory.

## Exam flow
1. Pick a topic or use the user's requested topic.
2. Retrieve sources, read the relevant documents, then call set_case with a
   markdown vignette and source chips like {"docid": 1, "title": "...",
   "collection": "aapd"}.
3. Ask one staged question at a time: diagnosis, management, then complications
   or follow-up. Use set_phase("questioning") when asking.
4. After the user answers, retrieve or reuse source documents, then call
   append_exchange with the exact question, the user's answer, concise feedback,
   and citations.
5. At the end, call set_score_card with markdown per-criterion scoring and cited
   feedback, then summarize briefly in chat.

Be firm, source-bound, and concise. This is exam practice, not open-ended Q&A.
"""


oralboards_agent = LlmAgent(
    name="oralboards_agent",
    model=LiteLlm(
        model="openrouter/poolside/laguna-m.1:free",
        fallbacks=[
            "mistral/mistral-small-latest",
            "openrouter/owl-alpha",
            "nvidia_nim/deepseek-ai/deepseek-v4-flash",
        ],
    ),
    instruction=_INSTRUCTION,
    before_agent_callback=on_before_agent,
    before_model_callback=before_model_modifier,
    after_tool_callback=shared_after_tool_callback,
    tools=[
        search_docs,
        read_doc,
        set_case,
        set_phase,
        append_exchange,
        set_score_card,
        AGUIToolset(),
    ],
)

ORALBOARDS_PREDICT_STATE = [
    PredictStateMapping(
        state_key="case",
        tool="set_case",
        tool_argument="case",
        emit_confirm_tool=False,
        stream_tool_call=True,
    ),
]

_shared_session_svc = create_session_service()
_session_container = SessionServiceContainer()
_artifact_svc = InMemoryArtifactService()
_memory_svc = InMemoryMemoryService()
_credential_svc = InMemoryCredentialService()


adk_oralboards_agent = ADKAgent(
    adk_agent=oralboards_agent,
    session_service=_shared_session_svc,
    artifact_service=_artifact_svc,
    memory_service=_memory_svc,
    credential_service=_credential_svc,
    session_timeout_seconds=3600,
    predict_state=ORALBOARDS_PREDICT_STATE,
)

app = FastAPI(title="Oral Boards Examiner Agent")


@app.middleware("http")
async def trace_requests(request, call_next):
    if request.url.path.endswith("/health"):
        return await call_next(request)

    start = time.perf_counter()
    with tracer.start_as_current_span(
        f"{request.method} {request.url.path}",
        attributes={
            "http.request.method": request.method,
            "url.path": request.url.path,
            "url.scheme": request.url.scheme,
        },
    ) as span:
        try:
            response = await call_next(request)
        except Exception as exc:
            span.record_exception(exc)
            span.set_attribute("error.type", type(exc).__name__)
            log.exception("Unhandled error in %s %s", request.method, request.url.path)
            raise

        span.set_attribute("http.response.status_code", response.status_code)
        span.set_attribute(
            "duration_ms",
            round((time.perf_counter() - start) * 1000, 2),
        )
        return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

add_adk_fastapi_endpoint(
    app,
    adk_oralboards_agent,
    path="/agui",
    extract_state_from_request=extract_oralboards_identity_state,
)


@app.get("/health")
async def health():
    session_health = await _session_container.check_database_connection()
    if DB_STARTUP_ERROR:
        return {"status": "unhealthy", "database": "error", "error": DB_STARTUP_ERROR}
    return session_health

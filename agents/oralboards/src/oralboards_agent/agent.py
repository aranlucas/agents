"""Oral boards examiner agent domain: state, tools, instructions."""

import asyncio
import re
import sqlite3
from typing import Annotated, Literal, TypedDict

from ag_ui_adk import AGUIToolset
from agents_shared.prompts import canvas_contract
from agents_shared.state import make_state_initializer, make_state_instruction
from agents_shared.tools import (
    DEFAULT_RETRY_CONFIG,
    build_model,
    on_model_error_callback,
)
from google.adk.agents import LlmAgent
from google.adk.tools import FunctionTool, ToolContext
from pydantic import BaseModel, Field

from .db import VALID_COLLECTIONS, connect


# ---------------------------------------------------------------------------
# State model
# ---------------------------------------------------------------------------
class CaseSource(TypedDict):
    docid: int
    filepath: str
    title: str
    snippet: str
    collection: str


class OralBoardsExchange(TypedDict):
    question: str
    answer: str
    feedback: str
    ideal_response: str


class OralBoardsState(BaseModel):
    """Default shared-state shape for the oral-boards examiner agent."""

    case: str = ""
    case_sources: list[CaseSource] = []
    transcript: list[OralBoardsExchange] = []
    score_card: str = ""
    status: str = "idle"
    loading_step: str = ""


# ---------------------------------------------------------------------------
# Tool argument schemas
# ---------------------------------------------------------------------------
class AppendExchangeSchema(BaseModel):
    """Explicit parameter schema for `append_exchange`.

    Each field corresponds to one flat function parameter the LLM sees.
    """

    question: str = Field(
        description="The exact question text the examiner asked the candidate"
    )
    answer: str = Field(description="The candidate's verbatim answer to the question")
    feedback: str = Field(
        description=(
            "Cited feedback markdown. Must begin with: **Interview phase:** "
            "<phase name from 4a–4e>. Followed by concise cited feedback."
        )
    )
    ideal_response: str = Field(
        description=(
            "Model answer the candidate should have given, grounded in the "
            "sourced documents"
        )
    )


class SetCaseSchema(BaseModel):
    """Explicit parameter schema for `set_case`."""

    case: str = Field(description="The grounded case vignette in concise markdown")
    case_sources: list[CaseSource] | None = Field(
        default=None,
        description=(
            "Source provenance: list of {docid, filepath, title, snippet, "
            "collection} dicts from search_docs results"
        ),
    )


# ---------------------------------------------------------------------------
# Query helpers
# ---------------------------------------------------------------------------
def _clean_query(query: str) -> str:
    cleaned = re.sub(r'["*]', " ", query).strip()
    return re.sub(r"\s+", " ", cleaned)


# ---------------------------------------------------------------------------
# Domain / search tools
# ---------------------------------------------------------------------------
async def search_docs(
    query: Annotated[
        str,
        Field(
            description="Free-text search terms (BM25-optimized; quotes and wildcards are stripped automatically)"
        ),
    ],
    collection: Annotated[
        Literal["", "aapd", "abpd", "cody"],
        Field(description="Optional source collection filter. Omit to search all."),
    ] = "",
) -> dict:
    """Search bundled oral-board source documents with FTS5/BM25."""
    clean = _clean_query(query)
    if not clean:
        return {
            "status": "error",
            "results": [],
            "error": "query is empty after cleaning",
        }
    if collection and collection not in VALID_COLLECTIONS:
        return {
            "status": "error",
            "results": [],
            "error": f"unknown collection: {collection}",
        }

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
    """  # noqa: S608 — collection_clause is a literal "and d.collection = ?" or ""; user input goes through params

    def _query() -> list:
        with connect() as conn:
            return conn.execute(sql, params).fetchall()

    try:
        rows = await asyncio.to_thread(_query)
    except sqlite3.Error as exc:
        return {"status": "error", "results": [], "error": str(exc)}

    results = [
        {
            "docid": row["docid"],
            "filepath": row["filepath"],
            "title": row["title"],
            "snippet": row["snippet"],
            "collection": row["collection"],
        }
        for row in rows
    ]
    return {
        "status": "success",
        "results": results,
        "error": "",
        "count": len(results),
    }


async def read_doc(
    filepath: Annotated[
        str,
        Field(
            description=(
                'Filepath from a search_docs result (e.g. "aapd/some-guideline.md")'
            ),
        ),
    ],
) -> dict:
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

    def _query() -> object:
        with connect() as conn:
            return conn.execute(sql, [path, collection, collection]).fetchone()

    try:
        row = await asyncio.to_thread(_query)
    except sqlite3.Error as exc:
        return {"status": "error", "error": str(exc)}

    if row is None:
        return {"status": "error", "error": "not found"}

    return {
        "status": "success",
        "docid": row["docid"],
        "collection": row["collection"],
        "filepath": f"{row['collection']}/{row['filepath']}",
        "title": row["title"],
        "body": row["body"],
        "error": "",
    }


# ---------------------------------------------------------------------------
# State / canvas tools
# ---------------------------------------------------------------------------
def set_case(
    tool_context: ToolContext,
    case: Annotated[
        str, Field(description="Grounded case vignette in concise markdown")
    ],
    case_sources: Annotated[
        list[CaseSource],
        Field(
            description=(
                "Source provenance list from search_docs results: "
                "{docid, filepath, title, snippet, collection}"
            ),
        ),
    ] = (),
) -> dict:
    """Write the grounded case vignette and source provenance to shared state."""
    tool_context.state["case"] = case
    tool_context.state["case_sources"] = case_sources or []
    tool_context.state["status"] = "presenting"
    return {"status": "success", "ok": True, "length": len(case)}


def set_phase(
    tool_context: ToolContext,
    phase: Annotated[
        Literal["presenting", "questioning", "complete"],
        Field(description="Exam phase to transition to"),
    ],
) -> dict:
    """Set the current oral-exam status phase."""
    tool_context.state["status"] = phase
    return {"status": "success", "ok": True, "phase": phase}


def set_loading_step(
    tool_context: ToolContext,
    step: Annotated[
        str,
        Field(
            description=(
                "Human-readable progress message shown during long operations. "
                "See the loading-step protocol table in the static instruction."
            ),
        ),
    ],
) -> dict:
    """Report a human-readable progress step during search or generation phases."""
    tool_context.state["loading_step"] = step
    return {"status": "success", "ok": True}


def append_exchange(
    tool_context: ToolContext,
    question: Annotated[
        str, Field(description="The exact question text the examiner asked")
    ],
    answer: Annotated[str, Field(description="The candidate's verbatim answer")],
    feedback: Annotated[
        str,
        Field(
            description=(
                "Cited feedback markdown. Must begin with: **Interview phase:** "
                "<phase name from 4a–4e>."
            ),
        ),
    ],
    ideal_response: Annotated[
        str,
        Field(
            description="Model answer the candidate should have given, grounded in sourced documents"
        ),
    ],
) -> dict:
    """Append one examiner question, candidate answer, cited feedback, and ideal response."""
    transcript = list(tool_context.state.get("transcript") or [])
    transcript.append(
        {
            "question": question,
            "answer": answer,
            "feedback": feedback,
            "ideal_response": ideal_response,
        },
    )
    tool_context.state["transcript"] = transcript
    tool_context.state["status"] = "questioning"
    return {"status": "success", "ok": True, "count": len(transcript)}


def set_score_card(
    tool_context: ToolContext,
    markdown: Annotated[
        str,
        Field(
            description=(
                "Final score card markdown with per-domain ABPD 1-3 scores, "
                "weights, weighted composite, and cited rationale"
            ),
        ),
    ],
) -> dict:
    """Write the final cited score card to shared state."""
    tool_context.state["score_card"] = markdown
    tool_context.state["status"] = "complete"
    return {"status": "success", "ok": True, "length": len(markdown)}


# ---------------------------------------------------------------------------
# Static instruction
# ---------------------------------------------------------------------------
_CANVAS_CONTRACT = canvas_contract(
    artifact="oral-board case, transcript, and score card",
    tools=("set_case", "set_phase", "append_exchange", "set_score_card"),
)

_STATIC_INSTRUCTION = (
    """\
You are an ABPD Oral Clinical Exam (OCE) practice examiner for pediatric dentistry.

The UI canvas is the source of truth.

"""
    + _CANVAS_CONTRACT
    + """

## Source collections
Three bundled collections are available via search_docs and read_doc:
- aapd  — AAPD clinical practice guidelines and best-practice papers
- abpd  — ABPD OCE guides, scoring rubrics, and qualifying-exam structure
- cody  — Oral-boards prep course cases and topic-specific lecture notes

## Grounding rules (non-negotiable)
You MUST call search_docs before producing ANY clinical content — cases, questions,
feedback, or scoring. No exceptions. Never fill in clinical content from memory.

Search strategy:
1. In a single turn, call search_docs with the topic keyword (no collection filter)
   AND call search_docs with collection="aapd" or collection="abpd" in parallel —
   both searches are independent, so fire them together rather than sequentially.
2. Call read_doc on the most relevant filepath(s). When multiple documents look
   relevant, issue all read_doc calls in parallel rather than one at a time.

If search returns no results for a topic, tell the user the corpus doesn't cover
it and offer adjacent topics you found via search_docs. Do not improvise.

## Loading step protocol

Call set_loading_step at each of these moments to show the user what you are doing:

| Moment | Step text |
|--------|-----------|
| Before the first search_docs call when building a case | "Searching clinical guidelines…" |
| Before each read_doc call | "Reading: <document title>…" (use the actual document title) |
| Immediately before calling set_case | "Composing case vignette…" |
| After a candidate submits an answer, before re-searching | "Reviewing your answer…" |
| Before calling append_exchange | "Composing feedback…" |
| Before calling set_score_card | "Computing score card…" |

Always call set_loading_step before the long operation, not after.

## Exam flow

1. Pick a topic or use the user's requested topic.
2. Run search_docs (at minimum: one broad query, one aapd/abpd query).
   Read the top documents with read_doc. Then call set_case with:
   - A concise markdown vignette grounded in what you read.
   - Source chips: [{"docid": N, "title": "...", "collection": "aapd"}, ...].
   In chat, present the case as a real examiner would — introduce the
   patient and scenario in 2-3 natural sentences, then say: "Take your
   time reviewing the details. When you're ready to begin, click
   **Ready to begin** below." Do not ask any clinical questions yet.

3. When the candidate signals readiness, call set_phase("questioning") once.
   Do not call set_phase again for the remainder of the session.

4. Conduct the interview in this sequence unless the case clearly requires
   a different order. For each question:
   a. Call ask_question with the exact question text before writing the question in chat.
   b. Write ONLY that question in chat — one sentence, no elaboration.
   c. STOP COMPLETELY. Do not call any tool. Do not write any more text.
      Do not proceed until a candidate message arrives in the conversation.
   Never answer your own question and never reveal the model answer or
   scoring rationale until set_score_card.

   a. Case orientation / initial impression
      Ask the candidate to identify the key problem, relevant findings,
      immediate concerns, or what they notice first from the vignette.

   b. Data gathering and diagnosis
      Ask what additional history, exam findings, radiographs, risk factors,
      medical considerations, behavior considerations, or differential
      diagnoses are needed. The candidate should arrive at a working
      diagnosis or prioritized differential.

   c. Management and treatment planning
      Ask for the recommended management plan, including prevention,
      behavior guidance, restorative/pulp/trauma/surgical/sedation/
      referral decisions as relevant. Require sequencing, rationale,
      consent, alternatives, and follow-up.

   d. Treatment variations and complications
      Modify the scenario with one clinically meaningful "what if" change.
      Examples: parent refuses treatment, child is uncooperative, swelling
      develops, medical history changes, radiograph changes, tooth becomes
      non-restorable, trauma prognosis changes, or treatment fails.

   e. Communication and professionalism
      Evaluate this throughout every answer. Ask a dedicated
      parent/caregiver communication question when relevant — especially
      for consent, risk explanation, anticipatory guidance, behavior
      guidance, medical complexity, trauma prognosis, or shared
      decision-making.

 5. After the candidate answers each question, re-search or reuse existing
    docs, then call append_exchange with:
    - The exact question text
    - The candidate's verbatim answer
    - Feedback markdown that begins:
        **Interview phase:** <phase name from 4a–4e>
      followed by concise cited feedback
    - The ideal candidate response — a model answer the candidate
      should have given, grounded in the sourced documents
    - Citation chips

6. After the final exchange, call set_score_card with a markdown score card
   containing:
   - Per-domain scores using the ABPD 1-3 scale for each relevant blueprint
     domain. Format: "Domain — Score (weight%)" with cited rationale.
   - A weighted composite score (sum of (domain score × weight) / sum of
     weights) shown as "X.Y / 3.0".
   - Cited feedback tying each score to the candidate's performance.
   Then summarize in 1–2 chat sentences.

Be firm, source-bound, and concise. This is exam practice, not open-ended Q&A.

## ABPD OCE Blueprint domains and weights

When scoring, reference these ABPD blueprint domains and their exam weights.
Only score domains that are relevant to the case — do not score irrelevant domains.

| # | Domain | Weight |
|---|--------|--------|
| 1 | Behavior Guidance | 14 % |
| 2 | Growth and Development | 8 % |
| 3 | Oral Facial Injury, Emergency Care and Oral Surgery | 16 % |
| 4 | Diagnosis, Oral Pathology, Oral Radiology, and Oral Medicine | 10 % |
| 5 | Prevention and Health Promotion | 10 % |
| 6 | Dental Caries Diagnosis, Non-restorative Caries Management and Restorative Treatment | 17 % |
| 7 | Pulp Therapy | 8 % |
| 8 | Special Health Care Needs | 8 % |
| 9 | Advocacy and Education | 4 % |
| 10 | Elements of Pediatric Dental Practice | 5 % |

## ABPD OCE scoring rubric

Score each relevant domain using the official ABPD 3-level scale:

- **Score 3** — The candidate showed a full understanding/application or analysis/evaluation of the knowledge and skills, clinical reasoning, communication, and professionalism required for safe and effective practice for the task being assessed.
- **Score 2** — The candidate showed less than a full understanding/application or analysis/evaluation of the knowledge and skills, clinical reasoning, communication, and professionalism required for safe and effective practice for the task being assessed.
- **Score 1** — The candidate did not show accurate understanding/application or analysis/evaluation of the knowledge and skills, clinical reasoning, communication, and professionalism required for safe and effective practice for the task being assessed.

When writing the score card in step 6, list per-domain scores as **Domain — Score (weight%)** using the 1-3 scale, then compute a weighted composite. Do not invent percentage scores like /100 or /5 — use only the ABPD 1-3 scale.
"""
)

_STATE_INSTRUCTION = make_state_instruction(
    OralBoardsState, header="Current oral-boards state"
)


# ---------------------------------------------------------------------------
# Agent factory
# ---------------------------------------------------------------------------
def build_agent() -> LlmAgent:
    """Fresh LlmAgent instance for the oral-boards examiner."""
    return LlmAgent(
        name="oralboards_agent",
        model=build_model(),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        state_schema=OralBoardsState,
        static_instruction=_STATIC_INSTRUCTION,
        instruction=_STATE_INSTRUCTION,
        before_agent_callback=make_state_initializer(OralBoardsState),
        tools=[
            FunctionTool(search_docs),
            FunctionTool(read_doc),
            FunctionTool(set_case),
            FunctionTool(set_phase),
            FunctionTool(set_loading_step),
            FunctionTool(append_exchange),
            FunctionTool(set_score_card),
            AGUIToolset(),
        ],
    )

"""Oral boards examiner agent domain: state, tools, instructions."""

import re
import sqlite3
from typing import Any

from agents_shared.state import make_state_initializer
from agents_shared.tools import (
    DEFAULT_RETRY_CONFIG,
    build_model,
    on_model_error_callback,
)
from google.adk.agents import LlmAgent
from google.adk.tools import ToolContext
from pydantic import BaseModel

from .db import VALID_COLLECTIONS, connect


# ---------------------------------------------------------------------------
# State model
# ---------------------------------------------------------------------------
class OralBoardsState(BaseModel):
    """Default shared-state shape for the oral-boards examiner agent."""

    case: str = ""
    case_sources: list[Any] = []
    transcript: list[Any] = []
    score_card: str = ""
    status: str = "idle"


# ---------------------------------------------------------------------------
# Query helpers
# ---------------------------------------------------------------------------
def _clean_query(query: str) -> str:
    cleaned = re.sub(r'["*]', " ", query).strip()
    return re.sub(r"\s+", " ", cleaned)


# ---------------------------------------------------------------------------
# Domain / search tools
# ---------------------------------------------------------------------------
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
        with connect() as conn:
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
        with connect() as conn:
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


# ---------------------------------------------------------------------------
# State / canvas tools
# ---------------------------------------------------------------------------
def set_case(tool_context: ToolContext, case: str, sources: list[dict]) -> dict:
    """Write the grounded case vignette and source provenance to shared state."""
    tool_context.state["case"] = case
    tool_context.state["case_sources"] = sources
    tool_context.state["status"] = "presenting"
    return {"ok": True, "length": len(case), "source_count": len(sources)}


def set_phase(tool_context: ToolContext, phase: str) -> dict:
    """Set the current oral-exam status."""
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
    tool_context.state["status"] = "questioning"
    return {"ok": True, "count": len(transcript)}


def set_score_card(tool_context: ToolContext, markdown: str) -> dict:
    """Write the final cited score card to shared state."""
    tool_context.state["score_card"] = markdown
    tool_context.state["status"] = "complete"
    return {"ok": True, "length": len(markdown)}


# ---------------------------------------------------------------------------
# Static instruction
# ---------------------------------------------------------------------------
_STATIC_INSTRUCTION = """\
You are an ABPD Oral Clinical Exam (OCE) practice examiner for pediatric dentistry.

The UI canvas is the source of truth. Never paste a vignette, transcript, or
score card into the chat — always write to state via the canvas tools.

## Source collections
Three bundled collections are available via search_docs and read_doc:
- aapd  — AAPD clinical practice guidelines and best-practice papers
- abpd  — ABPD OCE guides, scoring rubrics, and qualifying-exam structure
- cody  — Oral-boards prep course cases and topic-specific lecture notes

## Grounding rules (non-negotiable)
You MUST call search_docs before producing ANY clinical content — cases, questions,
feedback, or scoring. No exceptions. Never fill in clinical content from memory.

Search strategy:
1. Call search_docs with the topic keyword (no collection filter) to find the
   highest-ranked results across all collections.
2. Call search_docs again with collection="aapd" or collection="abpd" if you need
   guideline-specific or exam-structure content specifically.
3. Call read_doc on the most relevant filepath(s) to read the full document body
   before writing the case or feedback.

If search returns no results for a topic, tell the user the corpus doesn't cover
it and offer adjacent topics you found via search_docs. Do not improvise.

## Exam flow
1. Pick a topic or use the user's requested topic.
2. Run search_docs (at minimum: one broad query, one aapd/abpd query).
   Read the top documents with read_doc. Then call set_case with:
   - A concise markdown vignette grounded in what you read.
   - Source chips: [{"docid": N, "title": "...", "collection": "aapd"}, ...].
3. Call set_phase("questioning") once, then ask the first question.
4. After the user answers, re-search or reuse existing docs, then call
   append_exchange with the exact question text, the user's verbatim answer,
   concise cited feedback, and citation chips. append_exchange automatically
   keeps the status at "questioning" — do NOT call set_phase again.
5. Ask the next question. Repeat step 4 for each subsequent answer.
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



_STATE_INSTRUCTION = """\
Current oral-boards state:
- Case: {case}
- Case sources: {case_sources}
- Status: {status}
- Transcript: {transcript}
- Score card: {score_card}
"""


# ---------------------------------------------------------------------------
# Agent factory
# ---------------------------------------------------------------------------
def build_agent() -> LlmAgent:
    """Fresh LlmAgent instance for the oral-boards examiner."""
    from ag_ui_adk import AGUIToolset

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
            search_docs,
            read_doc,
            set_case,
            set_phase,
            append_exchange,
            set_score_card,
            AGUIToolset(),
        ],
    )

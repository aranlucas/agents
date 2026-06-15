"""Oral boards examiner agent domain: state, tools, instructions."""

import asyncio
import re
import sqlite3
from typing import TypedDict

from ag_ui_adk import AGUIToolset
from agents_shared.prompts import canvas_contract
from agents_shared.state import make_state_initializer, make_state_instruction
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
    citations: list[CaseSource]


class OralBoardsState(BaseModel):
    """Default shared-state shape for the oral-boards examiner agent."""

    case: str = ""
    case_sources: list[CaseSource] = []
    transcript: list[OralBoardsExchange] = []
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
async def search_docs(query: str, collection: str = "") -> dict:
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
    """  # noqa: S608 — collection_clause is a literal "and d.collection = ?" or ""; user input goes through params

    def _query() -> list:
        with connect() as conn:
            return conn.execute(sql, params).fetchall()

    try:
        rows = await asyncio.to_thread(_query)
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


async def read_doc(filepath: str) -> dict:
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
        return {"error": str(exc)}

    if row is None:
        return {"error": "not found"}

    return {
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
    case: str,
    case_sources: list[CaseSource] | None = None,
) -> dict:
    """Write the grounded case vignette and source provenance to shared state."""
    tool_context.state["case"] = case
    tool_context.state["case_sources"] = case_sources or []
    tool_context.state["status"] = "presenting"
    return {"ok": True}


def set_phase(tool_context: ToolContext, phase: str) -> dict:
    """Set the current oral-exam status."""
    tool_context.state["status"] = phase
    return {"ok": True, "phase": phase}


def append_exchange(
    tool_context: ToolContext,
    question: str,
    answer: str,
    feedback: str,
    citations: list[CaseSource],
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
    return {"ok": True}


def set_score_card(tool_context: ToolContext, markdown: str) -> dict:
    """Write the final cited score card to shared state."""
    tool_context.state["score_card"] = markdown
    tool_context.state["status"] = "complete"
    return {"ok": True}


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
            search_docs,
            read_doc,
            set_case,
            set_phase,
            append_exchange,
            set_score_card,
            AGUIToolset(),
        ],
    )

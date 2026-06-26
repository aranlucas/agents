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
    stop_on_terminal_text,
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
    collection: str


# Cognitive skill level from the ABPD OCE blueprint "Skill" column.
OralBoardsSkill = Literal["remember", "understand_apply", "analyze_evaluate"]


class OralBoardsExchange(TypedDict):
    question: str
    answer: str
    feedback: str
    ideal_response: str
    skillset: str
    skill: str
    score: int
    citations: list[CaseSource]


class SkillsetScore(TypedDict):
    skillset: str
    skill: str
    score: int
    rationale: str


class OralBoardsState(BaseModel):
    """Default shared-state shape for the oral-boards examiner agent."""

    case: str = ""
    case_sources: list[CaseSource] = []
    case_passages: str = ""
    transcript: list[OralBoardsExchange] = []
    score_card: str = ""
    score_summary: list[SkillsetScore] = []
    outcome: str = ""
    status: str = "idle"
    loading_step: str = ""
    current_question: str = ""
    interview_complete: bool = False
    # Streamed token-by-token while append_exchange is generating; cleared when
    # the exchange commits to transcript.  The UI shows these fields live.
    active_feedback: str = ""
    active_ideal_response: str = ""


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
    skillset: str = Field(
        description=(
            "The ABPD blueprint domain this question assessed, e.g. 'Pulp Therapy' "
            "(use an exact domain name from the blueprint table)"
        )
    )
    skill: OralBoardsSkill = Field(
        description=(
            "Blueprint cognitive skill level the question targeted: 'remember', "
            "'understand_apply', or 'analyze_evaluate'"
        )
    )
    feedback: str = Field(
        description=(
            "Cited feedback markdown. Must begin with: **Skillset:** <domain> · "
            "<skill level>. Followed by concise cited feedback. (Practice coaching "
            "only — the real OCE gives no feedback.)"
        )
    )
    ideal_response: str = Field(
        description=(
            "Model answer the candidate should have given, grounded in the "
            "sourced documents"
        )
    )
    score: int = Field(
        description="Practice score for this skillset on the ABPD 1-3 scale (1, 2, or 3)"
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


def _extract_passage(body: str, query: str, max_chars: int = 600) -> str:
    """Return the most relevant section of a document body for the given query.

    Finds the first occurrence of the longest query word (>4 chars) in the
    body and returns up to max_chars of text centered on that position.
    Falls back to the document start if no word matches.
    """
    body_lower = body.lower()
    words = sorted(
        (w.lower() for w in query.split() if len(w) > 4),
        key=len,
        reverse=True,
    )
    best_pos = next(
        (body_lower.find(w) for w in words if body_lower.find(w) != -1),
        -1,
    )
    if best_pos == -1:
        return body[:max_chars]
    start = max(0, best_pos - max_chars // 2)
    return body[start : start + max_chars]


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
          snippet(documents_fts, 2, '[', ']', '...', 24) as snippet,
          c.doc as body
        from documents_fts
        join documents d on d.collection || '/' || d.path = documents_fts.filepath
        join content c on c.hash = d.hash
        where documents_fts match ?
          and d.active = 1
          {collection_clause}
        order by bm25(documents_fts)
        limit 5
    """  # noqa: S608 — collection_clause is a literal "and d.collection = ?" or ""; user input goes through params

    def _query() -> list:
        with connect() as conn:
            rows = conn.execute(sql, params).fetchall()
            return [dict(row) for row in rows]

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
            "passage": _extract_passage(row["body"], clean),
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
    case_passages: Annotated[
        list[str],
        Field(
            description=(
                "Relevant text passages from search_docs results (the 'passage' field "
                "of each result). Stored in state so the evaluator can ground feedback "
                "without re-searching."
            ),
        ),
    ] = (),
) -> dict:
    """Write the grounded case vignette, source provenance, and passages to shared state."""
    tool_context.state["case"] = case
    tool_context.state["case_sources"] = case_sources or []
    tool_context.state["case_passages"] = (
        "\n\n---\n\n".join(case_passages) if case_passages else ""
    )
    tool_context.state["interview_complete"] = False
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
    skillset: Annotated[
        str,
        Field(
            description=(
                "The ABPD blueprint domain this question assessed, e.g. "
                "'Pulp Therapy' (exact domain name from the blueprint table)"
            ),
        ),
    ],
    skill: Annotated[
        OralBoardsSkill,
        Field(
            description=(
                "Blueprint cognitive skill level the question targeted: "
                "'remember', 'understand_apply', or 'analyze_evaluate'"
            ),
        ),
    ],
    feedback: Annotated[
        str,
        Field(
            description=(
                "Cited feedback markdown. Must begin with: **Skillset:** <domain> "
                "· <skill level>. (Practice coaching only — the real OCE gives no "
                "feedback during the exam.)"
            ),
        ),
    ],
    ideal_response: Annotated[
        str,
        Field(
            description="Model answer the candidate should have given, grounded in sourced documents"
        ),
    ],
    score: Annotated[
        Literal[1, 2, 3],
        Field(description="Practice score for this skillset on the ABPD 1-3 scale"),
    ],
    citations: Annotated[
        list[CaseSource],
        Field(
            description=(
                "Source provenance for this exchange from search_docs results: "
                "{docid, filepath, title, snippet, collection}"
            ),
        ),
    ] = (),
) -> dict:
    """Append one examiner question, answer, cited feedback, score, and ideal response."""
    transcript = list(tool_context.state.get("transcript") or [])
    transcript.append(
        {
            "question": question,
            "answer": answer,
            "skillset": skillset,
            "skill": skill,
            "feedback": feedback,
            "ideal_response": ideal_response,
            "score": score,
            "citations": list(citations) or [],
        },
    )
    tool_context.state["transcript"] = transcript
    tool_context.state["status"] = "questioning"
    tool_context.state["current_question"] = ""
    # Clear streaming preview fields once the exchange is committed.
    tool_context.state["active_feedback"] = ""
    tool_context.state["active_ideal_response"] = ""
    return {"status": "success", "ok": True, "count": len(transcript)}


def set_score_card(
    tool_context: ToolContext,
    markdown: Annotated[
        str,
        Field(
            description=(
                "Narrative score-card markdown: per-skillset rationale and an "
                "overall practice summary. Use ONLY the ABPD 1-3 scale. Do NOT "
                "compute a weighted composite or any /100 or /5 score."
            ),
        ),
    ],
    score_summary: Annotated[
        list[SkillsetScore],
        Field(
            description=(
                "Structured per-skillset scores: list of "
                "{skillset, skill, score (1-3), rationale}. One entry per skillset "
                "assessed in this vignette."
            ),
        ),
    ],
    outcome: Annotated[
        Literal["pass", "borderline", "not_yet"],
        Field(
            description=(
                "Overall practice-outcome estimate. The real OCE is Pass/Fail "
                "decided by examiners; this is a study aid only."
            ),
        ),
    ],
) -> dict:
    """Write the final cited score card, per-skillset scores, and practice outcome."""
    tool_context.state["score_card"] = markdown
    tool_context.state["score_summary"] = list(score_summary) or []
    tool_context.state["outcome"] = outcome
    tool_context.state["status"] = "complete"
    return {"status": "success", "ok": True, "length": len(markdown)}


# ---------------------------------------------------------------------------
# Static instruction
# ---------------------------------------------------------------------------
_CANVAS_CONTRACT = canvas_contract(
    artifact="oral-board case, transcript, and score card",
    tools=("set_case", "set_phase", "append_exchange", "set_score_card"),
)

STATIC_INSTRUCTION = (
    """\
You are an ABPD Oral Clinical Exam (OCE) **practice** examiner for pediatric dentistry.

The UI canvas is the source of truth.

"""
    + _CANVAS_CONTRACT
    + """

## What the OCE is (ground your behavior in this)

The OCE is the second of ABPD's two-part initial certification. It assesses the
specialized knowledge, clinical reasoning, communication, and professionalism
required of an **entry-level** pediatric dentist for **safe and effective practice**.

The real exam: two successive one-hour sessions with two examiners. Each session
presents clinical vignettes for discussion using **open-ended questions**. Examiners
score each **skillset** independently on a 1-3 scale, do not confer or reach a
consensus, give **no feedback** during the exam, and the result is reported
**Pass/Fail**.

How this practice tool differs: you DO coach. After each answer you give cited
feedback, a model answer, and a 1-3 practice score; at the end you give an overall
practice-outcome estimate. Tell the candidate once, up front, that real examiners
withhold feedback and the real result is Pass/Fail — this tool coaches to help them
learn.

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
   Then call ask_question with kind='ready' and question="When you are ready
   to begin the examination, click Begin Examination." This frontend tool
   waits for the candidate's response. Do not ask any clinical questions yet.

3. After ask_question returns {answer: "ready"}, call set_phase("questioning") once.
   Do not call set_phase again for the remainder of the session.

4. Identify the **blueprint skillsets present in this vignette** — the domains
   from the blueprint table below that this case can legitimately assess.
   Conduct an **open-ended** interview that works through those relevant
   skillsets in a sensible clinical order. A typical progression (adapt to the
   case):
   - Orientation / initial impression — key problem, relevant findings,
     immediate concerns, what the candidate notices first.
   - Data gathering and diagnosis — additional history, exam findings,
     radiographs, risk factors, medical/behavior considerations, and
     differentials leading to a working diagnosis.
   - Management and treatment planning — the plan with sequencing, rationale,
     consent, alternatives, and follow-up.
   - A realistic complication or "what if" variation — e.g. parent refuses
     treatment, child is uncooperative, swelling develops, history changes,
     tooth becomes non-restorable, prognosis changes, or treatment fails.
   - Communication and professionalism with the caregiver — consent, risk
     explanation, anticipatory guidance, shared decision-making.

   Cover every skillset the vignette reasonably supports — the most important
   thing is that the candidate **proceeds through all relevant skillsets**. Do
   not let the candidate stall: if an answer is vague, ask them to commit to and
   defend a position.

   For each question, call ask_question with kind='answer' and the exact
   open-ended question text. This frontend tool waits for the candidate's
   response and returns {answer: <candidate response>}. Do not also write the
   question in chat.

5. After ask_question returns, use its answer field as the candidate's verbatim
   answer. Re-search or reuse existing docs,
   then call append_exchange with:
   - question — the exact question text
   - answer — the candidate's verbatim answer
   - skillset — the blueprint domain assessed (exact domain name from the table)
   - skill — the cognitive level the question targeted: remember,
     understand_apply, or analyze_evaluate
   - feedback — markdown that begins **Skillset:** <domain> · <skill level>,
     then concise cited feedback
   - ideal_response — the model answer the candidate should have given, grounded
     in the sourced documents
   - score — the 1-3 practice score for this skillset (see rubric below)
   - citations — the CaseSource chips you used

6. After the final exchange, call set_score_card with:
   - score_summary — one entry per skillset you assessed:
     {skillset, skill, score (1-3), rationale}
   - outcome — an overall practice estimate: pass, borderline, or not_yet
   - markdown — a short narrative tying the scores to the candidate's
     performance, plus a one-line note that the real OCE outcome is Pass/Fail
     decided by examiners.
   Score each skillset **independently** on the 1-3 scale, exactly as ABPD does.
   Do NOT compute a weighted composite and do NOT invent /100 or /5 scores.
   Then summarize in 1-2 chat sentences.

Be firm, source-bound, and concise. This is exam practice, not open-ended Q&A.

## ABPD OCE Blueprint domains and weights

When choosing which skillsets a vignette assesses, reference these ABPD blueprint
domains and their exam weights. Only assess and score domains relevant to the
case. The weight reflects each domain's share of the overall exam — use it to
prioritize emphasis when a case could touch several domains, NOT to compute a
composite score.

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

## Blueprint skill levels (the "Skill" column)

Every blueprint task is assessed at one cognitive level. Tag each question and
its score with the level it targets:
- **remember** — recall facts, terms, and basic concepts.
- **understand_apply** — explain concepts and apply knowledge to the clinical
  situation.
- **analyze_evaluate** — analyze, compare, and evaluate to reach and defend a
  decision.
Diagnostic and management judgment tasks are typically analyze_evaluate; factual
recognition tasks are remember or understand_apply.

## ABPD OCE scoring rubric

Score each relevant skillset using the official ABPD 3-level scale:

- **Score 3** — The candidate showed a full understanding/application or analysis/evaluation of the knowledge and skills, clinical reasoning, communication, and professionalism required for safe and effective practice for the task being assessed.
- **Score 2** — The candidate showed less than a full understanding/application or analysis/evaluation of the knowledge and skills, clinical reasoning, communication, and professionalism required for safe and effective practice for the task being assessed.
- **Score 1** — The candidate did not show accurate understanding/application or analysis/evaluation of the knowledge and skills, clinical reasoning, communication, and professionalism required for safe and effective practice for the task being assessed.

Score each skillset independently on the 1-3 scale. Do not invent percentage
scores like /100 or /5, and do not compute a weighted composite.
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
        after_model_callback=stop_on_terminal_text,
        state_schema=OralBoardsState,
        static_instruction=STATIC_INSTRUCTION,
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

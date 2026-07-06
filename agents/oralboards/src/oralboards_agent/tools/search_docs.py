import asyncio
import sqlite3
from typing import Annotated, Literal

from google.adk.tools import ToolContext
from pydantic import Field, TypeAdapter, ValidationError

from ..db import VALID_COLLECTIONS, connect
from ._types import (
    SNIPPET_ELLIPSIS,
    SNIPPET_MARK_CLOSE,
    SNIPPET_MARK_OPEN,
    DocRow,
    anchor_passage,
    clean_query,
)

_DOC_ROWS = TypeAdapter(list[DocRow])

# Hard budget per search episode (one case build, or one evaluator re-search).
# Enforced in code, not just prompted, because small models don't reliably
# stop after "fire two calls" — they keep reformulating the query. The
# counter is reset by set_case / append_exchange / ask_probe, which mark the
# end of the episode that earned the budget.
MAX_SEARCH_CALLS = 2
SEARCH_CALL_COUNT_KEY = "_search_docs_calls"

# Candidate-pool shape handed to the reranking LLM: the overall BM25 top
# slice, plus each collection's best hits so a single unfiltered call still
# surfaces minority-collection docs (e.g. cody case narratives behind a wall
# of aapd guidelines).
OVERALL_TOP = 8
PER_COLLECTION_TOP = 2
RESULT_LIMIT = 10


def _row_to_dict(row: sqlite3.Row) -> dict[str, object]:
    return {key: row[key] for key in tuple(row.keys())}


async def search_docs(
    tool_context: ToolContext,
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
) -> dict[str, object]:
    """Search bundled oral-board source documents with FTS5/BM25."""
    calls = tool_context.state.get(SEARCH_CALL_COUNT_KEY, 0)
    if calls >= MAX_SEARCH_CALLS:
        return {
            "status": "error",
            "results": [],
            "error": (
                f"search budget exhausted ({MAX_SEARCH_CALLS} calls used) — "
                "stop searching and proceed with the passages you already have"
            ),
        }

    clean = clean_query(query)
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
    params: list[object] = [clean]
    if collection:
        params.append(collection)
    params += [OVERALL_TOP, PER_COLLECTION_TOP, RESULT_LIMIT]

    sql = f"""
        with matches as (
          select
            d.id as docid,
            documents_fts.filepath as filepath,
            d.title as title,
            d.collection as collection,
            snippet(documents_fts, 2,
                    '{SNIPPET_MARK_OPEN}', '{SNIPPET_MARK_CLOSE}',
                    '{SNIPPET_ELLIPSIS}', 24) as snippet,
            c.doc as body,
            -bm25(documents_fts) as score
          from documents_fts
          join documents d on d.collection || '/' || d.path = documents_fts.filepath
          join content c on c.hash = d.hash
          where documents_fts match ?
            and d.active = 1
            {collection_clause}
        ),
        ranked as (
          select *,
            row_number() over (order by score desc) as overall_rank,
            row_number() over (partition by collection order by score desc)
              as collection_rank
          from matches
        )
        select docid, filepath, title, collection, snippet, body, score
        from ranked
        where overall_rank <= ? or collection_rank <= ?
        order by score desc
        limit ?
    """  # noqa: S608

    def _query() -> list[DocRow]:
        with connect() as conn:
            rows = conn.execute(sql, params).fetchall()
            return _DOC_ROWS.validate_python([_row_to_dict(row) for row in rows])

    try:
        rows = await asyncio.to_thread(_query)
    except sqlite3.Error as exc:
        return {"status": "error", "results": [], "error": str(exc)}
    except ValidationError:
        return {"status": "error", "results": [], "error": "invalid search row"}

    tool_context.state[SEARCH_CALL_COUNT_KEY] = calls + 1

    results = [
        {
            "docid": row["docid"],
            "filepath": row["filepath"],
            "title": row["title"],
            "snippet": row.get("snippet", ""),
            "collection": row["collection"],
            "score": round(row.get("score", 0.0), 2),
            "passage": anchor_passage(row["body"], row.get("snippet", ""), clean),
        }
        for row in rows
    ]
    return {"status": "success", "results": results, "error": "", "count": len(results)}

import asyncio
import sqlite3
from typing import Annotated, Literal

from google.adk.tools import FunctionTool
from pydantic import Field

from ..db import VALID_COLLECTIONS, connect
from ._types import _clean_query, _extract_passage


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
    """  # noqa: S608

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
    return {"status": "success", "results": results, "error": "", "count": len(results)}


tool = FunctionTool(search_docs)

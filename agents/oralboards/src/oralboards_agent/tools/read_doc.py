import asyncio
import sqlite3
from typing import Annotated

from google.adk.tools import FunctionTool
from pydantic import Field, TypeAdapter, ValidationError

from ..db import connect
from ._types import DocRow

_DOC_ROW = TypeAdapter(DocRow)


def _row_to_dict(row: sqlite3.Row) -> dict[str, object]:
    return {key: row[key] for key in tuple(row.keys())}


async def read_doc(
    filepath: Annotated[
        str,
        Field(
            description='Filepath from a search_docs result (e.g. "aapd/some-guideline.md")',
        ),
    ],
) -> dict[str, object]:
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

    def _query() -> sqlite3.Row | None:
        with connect() as conn:
            return conn.execute(sql, [path, collection, collection]).fetchone()

    try:
        row = await asyncio.to_thread(_query)
    except sqlite3.Error as exc:
        return {"status": "error", "error": str(exc)}

    if row is None:
        return {"status": "error", "error": "not found"}

    try:
        doc = _DOC_ROW.validate_python(_row_to_dict(row))
    except ValidationError:
        return {"status": "error", "error": "invalid document row"}

    return {
        "status": "success",
        "docid": doc["docid"],
        "collection": doc["collection"],
        "filepath": f"{doc['collection']}/{doc['filepath']}",
        "title": doc["title"],
        "body": doc["body"],
        "error": "",
    }


tool = FunctionTool(read_doc)

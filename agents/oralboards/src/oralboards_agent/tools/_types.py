import re
from typing import Literal, NotRequired, TypedDict


class CaseSource(TypedDict):
    docid: int
    filepath: str
    title: str
    collection: str


class DocRow(CaseSource):
    body: str
    snippet: NotRequired[str]
    score: NotRequired[float]


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


def clean_query(query: str) -> str:
    cleaned = re.sub(r'["*]', " ", query).strip()
    return re.sub(r"\s+", " ", cleaned)


# Marker/separator strings inserted by the FTS5 snippet() call in search_docs.
# «» never occur in the corpus, so stripping them recovers verbatim body text.
SNIPPET_MARK_OPEN = "«"
SNIPPET_MARK_CLOSE = "»"
SNIPPET_ELLIPSIS = " … "

_SNIPPET_MARKS = re.compile(
    re.escape(SNIPPET_MARK_OPEN) + r"([^»]+)" + re.escape(SNIPPET_MARK_CLOSE)
)


def anchor_passage(body: str, snippet: str, query: str, max_chars: int = 600) -> str:
    """Passage centered on the region FTS5 matched, not a raw substring guess.

    The snippet is body text with «» wrapped around matched tokens, so it
    locates the BM25 match even when the query word only matches via porter
    stemming (query "splinting" vs body "splinted") and raw substring search
    would miss.
    """
    fragments = [
        fragment.replace(SNIPPET_MARK_OPEN, "").replace(SNIPPET_MARK_CLOSE, "").strip()
        for fragment in snippet.split(SNIPPET_ELLIPSIS)
    ]
    for fragment in sorted(fragments, key=len, reverse=True):
        if len(fragment) < 8:
            continue
        pos = body.find(fragment)
        if pos != -1:
            start = max(0, pos + len(fragment) // 2 - max_chars // 2)
            return body[start : start + max_chars]
    # Marked terms are body surface forms (post-stemming), unlike query words.
    body_lower = body.lower()
    for term in sorted(_SNIPPET_MARKS.findall(snippet), key=len, reverse=True):
        pos = body_lower.find(term.lower())
        if pos != -1:
            start = max(0, pos - max_chars // 2)
            return body[start : start + max_chars]
    return extract_passage(body, query, max_chars)


def extract_passage(body: str, query: str, max_chars: int = 600) -> str:
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

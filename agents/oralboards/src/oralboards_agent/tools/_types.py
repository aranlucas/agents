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

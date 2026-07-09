"""Deterministic question-craft gate for examiner questions.

Pure heuristics — no LLM. The orchestrator runs every questioner draft
through :func:`question_craft_violations`; on violations it feeds the list
back into state (``question_craft_feedback``) and re-runs the questioner
once. Conservative on purpose: it only flags patterns that are almost
always wrong in an exam question (answer-content leaks, stacked asks,
run-on length), so a clean question is never rejected.
"""

_ANSWER_LEAK_PHRASES = ("such as", "for example", "for instance", "e.g.")
_STACKED_ASK_PATTERNS = ("and how would", "and what would", "and why would")
_MAX_WORDS = 45


def question_craft_violations(question: str) -> list[str]:
    """Return human-readable question-craft violations (empty list = OK)."""
    violations: list[str] = []
    text = question.lower()

    leaks = [phrase for phrase in _ANSWER_LEAK_PHRASES if phrase in text]
    if leaks:
        listed = ", ".join(f"'{phrase}'" for phrase in leaks)
        violations.append(
            f"leaks answer content ({listed}) — never enumerate the "
            "findings/diagnoses/materials the candidate is expected to supply"
        )

    stacked = text.count("?") > 1 or any(
        pattern in text for pattern in _STACKED_ASK_PATTERNS
    )
    if stacked:
        violations.append(
            "stacks multiple asks — ask ONE question testing ONE cognitive act; "
            "the follow-up is a later question or a probe"
        )

    word_count = len(question.split())
    if word_count > _MAX_WORDS:
        violations.append(
            f"too long ({word_count} words > {_MAX_WORDS}) — keep it under "
            "~30 words, open-ended, second person"
        )

    return violations

"""Unit tests for the deterministic question-craft gate."""

import pytest
from oralboards_agent.question_craft import question_craft_violations

# The exact question that shipped in production: it enumerates the findings
# the candidate was supposed to supply ("such as ...") AND stacks a second
# ask ("and how would ... impact ..."), so the candidate just parroted the
# list back. The gate must flag it.
_PRODUCTION_FAILURE = (
    "What specific radiographic signs or abnormalities, such as the presence "
    "of supernumerary teeth, tooth crowding, or root resorption, would you "
    "closely examine on the panoramic and periapical radiographs of this "
    "8-year-old patient with a bilateral posterior crossbite and maxillary "
    "arch constriction, and how would the presence or absence of these "
    "findings impact your overall diagnosis and subsequent treatment planning?"
)


def test_production_failure_is_flagged_for_leak_and_stacked_ask() -> None:
    violations = question_craft_violations(_PRODUCTION_FAILURE)

    joined = " ".join(violations)
    assert "'such as'" in joined  # answer-content leak
    assert any("stacks multiple asks" in v for v in violations)
    assert len(violations) >= 2


def test_production_failure_is_also_flagged_for_length() -> None:
    violations = question_craft_violations(_PRODUCTION_FAILURE)
    assert any("too long" in v for v in violations)


@pytest.mark.parametrize(
    "question",
    [
        "How would radiographic findings change your treatment plan for this patient?",
        "What is your working diagnosis for this patient?",
        "How would you manage this avulsed permanent incisor at presentation?",
        "What would you tell the mother about the prognosis of this tooth?",
    ],
)
def test_clean_questions_pass(question: str) -> None:
    assert question_craft_violations(question) == []


@pytest.mark.parametrize(
    "question",
    [
        "What findings, such as caries, would you note?",
        "What findings, for example caries or abscesses, would you note?",
        "What findings, for instance mobility, would you note?",
        "What sequelae (e.g. ankylosis) would you monitor for?",
    ],
)
def test_answer_leak_phrases_are_flagged(question: str) -> None:
    violations = question_craft_violations(question)
    assert any("leaks answer content" in v for v in violations)


@pytest.mark.parametrize(
    "question",
    [
        "What would you look for? How would it change your plan?",
        "What signs concern you, and how would that change your management?",
        "What do you see, and what would you do next?",
        "What is the risk, and why would you accept it?",
    ],
)
def test_stacked_asks_are_flagged(question: str) -> None:
    violations = question_craft_violations(question)
    assert any("stacks multiple asks" in v for v in violations)


def test_long_questions_are_flagged() -> None:
    question = "How would you manage " + "this very complex clinical presentation " * 9
    violations = question_craft_violations(question)
    assert any("too long" in v for v in violations)


def test_length_boundary_is_45_words() -> None:
    forty_five = " ".join(["word"] * 45)
    forty_six = " ".join(["word"] * 46)
    assert question_craft_violations(forty_five) == []
    assert any("too long" in v for v in question_craft_violations(forty_six))


def test_matching_is_case_insensitive() -> None:
    violations = question_craft_violations("What findings, SUCH AS caries, matter?")
    assert any("leaks answer content" in v for v in violations)


def test_empty_question_passes() -> None:
    # The gate never fires on an empty draft — the questioner simply
    # produced nothing to validate.
    assert question_craft_violations("") == []

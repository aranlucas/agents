from main import (
    _PREFS_MARK_END,
    _PREFS_MARK_START,
    _build_prefs_block,
    _strip_old_prefs,
)


def test_build_prefs_block_includes_all_supported_fields():
    block = _build_prefs_block(
        {
            "travelerName": "Maya",
            "homeAirport": "SFO",
            "budgetTier": "comfort",
            "vibe": "food",
            "pace": "relaxed",
            "dietary": "vegetarian",
            "mobility": "step-free where possible",
            "interests": ["markets", "museums"],
        }
    )

    assert block == "\n".join(
        [
            _PREFS_MARK_START,
            "- Traveler: Maya",
            "- Home airport: SFO",
            "- Budget tier: comfort",
            "- Vibe: food",
            "- Pace: relaxed",
            "- Dietary: vegetarian",
            "- Mobility: step-free where possible",
            "- Interests: markets, museums",
            _PREFS_MARK_END,
        ]
    )


def test_build_prefs_block_ignores_empty_preferences():
    assert _build_prefs_block({}) is None
    assert _build_prefs_block({"interests": []}) is None


def test_strip_old_prefs_replaces_only_traveler_brief_block():
    instruction = "\n".join(
        [
            "intro",
            "",
            _PREFS_MARK_START,
            "- Traveler: stale",
            _PREFS_MARK_END,
            "",
            "rules stay",
        ]
    )

    assert _strip_old_prefs(instruction) == "intro\n\nrules stay"

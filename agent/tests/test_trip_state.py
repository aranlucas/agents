import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from utils import (
    DISCOVERY_TOOLS,
    LODGING_TOOLS,
    PROFILE_TOOLS,
    TRANSPORT_TOOLS,
    VIABILITY_TOOLS,
    merge_active_trip,
    normalize_trip_patch,
)


def test_merge_active_trip_preserves_existing_sections():
    current = {
        "origin": "SEA",
        "transport": {"options": [{"price": 120, "currency": "USD", "legs": []}]},
        "updated_at": 1,
    }

    merged = merge_active_trip(
        current,
        {
            "destination": "SFO",
            "lodging": {
                "options": [{"name": "Hotel A", "price": 180, "currency": "USD"}]
            },
        },
        now=2,
    )

    assert merged["origin"] == "SEA"
    assert merged["destination"] == "SFO"
    assert merged["transport"]["options"][0]["price"] == 120
    assert merged["lodging"]["options"][0]["name"] == "Hotel A"
    assert merged["updated_at"] == 2


def test_tool_groups_are_disjoint_enough_for_routing():
    assert "get_preferences" in PROFILE_TOOLS
    assert "search_flights" in TRANSPORT_TOOLS
    assert "search_hotels" in LODGING_TOOLS
    assert "assess_trip" in VIABILITY_TOOLS
    assert "weekend_getaway" in DISCOVERY_TOOLS
    assert (
        "configure_provider"
        not in PROFILE_TOOLS
        + TRANSPORT_TOOLS
        + LODGING_TOOLS
        + VIABILITY_TOOLS
        + DISCOVERY_TOOLS
    )


def test_normalize_trip_patch_for_hotels():
    patch = normalize_trip_patch(
        "search_hotels",
        {
            "location": "San Francisco",
            "check_in": "2026-05-01",
            "check_out": "2026-05-03",
        },
        {
            "success": True,
            "hotels": [{"name": "Hotel A", "price": 180, "currency": "USD"}],
        },
    )

    assert patch["destination"] == "San Francisco"
    assert patch["lodging"]["options"][0]["name"] == "Hotel A"


def test_normalize_trip_patch_for_assess_trip():
    patch = normalize_trip_patch(
        "assess_trip",
        {"origin": "SEA", "destination": "SFO"},
        {
            "success": True,
            "verdict": "viable",
            "checks": [
                {"dimension": "visa", "status": "ok", "summary": "No visa required"}
            ],
            "total_cost": 500,
            "currency": "USD",
        },
    )

    assert patch["origin"] == "SEA"
    assert patch["destination"] == "SFO"
    assert patch["viability"]["verdict"] == "viable"
    assert patch["viability"]["total_cost"] == 500

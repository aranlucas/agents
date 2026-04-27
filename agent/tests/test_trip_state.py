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
    assert "add_booking" in PROFILE_TOOLS
    assert "search_flights" in TRANSPORT_TOOLS
    assert "search_hidden_city" in TRANSPORT_TOOLS
    assert "search_hotels" in LODGING_TOOLS
    assert "assess_trip" in VIABILITY_TOOLS
    assert "search_restaurants" in VIABILITY_TOOLS
    assert "weekend_getaway" in DISCOVERY_TOOLS
    assert "nearby_places" in DISCOVERY_TOOLS
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


def test_normalize_trip_patch_for_route_itineraries():
    patch = normalize_trip_patch(
        "search_route",
        {"origin": "Seattle", "destination": "Vancouver", "date": "2026-05-01"},
        {
            "success": True,
            "itineraries": [
                {
                    "total_price": 75,
                    "currency": "USD",
                    "total_duration": 180,
                    "transfers": 0,
                    "legs": [{"mode": "bus", "from": "Seattle", "to": "Vancouver"}],
                }
            ],
        },
    )

    assert patch["origin"] == "Seattle"
    assert patch["destination"] == "Vancouver"
    assert patch["transport"]["routes"][0]["price"] == 75
    assert patch["transport"]["routes"][0]["duration"] == 180


def test_normalize_trip_patch_for_saved_trip_result():
    patch = normalize_trip_patch(
        "get_trip",
        {"id": "trip_123"},
        {
            "id": "trip_123",
            "name": "Vancouver weekend",
            "status": "planning",
            "updated_at": "2026-04-27T18:00:00Z",
            "legs": [
                {
                    "type": "train",
                    "from": "Seattle",
                    "to": "Vancouver",
                    "provider": "Amtrak",
                    "confirmed": False,
                }
            ],
            "bookings": [],
            "tags": ["weekend"],
            "notes": "Keep it simple",
        },
    )

    assert patch["id"] == "trip_123"
    assert patch["origin"] == "Seattle"
    assert patch["destination"] == "Vancouver"
    assert patch["status"] == "planning"
    assert patch["legs"][0]["provider"] == "Amtrak"


def test_normalize_trip_patch_for_add_trip_leg_result():
    patch = normalize_trip_patch(
        "add_trip_leg",
        {"trip_id": "trip_123"},
        {
            "trip_id": "trip_123",
            "leg": {
                "type": "flight",
                "from": "SEA",
                "to": "YVR",
                "provider": "Air Canada",
                "confirmed": True,
            },
        },
    )

    assert patch["id"] == "trip_123"
    assert patch["legs"][0]["from"] == "SEA"
    assert patch["origin"] == "SEA"
    assert patch["destination"] == "YVR"

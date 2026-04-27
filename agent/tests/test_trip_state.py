from trip_state import merge_active_trip


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
            "lodging": {"options": [{"name": "Hotel A", "price": 180, "currency": "USD"}]},
        },
        now=2,
    )

    assert merged["origin"] == "SEA"
    assert merged["destination"] == "SFO"
    assert merged["transport"]["options"][0]["price"] == 120
    assert merged["lodging"]["options"][0]["name"] == "Hotel A"
    assert merged["updated_at"] == 2

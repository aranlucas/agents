"""Stub implementations of trvl MCP tools for eval runs.

These replace the McpToolset so the agent can execute its full workflow
without a live MCP server. Signatures match what the agent expects.
"""


def search_flights(
    origin: str,
    destination: str,
    departure_date: str,
    return_date: str | None = None,
    travelers: int = 1,
    cabin_class: str = "economy",
) -> dict:
    return {
        "flights": [
            {
                "carrier": "TAP Air Portugal",
                "flight_number": "TP201",
                "departure": f"{departure_date}T10:30",
                "arrival": f"{departure_date}T07:15+1",
                "duration_h": 11.75,
                "stops": 0,
                "price_usd": 680 * travelers,
                "cabin": cabin_class,
            },
            {
                "carrier": "Iberia",
                "flight_number": "IB6253",
                "departure": f"{departure_date}T14:00",
                "arrival": f"{departure_date}T11:05+1",
                "duration_h": 13.0,
                "stops": 1,
                "stop_airports": ["MAD"],
                "price_usd": 520 * travelers,
                "cabin": cabin_class,
            },
        ],
        "note": "[eval stub — prices illustrative]",
    }


def search_hotels(
    destination: str,
    check_in: str,
    check_out: str,
    travelers: int = 1,
    budget_tier: str = "comfort",
) -> dict:
    return {
        "hotels": [
            {
                "name": "Bairro Alto Hotel",
                "stars": 5,
                "neighborhood": "Chiado",
                "price_per_night_usd": 320,
                "rating": 4.8,
                "highlights": ["rooftop bar", "historic building", "central location"],
            },
            {
                "name": "Hotel do Chiado",
                "stars": 4,
                "neighborhood": "Chiado",
                "price_per_night_usd": 210,
                "rating": 4.6,
                "highlights": [
                    "terrace views",
                    "boutique",
                    "walking distance to sights",
                ],
            },
        ],
        "note": "[eval stub — prices illustrative]",
    }


def get_weather(destination: str, date: str) -> dict:
    return {
        "destination": destination,
        "date": date,
        "temp_c": 17,
        "temp_f": 63,
        "conditions": "partly cloudy",
        "rain_chance_pct": 20,
        "note": "[eval stub]",
    }


def check_visa(nationality: str, destination_country: str) -> dict:
    return {
        "required": False,
        "notes": "US passport holders do not require a visa for Portugal (Schengen, up to 90 days).",
        "note": "[eval stub]",
    }


def destination_info(destination: str) -> dict:
    return {
        "destination": destination,
        "country": "Portugal",
        "timezone": "Europe/Lisbon",
        "currency": "EUR",
        "language": "Portuguese",
        "highlights": [
            "Alfama historic district",
            "Belém Tower & Jerónimos Monastery",
            "Pastéis de Belém",
            "Time Out Market",
            "Sintra day trip",
            "Fado music",
        ],
        "note": "[eval stub]",
    }


def get_preferences(user_id: str | None = None) -> dict:
    return {"preferences": {}, "note": "[eval stub — no user preferences loaded]"}


def search_restaurants(
    destination: str,
    cuisine: str | None = None,
    budget_tier: str = "comfort",
) -> dict:
    return {
        "restaurants": [
            {"name": "Time Out Market", "cuisine": "varied", "price_tier": "moderate"},
            {
                "name": "Solar dos Presuntos",
                "cuisine": "Portuguese",
                "price_tier": "moderate",
            },
            {
                "name": "Cervejaria Ramiro",
                "cuisine": "seafood",
                "price_tier": "moderate",
            },
        ],
        "note": "[eval stub]",
    }

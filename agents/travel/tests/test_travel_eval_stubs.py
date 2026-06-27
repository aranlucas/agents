from travel_agent.eval_stubs import (
    check_visa,
    destination_info,
    get_preferences,
    get_weather,
    search_flights,
    search_hotels,
    search_restaurants,
)


def test_search_flights_returns_two_carriers() -> None:
    result = search_flights("LIS", "OPO", "2026-07-01")
    assert len(result["flights"]) == 2
    assert result["flights"][0]["carrier"] == "TAP Air Portugal"
    assert result["flights"][1]["carrier"] == "Iberia"
    assert "note" in result


def test_search_flights_optional_params_propagate() -> None:
    result = search_flights(
        "LIS",
        "OPO",
        "2026-07-01",
        return_date="2026-07-10",
        travelers=2,
        cabin_class="business",
    )
    assert result["flights"][0]["price_usd"] == 680 * 2
    assert result["flights"][0]["cabin"] == "business"


def test_search_hotels_returns_list() -> None:
    result = search_hotels("Lisbon", "2026-07-01", "2026-07-05")
    assert len(result["hotels"]) == 2
    assert result["hotels"][0]["name"] == "Bairro Alto Hotel"


def test_get_weather_returns_forecast() -> None:
    result = get_weather("Lisbon", "2026-07-01")
    assert result["destination"] == "Lisbon"
    assert "temp_c" in result and "conditions" in result


def test_check_visa_returns_boolean() -> None:
    result = check_visa("US", "Portugal")
    assert "required" in result
    assert isinstance(result["required"], bool)


def test_destination_info_has_highlights() -> None:
    result = destination_info("Lisbon")
    assert result["country"] == "Portugal"
    assert len(result["highlights"]) > 0


def test_get_preferences_returns_dict() -> None:
    result = get_preferences("user-123")
    assert "preferences" in result


def test_search_restaurants_returns_list() -> None:
    result = search_restaurants("Lisbon", cuisine="Portuguese")
    assert len(result["restaurants"]) == 3
    assert result["restaurants"][0]["name"] == "Time Out Market"

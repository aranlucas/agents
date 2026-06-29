from typing import NotRequired, Required, TypedDict

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator


class StravaActivity(TypedDict):
    id: Required[str]
    name: Required[str]
    sport_type: NotRequired[str | None]
    start_date: NotRequired[str | None]
    distance_m: NotRequired[float | None]
    moving_time_s: NotRequired[int | None]
    elapsed_time_s: NotRequired[int | None]
    total_elevation_gain_m: NotRequired[float | None]
    average_heartrate: NotRequired[float | None]
    perceived_effort: NotRequired[int | None]


class _StravaActivityPayload(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    id: str = ""
    name: str = "Untitled activity"
    sport_type: str | None = Field(
        default=None, validation_alias=AliasChoices("sport_type", "type")
    )
    start_date: str | None = None
    distance_m: float | None = Field(default=None, validation_alias="distance")
    moving_time_s: int | None = Field(default=None, validation_alias="moving_time")
    elapsed_time_s: int | None = Field(default=None, validation_alias="elapsed_time")
    total_elevation_gain_m: float | None = Field(
        default=None, validation_alias="total_elevation_gain"
    )
    average_heartrate: float | None = None
    perceived_effort: int | None = Field(
        default=None, validation_alias="perceived_exertion"
    )

    @field_validator("id", mode="before")
    @classmethod
    def _coerce_id(_cls, value: object) -> str:
        return str(value)

    @field_validator("name", mode="before")
    @classmethod
    def _default_name(_cls, value: object) -> str:
        return str(value or "Untitled activity")

    @field_validator("sport_type", "start_date", mode="before")
    @classmethod
    def _empty_string_to_none(_cls, value: object) -> object:
        return None if value == "" else value

    @field_validator(
        "distance_m",
        "moving_time_s",
        "elapsed_time_s",
        "total_elevation_gain_m",
        "average_heartrate",
        "perceived_effort",
        mode="before",
    )
    @classmethod
    def _empty_number_to_none(_cls, value: object) -> object:
        return None if value == "" else value


def normalize_strava_activity(activity: dict[str, object]) -> StravaActivity:
    payload = _StravaActivityPayload.model_validate(activity)
    normalized: StravaActivity = {
        "id": payload.id,
        "name": payload.name,
    }

    if payload.sport_type is not None:
        normalized["sport_type"] = payload.sport_type
    if payload.start_date is not None:
        normalized["start_date"] = payload.start_date
    if payload.distance_m is not None:
        normalized["distance_m"] = payload.distance_m
    if payload.moving_time_s is not None:
        normalized["moving_time_s"] = payload.moving_time_s
    if payload.elapsed_time_s is not None:
        normalized["elapsed_time_s"] = payload.elapsed_time_s
    if payload.total_elevation_gain_m is not None:
        normalized["total_elevation_gain_m"] = payload.total_elevation_gain_m
    if payload.average_heartrate is not None:
        normalized["average_heartrate"] = payload.average_heartrate
    if payload.perceived_effort is not None:
        normalized["perceived_effort"] = payload.perceived_effort

    return normalized


def summarize_activities(activities: list[StravaActivity]) -> dict[str, object]:
    distance_m = sum(float(a.get("distance_m") or 0) for a in activities)
    moving_time_s = sum(int(a.get("moving_time_s") or 0) for a in activities)
    elevation_m = sum(float(a.get("total_elevation_gain_m") or 0) for a in activities)
    sport_counts: dict[str, int] = {}
    for activity in activities:
        sport = str(activity.get("sport_type") or "Activity")
        sport_counts[sport] = sport_counts.get(sport, 0) + 1
    return {
        "activity_count": len(activities),
        "distance_km": round(distance_m / 1000, 1),
        "moving_hours": round(moving_time_s / 3600, 1),
        "elevation_m": round(elevation_m),
        "sport_counts": sport_counts,
    }

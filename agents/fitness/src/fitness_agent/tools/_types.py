from typing import NotRequired, Required, TypedDict


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


def normalize_strava_activity(activity: dict[str, object]) -> StravaActivity:
    mapping = {
        "id": str(activity.get("id", "")),
        "name": activity.get("name") or "Untitled activity",
        "sport_type": activity.get("sport_type") or activity.get("type"),
        "start_date": activity.get("start_date"),
        "distance_m": activity.get("distance"),
        "moving_time_s": activity.get("moving_time"),
        "elapsed_time_s": activity.get("elapsed_time"),
        "total_elevation_gain_m": activity.get("total_elevation_gain"),
        "average_heartrate": activity.get("average_heartrate"),
        "perceived_effort": activity.get("perceived_exertion"),
    }
    return {key: value for key, value in mapping.items() if value not in (None, "")}


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

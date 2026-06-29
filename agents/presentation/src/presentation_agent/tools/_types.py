from typing import TypedDict

from pydantic import TypeAdapter, ValidationError


class Slide(TypedDict):
    id: str
    type: str
    heading: str
    body: str
    notes: str


_SLIDES = TypeAdapter(list[Slide])


def normalize_slides(value: object) -> list[Slide]:
    try:
        return _SLIDES.validate_python(value)
    except ValidationError:
        return []

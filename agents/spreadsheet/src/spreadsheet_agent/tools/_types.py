from typing import TypedDict

from pydantic import TypeAdapter, ValidationError


class Sheet(TypedDict):
    title: str
    rows: list[list[str]]


_SHEETS = TypeAdapter(list[Sheet])


def normalize_sheets(value: object) -> list[Sheet]:
    try:
        return _SHEETS.validate_python(value)
    except ValidationError:
        return []

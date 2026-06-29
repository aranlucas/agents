from collections.abc import Callable
from typing import Any

from litellm.integrations.custom_logger import CustomLogger

callbacks: list[Callable[..., object] | str | CustomLogger]

def register_model(*args: Any, **kwargs: Any) -> Any: ...

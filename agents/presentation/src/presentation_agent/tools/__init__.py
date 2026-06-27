from .create_slide import tool as create_slide
from .delete_slide import tool as delete_slide
from .mark_presentation_ready import tool as mark_presentation_ready
from .reorder_slides import tool as reorder_slides
from .set_presentation_meta import tool as set_presentation_meta
from .update_slide import tool as update_slide

__all__ = [
    "set_presentation_meta",
    "create_slide",
    "update_slide",
    "delete_slide",
    "reorder_slides",
    "mark_presentation_ready",
]

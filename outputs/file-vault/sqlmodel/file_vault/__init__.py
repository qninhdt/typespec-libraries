"""file_vault - auto-generated models. DO NOT EDIT."""

from sqlmodel import SQLModel
from . import assistant
from . import audit
from . import identity
from . import metadata
from . import notifications
from . import processing
from . import search
from . import shared
from . import sharing
from . import storage

target_metadata = SQLModel.metadata

__all__ = [
    "assistant",
    "audit",
    "identity",
    "metadata",
    "notifications",
    "processing",
    "search",
    "shared",
    "sharing",
    "storage",
    "target_metadata",
]

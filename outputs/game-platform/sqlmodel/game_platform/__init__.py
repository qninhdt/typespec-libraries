"""game_platform - auto-generated models. DO NOT EDIT."""

from sqlmodel import SQLModel
from . import __associations__
from . import accounts
from . import audit
from . import collaboration
from . import content
from . import forms
from . import shared
from . import worlds

metadata = SQLModel.metadata

__all__ = [
    "accounts",
    "audit",
    "collaboration",
    "content",
    "forms",
    "shared",
    "worlds",
    "metadata",
]

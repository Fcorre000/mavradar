"""Providers that hand the objects the lifespan built to routes through Depends.

Tests swap any of them with app.dependency_overrides.
"""

from typing import cast

from fastapi import Request

from app.config import Settings
from app.repositories.memory import MemoryRepositories


def get_settings(request: Request) -> Settings:
    return cast(Settings, request.app.state.settings)


def get_repositories(request: Request) -> MemoryRepositories:
    return cast(MemoryRepositories, request.app.state.repositories)

"""Shared utilities for the wellness orchestrator agent."""

from __future__ import annotations

import os

GROCERY_AGENT_A2A_URL = os.getenv("GROCERY_AGENT_A2A_URL", "http://localhost:8001/")
FITNESS_AGENT_A2A_URL = os.getenv("FITNESS_AGENT_A2A_URL", "http://localhost:8002/")

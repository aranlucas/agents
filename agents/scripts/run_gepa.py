#!/usr/bin/env python3
"""GEPA prompt optimization for agents in this monorepo.

Runs GEPARootAgentPromptOptimizer against an agent's eval set and prints the
optimized instruction. Uses programmatic setup to avoid the JSON deserialization
limitation in adk optimize when criterion rubrics are specified.

Usage:
    uv run python agents/scripts/run_gepa.py --agent travel
    uv run python agents/scripts/run_gepa.py --agent resume
    uv run python agents/scripts/run_gepa.py --agent grocery
    uv run python agents/scripts/run_gepa.py --agent fitness
    uv run python agents/scripts/run_gepa.py --agent oralboards

Options:
    --agent       Agent name (required)
    --max-calls   Max metric calls / evaluations (default: 15)
    --batch-size  Reflection minibatch size (default: 2)
    --run-dir     Directory to save intermediate results (default: none)
    --print-detailed  Print per-example GEPA metrics

Env vars (from .env.agents):
    GEMINI_API_KEY — Gemini key used by the agent and the GEPA optimizer model
"""

from __future__ import annotations

import argparse
import asyncio
import importlib
import logging
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


# ── per-agent configuration ──────────────────────────────────────────────────

AGENT_CONFIGS: dict[str, dict] = {
    "travel": {
        "app_name": "travel_agent",
        "agent_src": REPO_ROOT / "agents" / "travel" / "src",
        "rubrics": [
            {
                "rubric_id": "travel_sets_trip_meta",
                "text": "The agent calls set_trip_meta when the destination, dates, party size, and budget tier are known.",
            },
            {
                "rubric_id": "travel_uses_live_data_or_discloses_limits",
                "text": (
                    "The agent uses available travel/date lookup tools before making specific availability "
                    "or logistics claims, or clearly states when live data is unavailable instead of "
                    "fabricating details."
                ),
            },
            {
                "rubric_id": "travel_writes_itinerary_to_state",
                "text": (
                    "The agent writes the itinerary through write_itinerary or add_day using Day headings "
                    "and timed bullets, and keeps chat to a short summary."
                ),
            },
            {
                "rubric_id": "travel_no_full_plan_in_chat",
                "text": (
                    "The agent's final chat message is ≤2 sentences. It must not include tables, bullet "
                    "lists, day-by-day breakdowns, or any itinerary content — that content belongs in the "
                    "canvas (state), not chat."
                ),
            },
            {
                "rubric_id": "travel_no_booking_without_approval",
                "text": "The agent does not book, reserve, charge, share, or lock in the trip without explicit approval.",
            },
        ],
    },
    "resume": {
        "app_name": "resume_agent",
        "agent_src": REPO_ROOT / "agents" / "resume" / "src",
        "rubrics": [
            {
                "rubric_id": "resume_grounded_in_resume",
                "text": (
                    "The answer grounds claims in the resume, including Lucas being a senior engineer at "
                    "Anthropic and his relevant project history."
                ),
            },
            {
                "rubric_id": "resume_ai_agent_relevance",
                "text": "The answer highlights relevant AI or agentic work from the resume.",
            },
            {
                "rubric_id": "resume_no_invention",
                "text": "The answer does not invent employers, dates, credentials, or experience not present in the resume.",
            },
            {
                "rubric_id": "resume_concise_positive",
                "text": (
                    "The answer is short, specific, positive, and focused on senior/staff-level signals "
                    "like technical depth, autonomy, and scope."
                ),
            },
        ],
    },
    "grocery": {
        "app_name": "grocery_agent",
        "agent_src": REPO_ROOT / "agents" / "grocery" / "src",
        "rubrics": [
            {
                "rubric_id": "grocery_auth_gate",
                "text": (
                    "With default state where kroger_connected is false, the agent tells the user to "
                    "connect Kroger first before planning meals or building a shopping list."
                ),
            },
            {
                "rubric_id": "grocery_no_tools_when_disconnected",
                "text": (
                    "The agent does not call Kroger MCP tools and does not generate a meal plan or "
                    "shopping list while kroker_connected is false."
                ),
            },
            {
                "rubric_id": "grocery_clear_next_step",
                "text": (
                    "The response is concise and gives the user the concrete next step to unblock the "
                    "request (connect Kroger account)."
                ),
            },
        ],
    },
    "fitness": {
        "app_name": "fitness_agent",
        "agent_src": REPO_ROOT / "agents" / "fitness" / "src",
        "rubrics": [
            {
                "rubric_id": "fitness_auth_gate",
                "text": (
                    "With default state where strava_connected is false, the agent tells the user to "
                    "connect Strava before planning."
                ),
            },
            {
                "rubric_id": "fitness_no_fetch_when_disconnected",
                "text": (
                    "The agent does not call fetch_activities and does not write a training plan while "
                    "strava_connected is false."
                ),
            },
            {
                "rubric_id": "fitness_no_invented_history",
                "text": (
                    "The agent does not invent recent activities, current fitness, or hike suitability "
                    "without connected Strava data."
                ),
            },
        ],
    },
    "oralboards": {
        "app_name": "oralboards_agent",
        "agent_src": REPO_ROOT / "agents" / "oralboards" / "src",
        "rubrics": [
            {
                "rubric_id": "oralboards_v2_case_builder_sequence",
                "text": (
                    "The case builder follows the required sequence: set_loading_step, search_docs, "
                    "read_doc (one or more), then set_case. It does not generate the case vignette before "
                    "completing the search and read steps."
                ),
            },
            {
                "rubric_id": "oralboards_v2_request_input_pause",
                "text": (
                    "The workflow uses request_input with a readiness prompt and waits for the examinee "
                    "to confirm before presenting the case."
                ),
            },
            {
                "rubric_id": "oralboards_v2_grounded_case",
                "text": (
                    "The case content is grounded in retrieved source chips and includes at least one "
                    "source citation. It does not invent clinical facts not found in the retrieved docs."
                ),
            },
            {
                "rubric_id": "oralboards_v2_no_early_scoring",
                "text": (
                    "The workflow does not score or provide model answers during the presenting phase. "
                    "Scoring is deferred until the examinee has responded."
                ),
            },
        ],
    },
}


def _setup_env(agent_src: Path) -> None:
    """Load .env.agents and add agent src to sys.path."""
    from dotenv import load_dotenv

    load_dotenv(REPO_ROOT / ".env.agents", override=False)
    load_dotenv(REPO_ROOT / ".env", override=False)
    sys.path.insert(0, str(agent_src))
    sys.path.insert(0, str(REPO_ROOT / "agents" / "shared" / "src"))


def _build_rubrics(rubric_defs: list[dict]):
    from google.adk.evaluation.eval_rubrics import Rubric, RubricContent

    return [
        Rubric(
            rubric_id=r["rubric_id"],
            rubric_content=RubricContent(text_property=r["text"]),
        )
        for r in rubric_defs
    ]


def _build_sampler(app_name: str, agent_src: Path, rubric_defs: list[dict]):
    from google.adk.evaluation.eval_config import EvalConfig
    from google.adk.evaluation.eval_metrics import RubricsBasedCriterion
    from google.adk.evaluation.local_eval_sets_manager import LocalEvalSetsManager
    from google.adk.optimization.local_eval_sampler import (
        LocalEvalSampler,
        LocalEvalSamplerConfig,
    )

    rubrics = _build_rubrics(rubric_defs)
    sampler_config = LocalEvalSamplerConfig(
        eval_config=EvalConfig(
            criteria={
                "rubric_based_final_response_quality_v1": RubricsBasedCriterion(
                    threshold=0.5,
                    rubrics=rubrics,
                )
            }
        ),
        app_name=app_name,
        train_eval_set="train_eval_set",
    )
    eval_sets_manager = LocalEvalSetsManager(agents_dir=str(agent_src))
    return LocalEvalSampler(sampler_config, eval_sets_manager)


def _load_root_agent(app_name: str):
    agent_module = importlib.import_module(f"{app_name}.agent")
    return agent_module.root_agent


async def _optimize(
    agent_name: str,
    max_calls: int,
    batch_size: int,
    run_dir: str | None,
    print_detailed: bool,
) -> None:
    cfg = AGENT_CONFIGS[agent_name]
    app_name: str = cfg["app_name"]
    agent_src: Path = cfg["agent_src"]

    _setup_env(agent_src)

    from google.adk.optimization.gepa_root_agent_prompt_optimizer import (
        GEPARootAgentPromptOptimizer,
        GEPARootAgentPromptOptimizerConfig,
    )

    sampler = _build_sampler(app_name, agent_src, cfg["rubrics"])
    root_agent = _load_root_agent(app_name)

    opt_config = GEPARootAgentPromptOptimizerConfig(
        max_metric_calls=max_calls,
        reflection_minibatch_size=batch_size,
        run_dir=run_dir,
    )
    optimizer = GEPARootAgentPromptOptimizer(opt_config)

    print(
        f"\n[gepa] optimizing {app_name}  (max_calls={max_calls}, batch_size={batch_size})"
    )
    result = await optimizer.optimize(root_agent, sampler)

    best_idx = result.gepa_result["best_idx"]
    best = result.optimized_agents[best_idx]

    print("\n" + "=" * 80)
    print(f"Optimized instruction (score={best.overall_score:.3f}):")
    print("-" * 80)
    print(best.optimized_agent.instruction)
    print("=" * 80)

    if print_detailed:
        print("\nGEPA metrics:")
        print(result.gepa_result)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run GEPA prompt optimization for an agent"
    )
    parser.add_argument(
        "--agent", required=True, choices=list(AGENT_CONFIGS), help="Agent name"
    )
    parser.add_argument(
        "--max-calls", type=int, default=15, help="Max metric calls (default 15)"
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=2,
        help="Reflection minibatch size (default 2)",
    )
    parser.add_argument(
        "--run-dir", default=None, help="Directory to save intermediate GEPA results"
    )
    parser.add_argument(
        "--print-detailed", action="store_true", help="Print GEPA metrics"
    )
    parser.add_argument(
        "--log-level", default="WARNING", choices=["DEBUG", "INFO", "WARNING", "ERROR"]
    )
    args = parser.parse_args()

    logging.basicConfig(level=getattr(logging, args.log_level))

    asyncio.run(
        _optimize(
            agent_name=args.agent,
            max_calls=args.max_calls,
            batch_size=args.batch_size,
            run_dir=args.run_dir,
            print_detailed=args.print_detailed,
        )
    )


if __name__ == "__main__":
    main()

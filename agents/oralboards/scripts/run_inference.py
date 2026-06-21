#!/usr/bin/env python3
"""Custom ADK inference runner for eval — no Vertex AI required.

Runs the oralboards agent against each eval case in the dataset and writes
traces in EvaluationDataset format so `agents-cli eval grade` can score them.

Usage:
    uv run python agents/oralboards/scripts/run_inference.py \\
        --dataset agents/oralboards/tests/eval/datasets/oralboards-evals.json \\
        --output agents/oralboards/artifacts/traces/

Env vars required (from Railway or .env):
    GEMINI_API_KEY  (or CEREBRAS_API_KEY / GROQ_API_KEY / NVIDIA_NIM_API_KEY /
    MISTRAL_API_KEY / OPENROUTER_API_KEY as fallback)
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import uuid
from datetime import datetime
from pathlib import Path

# ── make sure the repo root is importable ───────────────────────────────────
REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "agents" / "oralboards" / "src"))
sys.path.insert(0, str(REPO_ROOT / "agents" / "shared" / "src"))

# Load .env from repo root so LiteLLM gets the API keys
from dotenv import load_dotenv  # noqa: E402

load_dotenv(REPO_ROOT / ".env", override=False)

from oralboards_agent.agent import (  # noqa: E402
    FunctionTool,
    append_exchange,
    read_doc,
    search_docs,
    set_case,
    set_loading_step,
    set_phase,
    set_score_card,
)


def _build_eval_agent():
    """Build the agent without AGUIToolset (not usable in eval mode)."""
    from agents_shared.state import make_state_initializer, make_state_instruction
    from agents_shared.tools import (
        DEFAULT_RETRY_CONFIG,
        build_model,
        on_model_error_callback,
    )
    from google.adk.agents import LlmAgent
    from oralboards_agent.agent import _STATIC_INSTRUCTION, OralBoardsState

    state_instruction = make_state_instruction(
        OralBoardsState, header="Current oral-boards state"
    )
    return LlmAgent(
        name="oralboards_agent",
        model=build_model(),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        state_schema=OralBoardsState,
        static_instruction=_STATIC_INSTRUCTION,
        instruction=state_instruction,
        before_agent_callback=make_state_initializer(OralBoardsState),
        tools=[
            FunctionTool(search_docs),
            FunctionTool(read_doc),
            FunctionTool(set_case),
            FunctionTool(set_phase),
            FunctionTool(set_loading_step),
            FunctionTool(append_exchange),
            FunctionTool(set_score_card),
            # AGUIToolset excluded — it's a placeholder that requires ADKAgent wrapper
        ],
    )


async def _run_single(agent, prompt_text: str) -> list[dict]:
    """Run the agent on one prompt and return ADK events as dicts."""
    from google.adk.runners import Runner
    from google.adk.sessions import InMemorySessionService
    from google.genai import types

    session_svc = InMemorySessionService()
    runner = Runner(
        agent=agent,
        app_name="oralboards_eval",
        session_service=session_svc,
    )
    user_id = "eval_user"
    session_id = str(uuid.uuid4())
    await session_svc.create_session(
        app_name="oralboards_eval",
        user_id=user_id,
        session_id=session_id,
    )
    user_content = types.Content(
        role="user",
        parts=[types.Part(text=prompt_text)],
    )
    events_out: list[dict] = []
    async for event in runner.run_async(
        user_id=user_id,
        session_id=session_id,
        new_message=user_content,
    ):
        if event.is_final_response() or event.content:
            events_out.append(_event_to_dict(event))
    return events_out


def _event_to_dict(event) -> dict:
    """Serialise an ADK Event to a plain dict for the trace format."""
    parts = []
    if event.content and event.content.parts:
        for part in event.content.parts:
            p: dict = {}
            if hasattr(part, "text") and part.text:
                p["text"] = part.text
            if hasattr(part, "function_call") and part.function_call:
                fc = part.function_call
                p["function_call"] = {
                    "name": fc.name,
                    "args": dict(fc.args) if fc.args else {},
                }
            if hasattr(part, "function_response") and part.function_response:
                fr = part.function_response
                resp_content = fr.response
                if hasattr(resp_content, "model_dump"):
                    resp_content = resp_content.model_dump()
                p["function_response"] = {
                    "name": fr.name,
                    "response": resp_content,
                }
            if p:
                parts.append(p)
    return {
        "author": event.author or "oralboards_agent",
        "content": {
            "role": "model" if (event.author != "user") else "user",
            "parts": parts,
        },
    }


def _build_trace_case(eval_case_id: str, prompt_text: str, events: list[dict]) -> dict:
    """Build a trace eval case dict in EvaluationDataset format."""
    user_event = {
        "author": "user",
        "content": {"role": "user", "parts": [{"text": prompt_text}]},
    }
    all_events = [user_event] + events
    final_text = ""
    for ev in reversed(all_events):
        for p in (ev.get("content") or {}).get("parts") or []:
            if p.get("text"):
                final_text = p["text"]
                break
        if final_text:
            break

    return {
        "eval_case_id": eval_case_id,
        "agent_data": {
            "agents": {"oralboards_agent": {"agent_id": "oralboards_agent"}},
            "turns": [
                {
                    "turn_index": 0,
                    "events": all_events,
                }
            ],
        },
        "responses": [{"response": {"role": "model", "parts": [{"text": final_text}]}}]
        if final_text
        else [],
    }


async def main(dataset_path: str, output_dir: str) -> None:
    raw = json.loads(Path(dataset_path).read_text(encoding="utf-8"))  # noqa: ASYNC240
    cases = raw.get("eval_cases") or []
    print(f"[inference] {len(cases)} eval case(s) loaded", flush=True)

    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)  # noqa: ASYNC240
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_path = out_dir / f"traces_{ts}.json"

    trace_cases = []
    for i, case in enumerate(cases):
        case_id = case.get("eval_case_id") or f"case_{i}"
        prompt_parts = (case.get("prompt") or {}).get("parts") or []
        prompt_text = " ".join(p.get("text", "") for p in prompt_parts).strip()
        if not prompt_text:
            print(
                f"[inference] case {i} ({case_id}) skipped — no prompt text", flush=True
            )
            continue

        print(f"[inference] running case {i + 1}/{len(cases)}: {case_id}", flush=True)
        agent = _build_eval_agent()
        try:
            events = await _run_single(agent, prompt_text)
            trace = _build_trace_case(case_id, prompt_text, events)
            trace_cases.append(trace)
            print(
                f"[inference] case {i + 1} done — {len(events)} events captured",
                flush=True,
            )
        except Exception as exc:
            print(
                f"[inference] case {i + 1} FAILED: {exc}", file=sys.stderr, flush=True
            )

    if not trace_cases:
        print("[inference] No cases succeeded — no output written.", file=sys.stderr)
        sys.exit(1)

    result = {"eval_cases": trace_cases}
    output_path.write_text(
        json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"[inference] wrote {output_path}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--dataset", default="tests/eval/datasets/oralboards-evals.json"
    )
    parser.add_argument("--output", default="artifacts/traces/")
    args = parser.parse_args()
    asyncio.run(main(args.dataset, args.output))

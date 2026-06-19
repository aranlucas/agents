#!/usr/bin/env python3
"""Local eval grader — runs custom_function metrics without Vertex AI / GCP.

Usage:
    uv run python agents/oralboards/scripts/run_grade.py \\
        --traces agents/oralboards/artifacts/traces/traces_*.json \\
        --config agents/oralboards/tests/eval/eval_config.yaml

Outputs a results table to the console and writes
artifacts/grade_results/results_<ts>.json.
"""
from __future__ import annotations

import argparse
import glob
import json
import sys
from datetime import datetime
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[3]


# ── metric compilation ───────────────────────────────────────────────────────

def _compile(source: str, name: str):
    ns: dict = {}
    exec(compile(source, f"<metric:{name}>", "exec"), ns)
    fn = ns.get("evaluate")
    if not callable(fn):
        raise ValueError(f"Metric '{name}' must define evaluate(instance)")
    return fn


def _load_metrics(config_path: str) -> list[dict]:
    with open(config_path, encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    to_run = set(cfg.get("metrics_to_run") or [])
    pool = {m["name"]: m for m in cfg.get("custom_metrics") or []}
    return [pool[n] for n in to_run if n in pool]


# ── trace loading ────────────────────────────────────────────────────────────

def _load_traces(paths: list[str]) -> list[dict]:
    cases = []
    for p in paths:
        with open(p, encoding="utf-8") as f:
            d = json.load(f)
        cases.extend(d.get("eval_cases") or [])
    return cases


def _case_to_instance(case: dict) -> dict:
    """Convert an eval case to the flat instance dict metrics receive."""
    agent_data = case.get("agent_data") or {}
    turns = agent_data.get("turns") or []
    responses = case.get("responses") or []
    final_text = ""
    if responses:
        parts = (responses[-1].get("response") or {}).get("parts") or []
        final_text = "".join(p.get("text", "") for p in parts)
    # prompt text from the first user event
    prompt_text = ""
    for t in turns:
        for ev in t.get("events") or []:
            if ev.get("author") == "user":
                for p in (ev.get("content") or {}).get("parts") or []:
                    if p.get("text"):
                        prompt_text = p["text"]
                        break
            if prompt_text:
                break
        if prompt_text:
            break
    return {
        "eval_case_id": case.get("eval_case_id") or "",
        "prompt": prompt_text,
        "response": final_text,
        "agent_data": agent_data,
        "context": case.get("context"),
        "reference": case.get("reference"),
    }


# ── scoring ──────────────────────────────────────────────────────────────────

def _run(cases: list[dict], metrics: list[dict]) -> list[dict]:
    results = []
    for case in cases:
        instance = _case_to_instance(case)
        case_scores: dict[str, object] = {"eval_case_id": instance["eval_case_id"]}
        for m in metrics:
            name = m["name"]
            fn = _compile(m["custom_function"], name)
            try:
                raw = fn(instance)
                if isinstance(raw, dict):
                    case_scores[name] = raw.get("score")
                    case_scores[f"{name}__explanation"] = raw.get("explanation", "")
                else:
                    case_scores[name] = raw
            except Exception as exc:
                case_scores[name] = None
                case_scores[f"{name}__explanation"] = f"ERROR: {exc}"
        results.append(case_scores)
    return results


# ── display + save ───────────────────────────────────────────────────────────

def _display(results: list[dict], metric_names: list[str]) -> None:
    col_w = 38
    header = f"{'eval_case_id':<30} " + " ".join(f"{n[:col_w]:<{col_w}}" for n in metric_names)
    print("\n" + header)
    print("-" * len(header))
    for r in results:
        row = f"{r['eval_case_id']:<30} "
        for n in metric_names:
            val = r.get(n)
            cell = "✓" if val == 1 else ("✗" if val == 0 else str(val))
            row += f"{cell:<{col_w}} "
        print(row)
    print()
    # Per-metric averages
    for n in metric_names:
        vals = [r[n] for r in results if isinstance(r.get(n), (int, float))]
        avg = sum(vals) / len(vals) if vals else 0
        bar = "█" * int(avg * 10) + "░" * (10 - int(avg * 10))
        print(f"  {n:<40} avg={avg:.2f} [{bar}]")
    print()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--traces", nargs="+", required=True)
    ap.add_argument("--config", default="tests/eval/eval_config.yaml")
    ap.add_argument("--output", default="artifacts/grade_results/")
    args = ap.parse_args()

    # Expand globs
    all_paths: list[str] = []
    for pattern in args.traces:
        expanded = glob.glob(pattern)
        all_paths.extend(expanded if expanded else [pattern])

    cases = _load_traces(all_paths)
    print(f"Loaded {len(cases)} eval case(s) from {len(all_paths)} file(s)")

    metrics = _load_metrics(args.config)
    metric_names = [m["name"] for m in metrics]
    print(f"Running {len(metrics)} local metric(s): {', '.join(metric_names)}\n")

    results = _run(cases, metrics)
    _display(results, metric_names)

    out_dir = Path(args.output)
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_file = out_dir / f"results_{ts}.json"
    out_file.write_text(json.dumps({"results": results}, indent=2, ensure_ascii=False))
    print(f"Results saved to {out_file}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

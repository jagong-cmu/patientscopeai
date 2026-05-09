#!/usr/bin/env python3
"""Minimal Anthropic Messages API call with tool use — verifies API key and client wiring."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from anthropic import Anthropic
from dotenv import load_dotenv


def load_env() -> None:
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    load_dotenv(Path(__file__).resolve().parents[1] / ".env.local")


def tool_catalog() -> list[dict]:
    return [
        {
            "name": "cohort_row_count",
            "description": "Return the number of rows in a named cohort table (demo tool).",
            "input_schema": {
                "type": "object",
                "properties": {
                    "table_name": {
                        "type": "string",
                        "description": "Logical table identifier.",
                    }
                },
                "required": ["table_name"],
            },
        }
    ]


def handle_tool(name: str, payload: dict) -> dict:
    if name == "cohort_row_count":
        return {
            "table_name": payload.get("table_name", ""),
            "rows": 42,
            "note": "stub response — replace with real DB query during the hackathon",
        }
    return {"error": f"unknown tool {name}"}


def main() -> int:
    load_env()
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        print("Set ANTHROPIC_API_KEY in .env (see .env.example).", file=sys.stderr)
        return 1

    model = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-20250514").strip()
    client = Anthropic(api_key=api_key)

    user_prompt = (
        "Use the cohort_row_count tool once with table_name='icu_cohort' "
        "so we confirm tool routing works. Keep prose minimal."
    )

    messages: list[dict] = [{"role": "user", "content": user_prompt}]
    tools = tool_catalog()

    msg = client.messages.create(
        model=model,
        max_tokens=512,
        tools=tools,
        messages=messages,
    )

    print("--- initial response ---")
    print(json.dumps(msg.model_dump(), indent=2, default=str))

    follow_blocks: list[dict] = []
    tool_uses: list[dict] = []
    for block in msg.content:
        b = block.model_dump()
        if b.get("type") == "tool_use":
            tool_uses.append(b)

    if not tool_uses:
        print("No tool_use blocks returned; model may have answered without tools.", file=sys.stderr)
        return 0

    for tu in tool_uses:
        name = tu.get("name")
        tid = tu.get("id")
        payload = tu.get("input") or {}
        result = handle_tool(name, payload if isinstance(payload, dict) else {})
        follow_blocks.append(
            {
                "type": "tool_result",
                "tool_use_id": tid,
                "content": json.dumps(result),
            }
        )

    messages.append({"role": "assistant", "content": msg.content})
    messages.append({"role": "user", "content": follow_blocks})

    final = client.messages.create(
        model=model,
        max_tokens=512,
        tools=tools,
        messages=messages,
    )

    print("--- final response after tool_result ---")
    print(json.dumps(final.model_dump(), indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Validate Pyquest's version-one course manifest without network access."""

from __future__ import annotations

import json
import sys
from pathlib import Path


REQUIRED_LESSON_FIELDS = {
    "id", "title", "folder", "file", "test_file", "demo_file",
    "focus", "tag", "goal", "hint", "reward",
}


def validate(path: Path) -> list[str]:
    try:
        course = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        return [f"Could not read {path}: {error}"]

    errors: list[str] = []
    if course.get("schema_version") != 1:
        errors.append("schema_version must be 1")
    source = course.get("source", {})
    for field in ("repository", "revision", "base_path"):
        if not source.get(field):
            errors.append(f"source.{field} is required")

    lessons = course.get("lessons")
    if not isinstance(lessons, list) or not lessons:
        return errors + ["lessons must be a non-empty list"]
    seen: set[int] = set()
    for position, lesson in enumerate(lessons, 1):
        label = f"lesson at position {position}"
        if not isinstance(lesson, dict):
            errors.append(f"{label} must be an object")
            continue
        missing = REQUIRED_LESSON_FIELDS - lesson.keys()
        if missing:
            errors.append(f"{label} is missing: {', '.join(sorted(missing))}")
        lesson_id = lesson.get("id")
        if not isinstance(lesson_id, int) or lesson_id < 1:
            errors.append(f"{label} has an invalid id")
        elif lesson_id in seen:
            errors.append(f"lesson id {lesson_id} is duplicated")
        else:
            seen.add(lesson_id)
    return errors


def main() -> int:
    path = Path(sys.argv[1] if len(sys.argv) > 1 else "course.json")
    errors = validate(path)
    if errors:
        print("Course manifest is invalid:")
        for error in errors:
            print(f"- {error}")
        return 1
    print(f"Course manifest is valid: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

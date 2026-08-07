# Pyquest

**A joyful, local-first Python practice workspace.**

[![MIT license](https://img.shields.io/badge/license-MIT-22c55e.svg)](LICENSE)
[![Deploy](https://github.com/seanbud/pyquest/actions/workflows/pages.yml/badge.svg)](https://github.com/seanbud/pyquest/actions/workflows/pages.yml)

[Try Pyquest in your browser](https://seanbud.github.io/pyquest/) ·
[Roadmap](ROADMAP.md) · [Course format](docs/COURSE_FORMAT.md)

Pyquest turns an exercise repository into a focused read → build → run → learn
loop. It combines a polished split workspace, immediate test feedback, a real
stateful Python REPL, and playful progress rewards without requiring an account
or sending learner code to an application server.

The first course integration covers 18 lessons from
[Alex's Python: Zero to Hero](https://github.com/Alendro305/python-learning):
variables, numbers, strings, conditionals, loops, functions, collections,
comprehensions, sorting, closures, higher-order functions, decorators,
`functools`, and type hints.

## What feels good already

- Resizable problem/editor and editor/results splits inspired by modern coding tools
- Rendered Markdown lessons beside an editable Python workspace
- Line numbers, syntax highlighting, indentation guides, smart indentation,
  completion suggestions, and useful keyboard shortcuts
- Individual clickable checks with captured output and readable tracebacks
- Full-frame stateful REPL with command history and expandable values
- Local drafts, progress, XP, streaks, optional sound, and reduced-motion support
- A first-run product tour and responsive narrow-screen layout

## Use the public app

Visit **[seanbud.github.io/pyquest](https://seanbud.github.io/pyquest/)**, choose
a lesson, edit the starter, and select **Run checks**. The first run downloads a
browser Python runtime; later runs are faster. Course files come from Alex's
original public repository, and execution stays in your browser.

Browser mode supports the test patterns used by the first 18 lessons: normal
`test_*` functions, assertions, and `pytest.raises`. Use native mode for full
pytest compatibility, native packages, or offline work after setup.

## Run the native workspace

Requirements: Python 3.11+ (3.13 recommended),
[uv](https://docs.astral.sh/uv/), and a checkout of the source course.

```bash
git clone https://github.com/seanbud/pyquest.git
cd pyquest
git clone https://github.com/Alendro305/python-learning.git course
uv venv --python 3.13
uv pip install pytest
.venv/bin/python server.py --port 8765
```

Open [http://127.0.0.1:8765](http://127.0.0.1:8765). You can instead set
`PYQUEST_COURSE_ROOT=/path/to/python-learning` to use an existing checkout.

The local runner executes learner code on your machine. It binds to localhost
by default and must not be exposed as a public service; see [SECURITY.md](SECURITY.md).

## Keyboard highlights

- `Ctrl/Cmd + Enter` — run focused checks
- `Ctrl/Cmd + /` — toggle line comments
- `Tab` / `Shift + Tab` — indent or outdent
- `Ctrl/Cmd + Space` — show completions
- `↑` / `↓` — REPL command history
- `Ctrl + L` — clear the REPL transcript

## Build a different course

Pyquest deliberately separates the learning interface from course content.
Point `PYQUEST_COURSE_MANIFEST` and `PYQUEST_COURSE_ROOT` at a compatible
manifest and checkout to adapt another repository without changing its files.
See [the manifest contract](docs/COURSE_FORMAT.md) and
[architecture](docs/ARCHITECTURE.md).

The planned v2 format grows this seam into multi-file workspaces, task graphs,
fixtures, and interactive visualizers—enough to teach web apps, data pipelines,
or other project-shaped skills in the same interface.

## Attribution and license

Pyquest's interface and runtime are released under the [MIT License](LICENSE).
The course instructions, starters, tests, and demos are authored in
[Alendro305/python-learning](https://github.com/Alendro305/python-learning), are
not distributed in this repository, and are not covered by Pyquest's license.
The upstream repository currently declares no license. Read [NOTICE.md](NOTICE.md)
for the exact boundary.

Contributions are welcome; start with [CONTRIBUTING.md](CONTRIBUTING.md).

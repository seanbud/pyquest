# Architecture

Pyquest is one interface with two execution adapters.

```text
course.json ──> lesson reader + editor + feedback UI
     │
     ├── native adapter: localhost API ──> temporary copy + CPython + pytest
     └── web adapter:    fetch upstream ──> Pyodide in the visitor's browser
```

## Shared interface

`static/app.js` owns product behavior and talks only to a small fetch-shaped API.
`static/runtime.js` intercepts that API on GitHub Pages (or with
`?runtime=browser`). On localhost, the same calls reach `server.py`. This keeps
the interface independent of execution technology.

## Native mode

The server reads a course checkout, copies one assignment to a temporary
directory, replaces only the copied starter file, and invokes pytest or its
demo. Its persistent REPL is a child CPython process scoped to the current
lesson. This is the most compatible mode, but it is trusted-local software—not
a security boundary.

## Browser mode

The static runtime reads the same manifest, fetches course files from their
declared source repository, and executes them in Pyodide. The first release uses
a deliberately small pytest-compatible check harness that supports plain
`test_*` functions, assertions, and `pytest.raises`. Full pytest features and
native packages require native mode.

## Extensibility direction

The manifest is the seam for new courses. The next schema adds a `workspace`
array, an editable/read-only flag per file, entry points for test/demo tasks,
and capability declarations. That supports multi-file applications, pipelines,
data fixtures, and visualizers without teaching the core UI about a particular
repository layout.

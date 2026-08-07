#!/usr/bin/env python3
"""Local browser workspace for a small, safe slice of the Python course."""

from __future__ import annotations

import ast
import contextlib
import io
import json
import os
import select
import shutil
import subprocess
import tempfile
import time
import uuid
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


APP_ROOT = Path(__file__).resolve().parent
STATIC = APP_ROOT / "static"
COURSE_MANIFEST = Path(os.environ.get("PYQUEST_COURSE_MANIFEST", APP_ROOT / "course.json"))
_nearby_course = APP_ROOT.parent if (APP_ROOT.parent / "assignments").is_dir() else APP_ROOT / "course"
COURSE_ROOT = Path(os.environ.get("PYQUEST_COURSE_ROOT", _nearby_course)).resolve()

LESSONS = {
    1: {"title": "Variables, types, and f-strings", "folder": "01_variables_and_types", "file": "variables.py", "focus": "Names, objects, f-strings, tuples, and formatting.", "tag": "First steps", "goal": "Make Python describe values clearly.", "hint": "Start with an f-string. For a type name, ask the object for its type's __name__.", "reward": 100},
    2: {"title": "Numbers, division, and operators", "folder": "02_numbers_and_operators", "file": "arithmetic.py", "focus": "Floor division, modulo, averages, and compound interest.", "tag": "Core moves", "goal": "Use Python's number operators with confidence.", "hint": "The four tools are //, %, sum()/len(), and **. Guard the empty list before dividing.", "reward": 120},
    3: {"title": "Strings and slicing", "folder": "03_strings_and_slicing", "file": "strings.py", "focus": "Slices, immutable strings, joins, and whitespace.", "tag": "Text power", "goal": "Transform text with Python's expressive string tools.", "hint": "Reverse with [::-1]. Use split() with no argument for words and join() for pieces.", "reward": 140},
    4: {"title": "Conditionals and truthiness", "folder": "04_conditionals_and_truthiness", "file": "conditionals.py", "focus": "If statements, truthy values, early returns, and grades.", "tag": "Decision making", "goal": "Teach your program to choose the right path.", "hint": "Check the highest grade first. A blank string becomes empty after strip(), and empty is falsy.", "reward": 160},
    5: {"title": "Loops and iteration", "folder": "05_loops_and_iteration", "file": "loops.py", "focus": "for, while, range, enumerate, and repeated computation.", "tag": "Keep moving", "goal": "Use loops to process sequences and repeat work reliably.", "hint": "Remember that range stops before its end. Check FizzBuzz's divisible-by-15 case before 3 or 5.", "reward": 180},
    6: {"title": "Functions and arguments", "folder": "06_functions_and_arguments", "file": "functions.py", "focus": "Defaults, *args, **kwargs, callbacks, and safe mutable arguments.", "tag": "Function craft", "goal": "Build reusable functions with flexible, predictable inputs.", "hint": "Use None as the default for a list you create inside the function; *args is a tuple and **kwargs is a dict.", "reward": 200},
    7: {"title": "Lists and methods", "folder": "07_lists_and_methods", "file": "lists.py", "focus": "append, extend, slicing, deduplication, rotation, and chunks.", "tag": "Collection skills", "goal": "Transform lists while keeping order, copies, and boundaries clear.", "hint": "append adds one item while extend adds each item. Guard an empty list before using n % len(items).", "reward": 220},
    8: {"title": "Tuples and unpacking", "folder": "08_tuples_and_unpacking", "file": "tuples.py", "focus": "Immutable records, multiple returns, starred unpacking, and coordinates.", "tag": "Shape and structure", "goal": "Use tuples to represent fixed-size data and unpack it cleanly.", "hint": "Write first, *rest = items for a head and the remaining list. Raise ValueError when there is no minimum or maximum.", "reward": 240},
    9: {"title": "Dictionaries", "folder": "09_dictionaries", "file": "dicts.py", "focus": "Key-value lookup, get, setdefault, merging, and grouping.", "tag": "Data organized", "goal": "Model and transform related data with Python's key-value workhorse.", "hint": "Use get(key, 0) for counts and setdefault(letter, []) when a group must stay stored in the dictionary.", "reward": 260},
    10: {"title": "Sets", "folder": "10_sets", "file": "sets_practice.py", "focus": "Uniqueness, membership, intersections, differences, and set algebra.", "tag": "Cut duplicates", "goal": "Use sets for fast membership and clear operations on collections.", "hint": "Build sets with set(iterable), use & for items in both and - for items only in the first, then sort list results.", "reward": 280},
    11: {"title": "Comprehensions", "folder": "11_comprehensions", "file": "comprehensions.py", "focus": "List, set, dict, nested, and generator comprehensions.", "tag": "Expressive loops", "goal": "Build collections clearly with compact, readable comprehensions.", "hint": "Read a comprehension left to right: expression, for each item, where the optional if filters; nested for clauses follow normal loop order.", "reward": 300},
    12: {"title": "Sorting with keys", "folder": "12_sorting_with_keys", "file": "sorting.py", "focus": "Key functions, tuple keys, stable sorting, versions, and max.", "tag": "Order matters", "goal": "Sort data by multiple rules without writing comparators.", "hint": "Use tuple keys for tie-breakers, negate numeric fields for descending counts, and split version parts into integers before sorting.", "reward": 320},
    13: {"title": "Scope and closures", "folder": "13_scope_and_closures", "file": "scope.py", "focus": "LEGB lookup, nonlocal state, factories, and late binding.", "tag": "Remember state", "goal": "Create functions that retain private state after their factory returns.", "hint": "Reading an enclosing name is free; use nonlocal when rebinding it, and bind loop values with a default argument to avoid late binding.", "reward": 340},
    14: {"title": "First-class functions", "folder": "14_first_class_functions", "file": "higher_order.py", "focus": "Passing, returning, composing, and applying functions and lambdas.", "tag": "Functions as data", "goal": "Use functions as flexible building blocks for reusable pipelines.", "hint": "Pass func without parentheses, compose right-to-left, pipeline left-to-right, and make an empty pipeline return its input unchanged.", "reward": 360},
    15: {"title": "Decorators", "folder": "15_decorators", "file": "decorators.py", "focus": "Wrappers, forwarding arguments, function attributes, and memoization.", "tag": "Wrap behavior", "goal": "Extend functions with reusable behavior while preserving their call shape.", "hint": "A decorator takes a function and returns a closure; forward with *args and **kwargs, and keep caches in the enclosing scope.", "reward": 380},
    16: {"title": "Decorators with arguments", "folder": "16_decorator_arguments", "file": "decorator_args.py", "focus": "Decorator factories, retries, repeats, and functools.wraps.", "tag": "Three layers", "goal": "Build configurable decorators that preserve names and docstrings.", "hint": "Use three nested layers—arguments, function, then call—and apply functools.wraps(func) to the innermost wrapper.", "reward": 400},
    17: {"title": "The functools toolkit", "folder": "17_functools", "file": "functools_tools.py", "focus": "reduce, partial, lru_cache, operator functions, and nested lookup.", "tag": "Standard library", "goal": "Use focused functional tools to express folds, reusable calls, and fast recursion.", "hint": "Choose identity values for reduce, prefill with partial, decorate Fibonacci with lru_cache, and reduce getitem over a key path.", "reward": 420},
    18: {"title": "Type hints", "folder": "18_type_hints", "file": "typing_basics.py", "focus": "Modern annotations, unions, generic sequences, and type introspection.", "tag": "Communicate intent", "goal": "Annotate functions precisely so tools and readers understand their contracts.", "hint": "Use list[str], int | None, and Sequence[T]; annotate the widest accepted input and remember hints document rather than enforce.", "reward": 440},
}

# The manifest is the shared contract used by both the native server and the
# browser-only GitHub Pages runtime. Keeping lesson metadata out of course files
# lets Pyquest support other repositories without changing their source.
if COURSE_MANIFEST.exists():
    _course_data = json.loads(COURSE_MANIFEST.read_text(encoding="utf-8"))
    LESSONS = {
        int(lesson["id"]): {key: value for key, value in lesson.items() if key != "id"}
        for lesson in _course_data["lessons"]
    }


def lesson_payload(number: int) -> dict[str, object]:
    details = LESSONS[number]
    directory = COURSE_ROOT / "assignments" / details["folder"]
    readme = (directory / "README.md").read_text(encoding="utf-8")
    return {"id": number, **details, "readme": readme, "code": (directory / details["file"]).read_text(encoding="utf-8")}


def python_command() -> str:
    candidates = (COURSE_ROOT / ".venv" / "bin" / "python", APP_ROOT / ".venv" / "bin" / "python")
    return str(next((candidate for candidate in candidates if candidate.exists()), "python3"))


def run_lesson(number: int, code: str, action: str) -> dict[str, object]:
    details = LESSONS[number]
    source = COURSE_ROOT / "assignments" / details["folder"]
    with tempfile.TemporaryDirectory(prefix="python-practice-") as temp_name:
        temp = Path(temp_name)
        shutil.copytree(source, temp / details["folder"])
        workdir = temp / details["folder"]
        (workdir / details["file"]).write_text(code, encoding="utf-8")
        if action == "tests":
            command = [python_command(), "-m", "pytest", "-q", "-rA", str(workdir)]
        else:
            command = [python_command(), str(details.get("demo_file", "main.py"))]
        try:
            completed = subprocess.run(command, cwd=workdir if action == "demo" else temp, text=True, capture_output=True, timeout=15)
            stdout = completed.stdout.strip()
            stderr = completed.stderr.strip()
            output = (stdout + ("\n" if stdout and stderr else "") + stderr).strip()
            return {"ok": completed.returncode == 0, "exit_code": completed.returncode, "stdout": stdout, "stderr": stderr, "output": output or "(no output)"}
        except subprocess.TimeoutExpired as error:
            stdout = (error.stdout or "").strip()
            stderr = ((error.stderr or "") + "\nTimed out after 15 seconds.").strip()
            output = (stdout + ("\n" if stdout and stderr else "") + stderr).strip()
            return {"ok": False, "exit_code": None, "stdout": stdout, "stderr": stderr, "output": output}


REPL_BRIDGE = r'''import ast
import contextlib
import io
import json
import sys
import traceback
from pathlib import Path


def compact(value, depth=0):
    if depth >= 4:
        return {"type": type(value).__name__, "repr": "…"}
    if value is None or isinstance(value, (bool, int, float)):
        return {"type": type(value).__name__, "repr": repr(value)}
    if isinstance(value, str):
        return {"type": "str", "repr": repr(value[:1200]) + ("…" if len(value) > 1200 else "")}
    if isinstance(value, (list, tuple, set)):
        items = list(value)
        return {"type": type(value).__name__, "size": len(items), "items": [compact(item, depth + 1) for item in items[:100]], "truncated": len(items) > 100}
    if isinstance(value, dict):
        entries = list(value.items())
        return {"type": "dict", "size": len(entries), "entries": [{"key": repr(key), "value": compact(item, depth + 1)} for key, item in entries[:100]], "truncated": len(entries) > 100}
    try:
        rendered = repr(value)
    except Exception:
        rendered = f"<{type(value).__name__}>"
    return {"type": type(value).__name__, "repr": rendered[:1200] + ("…" if len(rendered) > 1200 else "")}


namespace = {"__name__": "__pyquest_repl__"}
module_path = Path(sys.argv[1])
exec(compile(module_path.read_text(encoding="utf-8"), str(module_path), "exec"), namespace)
baseline = set(namespace)

for raw in sys.stdin:
    request = json.loads(raw)
    command = request.get("input", "")
    previous = {name: id(value) for name, value in namespace.items()}
    out, err = io.StringIO(), io.StringIO()
    response = {"ok": True, "stdout": "", "stderr": "", "value": None, "bindings": {}}
    try:
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            try:
                expression = compile(command, "<Pyquest REPL>", "eval")
            except SyntaxError:
                exec(compile(command, "<Pyquest REPL>", "exec"), namespace)
            else:
                response["value"] = compact(eval(expression, namespace))
        response["bindings"] = {name: compact(value) for name, value in namespace.items() if not name.startswith("_") and ((name not in baseline and name not in previous) or previous.get(name) != id(value))}
    except Exception:
        response["ok"] = False
        response["stderr"] = traceback.format_exc().strip()
    response["stdout"] = out.getvalue().strip()
    response["stderr"] = (response["stderr"] or err.getvalue()).strip()
    print(json.dumps(response), flush=True)
'''


class ReplSession:
    def __init__(self, number: int, code: str) -> None:
        details = LESSONS[number]
        source = COURSE_ROOT / "assignments" / details["folder"]
        self.temp = Path(tempfile.mkdtemp(prefix="python-repl-"))
        self.workdir = self.temp / details["folder"]
        shutil.copytree(source, self.workdir)
        (self.workdir / details["file"]).write_text(code, encoding="utf-8")
        bridge = self.workdir / "_pyquest_repl.py"
        bridge.write_text(REPL_BRIDGE, encoding="utf-8")
        self.process = subprocess.Popen(
            [python_command(), bridge.name, details["file"]], cwd=self.workdir,
            text=True, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
        self.last_used = time.monotonic()

    def run(self, command: str) -> dict[str, object]:
        if not self.process.stdin or not self.process.stdout:
            return {"ok": False, "stderr": "The REPL session is unavailable."}
        try:
            self.process.stdin.write(json.dumps({"input": command}) + "\n")
            self.process.stdin.flush()
            ready, _, _ = select.select([self.process.stdout], [], [], 10)
            if not ready:
                self.close()
                return {"ok": False, "stderr": "Timed out after 10 seconds. The REPL was restarted."}
            self.last_used = time.monotonic()
            return json.loads(self.process.stdout.readline())
        except (BrokenPipeError, json.JSONDecodeError):
            self.close()
            return {"ok": False, "stderr": "The REPL session ended. Restart it and try again."}

    def close(self) -> None:
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=1)
            except subprocess.TimeoutExpired:
                self.process.kill()
        shutil.rmtree(self.temp, ignore_errors=True)


REPL_SESSIONS: dict[str, ReplSession] = {}


def clear_stale_repls() -> None:
    cutoff = time.monotonic() - 30 * 60
    for session_id, session in list(REPL_SESSIONS.items()):
        if session.last_used < cutoff:
            session.close()
            del REPL_SESSIONS[session_id]


def start_repl(number: int, code: str) -> dict[str, str]:
    clear_stale_repls()
    session_id = uuid.uuid4().hex
    REPL_SESSIONS[session_id] = ReplSession(number, code)
    return {"session": session_id}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args: object) -> None:
        return

    def send_json(self, value: object, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(value).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/lessons":
            self.send_json([{"id": number, **{key: value for key, value in details.items() if key != "file"}} for number, details in LESSONS.items()])
            return
        if path.startswith("/api/lessons/"):
            try:
                number = int(path.rsplit("/", 1)[1])
                self.send_json(lesson_payload(number))
            except (ValueError, KeyError, FileNotFoundError):
                self.send_json({"error": "Lesson not found"}, HTTPStatus.NOT_FOUND)
            return
        static_files = {
            "/static/styles.css": ("styles.css", "text/css; charset=utf-8"),
            "/static/app.js": ("app.js", "text/javascript; charset=utf-8"),
            "/static/runtime.js": ("runtime.js", "text/javascript; charset=utf-8"),
        }
        if path in static_files:
            filename, content_type = static_files[path]
            body = (STATIC / filename).read_bytes()
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/course.json":
            body = COURSE_MANIFEST.read_bytes()
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path in {"/", "/index.html"}:
            body = (STATIC / "index.html").read_bytes()
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_json({"error": "Not found"}, HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path not in {"/api/run", "/api/repl/open", "/api/repl/run", "/api/repl/close"}:
            self.send_json({"error": "Not found"}, HTTPStatus.NOT_FOUND)
            return
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))))
            if path in {"/api/run", "/api/repl/open"}:
                number = int(body["lesson"])
                code = body["code"]
                if number not in LESSONS or not isinstance(code, str):
                    raise ValueError
            if path == "/api/run":
                action = body["action"]
                if action not in {"tests", "demo"}:
                    raise ValueError
                self.send_json(run_lesson(number, code, action))
            elif path == "/api/repl/open":
                self.send_json(start_repl(number, code))
            elif path == "/api/repl/run":
                session_id = body["session"]
                snippet = body["input"]
                if not isinstance(session_id, str) or session_id not in REPL_SESSIONS or not isinstance(snippet, str) or len(snippet) > 20_000:
                    raise ValueError
                self.send_json(REPL_SESSIONS[session_id].run(snippet))
            else:
                session_id = body["session"]
                session = REPL_SESSIONS.pop(session_id, None)
                if session:
                    session.close()
                self.send_json({"ok": True})
        except (ValueError, KeyError, TypeError, json.JSONDecodeError):
            self.send_json({"error": "Provide a lesson, code, and a valid run action or REPL snippet."}, HTTPStatus.BAD_REQUEST)


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Serve the local Python practice workspace.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"Python practice workspace: http://{args.host}:{server.server_port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping practice workspace.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

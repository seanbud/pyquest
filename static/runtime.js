(() => {
  "use strict";

  const params = new URLSearchParams(location.search);
  const browserMode = params.get("runtime") === "browser" || location.hostname.endsWith("github.io");
  window.PYQUEST_BROWSER_RUNTIME = browserMode;
  if (!browserMode) return;
  document.addEventListener("DOMContentLoaded", () => {
    const label = document.querySelector("#runtime-label");
    if (label) label.textContent = "Python · Browser";
  });

  const nativeFetch = window.fetch.bind(window);
  const PYODIDE_VERSION = "0.27.7";
  const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
  let manifestPromise;
  let pyodidePromise;
  const lessonFiles = new Map();
  let nextSession = 1;

  const jsonResponse = (value, status = 200) => new Response(JSON.stringify(value), {
    status,
    headers: {"Content-Type": "application/json; charset=utf-8"},
  });

  function manifest() {
    manifestPromise ||= nativeFetch(new URL("course.json", location.href)).then(response => {
      if (!response.ok) throw new Error("Could not load the course manifest.");
      return response.json();
    }).then(course => {
      if (course.schema_version !== 1) throw new Error(`Unsupported course schema: ${course.schema_version}.`);
      return course;
    });
    return manifestPromise;
  }

  function rawUrl(course, lesson, filename) {
    const source = course.source;
    const repository = new URL(source.repository).pathname.replace(/^\//, "").replace(/\.git$/, "");
    const segments = [source.base_path, lesson.folder, filename].map(segment => encodeURIComponent(segment));
    return `https://raw.githubusercontent.com/${repository}/${encodeURIComponent(source.revision)}/${segments.join("/")}`;
  }

  async function fetchText(url) {
    const response = await nativeFetch(url);
    if (!response.ok) throw new Error(`Course file could not be loaded (${response.status}).`);
    return response.text();
  }

  async function getLesson(id, includeRunnerFiles = false) {
    const course = await manifest();
    const lesson = course.lessons.find(item => item.id === Number(id));
    if (!lesson) throw new Error("Lesson not found.");
    const key = `${lesson.id}:${includeRunnerFiles}`;
    if (!lessonFiles.has(key)) {
      const names = ["README.md", lesson.file];
      if (includeRunnerFiles) names.push(lesson.test_file, lesson.demo_file);
      lessonFiles.set(key, Promise.all(names.map(name => fetchText(rawUrl(course, lesson, name)))).then(values => {
        const files = Object.fromEntries(names.map((name, index) => [name, values[index]]));
        return {course, lesson, files};
      }));
    }
    return lessonFiles.get(key);
  }

  function loadPyodideRuntime() {
    if (pyodidePromise) return pyodidePromise;
    pyodidePromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `${PYODIDE_BASE}pyodide.js`;
      script.onload = () => window.loadPyodide({indexURL: PYODIDE_BASE}).then(resolve, reject);
      script.onerror = () => reject(new Error("Browser Python could not be downloaded. Check your connection and try again."));
      document.head.append(script);
    });
    return pyodidePromise;
  }

  const PYTHON_BRIDGE = String.raw`
import ast, contextlib, importlib.util, io, json, os, re, sys, traceback, types

payload = json.loads(__pyquest_payload)
mode = payload["mode"]
workdir = payload["workdir"]
os.makedirs(workdir, exist_ok=True)
os.chdir(workdir)
if workdir not in sys.path:
    sys.path.insert(0, workdir)

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

class Raises:
    def __init__(self, expected, match=None):
        self.expected, self.match = expected, match
    def __enter__(self):
        return self
    def __exit__(self, kind, value, _trace):
        if kind is None:
            raise AssertionError(f"DID NOT RAISE {self.expected.__name__}")
        if not issubclass(kind, self.expected):
            return False
        if self.match is not None and re.search(self.match, str(value)) is None:
            raise AssertionError(f"Exception message {str(value)!r} does not match {self.match!r}")
        return True

pytest_stub = types.ModuleType("pytest")
pytest_stub.raises = Raises
sys.modules.setdefault("pytest", pytest_stub)

def write_files():
    for name, contents in payload.get("files", {}).items():
        with open(os.path.join(workdir, name), "w", encoding="utf-8") as handle:
            handle.write(contents)

def clear_module(name):
    sys.modules.pop(name, None)

result = {"ok": False, "exit_code": 1, "stdout": "", "stderr": "", "output": ""}
write_files()

if mode == "tests":
    source_module = os.path.splitext(payload["source_file"])[0]
    clear_module(source_module)
    clear_module("_pyquest_tests")
    captured, failures, statuses = io.StringIO(), [], []
    passed = failed = 0
    try:
        spec = importlib.util.spec_from_file_location("_pyquest_tests", os.path.join(workdir, payload["test_file"]))
        tests = importlib.util.module_from_spec(spec)
        with contextlib.redirect_stdout(captured), contextlib.redirect_stderr(captured):
            spec.loader.exec_module(tests)
        functions = sorted((name, value) for name, value in vars(tests).items() if name.startswith("test_") and callable(value))
        for name, function in functions:
            try:
                with contextlib.redirect_stdout(captured), contextlib.redirect_stderr(captured):
                    function()
            except Exception as error:
                failed += 1
                trace = traceback.format_exc().strip()
                failures.append(f"{'_' * 12} {name} {'_' * 12}\n{trace}")
                statuses.append(f"FAILED {payload['test_file']}::{name} - {type(error).__name__}: {error}")
            else:
                passed += 1
                statuses.append(f"PASSED {payload['test_file']}::{name}")
    except Exception as error:
        failed += 1
        trace = traceback.format_exc().strip()
        failures.append(f"{'_' * 12} collection {'_' * 12}\n{trace}")
        statuses.append(f"FAILED {payload['test_file']}::collection - {type(error).__name__}: {error}")
    summary = f"{passed} passed" + (f", {failed} failed" if failed else "")
    console = "\n".join(piece for piece in [captured.getvalue().strip(), "\n".join(statuses), summary] if piece)
    errors = "\n\n".join(failures)
    output = "\n\n".join(piece for piece in [errors, console] if piece)
    result = {"ok": failed == 0, "exit_code": 0 if failed == 0 else 1, "stdout": console, "stderr": errors, "output": output or "(no output)"}

elif mode == "demo":
    source_module = os.path.splitext(payload["source_file"])[0]
    clear_module(source_module)
    out, err = io.StringIO(), io.StringIO()
    try:
        namespace = {"__name__": "__main__", "__file__": payload["demo_file"]}
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            demo_path = os.path.join(workdir, payload["demo_file"])
            exec(compile(open(demo_path, encoding="utf-8").read(), demo_path, "exec"), namespace)
        ok, error_text = True, ""
    except Exception:
        ok, error_text = False, traceback.format_exc().strip()
    stdout, stderr = out.getvalue().strip(), error_text or err.getvalue().strip()
    result = {"ok": ok, "exit_code": 0 if ok else 1, "stdout": stdout, "stderr": stderr, "output": "\n".join(piece for piece in [stdout, stderr] if piece) or "(no output)"}

elif mode == "repl_open":
    registry = globals().setdefault("_pyquest_repls", {})
    namespace = {"__name__": "__pyquest_repl__"}
    source_path = os.path.join(workdir, payload["source_file"])
    exec(compile(payload["files"][payload["source_file"]], source_path, "exec"), namespace)
    registry[payload["session"]] = {"namespace": namespace, "baseline": set(namespace)}
    result = {"session": payload["session"]}

elif mode == "repl_run":
    state = globals().setdefault("_pyquest_repls", {})[payload["session"]]
    namespace, baseline = state["namespace"], state["baseline"]
    previous = {name: id(value) for name, value in namespace.items()}
    out, err = io.StringIO(), io.StringIO()
    response = {"ok": True, "stdout": "", "stderr": "", "value": None, "bindings": {}}
    try:
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            try:
                expression = compile(payload["input"], "<Pyquest REPL>", "eval")
            except SyntaxError:
                exec(compile(payload["input"], "<Pyquest REPL>", "exec"), namespace)
            else:
                response["value"] = compact(eval(expression, namespace))
        response["bindings"] = {name: compact(value) for name, value in namespace.items() if not name.startswith("_") and ((name not in baseline and name not in previous) or previous.get(name) != id(value))}
    except Exception:
        response["ok"] = False
        response["stderr"] = traceback.format_exc().strip()
    response["stdout"] = out.getvalue().strip()
    response["stderr"] = response["stderr"] or err.getvalue().strip()
    result = response

elif mode == "repl_close":
    globals().setdefault("_pyquest_repls", {}).pop(payload["session"], None)
    result = {"ok": True}

json.dumps(result)
`;

  async function pythonCall(payload) {
    const pyodide = await loadPyodideRuntime();
    pyodide.globals.set("__pyquest_payload", JSON.stringify(payload));
    try {
      return JSON.parse(await pyodide.runPythonAsync(PYTHON_BRIDGE));
    } finally {
      pyodide.globals.delete("__pyquest_payload");
    }
  }

  async function runLesson(body) {
    const {lesson, files} = await getLesson(body.lesson, true);
    const workdir = `/tmp/pyquest-${lesson.id}`;
    return pythonCall({
      mode: body.action,
      workdir,
      source_file: lesson.file,
      test_file: lesson.test_file,
      demo_file: lesson.demo_file,
      files: {...files, [lesson.file]: body.code},
    });
  }

  async function openRepl(body) {
    const {lesson} = await getLesson(body.lesson, false);
    const session = `browser-${nextSession++}`;
    return pythonCall({
      mode: "repl_open",
      session,
      workdir: `/tmp/pyquest-repl-${session}`,
      source_file: lesson.file,
      files: {[lesson.file]: body.code},
    });
  }

  window.pyquestFetch = async (input, init = {}) => {
    const path = typeof input === "string" ? input : input.url;
    try {
      if (path === "/api/lessons") {
        const course = await manifest();
        return jsonResponse(course.lessons.map(({file, test_file, demo_file, ...lesson}) => lesson));
      }
      const match = path.match(/^\/api\/lessons\/(\d+)$/);
      if (match) {
        const {lesson, files} = await getLesson(match[1], false);
        return jsonResponse({...lesson, readme: files["README.md"], code: files[lesson.file]});
      }
      const body = init.body ? JSON.parse(init.body) : {};
      if (path === "/api/run") return jsonResponse(await runLesson(body));
      if (path === "/api/repl/open") return jsonResponse(await openRepl(body));
      if (path === "/api/repl/run") return jsonResponse(await pythonCall({mode: "repl_run", session: body.session, input: body.input, workdir: "/tmp"}));
      if (path === "/api/repl/close") return jsonResponse(await pythonCall({mode: "repl_close", session: body.session, workdir: "/tmp"}));
      return nativeFetch(input, init);
    } catch (error) {
      console.error(error);
      return jsonResponse({error: error.message || "The browser runtime could not complete that action."}, 500);
    }
  };
})();

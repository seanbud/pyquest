const $ = (id) => document.getElementById(id);
const state = { lessons: [], lesson: null, starter: "", sound: true, running: false, replRunning: false, replSession: null, replSource: "", replPreviousHeight: null, replHistory: [], replHistoryIndex: -1, replHistoryDraft: "", completed: new Set(), drafts: {}, xp: 0, streak: 0, logs: {}, logView: "console", testCases: [] };
const storageKey = "pyquest-progress-v1";
const splitKey = "pyquest-split-v1";
const resultsHeightKey = "pyquest-results-height-v1";
const tourKey = "pyquest-tour-v2";
const keywords = new Set(["and", "as", "assert", "async", "await", "break", "class", "continue", "def", "del", "elif", "else", "except", "finally", "for", "from", "global", "if", "import", "in", "is", "lambda", "match", "not", "or", "pass", "raise", "return", "try", "while", "with", "yield"]);
const builtins = new Set(["bool", "dict", "enumerate", "float", "int", "len", "list", "open", "print", "range", "set", "str", "sum", "tuple", "type", "zip"]);
const completions = [...keywords, ...builtins, "True", "False", "None", "NotImplementedError"];
const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function escapeHtml(value) { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;"); }
function inlineMarkdown(value) {
  let html = escapeHtml(value);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  return html;
}
function tableCells(line) {
  const content = line.trim().replace(/^\||\|$/g, ""); const cells = []; let cell = "";
  for (let index = 0; index < content.length; index++) {
    if (content[index] === "\\" && content[index + 1] === "|") { cell += "|"; index++; }
    else if (content[index] === "|") { cells.push(cell.trim()); cell = ""; }
    else cell += content[index];
  }
  cells.push(cell.trim()); return cells;
}
function renderMarkdown(markdown) {
  const lines = markdown.split("\n"); let html = ""; let inCode = false; let code = []; let inList = false; let inTable = false; let tableHead = false;
  const closeList = () => { if (inList) { html += "</ul>"; inList = false; } };
  const closeTable = () => { if (inTable) { html += "</tbody></table>"; inTable = false; tableHead = false; } };
  for (const line of lines) {
    if (line.trim().startsWith("```")) { if (inCode) { html += `<pre>${escapeHtml(code.join("\n"))}</pre>`; code = []; inCode = false; } else { closeList(); closeTable(); inCode = true; } continue; }
    if (inCode) { code.push(line); continue; }
    if (line.trim().startsWith("|")) {
      closeList(); const cells = tableCells(line);
      if (cells.every(cell => /^[-: ]+$/.test(cell))) continue;
      if (!inTable) { html += "<table><thead><tr>" + cells.map(cell => `<th>${inlineMarkdown(cell)}</th>`).join("") + "</tr></thead><tbody>"; inTable = true; tableHead = true; }
      else if (tableHead) { tableHead = false; html += "<tr>" + cells.map(cell => `<td>${inlineMarkdown(cell)}</td>`).join("") + "</tr>"; }
      else html += "<tr>" + cells.map(cell => `<td>${inlineMarkdown(cell)}</td>`).join("") + "</tr>";
      continue;
    }
    closeTable();
    if (!line.trim()) { closeList(); continue; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) { closeList(); const level = heading[1].length; html += `<h${level}>${inlineMarkdown(heading[2])}</h${level}>`; continue; }
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${inlineMarkdown(bullet[1])}</li>`; continue; }
    closeList(); html += `<p>${inlineMarkdown(line)}</p>`;
  }
  if (inCode) html += `<pre>${escapeHtml(code.join("\n"))}</pre>`;
  closeList(); closeTable(); return html;
}

function highlightPython(source) {
  let html = ""; let i = 0; const span = (kind, value) => `<span class="tok-${kind}">${escapeHtml(value)}</span>`;
  while (i < source.length) {
    const char = source[i];
    if (char === "\n") { html += "\n"; i++; continue; }
    if (char === "#") { const end = source.indexOf("\n", i); const stop = end < 0 ? source.length : end; html += span("comment", source.slice(i, stop)); i = stop; continue; }
    if (char === "\"" || char === "'") { const quote = char; const triple = source.slice(i, i + 3) === quote.repeat(3); const close = triple ? quote.repeat(3) : quote; let end = i + (triple ? 3 : 1); while (end < source.length) { if (source[end] === "\\") { end += 2; continue; } if (source.slice(end, end + close.length) === close) { end += close.length; break; } end++; } html += span("string", source.slice(i, end)); i = end; continue; }
    if (/[A-Za-z_]/.test(char)) { const match = source.slice(i).match(/^[A-Za-z_]\w*/)[0]; html += span(keywords.has(match) ? "keyword" : builtins.has(match) ? "builtin" : "plain", match); i += match.length; continue; }
    if (/\d/.test(char)) { const match = source.slice(i).match(/^\d+(?:\.\d+)?/)[0]; html += span("number", match); i += match.length; continue; }
    if (/[+\-*\/%=<>!|&^~]/.test(char)) { const match = source.slice(i).match(/^(?:==|!=|<=|>=|\*\*|\/\/|->|\+=|-=|\*=|\/=|[+\-*\/%=<>!|&^~])/)[0]; html += span("operator", match); i += match.length; continue; }
    html += escapeHtml(char); i++;
  }
  return html + "\n";
}
function scopeGuides(source) {
  const lines = source.split("\n"); const guides = []; const scopes = []; let previous = null;
  lines.forEach((line, index) => {
    if (!line.trim() || line.trim().startsWith("#")) return;
    const indent = (line.match(/^ */) || [""])[0].length;
    while (scopes.length && indent < scopes[scopes.length - 1].indent) { const scope = scopes.pop(); scope.end = index; guides.push(scope); }
    if (previous && previous.endsBlock && indent > previous.indent) scopes.push({indent, start: index, end: lines.length});
    previous = {indent, endsBlock: /:\s*(#.*)?$/.test(line.trim())};
  });
  while (scopes.length) guides.push(scopes.pop());
  return guides.map(scope => `<i data-scope-start="${scope.start}" data-scope-end="${scope.end}" style="left:${66 + scope.indent * 7.83}px;top:${16 + scope.start * 21.45}px;height:${Math.max(21.45, (scope.end - scope.start) * 21.45)}px"></i>`).join("");
}
function updateActiveLine() {
  const code = $("code"); const line = code.value.slice(0, code.selectionStart).split("\n").length - 1;
  $("active-line").style.transform = `translateY(${16 + line * 21.45 - code.scrollTop}px)`;
  $("scope-guides").querySelectorAll("i").forEach(guide => guide.classList.toggle("is-active", Number(guide.dataset.scopeStart) <= line && line < Number(guide.dataset.scopeEnd)));
}
function updateEditor() { const value = $("code").value; $("highlight-code").innerHTML = highlightPython(value); const count = Math.max(1, value.split("\n").length); $("lines").innerHTML = Array.from({length: count}, (_, index) => index + 1).join("<br>"); $("scope-guides").innerHTML = scopeGuides(value); syncEditorScroll(); }
function syncEditorScroll() { const code = $("code"); const transform = `translate(${-code.scrollLeft}px, ${-code.scrollTop}px)`; $("highlight").style.transform = ""; $("highlight-code").style.transform = transform; $("scope-guides").style.transform = ""; $("scope-guides").querySelectorAll("i").forEach(guide => { guide.style.transform = transform; }); $("lines").scrollTop = code.scrollTop; updateActiveLine(); }
function showCompletions() {
  const code = $("code"); const before = code.value.slice(0, code.selectionStart); const match = before.match(/[A-Za-z_]\w*$/); const prefix = match ? match[0].toLowerCase() : ""; const choices = completions.filter(item => item.toLowerCase().startsWith(prefix)).slice(0, 8);
  if (!choices.length) { $("completion").hidden = true; return; }
  $("completion").innerHTML = choices.map(item => `<button type="button" data-word="${item}">${item}</button>`).join(""); $("completion").hidden = false;
  $("completion").querySelectorAll("button").forEach(button => button.addEventListener("click", () => { const start = match ? code.selectionStart - match[0].length : code.selectionStart; code.setRangeText(button.dataset.word, start, code.selectionStart, "end"); updateEditor(); code.focus(); $("completion").hidden = true; }));
}

function loadProgress() {
  try { const saved = JSON.parse(localStorage.getItem(storageKey) || "{}"); state.completed = new Set(saved.completed || []); state.drafts = saved.drafts || {}; state.sound = saved.sound !== false; state.streak = saved.streak || 0; state.xp = saved.xp || 0; }
  catch (_) { state.completed = new Set(); state.drafts = {}; state.sound = true; state.streak = 0; state.xp = 0; }
  $("sound").textContent = state.sound ? "🔊" : "🔇"; $("xp").textContent = state.xp; $("streak").textContent = state.streak;
}
function saveProgress() { localStorage.setItem(storageKey, JSON.stringify({completed: [...state.completed], drafts: state.drafts, sound: state.sound, streak: state.streak, xp: state.xp})); }
const apiFetch = (...args) => (window.pyquestFetch || window.fetch.bind(window))(...args);
async function get(path) { const response = await apiFetch(path); if (!response.ok) throw new Error("Could not load " + path); return response.json(); }
function renderProgress() {
  const total = state.lessons.length || 4; const done = state.completed.size; $("progress-label").textContent = `${done} / ${total}`; $("progress-bar").style.width = `${done / total * 100}%`; const next = state.lessons.find(item => !state.completed.has(item.id)); $("next-label").textContent = next ? `Lesson ${next.id}` : "All clear!";
  document.querySelectorAll(".lesson").forEach(button => button.classList.toggle("complete", state.completed.has(Number(button.dataset.id))));
}
function renderList(lessons) {
  $("lessons").innerHTML = lessons.map(item => `<button class="lesson" data-id="${item.id}"><span class="dot">${item.id}</span><span><strong>${item.title}</strong><span>${item.tag}</span></span></button>`).join("");
  document.querySelectorAll(".lesson").forEach(button => button.addEventListener("click", () => { loadLesson(Number(button.dataset.id)); closeLessonDrawer(); })); renderProgress();
}
function setDescriptionTab(showHint) {
  $("description-tab").classList.toggle("active", !showHint); $("hint-tab").classList.toggle("active", showHint); $("description-tab").setAttribute("aria-selected", String(!showHint)); $("hint-tab").setAttribute("aria-selected", String(showHint));
  $("hint-panel").hidden = !showHint; if (showHint) $("hint-panel").scrollIntoView({behavior: prefersReducedMotion ? "auto" : "smooth", block: "center"});
}
async function loadLesson(id) {
  closeRepl();
  const item = await get(`/api/lessons/${id}`); state.lesson = item.id; state.starter = item.code;
  $("lesson-number").textContent = `Lesson ${item.id} of ${state.lessons.length || 4}`; $("title").textContent = item.title; $("focus").textContent = item.focus; $("tag").textContent = item.tag; $("file-name").textContent = item.file; $("instructions").innerHTML = renderMarkdown(item.readme); $("goal").textContent = item.goal; $("coach-copy").textContent = item.hint; $("code").value = state.drafts[id] ?? item.code; updateEditor();
  state.logs = {}; state.testCases = []; state.replSource = ""; state.replHistory = []; state.replHistoryIndex = -1; state.replHistoryDraft = ""; $("test-list-card").hidden = true; $("test-list").innerHTML = ""; $("issue-card").className = "issue-card"; $("issue-kicker").textContent = "Next step"; $("issue-title").textContent = "Your first useful clue will appear here."; $("issue-output").textContent = "Run the focused checks to see the first actionable result."; $("repl-code").value = ""; $("repl-transcript").innerHTML = ""; $("repl-source").textContent = "Open the REPL to load this lesson."; $("run-kind").textContent = "Ready"; $("status").textContent = state.completed.has(id) ? "Completed — revisit it or move forward." : "Edit the solution, then run focused checks."; $("status").className = "status"; $("next").hidden = true; $("completion-chip").textContent = state.completed.has(id) ? "✓ Solved" : "In progress"; $("completion-chip").classList.toggle("complete", state.completed.has(id)); $("saved-state").textContent = "Saved locally"; setLogView("console");
  document.querySelectorAll(".lesson").forEach(button => button.classList.toggle("selected", Number(button.dataset.id) === id));
  $("previous-lesson").disabled = id <= 1; $("next-lesson").disabled = id >= state.lessons.length; setDescriptionTab(false); $("problem-scroll").scrollTop = 0;
}

function openLessonDrawer() { $("lesson-drawer").hidden = false; $("drawer-scrim").hidden = false; $("lesson-drawer").setAttribute("aria-hidden", "false"); $("lessons-button").setAttribute("aria-expanded", "true"); }
function closeLessonDrawer() { $("lesson-drawer").hidden = true; $("drawer-scrim").hidden = true; $("lesson-drawer").setAttribute("aria-hidden", "true"); $("lessons-button").setAttribute("aria-expanded", "false"); }

function setSplit(percent, persist = false) {
  const value = Math.max(28, Math.min(70, percent)); $("problem-pane").style.flexBasis = `${value}%`; $("splitter").setAttribute("aria-valuenow", String(Math.round(value))); if (persist) localStorage.setItem(splitKey, String(value));
}
function initializeSplitter() {
  setSplit(Number(localStorage.getItem(splitKey)) || 46); let dragging = false;
  const move = event => { if (!dragging) return; const rect = $("workspace").getBoundingClientRect(); setSplit((event.clientX - rect.left) / rect.width * 100); };
  const stop = () => { if (!dragging) return; dragging = false; $("splitter").classList.remove("dragging"); setSplit(Number($("splitter").getAttribute("aria-valuenow")), true); document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", stop); };
  $("splitter").addEventListener("pointerdown", event => { dragging = true; $("splitter").classList.add("dragging"); event.preventDefault(); document.addEventListener("pointermove", move); document.addEventListener("pointerup", stop); });
  $("splitter").addEventListener("dblclick", () => setSplit(46, true));
  $("splitter").addEventListener("keydown", event => { const current = Number($("splitter").getAttribute("aria-valuenow")); if (event.key === "ArrowLeft") { event.preventDefault(); setSplit(current - 2, true); } if (event.key === "ArrowRight") { event.preventDefault(); setSplit(current + 2, true); } if (event.key === "Home") { event.preventDefault(); setSplit(32, true); } if (event.key === "End") { event.preventDefault(); setSplit(65, true); } });
}

function refreshEditorSurface() { requestAnimationFrame(() => { updateEditor(); syncEditorScroll(); }); }
function setResultsExpanded(expanded) { $("results-card").classList.toggle("collapsed", !expanded); $("results-toggle").setAttribute("aria-expanded", String(expanded)); refreshEditorSurface(); }
function defaultResultsHeight() { return Math.min(380, Math.round(innerHeight * .44)); }
function setResultsHeight(height, persist = false) {
  // Keep enough vertical room for a useful editing surface: a result drawer should
  // never turn the code above it into a clipped two-line preview.
  const editorMinimum = state.logView === "repl" ? 92 : 200;
  const fixedChrome = 42 + 34 + 39 + 9;
  const max = Math.max(160, $("code-pane").getBoundingClientRect().height - fixedChrome - editorMinimum); const value = Math.max(160, Math.min(max, Math.round(height)));
  $("results-body").style.setProperty("--results-height", `${value}px`); $("results-resizer").setAttribute("aria-valuenow", String(value)); $("results-resizer").setAttribute("aria-valuemax", String(Math.round(max))); if (persist) localStorage.setItem(resultsHeightKey, String(value)); refreshEditorSurface();
}
function initializeResultsResizer() {
  setResultsHeight(Number(localStorage.getItem(resultsHeightKey)) || defaultResultsHeight()); let dragging = false; let startY = 0; let startHeight = 0;
  const move = event => { if (dragging) setResultsHeight(startHeight + startY - event.clientY); };
  const stop = () => { if (!dragging) return; dragging = false; $("results-resizer").classList.remove("dragging"); setResultsHeight(Number($("results-resizer").getAttribute("aria-valuenow")), true); document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", stop); };
  $("results-resizer").addEventListener("pointerdown", event => { dragging = true; startY = event.clientY; startHeight = $("results-body").getBoundingClientRect().height; $("results-resizer").classList.add("dragging"); event.preventDefault(); document.addEventListener("pointermove", move); document.addEventListener("pointerup", stop); });
  $("results-resizer").addEventListener("dblclick", () => setResultsHeight(defaultResultsHeight(), true));
  $("results-resizer").addEventListener("keydown", event => { const current = Number($("results-resizer").getAttribute("aria-valuenow")); if (event.key === "ArrowUp") { event.preventDefault(); setResultsHeight(current + 30, true); } if (event.key === "ArrowDown") { event.preventDefault(); setResultsHeight(current - 30, true); } if (event.key === "Home") { event.preventDefault(); setResultsHeight(160, true); } if (event.key === "End") { event.preventDefault(); setResultsHeight(Number($("results-resizer").getAttribute("aria-valuemax")), true); } });
}

let audioContext = null; let runTimer = null;
function audioReady() { if (!state.sound) return null; const Audio = window.AudioContext || window.webkitAudioContext; if (!Audio) return null; audioContext ||= new Audio(); if (audioContext.state === "suspended") audioContext.resume(); return audioContext; }
function playTone(frequency, duration, startAt, wave = "sine", volume = .055) { const audio = audioReady(); if (!audio) return; const oscillator = audio.createOscillator(); const gain = audio.createGain(); oscillator.type = wave; oscillator.frequency.setValueAtTime(frequency, startAt); gain.gain.setValueAtTime(.0001, startAt); gain.gain.exponentialRampToValueAtTime(volume, startAt + .015); gain.gain.exponentialRampToValueAtTime(.0001, startAt + duration); oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(startAt); oscillator.stop(startAt + duration + .02); }
function tone(kind) { const audio = audioReady(); if (!audio) return; playTone(kind === "success" ? 660 : 170, kind === "success" ? .22 : .16, audio.currentTime, "sine", .04); }
function playTestTones(passed, failed) { const audio = audioReady(); if (!audio) return; const start = audio.currentTime + .02; for (let index = 0; index < passed; index++) playTone(430 + index * 78, .16, start + index * .13, "triangle", .045); if (failed) playTone(155, .28, start + passed * .13 + .04, "sawtooth", .03); }
function playFanfare() { const audio = audioReady(); if (!audio) return; const start = audio.currentTime + .04; [523, 659, 784, 1046].forEach((frequency, index) => playTone(frequency, .34, start + index * .16, "triangle", .06)); playTone(1046, .6, start + .62, "sine", .04); }
function testStats(output, action) { if (action === "demo") return {passed: 1, failed: 0, total: 1}; const passed = Number((output.match(/(\d+) passed/) || [0, 0])[1]); const failed = Number((output.match(/(\d+) failed/) || [0, 0])[1]); const errors = Number((output.match(/(\d+) error/) || [0, 0])[1]); return {passed, failed: failed + errors, total: passed + failed + errors || 5}; }
function startRunVisual(action) { const total = action === "tests" ? 5 : 1; $("results-card").classList.remove("success", "failure"); $("run-label").textContent = action === "tests" ? "Running focused checks…" : "Running the demo…"; $("run-count").textContent = `0 / ${total}`; $("run-progress").style.width = "4%"; $("check-dots").innerHTML = Array.from({length: total}, () => '<i class="check-dot"></i>').join(""); let active = 0; clearInterval(runTimer); runTimer = setInterval(() => { const dots = document.querySelectorAll(".check-dot"); if (active < dots.length) dots[active++].classList.add("active"); }, 105); }
function finishRunVisual(result, action) { clearInterval(runTimer); const stats = testStats(result.output || "", action); const dots = document.querySelectorAll(".check-dot"); dots.forEach((dot, index) => dot.className = `check-dot ${index < stats.passed ? "pass" : index < stats.passed + stats.failed ? "fail" : ""}`); $("run-progress").style.width = `${result.ok ? 100 : Math.round(stats.passed / stats.total * 100)}%`; $("run-count").textContent = action === "tests" ? `${stats.passed} passed · ${stats.failed} failed` : "Demo complete"; $("run-label").textContent = result.ok ? (action === "tests" ? "All checks are green!" : "Demo finished") : "A few checks need attention"; $("results-card").classList.add(result.ok ? "success" : "failure"); return stats; }
function showFeedback(result, action, stats) { const summary = $("feedback-summary"); if (result.ok) { summary.textContent = action === "tests" ? `${stats.passed} checks passed — every light is green.` : "The demo ran successfully."; summary.className = "feedback-summary success"; } else { summary.textContent = action === "tests" ? `${stats.passed} passed, ${stats.failed} failed. Start with the first failure.` : "The demo could not finish. Read the output for the next move."; summary.className = "feedback-summary failure"; } }
function terminalMarkup(text) {
  return escapeHtml(text || "(no output)").split("\n").map(line => {
    if (/^E\s+|^FAILED\b|^ERROR\b|^F+$|FAILURES|short test summary|\b\d+ failed\b|AssertionError|NotImplementedError|SyntaxError|TypeError|NameError|Traceback/.test(line)) return `<span class="term-error">${line}</span>`;
    if (/^PASSED\b|\b\d+ passed\b|^=+ .*passed/.test(line)) return `<span class="term-pass">${line}</span>`;
    if (/^\s*File .+, line \d+|^\s*\^+/.test(line)) return `<span class="term-location">${line}</span>`;
    if (/^\s*\+|^\s*-/.test(line)) return `<span class="term-diff">${line}</span>`;
    return line;
  }).join("\n");
}
function firstProblem(text) {
  const lines = (text || "").split("\n"); let marker = lines.findIndex(line => /AssertionError|NotImplementedError|SyntaxError|TypeError|NameError|Traceback/.test(line));
  if (marker < 0) marker = lines.findIndex(line => /^E\s+|^FAILED\b|^ERROR\b|\b\d+ failed\b/.test(line));
  if (marker < 0) return lines.filter(Boolean).slice(0, 9).join("\n") || "No error text was produced.";
  const start = Math.max(0, marker - 3); const end = Math.min(lines.length, marker + 4); return lines.slice(start, end).join("\n");
}
function setLogView(view) {
  const wasRepl = state.logView === "repl"; state.logView = view; const repl = view === "repl"; const text = state.logs[view] || (view === "error" ? "No errors were reported." : view === "console" ? "No console output was produced." : "No log output was produced.");
  if (repl && !wasRepl) { state.replPreviousHeight = Number($("results-resizer").getAttribute("aria-valuenow")); setResultsHeight(99_999); }
  if (!repl && wasRepl && state.replPreviousHeight !== null) { setResultsHeight(state.replPreviousHeight); state.replPreviousHeight = null; }
  $("output").hidden = repl; $("repl-panel").hidden = !repl; $("results-body").classList.toggle("repl-mode", repl); $("repl-launch").classList.toggle("active", repl); if (!repl) $("output").innerHTML = terminalMarkup(text); else openRepl(); document.querySelectorAll(".log-tab").forEach(button => { const active = button.dataset.log === view; button.classList.toggle("active", active); button.setAttribute("aria-selected", String(active)); });
}
function splitPytestOutput(raw) {
  const captured = []; const diagnostic = []; let collectingStdout = false;
  for (const line of (raw || "").split("\n")) {
    if (/^-+ Captured stdout (?:setup|call|teardown) -+$/.test(line)) { collectingStdout = true; continue; }
    if (collectingStdout && (/^-+ Captured (?:stderr|log) .+ -+$/.test(line) || /^=+/.test(line) || /^-+ short test summary info -+$/.test(line))) collectingStdout = false;
    (collectingStdout ? captured : diagnostic).push(line);
  }
  const cleanDiagnostic = diagnostic.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const failureAt = cleanDiagnostic.search(/(?:^|\n)(?:=+ FAILURES =+|E\s+|FAILED\b|ERROR\b)/m);
  return {console: captured.join("\n").trim(), errors: failureAt >= 0 ? cleanDiagnostic.slice(failureAt).trim() : cleanDiagnostic};
}
function fullLog(stdout, stderr, action, exitCode) {
  const runner = action === "tests" ? "pytest" : "Python demo";
  return [`[${runner} · exit ${exitCode ?? "unknown"}]`, "[stdout]", stdout || "(no output)", "[stderr]", stderr || "(no errors)"].join("\n");
}
function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function testBlock(raw, name) {
  const header = new RegExp(`^_{5,}\\s+${escapeRegex(name)}\\s+_{5,}\\s*$`, "m"); const match = header.exec(raw);
  if (!match) return "";
  const next = raw.slice(match.index + match[0].length).search(/\n_{5,}\s+.+?\s+_{5,}\s*$|\n=+ short test summary info/m);
  return raw.slice(match.index, next < 0 ? raw.length : match.index + match[0].length + next).trim();
}
function parseTestCases(raw, fileName) {
  const cases = []; const seen = new Set(); const summary = /^(PASSED|FAILED|ERROR)\s+(.+?)(?:\s+-\s+(.+))?$/gm;
  for (const match of raw.matchAll(summary)) {
    const status = match[1].toLowerCase(); const target = match[2].trim(); if (seen.has(target)) continue; seen.add(target);
    const name = target.split("::").pop() || target; const block = status === "passed" ? "" : testBlock(raw, name);
    const kind = block.match(/^E\s+([^\n]+)/m)?.[1]?.split(/\s{2,}/)[0] || match[3] || (status === "error" ? "Test error" : "Assertion failed");
    const lineMatches = [...block.matchAll(new RegExp(`${escapeRegex(fileName)}:(\\d+):`, "g"))]; const line = lineMatches.at(-1)?.[1];
    const detail = status === "passed" ? "Passed" : `${kind}${line ? ` · ${fileName}:${line}` : ""}`;
    cases.push({status, name, detail, block: block || detail});
  }
  return cases;
}
function selectTestCase(index, switchLog = true) {
  const item = state.testCases[index]; if (!item) return;
  document.querySelectorAll(".test-case").forEach(button => button.classList.toggle("selected", Number(button.dataset.testIndex) === index));
  const passed = item.status === "passed"; $("issue-card").className = `issue-card ${passed ? "success" : "failure"}`; $("issue-kicker").textContent = passed ? "Passed" : "Selected check"; $("issue-title").textContent = item.name; $("issue-output").innerHTML = terminalMarkup(passed ? "This check passed. Keep going." : item.block);
  if (switchLog) setLogView(passed ? "full" : "error");
}
function renderTestList(raw, action, stats) {
  if (action !== "tests") { $("test-list-card").hidden = true; state.testCases = []; return; }
  state.testCases = parseTestCases(raw, $("file-name").textContent); $("test-list-card").hidden = state.testCases.length === 0;
  $("test-list-summary").textContent = `${stats.passed} passed · ${stats.failed} failed`;
  $("test-list").innerHTML = state.testCases.map((item, index) => `<button class="test-case ${item.status === "passed" ? "pass" : item.status}" type="button" role="listitem" data-test-index="${index}"><i class="case-state">${item.status === "passed" ? "✓" : "!"}</i><span class="case-copy"><strong class="case-name">${escapeHtml(item.name)}</strong><small class="case-detail">${escapeHtml(item.detail)}</small></span><span class="case-chevron">›</span></button>`).join("");
  document.querySelectorAll(".test-case").forEach(button => button.addEventListener("click", () => selectTestCase(Number(button.dataset.testIndex))));
  const firstFailure = state.testCases.findIndex(item => item.status !== "passed"); if (firstFailure >= 0) selectTestCase(firstFailure, false);
}
function renderResultDetails(result, action, stats) {
  const stdout = result.stdout || ""; const stderr = result.stderr || ""; const raw = result.output || [stdout, stderr].filter(Boolean).join("\n");
  const pytest = action === "tests" ? splitPytestOutput(raw) : null;
  const consoleOutput = pytest ? pytest.console : stdout;
  const errors = pytest ? (result.ok ? "" : [stderr, pytest.errors].filter(Boolean).join("\n")) : stderr;
  const full = action === "tests" ? fullLog(raw, stderr, action, result.exit_code) : fullLog(stdout, stderr, action, result.exit_code);
  state.logs = {error: errors, console: consoleOutput, full}; const issue = result.ok ? (action === "tests" ? `${stats.passed} focused checks passed. There is nothing to fix.` : consoleOutput || "The demo finished without errors.") : firstProblem(errors || raw);
  $("issue-card").className = `issue-card ${result.ok ? "success" : "failure"}`; $("issue-kicker").textContent = result.ok ? "All clear" : "Start here"; $("issue-title").textContent = result.ok ? "Your run completed successfully." : "First actionable error"; $("issue-output").innerHTML = terminalMarkup(issue);
  $("log-error").textContent = errors ? "Errors" : "Errors · none"; $("log-console").textContent = consoleOutput ? "Console" : "Console · none"; setLogView("console"); renderTestList(raw, action, stats);
}
function replWelcome() { $("repl-transcript").innerHTML = '<div class="repl-welcome"><strong>Fresh Python session</strong><br>Your lesson functions are loaded. Try an expression like <code>sum_to(10)</code>, create a variable, then use it on the next line.</div>'; }
function resizeReplInput() { const input = $("repl-code"); input.style.height = "auto"; input.style.height = `${Math.min(180, Math.max(42, input.scrollHeight))}px`; }
function indentReplInput(outdent) {
  const input = $("repl-code"); const start = input.selectionStart; const end = input.selectionEnd; const lineStart = input.value.lastIndexOf("\n", start - 1) + 1; const lineEndAnchor = end > start && input.value[end - 1] === "\n" ? end - 1 : end; const lineEnd = input.value.indexOf("\n", lineEndAnchor); const blockEnd = lineEnd < 0 ? input.value.length : lineEnd; const lines = input.value.slice(lineStart, blockEnd).split("\n");
  const replacement = lines.map(line => outdent ? line.replace(/^ {1,4}/, "") : `    ${line}`).join("\n"); input.setRangeText(replacement, lineStart, blockEnd, "select"); resizeReplInput();
}
function recallReplHistory(direction) {
  if (!state.replHistory.length) return; const input = $("repl-code");
  if (state.replHistoryIndex < 0) state.replHistoryDraft = input.value;
  if (direction < 0) state.replHistoryIndex = state.replHistoryIndex < 0 ? state.replHistory.length - 1 : Math.max(0, state.replHistoryIndex - 1);
  else state.replHistoryIndex = state.replHistoryIndex >= state.replHistory.length - 1 ? -1 : state.replHistoryIndex + 1;
  input.value = state.replHistoryIndex < 0 ? state.replHistoryDraft : state.replHistory[state.replHistoryIndex]; input.selectionStart = input.selectionEnd = input.value.length; resizeReplInput();
}
function renderReplValue(value, label = "") {
  if (!value) return "";
  const title = `${label ? `<span class="repl-key">${escapeHtml(label)}</span> = ` : ""}${escapeHtml(value.repr || value.type || "value")}`;
  if (value.entries || value.items) {
    const children = value.entries ? value.entries.map(entry => renderReplValue(entry.value, entry.key)).join("") : value.items.map((item, index) => renderReplValue(item, String(index))).join("");
    return `<details class="repl-object" open><summary>${title} <span class="repl-truncated">(${value.size ?? 0} ${value.type})</span></summary>${children}${value.truncated ? '<div class="repl-truncated">… more items omitted</div>' : ""}</details>`;
  }
  return `<div class="repl-leaf">${title}</div>`;
}
function appendReplEntry(command, result) {
  const entry = document.createElement("div"); entry.className = "repl-entry-line"; entry.innerHTML = `<b>›</b> ${escapeHtml(command)}`; $("repl-transcript").appendChild(entry);
  if (result.stdout) { const out = document.createElement("pre"); out.className = "repl-stdout"; out.textContent = result.stdout; $("repl-transcript").appendChild(out); }
  if (result.stderr) { const error = document.createElement("pre"); error.className = "repl-stderr"; error.textContent = result.stderr; $("repl-transcript").appendChild(error); }
  if (result.value) { const value = document.createElement("div"); value.className = "repl-value"; value.innerHTML = renderReplValue(result.value); $("repl-transcript").appendChild(value); }
  if (result.bindings && Object.keys(result.bindings).length) { const bindings = document.createElement("div"); bindings.className = "repl-value"; bindings.innerHTML = Object.entries(result.bindings).map(([name, value]) => renderReplValue(value, name)).join(""); $("repl-transcript").appendChild(bindings); }
  if (!result.stdout && !result.stderr && !result.value && (!result.bindings || !Object.keys(result.bindings).length)) { const note = document.createElement("div"); note.className = "repl-note"; note.textContent = "Executed."; $("repl-transcript").appendChild(note); }
  $("repl-transcript").scrollTop = $("repl-transcript").scrollHeight;
}
function appendReplBlank() { const blank = document.createElement("div"); blank.className = "repl-blank"; blank.setAttribute("aria-hidden", "true"); $("repl-transcript").appendChild(blank); $("repl-transcript").scrollTop = $("repl-transcript").scrollHeight; }
function clearReplTranscript() { $("repl-transcript").innerHTML = ""; }
async function closeRepl() {
  const session = state.replSession; state.replSession = null;
  if (!session) return;
  try { await apiFetch("/api/repl/close", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({session})}); } catch (_) { /* Server shutdown is harmless here. */ }
}
async function openRepl(restart = false) {
  if (state.replSession && !restart) return;
  if (restart) await closeRepl();
  $("repl-source").textContent = "Loading your current lesson code…"; $("repl-restart").disabled = true;
  try {
    const response = await apiFetch("/api/repl/open", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({lesson: state.lesson, code: $("code").value})});
    const result = await response.json(); if (!response.ok) throw new Error(result.error || "The REPL could not start.");
    state.replSession = result.session; state.replSource = $("code").value; replWelcome(); $("repl-source").textContent = "Loaded from your current lesson code · session stays live"; $("repl-code").focus();
  } catch (error) { $("repl-source").textContent = "Could not start"; $("repl-transcript").innerHTML = `<div class="repl-welcome">${escapeHtml(error.message)}</div>`; }
  finally { $("repl-restart").disabled = false; }
}
async function resetRepl() { state.replHistory = []; state.replHistoryIndex = -1; state.replHistoryDraft = ""; $("repl-code").value = ""; resizeReplInput(); await openRepl(true); }
async function runRepl() {
  const input = $("repl-code").value.trimEnd(); if (state.replRunning) return;
  if (!input.trim()) { $("repl-code").value = ""; resizeReplInput(); appendReplBlank(); return; }
  if (state.replSource !== $("code").value) await openRepl(true);
  if (!state.replSession) return;
  state.replRunning = true; $("repl-run").disabled = true;
  try {
    const response = await apiFetch("/api/repl/run", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({session: state.replSession, input})});
    const result = await response.json(); if (!response.ok) throw new Error(result.error || "The REPL could not run.");
    state.replHistory.push(input); state.replHistoryIndex = -1; state.replHistoryDraft = ""; $("repl-code").value = ""; resizeReplInput(); appendReplEntry(input, result); tone(result.ok ? "success" : "failure");
  } catch (error) { appendReplEntry(input, {ok: false, stderr: error.message}); tone("failure"); }
  finally { state.replRunning = false; $("repl-run").disabled = false; $("repl-code").focus(); }
}
function celebrate(item) { playFanfare(); const colors = ["#72e3a1", "#ffd166", "#82c7ff", "#ff9eaa"]; if (!prefersReducedMotion) for (let i = 0; i < 30; i++) { const spark = document.createElement("i"); spark.className = "spark"; spark.style.left = `${35 + Math.random() * 30}%`; spark.style.top = `${30 + Math.random() * 15}%`; spark.style.background = colors[i % colors.length]; spark.style.setProperty("--dx", `${(Math.random() - .5) * 260}px`); document.body.appendChild(spark); setTimeout(() => spark.remove(), 900); } $("toast-copy").textContent = `+${item.reward} XP · ${item.goal}`; $("toast").classList.remove("show"); void $("toast").offsetWidth; $("toast").classList.add("show"); $("fanfare-copy").textContent = `You earned ${item.reward} XP and mastered ${item.title}.`; $("fanfare").hidden = false; }
async function run(action) {
  if (state.running) return; state.running = true; setResultsExpanded(true); $("run-tests").disabled = true; $("run-demo").disabled = true; state.drafts[state.lesson] = $("code").value; saveProgress(); $("saved-state").textContent = "Saved locally"; $("status").textContent = action === "tests" ? "Running your checks…" : "Running the demo…"; $("status").className = "status"; $("run-kind").textContent = action === "tests" ? "Tests running" : "Demo running"; startRunVisual(action); const started = Date.now();
  try { const response = await apiFetch("/api/run", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({lesson: state.lesson, action, code: $("code").value})}); const result = await response.json(); if (!response.ok) throw new Error(result.error); const wait = Math.max(0, 430 - (Date.now() - started)); if (wait) await new Promise(resolve => setTimeout(resolve, wait)); const stats = finishRunVisual(result, action); showFeedback(result, action, stats); renderResultDetails(result, action, stats); playTestTones(stats.passed, stats.failed); $("run-kind").textContent = result.ok ? "Passed" : "Needs work";
    if (result.ok && action === "tests") { const item = await get(`/api/lessons/${state.lesson}`); if (!state.completed.has(state.lesson)) { state.completed.add(state.lesson); state.xp += item.reward; state.streak += 1; $("xp").textContent = state.xp; $("streak").textContent = state.streak; saveProgress(); renderProgress(); celebrate(item); } $("completion-chip").textContent = "✓ Solved"; $("completion-chip").classList.add("complete"); $("next").hidden = state.lesson >= state.lessons.length; $("status").textContent = "Lesson complete. Excellent work."; $("status").className = "status success"; }
    else { $("status").textContent = result.ok ? "Demo finished. Run the focused checks when ready." : "Use the first failure to guide your next edit."; $("status").className = `status ${result.ok ? "success" : "failure"}`; if (!result.ok) tone("failure"); }
  } catch (error) { clearInterval(runTimer); const result = {ok: false, output: error.message, stderr: error.message, stdout: ""}; const stats = {passed: 0, failed: 1, total: 1}; renderResultDetails(result, action, stats); $("feedback-summary").textContent = "The local runner could not complete."; $("feedback-summary").className = "feedback-summary failure"; $("status").textContent = "Check that the local server is running, then try again."; $("status").className = "status failure"; $("results-card").classList.add("failure"); tone("failure"); }
  finally { state.running = false; $("run-tests").disabled = false; $("run-demo").disabled = false; }
}

const tourSteps = [
  {selector: "[data-tour='toolbar']", title: "Run from the toolbar", copy: "Demo your solution or run focused checks without leaving the editor."},
  {selector: "[data-tour='description']", title: "Read the problem", copy: "The original course lesson is rendered here with examples, requirements, and reference links."},
  {selector: "[data-tour='splitter']", title: "Resize your workspace", copy: "Drag this divider to give the problem or editor more room. Double-click to reset it."},
  {selector: "[data-tour='editor']", title: "Build your solution", copy: "Edit Python with line numbers, syntax color, indentation help, and local draft saving."},
  {selector: "[data-tour='results']", title: "Learn from feedback", copy: "Test output expands here. Failures stay actionable; green runs earn XP and celebrations."},
];
let tourIndex = 0;
function positionTour() {
  if ($("tour").hidden) return; const step = tourSteps[tourIndex]; const target = document.querySelector(step.selector); if (!target || target.offsetParent === null) { if (tourIndex < tourSteps.length - 1) { tourIndex++; showTourStep(); } return; }
  const rect = target.getBoundingClientRect(); const pad = 6; Object.assign($("tour-spotlight").style, {left: `${Math.max(4, rect.left - pad)}px`, top: `${Math.max(4, rect.top - pad)}px`, width: `${Math.min(innerWidth - 8, rect.width + pad * 2)}px`, height: `${Math.min(innerHeight - 8, rect.height + pad * 2)}px`});
  const card = $("tour-card"); const cardWidth = card.offsetWidth || 330; const cardHeight = card.offsetHeight || 190; let left = rect.right + 16; let top = rect.top + Math.min(40, rect.height / 3);
  if (left + cardWidth > innerWidth - 12) { left = rect.left - cardWidth - 16; }
  if (left < 12) { left = Math.max(12, Math.min(innerWidth - cardWidth - 12, rect.left + rect.width / 2 - cardWidth / 2)); top = rect.bottom + 14; }
  if (top + cardHeight > innerHeight - 12) top = Math.max(12, rect.top - cardHeight - 14);
  card.style.left = `${left}px`; card.style.top = `${Math.max(12, top)}px`;
}
function showTourStep() { const step = tourSteps[tourIndex]; $("tour-count").textContent = `${tourIndex + 1} of ${tourSteps.length}`; $("tour-title").textContent = step.title; $("tour-copy").textContent = step.copy; $("tour-back").disabled = tourIndex === 0; $("tour-next").textContent = tourIndex === tourSteps.length - 1 ? "Start practicing" : "Next"; requestAnimationFrame(positionTour); }
function startTour() { closeLessonDrawer(); tourIndex = 0; $("tour").hidden = false; showTourStep(); }
function endTour() { $("tour").hidden = true; localStorage.setItem(tourKey, "done"); $("help-tour").focus(); }

$("lessons-button").addEventListener("click", () => $("lesson-drawer").hidden ? openLessonDrawer() : closeLessonDrawer());
$("close-lessons").addEventListener("click", closeLessonDrawer); $("drawer-scrim").addEventListener("click", closeLessonDrawer);
$("previous-lesson").addEventListener("click", () => { if (state.lesson > 1) loadLesson(state.lesson - 1); }); $("next-lesson").addEventListener("click", () => { if (state.lesson < state.lessons.length) loadLesson(state.lesson + 1); });
$("description-tab").addEventListener("click", () => setDescriptionTab(false)); $("hint-tab").addEventListener("click", () => setDescriptionTab(true)); $("hint").addEventListener("click", () => { setDescriptionTab(true); tone("success"); });
$("run-tests").addEventListener("click", () => run("tests")); $("run-demo").addEventListener("click", () => run("demo")); $("results-toggle").addEventListener("click", () => setResultsExpanded($("results-card").classList.contains("collapsed")));
$("repl-launch").addEventListener("click", () => { setResultsExpanded(true); setLogView("repl"); });
document.querySelectorAll(".log-tab").forEach(button => button.addEventListener("click", () => setLogView(button.dataset.log)));
$("repl-run").addEventListener("click", runRepl); $("repl-restart").addEventListener("click", resetRepl); $("repl-code").addEventListener("input", resizeReplInput); $("repl-code").addEventListener("keydown", event => { const input = $("repl-code"); const lineStart = input.value.lastIndexOf("\n", input.selectionStart - 1) + 1; const line = input.value.slice(lineStart, input.selectionStart); if (event.ctrlKey && event.key.toLowerCase() === "l") { event.preventDefault(); clearReplTranscript(); return; } if (event.key === "Tab") { event.preventDefault(); indentReplInput(event.shiftKey); return; } if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key === "ArrowUp") { event.preventDefault(); recallReplHistory(-1); return; } if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key === "ArrowDown") { event.preventDefault(); recallReplHistory(1); return; } if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); runRepl(); return; } if (event.key === "Enter" && !event.shiftKey && /:\s*(#.*)?$/.test(line.trim())) { event.preventDefault(); input.setRangeText(`\n${(line.match(/^\s*/) || [""])[0]}    `, input.selectionStart, input.selectionEnd, "end"); resizeReplInput(); return; } if (event.key === "Enter" && !event.shiftKey && input.value.includes("\n") && !line.trim()) { event.preventDefault(); runRepl(); return; } if (event.key === "Enter" && !event.shiftKey && input.value.includes("\n")) { event.preventDefault(); input.setRangeText(`\n${(line.match(/^\s*/) || [""])[0]}`, input.selectionStart, input.selectionEnd, "end"); resizeReplInput(); return; } if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); runRepl(); } });
$("next").addEventListener("click", () => { $("fanfare").hidden = true; if (state.lesson < state.lessons.length) loadLesson(state.lesson + 1); }); $("fanfare-close").addEventListener("click", () => { $("fanfare").hidden = true; });
$("reset").addEventListener("click", () => { if (!confirm("Reset this lesson back to its starter code?")) return; $("code").value = state.starter; delete state.drafts[state.lesson]; updateEditor(); saveProgress(); $("saved-state").textContent = "Starter restored"; });
$("sound").addEventListener("click", () => { state.sound = !state.sound; $("sound").textContent = state.sound ? "🔊" : "🔇"; saveProgress(); });
$("help-tour").addEventListener("click", startTour); $("tour-close").addEventListener("click", endTour); $("tour-skip").addEventListener("click", endTour); $("tour-back").addEventListener("click", () => { if (tourIndex > 0) { tourIndex--; showTourStep(); } }); $("tour-next").addEventListener("click", () => { if (tourIndex === tourSteps.length - 1) endTour(); else { tourIndex++; showTourStep(); } });
function saveEditorDraft() { state.drafts[state.lesson] = $("code").value; updateEditor(); saveProgress(); $("saved-state").textContent = "Saved locally"; }
function selectedLineRange(code) {
  const start = code.selectionStart; const end = code.selectionEnd; const blockStart = code.value.lastIndexOf("\n", start - 1) + 1;
  const endAnchor = end > start && code.value[end - 1] === "\n" ? end - 1 : end;
  const nextBreak = code.value.indexOf("\n", endAnchor); const blockEnd = nextBreak < 0 ? code.value.length : nextBreak;
  return {blockStart, blockEnd};
}
function toggleComments(code) {
  const {blockStart, blockEnd} = selectedLineRange(code); const block = code.value.slice(blockStart, blockEnd); const lines = block.split("\n");
  const content = lines.filter(line => line.trim()); const uncomment = content.length > 0 && content.every(line => /^\s*#/.test(line));
  const replacement = lines.map(line => { if (!line.trim()) return line; return uncomment ? line.replace(/^(\s*)# ?/, "$1") : line.replace(/^(\s*)/, "$1# "); }).join("\n");
  code.setRangeText(replacement, blockStart, blockEnd, "select"); saveEditorDraft();
}
function duplicateSelectionOrLine(code) {
  const {blockStart, blockEnd} = selectedLineRange(code); const hasSelection = code.selectionStart !== code.selectionEnd;
  if (hasSelection) { const text = code.value.slice(code.selectionStart, code.selectionEnd); code.setRangeText(text + text, code.selectionStart, code.selectionEnd, "end"); }
  else { const line = code.value.slice(blockStart, blockEnd); code.setRangeText(`\n${line}`, blockEnd, blockEnd, "end"); }
  saveEditorDraft();
}
function deleteSelectionOrLine(code) {
  const {blockStart, blockEnd} = selectedLineRange(code); const start = code.selectionStart; const end = code.selectionEnd;
  if (start !== end) code.setRangeText("", start, end, "start");
  else { const deleteEnd = blockEnd < code.value.length ? blockEnd + 1 : blockEnd; const deleteStart = blockStart > 0 && blockEnd === code.value.length ? blockStart - 1 : blockStart; code.setRangeText("", deleteStart, deleteEnd, "start"); }
  saveEditorDraft();
}
$("code").addEventListener("input", saveEditorDraft); $("code").addEventListener("scroll", syncEditorScroll); $("code").addEventListener("click", updateActiveLine); $("code").addEventListener("keyup", updateActiveLine);
$("code").addEventListener("keydown", event => {
  const code = $("code"); const start = code.selectionStart; const end = code.selectionEnd; const before = code.value.slice(0, start); const lineStart = before.lastIndexOf("\n") + 1; const line = before.slice(lineStart);
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); $("completion").hidden = true; run("tests"); return; }
  if ((event.ctrlKey || event.metaKey) && event.key === "/") { event.preventDefault(); toggleComments(code); return; }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") { event.preventDefault(); duplicateSelectionOrLine(code); return; }
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "k") { event.preventDefault(); deleteSelectionOrLine(code); return; }
  if ((event.ctrlKey || event.metaKey) && event.code === "Space") { event.preventDefault(); showCompletions(); return; }
  if (event.key === "Tab") { event.preventDefault(); if (event.shiftKey) { const indent = line.match(/^ {1,4}/); if (indent) code.setRangeText("", lineStart, lineStart + indent[0].length, "end"); } else code.setRangeText("    ", start, end, "end"); saveEditorDraft(); return; }
  if (event.key === "Backspace" && start === end) { const leading = line.match(/^ +/)?.[0] || ""; const position = start - lineStart; if (position > 0 && position <= leading.length) { event.preventDefault(); const width = position % 4 || 4; code.setRangeText("", start - width, start, "end"); saveEditorDraft(); return; } }
  if (event.key === "Enter") { event.preventDefault(); const indent = (line.match(/^\s*/) || [""])[0]; const extra = /:\s*(#.*)?$/.test(line.trim()) ? "    " : ""; code.setRangeText("\n" + indent + extra, start, end, "end"); saveEditorDraft(); return; }
  if (event.key === "Escape") $("completion").hidden = true;
});
document.addEventListener("keydown", event => { if (event.key === "Escape") { if (!$("tour").hidden) endTour(); else closeLessonDrawer(); } });
window.addEventListener("resize", () => { if (!$("tour").hidden) positionTour(); setResultsHeight(Number($("results-resizer").getAttribute("aria-valuenow"))); });

loadProgress(); initializeSplitter(); initializeResultsResizer();
(async () => {
  try { state.lessons = await get("/api/lessons"); renderList(state.lessons); await loadLesson(state.lessons.find(item => !state.completed.has(item.id))?.id || state.lessons[0].id); if (!localStorage.getItem(tourKey)) setTimeout(startTour, 220); }
  catch (error) { $("title").textContent = "Could not start"; $("instructions").textContent = error.message; }
})();

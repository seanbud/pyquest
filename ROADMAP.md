# Pyquest product roadmap

The north star is a course engine that feels as capable as a small IDE and as
motivating as an excellent learning game—while remaining local-first, portable,
and honest about what the learner has mastered.

## 0.1 — First public release

- Professional split workspace, lesson tour, responsive layout
- Eighteen Python lessons sourced from their original repository
- Rich editor basics, focused check explorer, output views, and stateful REPL
- Drafts, progress, rewards, sound toggle, and reduced-motion support
- Native CPython/pytest mode plus safe static Pyodide deployment
- MIT project packaging, attribution boundary, and versioned course manifest

## 0.2 — Trustworthy daily practice

- Offline cache and explicit runtime/download status
- Better browser-runner parity and regression tests for every supported lesson
- Searchable curriculum map, bookmarks, recent lessons, and resume card
- Theme controls, font sizing, command palette, and expanded accessibility audit
- Import remaining fundamentals in manifest-driven batches

## 0.3 — The teaching layer

- Translate common assertion, syntax, name, type, and boundary failures into
  concise explanations while preserving the real traceback
- Progressive hints with examples and a deliberate solution reveal
- “Explain this check” and “show the smallest next step” interactions
- Tiny visual labs for slicing, truthiness, loops, references, and data flow
- Spaced review queue based on demonstrated skills rather than page visits

## 0.4 — IDE confidence

- CodeMirror or Monaco adapter with bracket matching, folding, multi-cursor,
  search/replace, diagnostics, and robust autocomplete
- Multi-file tabs and a real file tree
- Diff against starter, checkpoints, snapshots, and undoable reset
- Keyboard-first command palette and configurable keymap
- Optional local language-server bridge in native mode

## 0.5 — Motivation with taste

- Skill map, quests, mastery levels, and personal bests
- Reward pacing based on meaningful checks—not button presses
- More expressive browser-native animation and sound themes
- Calm/focus mode and controls for every sensory effect
- Shareable completion cards with no learner data collection

## 0.6 — Authoring at scale

- Validate manifests with a published JSON Schema and authoring CLI
- Generate lesson metadata from conventional repositories, then review diffs
- Course preview mode, fixture inspector, and compatibility report
- Reusable components for custom instructions, visualizers, and feedback rules
- Token-efficient lesson onboarding: inventory → infer metadata → batch validate →
  human-review exceptions

## 0.7 — Project-shaped learning

- Manifest v2 multi-file workspaces with editable/read-only/generated files
- Task graphs for linked scripts, APIs, data transforms, and pipelines
- Dataset and artifact panes with table, JSON, image, and chart previews
- Safe browser virtual filesystem and per-project snapshots
- Native container adapter for advanced, explicitly trusted courses

## 0.8 — Community course ecosystem

- Course starter template, examples, compatibility badges, and version pinning
- Install courses from GitHub without copying their source into Pyquest
- Author and learner documentation sites
- Curated gallery with clear licensing and provenance metadata
- Export/import local progress without an account

## 0.9 — Release candidate

- Performance budgets, cross-browser matrix, security review, and failure telemetry
  that is local by default and opt-in if ever transmitted
- Stable extension API and migration tools for manifest revisions
- Complete keyboard/screen-reader workflows and WCAG contrast verification
- Full course completion flow, recovery states, and polished onboarding

## 1.0 — The portable coding-course engine

- A stable, documented engine for single-file exercises and multi-file projects
- Excellent editor, test explorer, REPL, artifacts, visualizers, and coaching
- Native and browser execution adapters with explicit capability negotiation
- A complete Python learning path and reusable templates for new disciplines
- Sustainable maintenance, contribution, release, and security processes

## Principles that do not wait for 1.0

1. Course authors keep ownership; manifests point to sources and preserve licenses.
2. Feedback is fast, specific, and connected to real program behavior.
3. Delight supports learning and always respects sound and motion preferences.
4. Learner code and progress stay local unless the learner explicitly exports them.
5. Capabilities are declared honestly; the interface never pretends a lightweight
   editor or test harness is a full IDE or full pytest implementation.

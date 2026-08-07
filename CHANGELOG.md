# Changelog

All notable changes follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.3] - 2026-08-07

### Added

- Editor-line diagnostics for failed checks and runtime errors.
- Click-to-jump navigation from a failed check to the relevant source line.
- Honest fallback highlighting of a likely related function when pytest does
  not provide an exact learner-source traceback line.

## [0.1.2] - 2026-08-07

### Added

- Subtle leading-whitespace markers: dots for spaces and arrows for tabs.
- Live warnings for mixed tab/space styles and uneven indentation levels.
- Plain-language feedback for `TabError` and `IndentationError`, including the
  relevant line when Python reports one.
- One-click conversion of leading tabs to 4-space tab stops.

## [0.1.1] - 2026-08-07

### Changed

- Faded the empty REPL prompt so it reads clearly as placeholder guidance.
- Stopped Down Arrow at the newest history position instead of wrapping to the
  oldest command, with a restrained visual and optional audio boundary cue.

## [0.1.0] - 2026-08-07

### Added

- Eighteen interactive lessons from variables through type hints.
- Resizable problem, editor, and results panes with a guided first-run tour.
- Python highlighting, line numbers, indentation guides, completion suggestions,
  editor shortcuts, persistent drafts, and progress.
- Focused check results, captured console output, actionable tracebacks, and a
  stateful Python REPL with history and expandable values.
- Accessible celebrations, optional browser-native sound, and reduced-motion support.
- Native local runner and browser-contained Pyodide runtime for GitHub Pages.
- Course manifest contract for adding repositories without modifying their source.

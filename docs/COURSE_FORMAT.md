# Course manifest format

`course.json` is a versioned adapter between Pyquest and an external course.

```json
{
  "schema_version": 1,
  "id": "course-id",
  "title": "Course title",
  "source": {
    "repository": "https://github.com/owner/repository",
    "revision": "main",
    "base_path": "assignments",
    "license": "MIT"
  },
  "lessons": [
    {
      "id": 1,
      "folder": "01_intro",
      "file": "solution.py",
      "test_file": "test_solution.py",
      "demo_file": "main.py",
      "title": "First lesson",
      "focus": "What the learner practices.",
      "goal": "A concrete learner outcome.",
      "hint": "One progressive nudge.",
      "tag": "Fundamentals",
      "reward": 100
    }
  ]
}
```

The browser runtime currently expects a public GitHub source and these four
files in every lesson folder: `README.md`, the editable file, the test file, and
the demo file. Native mode may use a private local checkout.

Schema v2 is reserved for multi-file workspaces and explicit runner
capabilities. Consumers must reject unknown major schema versions rather than
guessing.

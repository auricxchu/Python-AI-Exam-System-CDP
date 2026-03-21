# Changelog

## Unreleased

- Refine the API settings modal into a simpler desktop-style layout with unified scrollbar styling.
- Add lite opening screen flow and keep the full opening animation for first launch.
- Fix lite opening logo sizing/centering and add a timed fallback so the app cannot get stuck on the splash screen.
- Replace the IME drag handle with a lighter vertical three-dot grip.
- Clean up multiple UTF-8/garbled UI strings in `App.tsx`.
- Improve IME status handling with TSF probing, shift-tap state, and bottom-right status bar (now includes CAPS).
- Remove duplicate IME status bar from the top header.
- Restore StudentExam.tsx to valid UTF-8 after encoding corruption.
- Stabilize IME CN/EN toggle behavior when switching between ENG and Chinese layouts.
- Load Monaco editor assets locally for offline use and prevent IDE from hanging without VPN.
- Prevent opening-screen code animation from restarting during init checks.
- Stabilize Pyodide terminal output to avoid repeated input prompts.
- Add resizable split panes for question, editor, and terminal with reset-on-double-click.
- Improve splitter styling and light theme contrast.
- Stabilize Pyodide runs by resetting runtime on each run and aborting stuck runs.
- Preserve per-question terminal output until the next run.
- Remove auto/default model option and use explicit provider selection.
- Update model availability checks to resolve per-provider as they complete.
- Simplify AI question prompt to a single-line input and remove the continuous-chat hint.
- Restore multi-line fields for question description and code template.
- Fix Pyodide output decoding so input prompts render correctly.
- Normalize terminal input typography to match editor spacing.
- Add AI model selector with availability checks and center-selection wheel UI.
- Add AI question drafting in teacher editor with prompt input and wand action.
- Expand AI provider support (OpenAI/Qwen/Moonshot) and rename service to `aiService`.
- Improve exam report details (start/end time, actual grading model) and layout.
- Refine light theme background and hover contrast.

## Known Issues

- Wubi IME profile is not detected; UI falls back to Pinyin/ENG only.
- TSF profile reporting can return default (all-zero) profile GUIDs on some systems.

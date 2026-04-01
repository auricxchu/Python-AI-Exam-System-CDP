# Changelog

## Unreleased

- Rework the student results page into separate left/right cards with improved visual hierarchy and teacher-dashboard-aligned question panels.
- Add per-question review expansion with question content, embedded images, AI summary blocks, stacked student/reference answers, and fixed image zoom preview.
- Add exam-level review summary generation, including a dedicated all-blank submission branch and AI reference answers for blank questions.
- Improve report export flow: auto-export failed cloud uploads to the desktop in Electron and add a manual "导出成绩单" action on the results page.
- Refine results-page spacing, contrast, score typography, hover states, and action button layout across dark/light themes.
- Extend the local run timeout to 60 seconds to better support multi-step input and slower executions.
- Show total score and per-question awarded points with one decimal place, and animate the final score from 0.0 on the results page.
- Simplify the exam info section into a single-column layout with tighter, more consistent spacing.
- Restore readable Chinese copy in the student report page by removing Unicode escapes and cleaning display text.
- Tighten Tailwind content scanning and clean up App/type definitions to reduce dead code and unsafe typing.

- Refine the API settings modal into a simpler desktop-style layout with unified scrollbar styling.
- Add lite opening screen flow and keep the full opening animation for first launch.
- Fix lite opening logo sizing/centering and add a timed fallback so the app cannot get stuck on the splash screen.
- Replace the IME drag handle with a lighter vertical three-dot grip.
- Clean up multiple UTF-8/garbled UI strings in `App.tsx`.
- Improve IME status handling with TSF probing, shift-tap state, and bottom-right status bar (now includes CAPS).
- Remove duplicate IME status bar from the top header.
- Restore `StudentExam.tsx` to valid UTF-8 after encoding corruption.
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

# Changelog

## Unreleased — Cross-platform & Bugfix Sprint (Claude Code)

*Contributed by Claude Code (Deepseek-v4-pro)*

- **Cross-platform support**: remove Windows-only IME helper entirely; switch from fullscreen to borderless maximized window so the native OS taskbar (and its IME toolbar) stays visible during exams. macOS and Linux can now build and package without Windows dependencies.
- **Add macOS app icon**: generate `app_icon.icns` from PNG source and wire it into the electron-builder macOS config.
- **Fix multi-line print output**: Pyodide 0.25 `write` handler was missing the required `return buffer.length`, causing stdout to be silently dropped. Switched to `write` API with streaming `TextDecoder` — all `print()` output now displays correctly.
- **Fix opening animation bugs**: fallback timeout now correctly writes `OPENING_SEEN_KEY` so the lite splash plays on subsequent launches; lite fade-out wait increased to match CSS transition duration; editor code span given `minHeight` to prevent layout jumps during typing animation.
- **Responsive layout for small screens**: landing page, score report, and teacher dashboard now use Tailwind responsive breakpoints (`sm:`/`md:`) to scale down font sizes and spacing on 1366×768 and similar displays. Score report and teacher dashboard panels switched to `overflow-y-auto` for scrollable content.
- **Remove custom IME floating pill**: the in-app IME status indicator was unreliable across different IME types and had state synchronisation issues. Deleted entirely (~130 lines of state, polling, drag, and rendering). Users now rely on the native OS IME toolbar visible in the taskbar.
- **Offline exam security**: extended network connectivity check to include Supabase backend reachability; restored online-required gate in the student login flow; added 60-second offline detection that locks the exam UI with a fullscreen overlay to prevent question leakage when the network drops.
- **Exam runtime asset loading**: support local Pyodide and Monaco assets as priority sources, falling back to CDN only when local files are unavailable.
- **Feedback system**: students can submit technical/grading/other feedback from the score report page.
- **Exam kiosk security**: add `before-input-event` shortcut blocking (Alt+Tab, Win key, Alt+F4, Ctrl+R, etc.), minimisation prevention, focus-loss recovery, and DevTools blocking during exams.

---

## Previous Releases

### Teacher UX & Manual Paper Assembly

- Move AI provider configuration into the teacher dashboard and add a Supabase-backed cloud proxy flow for provider settings and review requests.
- Add teacher-admin onboarding: force a password change after default-password login, guide the teacher through AI key setup, and show a short usage guide.
- Improve teacher-side UX with draft-based AI connectivity checks, light-theme warning contrast fixes, and smoother direct-click model-wheel animation.
- Remove client-side AI key injection from Vite builds and stop persisting the teacher password in session storage, reducing accidental secret exposure.
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
- Add dual paper assembly modes in the teacher dashboard: keep random draw rules and add manual paper building with per-question selection, scoring, ordering, and validation.
- Normalize exam config persistence for the new manual-paper structure across local storage, cloud sync, and student-side paper generation.
- Refine manual-paper UX with compact left-side cards, icon-based add/remove/reorder actions, theme-aware hover states, and landing-card watermark polish in light mode.
- Unify teacher-side paper summary layout, trim manual-paper visual noise, wire in dedicated app/setup/uninstall icons, and regenerate Windows multi-size ICO assets.

### IME, Editor & Stability

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

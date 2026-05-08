# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install              # Install dependencies (runs postinstall scripts for electron-rebuild patch + Monaco copy)
npm run dev              # Start Vite dev server (http://localhost:5173)
npm run build            # Typecheck (tsc) + build web assets to dist/
npm run dist             # Build + package Electron app (output to release/)
npm run build:ime        # Build IME helper for Windows (requires .NET 6 SDK)
```

## Architecture

**Electron + Vite + React + TypeScript** desktop app. No router — `App.tsx` uses an in-component `AppMode` state machine (`landing → teacher_login → teacher_dash`, `landing → student_login → student_exam`).

### Layers

- **`App.tsx`** — Top-level state machine. Owns: `ExamConfig`, `AiProvider`, `AiProviderSettings`, `theme`, student user, exam questions. Passes data + callbacks down to screen components.
- **`components/`** — Screen components (`TeacherDashboard.tsx`, `StudentExam.tsx`, `OpeningScreen.tsx`) and shared UI (`CodeEditor.tsx` wrapping Monaco, `TerminalOutput.tsx`, `Modal.tsx`, `ImageModal.tsx`, `CachedImage.tsx`, `ui.tsx` with `Button`/`Input`/`Badge`).
- **`services/aiService.ts`** — The largest service (36K). Handles AI grading (`gradeQuestion`), question generation (`generateQuestion`), reference answer generation, exam review summaries, provider connection testing, and runtime AI settings management. AI provider configs are stored in-memory at runtime and persisted to Supabase cloud via `aiCloudService`.
- **`services/aiCloudService.ts`** — Proxies AI calls through Supabase Edge Function `ai-proxy` to keep third-party API keys server-side. Also fetches/saves AI settings via `admin-get-ai-settings` / `admin-upsert-ai-settings` Edge Functions.
- **`services/cloudService.ts`** — Supabase DB read/write for the full `ExamConfig` (stored in `question_bank` table, `data` JSONB column, keeps last 10 versions).
- **`services/examConfigService.ts`** — Normalizes exam configs (merges with defaults, sanitizes rules/manual questions). `buildExamQuestions()` assembles question sets from rules (random or manual mode) with a Fisher-Yates shuffle.
- **`services/pyodideService.ts`** — Web Worker that loads Pyodide (Python in browser). Uses `SharedArrayBuffer` + `Atomics.wait` for blocking `input()` support. The main thread sends code + input via `postMessage`; worker streams output back. Requires COOP/COEP headers set by Electron main process.
- **`services/storageService.ts`** — localStorage wrapper for `ExamConfig` and `ExamReport` persistence.
- **`services/adminAuthService.ts`** — Password hashing (SHA-256 via Web Crypto). Default teacher password is `"admin"` (`DEFAULT_TEACHER_PASSWORD`).
- **`services/teacherSessionService.ts`** — In-memory holder for the teacher password, used as `x-admin-password` header for Supabase Edge Function auth.
- **`services/imageCacheService.ts`** — In Electron, resolves HTTP image URLs to local cache via `appimg://` protocol IPC.
- **`hooks/useResolvedImageUrl.ts`** — Resolves image URLs through the Electron image cache on mount.

### Electron main process (`electron/main.js`)

- Creates fullscreen `BrowserWindow` with `nodeIntegration: true`, `contextIsolation: false`.
- Sets COOP/COEP response headers for SharedArrayBuffer support.
- Registers custom `appimg://` protocol for cached image serving.
- IPC handlers: `appimg-cache` (download + cache images), `ime-status-get`, `export-report-to-desktop` (write report to Desktop).
- Spawns `ime-helper.exe` (Windows only) for IME composition status, relays via `ime-status` IPC to renderer.

### Supabase backend

- **Edge Functions** (in `supabase/functions/`): `ai-proxy` (main AI proxy), `admin-get-ai-settings`, `admin-upsert-ai-settings`. Shared auth/ai logic in `_shared/`.
- **SQL**: `ai_provider_settings.sql` creates the settings table.
- **Storage buckets**: `exam-assets` (question images), `exam-reports`.
- Teacher auth to Edge Functions uses `x-admin-password` header (plaintext session password).

### Data flow

1. On load, App fetches cloud `ExamConfig` from Supabase → merges with localStorage fallback.
2. Teacher logs in (local or cloud password check) → fetches cloud AI settings → loads TeacherDashboard.
3. Teacher edits question bank/rules → saves to both localStorage and Supabase.
4. Teacher saves AI API keys → Edge Function stores them in Supabase `ai_provider_settings` table (keys never reach the frontend).
5. Student enters name/student ID/access key → `buildExamQuestions(config)` assembles the paper → enters StudentExam.
6. Student writes code → runs via Pyodide Web Worker → submits → AI grading via `ai-proxy` Edge Function → report generated, saved locally and uploaded to Supabase.

### AI Provider model

Five providers: `deepseek`, `openai`, `qwen`, `moonshot`, `gemini`. Each has an API key + model name. Default models are set in `aiService.ts` (overridable via env vars for some). The selected provider is stored in `localStorage` key `app_ai_provider`. Grading uses structured JSON output with a deduction-based scoring system (categories: syntax/logic/runtime/style, each with caps).

### Theme

Light/dark toggle stored in `localStorage` key `app_theme`. Applied via `document.documentElement.dataset.theme`. Tailwind CSS with `tailwind.config.js`.

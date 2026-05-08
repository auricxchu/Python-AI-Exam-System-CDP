# Python AI Exam System / Python 智能考试系统

A desktop-first exam system built with Electron + Vite + React. Teachers manage question banks and exam rules, and students complete timed coding exams with a built-in editor and AI-assisted grading.

基于 Electron + Vite + React 的桌面优先考试系统。教师管理题库与试卷规则，学生在内置编辑器中完成计时编程考试，并由 AI 辅助评分。

## Features / 功能

- Teacher dashboard: question bank, rules, image upload, AI question drafting
- Student exam: timer, navigation, code editor, local Python runner, AI grading
- Model selector with availability checks for configured AI providers
- Teacher-side AI API settings synced through Supabase proxy
- Exam report upload + local report generation
- Light/Dark theme toggle (default light)
- Cross-platform: Windows, macOS, Linux

- 教师端：题库、规则、图片上传、AI 出题草稿
- 学生端：计时、题目导航、代码编辑器、本地 Python 运行、AI 评分
- 已配置 AI 模型的选择与可用性检测
- 教师端 AI API 设置通过 Supabase 云代理同步
- 成绩报告上传与本地报告生成
- 黑白主题切换（默认浅色）
- 跨平台支持：Windows、macOS、Linux

## Tech Stack / 技术栈

- Electron, Vite, React, TypeScript, Tailwind
- Monaco Editor, Pyodide
- Supabase (DB + Storage)

## Requirements / 环境要求

- Node.js

## Setup / 启动

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and configure it
3. Run the app: `npm run dev`

1. 安装依赖：`npm install`
2. 复制 `.env.example` 为 `.env` 并完成配置
3. 启动项目：`npm run dev`

## Environment Variables / 环境变量

Create or edit `.env`:

- `SUPABASE_URL`
- `SUPABASE_KEY`

第三方 AI Key 不再写入前端 `.env`，请在教师端登录后通过 `AI API 设置` 保存到 Supabase 云端。

## Build & Package / 打包

```bash
# Windows (NSIS installer)
npm run dist

# macOS (DMG)
npm run dist

# Linux (AppImage)
npm run dist
```

```bash
npm run dist    # 全平台打包
```

## Scripts / 脚本

- `npm run dev` — start Vite dev server
- `npm run build` — typecheck + build web assets
- `npm run dist` — build + package Electron

## Notes / 备注

- Default teacher password: `admin` (see `App.tsx`)
- Image uploads use Supabase Storage buckets: `exam-assets` and `exam-reports`
- Python runtime and Monaco editor are loaded on demand
- The window runs in borderless maximized mode — the native OS IME toolbar in the taskbar is always visible during exams

- 默认教师密码：`admin`（见 `App.tsx`）
- 图片上传使用 Supabase Storage：`exam-assets` 与 `exam-reports`
- Python 运行环境与 Monaco 编辑器按需加载
- 窗口采用无边框最大化模式 — 考试期间任务栏中原生输入法工具栏始终可见

## Credits / 说明

- This project was originally built with Codex and Gemini (AI Studio).
- Bug fixes, cross-platform support, and responsive layout improvements by Claude Code (Deepseek-v4-pro).

- 本项目最初由 Codex 与 Gemini（AI Studio）协作完成。
- Bug 修复、跨平台适配和响应式布局改进由 Claude Code (Deepseek-v4-pro) 完成。

# Python AI Exam System / Python 智能考试系统

A desktop-first exam system built with Electron + Vite + React. Teachers manage question banks and exam rules, and students complete timed coding exams with a built-in editor and AI-assisted grading.

基于 Electron + Vite + React 的桌面优先考试系统。教师管理题库与试卷规则，学生在内置编辑器中完成计时编程考试，并由 AI 辅助评分。

## Features / 功能

- Teacher dashboard: question bank, rules, image upload, AI question drafting
- Student exam: timer, navigation, code editor, local Python runner, AI grading
- Model selector with availability checks for configured AI providers
- Built-in API settings modal for AI provider keys
- Exam report upload + local report generation
- Light/Dark theme toggle (default light)

- 教师端：题库、规则、图片上传、AI 出题草稿
- 学生端：计时、题目导航、代码编辑器、本地 Python 运行、AI 评分
- 已配置 AI 模型的选择与可用性检测
- 内置 AI 平台 API 设置弹窗
- 成绩报告上传与本地报告生成
- 黑白主题切换（默认浅色）

## Tech Stack / 技术栈

- Electron, Vite, React, TypeScript, Tailwind
- Monaco Editor, Pyodide
- Supabase (DB + Storage)

## Requirements / 环境要求

- Node.js
- Windows 10+ for packaged app
- Optional: .NET 6 SDK for IME helper (Windows only)

- Node.js
- 打包运行需 Windows 10+
- 可选：.NET 6 SDK（IME 辅助程序，仅 Windows）

## Setup / 启动

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and configure it
3. Run the app: `npm run dev`

1. 安装依赖：`npm install`
2. 复制 `.env.example` 为 `.env` 并完成配置
3. 启动项目：`npm run dev`

## Environment Variables / 环境变量

Create or edit `.env`:

- `DEEPSEEK_API_KEY`
- `API_KEY` (Gemini)
- `OPENAI_API_KEY`
- `QWEN_API_KEY`
- `MOONSHOT_API_KEY`
- Optional model overrides: `OPENAI_MODEL`, `QWEN_MODEL`, `MOONSHOT_MODEL`, `GEMINI_MODEL`
- `SUPABASE_URL`
- `SUPABASE_KEY`

如未配置 AI Key，评分、AI 出题与连通性检测会受到影响。

## Build & Package / 打包

1. Build IME helper (Windows only, optional): `npm run build:ime`
2. Package app: `npm run dist`

1. 构建 IME 辅助程序（仅 Windows，可选）：`npm run build:ime`
2. 打包应用：`npm run dist`

## Scripts / 脚本

- `npm run dev` start Vite dev server
- `npm run build` typecheck + build web assets
- `npm run dist` build + package Electron
- `npm run build:ime` build IME helper (Windows)

- `npm run dev` 启动 Vite 开发服务
- `npm run build` 类型检查 + 构建前端资源
- `npm run dist` 构建 + 打包 Electron
- `npm run build:ime` 构建 IME 辅助程序（Windows）

## Notes / 备注

- Default teacher password: `admin` (see `App.tsx`)
- Image uploads use Supabase Storage buckets: `exam-assets` and `exam-reports`
- Python runtime and Monaco editor are loaded on demand

- 默认教师密码：`admin`（见 `App.tsx`）
- 图片上传使用 Supabase Storage：`exam-assets` 与 `exam-reports`
- Python 运行环境与 Monaco 编辑器按需加载

## Credits / 说明

- This project was built with Codex and Gemini (AI Studio).
- 本项目由 Codex 与 Gemini（AI Studio）协作完成。

<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Python AI Exam System / Python 智能考试系统

A desktop-first exam system built with Electron + Vite + React. Teachers manage question banks and exam rules, students take timed coding exams with a built-in editor and AI grading.

基于 Electron + Vite + React 的桌面优先考试系统。教师管理题库和规则，学生在内置编辑器中完成计时编程考试并进行 AI 评分。

## Features / 功能

- Teacher dashboard (question bank, rules, images)
- Student exam flow (timer, navigation, code runner)
- AI grading via Gemini or Deepseek
- Pyodide-powered Python execution (CDN)
- Supabase storage for assets and reports
- Light/Dark theme toggle (default light)

- 教师端：题库、规则、图片管理
- 学生端：计时考试、题目导航、代码运行
- AI 评分：Gemini / Deepseek
- Pyodide 运行 Python（CDN 加载）
- Supabase 存储题图和报告
- 黑白主题切换（默认白色）

## Tech Stack / 技术栈

- Electron, Vite, React, TypeScript, Tailwind
- Monaco Editor, Pyodide
- Supabase (DB + Storage)

- Electron, Vite, React, TypeScript, Tailwind
- Monaco Editor, Pyodide
- Supabase（数据库 + 存储）

## Requirements / 环境要求

- Node.js
- Windows 10+ for packaged app
- Optional: .NET 6 SDK for IME helper (Windows only)

- Node.js
- 打包运行需要 Windows 10+
- 可选：.NET 6 SDK（IME 辅助程序，仅 Windows）

## Setup / 启动

1. Install dependencies:
   `npm install`
2. Configure `.env` (see below).
3. Run the app:
   `npm run dev`

1. 安装依赖：
   `npm install`
2. 配置 `.env`（见下文）。
3. 启动项目：
   `npm run dev`

## Environment Variables / 环境变量

Create or edit `.env`:

- `API_KEY` (Gemini, optional)
- `DEEPSEEK_API_KEY` (Deepseek, optional)
- `SUPABASE_URL`
- `SUPABASE_KEY`

如果不配置 AI Key，评分将返回提示信息。

## Build & Package / 打包

1. Build IME helper (Windows only, optional):
   `npm run build:ime`
2. Package app:
   `npm run dist`

1. 构建 IME 辅助程序（仅 Windows，可选）：
   `npm run build:ime`
2. 打包应用：
   `npm run dist`

## Scripts / 脚本

- `npm run dev` – start Vite dev server
- `npm run build` – typecheck + build web assets
- `npm run dist` – build + package Electron
- `npm run build:ime` – build IME helper (Windows)

- `npm run dev` – 启动 Vite 开发服务器
- `npm run build` – 类型检查 + 构建前端资源
- `npm run dist` – 构建 + 打包 Electron
- `npm run build:ime` – 构建 IME 辅助程序（Windows）

## Notes / 备注

- Default teacher password is `admin` (see `App.tsx`).
- Image uploads use Supabase Storage buckets: `exam-assets` and `exam-reports`.
- Python runtime and Monaco editor are loaded from CDN on demand.

- 默认教师密码为 `admin`（见 `App.tsx`）。
- 图片上传使用 Supabase Storage：`exam-assets`、`exam-reports`。
- Python 运行环境与 Monaco 编辑器按需从 CDN 加载。

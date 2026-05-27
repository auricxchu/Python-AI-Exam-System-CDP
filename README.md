# Python AI Exam System / Python 智能考试系统

![Version](https://img.shields.io/badge/version-1.4.1-blue)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![License](https://img.shields.io/badge/license-MIT-green)

A desktop exam system for Python programming courses. Teachers manage question banks and generate exam papers; students take timed coding exams in a built-in editor with AI-assisted grading.

一款面向 Python 编程课程的桌面考试系统。教师管理题库并生成试卷，学生在内置编辑器中完成计时编程考试，由 AI 辅助评分。

## Screenshots / 截图

<!-- TODO: add screenshots of teacher dashboard and student exam UI -->

## Features / 功能

- **Teacher Dashboard** — question bank management, exam rules, image upload, AI-assisted question drafting
- **Student Exam** — countdown timer, question navigation, Monaco code editor, local Python runner (Pyodide), AI grading
- **AI Provider Management** — model selector with availability checks, API keys stored server-side via Supabase Edge Functions
- **Reports** — exam report generation, local export, and cloud upload
- **Theme** — light/dark toggle (default light)
- **Cross-platform** — Windows, macOS, Linux

---

- **教师端** — 题库管理、试卷规则、图片上传、AI 辅助出题
- **学生端** — 倒计时、题目导航、Monaco 代码编辑器、本地 Python 运行 (Pyodide)、AI 评分
- **AI 模型管理** — 模型选择与可用性检测，API Key 通过 Supabase Edge Function 保存在服务端
- **成绩报告** — 考试报告生成、本地导出、云端上传
- **主题切换** — 黑白主题（默认浅色）
- **跨平台** — Windows、macOS、Linux

## Tech Stack / 技术栈

Electron · Vite · React · TypeScript · Tailwind CSS · Monaco Editor · Pyodide · Supabase

## Prerequisites / 环境要求

- **Node.js** ≥ 18
- **Supabase** account (for database, storage, and edge functions)

## Quick Start / 快速开始

```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables
cp .env.example .env
# Edit .env with your Supabase URL and anon key
```

### `.env` file / 环境变量

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
```

Third-party AI keys (DeepSeek, OpenAI, etc.) are **not** stored in `.env`. After logging in as a teacher, save them via the **AI API Settings** panel — they are persisted to Supabase and proxied through Edge Functions, never reaching the frontend.

第三方 AI Key 不写入前端 `.env`。教师登录后通过「AI API 设置」面板保存到 Supabase 云端，经由 Edge Function 代理调用，不会暴露到前端。

### Supabase Setup / Supabase 配置

依次执行 `supabase/sql/` 下的 SQL 文件创建表和存储桶，然后部署 Edge Functions：

**1. SQL（在 Supabase Dashboard → SQL Editor 中执行）：**

| 顺序 | 文件 | 创建内容 |
|---|---|---|
| 1 | `question_bank.sql` | 题库/试卷配置表 |
| 2 | `exam_reports.sql` | 考试报告记录表 |
| 3 | `ai_provider_settings.sql` | AI 密钥表 |
| 4 | `exam_feedbacks.sql` | 反馈工单表 + 反馈存储桶 |
| 5 | `storage_buckets.sql` | 题目配图 + 报告文件存储桶 |

**2. Edge Functions：**

```bash
supabase functions deploy admin-get-ai-settings
supabase functions deploy admin-upsert-ai-settings
supabase functions deploy ai-proxy
```

详细说明见 `supabase/README.md`。

```bash
# 3. Start the dev server
npm run dev
```

The app opens at `http://localhost:5173`. For full Electron features (Pyodide with input support, image caching, report export), package and run the Electron build instead.

开发服务器运行在 `http://localhost:5173`。完整的 Electron 功能（Pyodide input 支持、图片缓存、报告导出）需要打包后运行。

## Build & Package / 打包

```bash
npm run dist
```

`electron-builder` auto-detects your OS and outputs to `release/`:
- **Windows** → NSIS installer (`.exe`)
- **macOS** → DMG + zip
- **Linux** → AppImage

## Default Credentials / 默认密码

| Role / 角色 | Password / 密码 |
|---|---|
| Teacher / 教师 | `admin` |

## License

MIT — see [LICENSE](LICENSE).

## Credits / 鸣谢

Built with the help of multiple AI models — Gemini (design system), Codex / GPT-5.x (feature implementation), Claude Code (bug fixing & review), and GLM (feedback module).

本项目在多个 AI 模型的协助下完成：Gemini（设计系统）、Codex / GPT-5.x（功能实现）、Claude Code（Bug 修复与审查）、GLM（反馈模块）。

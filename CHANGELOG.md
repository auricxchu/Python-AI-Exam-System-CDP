# Changelog

## v1.1.0 (2026-05-21)

### 评分系统重构：能力完成度混合打分制

**核心变更：从"错误扣分制"升级为"能力完成度混合打分制"**

- **能力完成度主评分**：教师为每道题定义 Rubric（能力点评分标准），AI 判断每个能力点的完成度(0%~100%)，能力得分 = Σ(能力占比 × 完成度)
- **轻量扣分副评分**：保留语法/运行时/命名风格类扣分（5 项，权重降低），逻辑问题不再单独扣分，由能力完成度体现
- **移除关键路径保底机制**：不再有 pathHit 40 分保底，分数完全由能力掌握程度决定
- **百分比 Rubric 编辑器**：教师后台支持每个能力点按百分比分配（总和 100%），彩色堆叠条形图可视化能力占比，拖拽滑块调节
- **AI 推断能力点**：旧题目无 Rubric 时自动 AI 推断能力点并缓存

### 成绩单优化

- 左侧分数改为 `得分 / 总分` 样式，总分弱化显示
- 新增得分率百分比
- 新增**评分说明**弹窗：三列横向布局讲解能力完成度、轻量扣分、最终计分公式
- 能力完成度进度条（绿≥80%/黄≥50%/红<50%）替代旧扣分标签
- 展开详情新增能力评估依据 + 轻量扣分证据
- 空白卷显示"本题暂未作答"中性灰色标签
- 提交文案"AI 标签识别中"改为"AI 能力分析中"

### 交卷提醒

- 点击交卷时自动检测未作答题目数
- 有未作答题时弹窗显示琥珀色警告："还有 X 道题目未作答"
- 确认按钮变为"仍然交卷"

### 其他

- Modal 组件 panelClassName 会覆盖默认 max-w-md，允许自定义宽度
- 教师题库展开视图显示能力点百分比摘要
- 版本号 1.0.1 → 1.1.0

## v1.0.1 (2026-05-17)

### 评分标准重构
- LOG_MISS（核心逻辑缺失）扣分权重调整为 50，LOG_WRONG 调整为 20
- 删除 STY_DOC（缺少说明）标签，7 个标签权重合计 100
- 维度扣分上限：logic 70 / syntax 20 / runtime 8 / style 2

### 自适应布局重构
- 移除首页 CSS scale() 缩放，改用高度断点 CSS 变量 + flex 约束
- 三层高度断点：≤780px compact / 781-950px medium / >950px comfortable
- 首页及登录页内容区域宽度优化，教师后台与成绩单面板改为可滚动
- 成绩单左侧：移除阴影，反馈按钮并入 2×2 网格，标签文字简化
- 分题解析标签重命名：主要问题→主要失分点，下一步建议→下一步提高，做得好的地方→做得好的点
- 代码对比始终左右对比，窄屏横向滚动，添加"答案对比"标题
- 展开箭头固定在摘要区，展开后位置不变

### 教师后台优化
- AI API 设置、修改管理密码移至右上角，与主题切换、返回首页统一样式
- 基础设置紧凑化：考试名称/时长/密钥并排三列（50%/25%/25%），Cloud 图标移除
- 更新弹窗移至屏幕正上方

### 其他
- 密码输入框添加显示/隐藏切换
- 首页底部版权字号缩小淡化，左下角添加版本信息
- 修复 macOS 成绩单红绿灯按钮问题
- 修复退出系统按钮考试后失效
- 阴影规范：仅 hover/click/选中状态使用，移除静态装饰阴影

---

## Unreleased — Cross-platform & Bugfix Sprint

*Bug 修复与交叉审查由 Claude Code (Deepseek-v4-pro) 与 Codex 协同完成；反馈工单由 Zhipu GLM-5.1 实现*

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

# Changelog

## v1.2.6 (2026-05-27)

### 修复

- **图标统一**：已是最新版本 toast 与后台同步成功 toast 统一使用 CheckCircle 图标

## v1.2.5 (2026-05-27)

### 修复

- **立即重启功能修复**：更新下载完成后立即重启按钮现在可正常工作，增加窗口状态清理和兜底退出机制
- **更新弹窗关闭**：更新就绪弹窗右上角 X 按钮可以正常关闭
- **更新日志 Markdown 渲染**：更新内容支持标题、粗体、链接、列表等 Markdown 格式显示
- **弹窗时隐藏工具栏按钮**：新版本弹窗出现时右上角深浅切换和检查更新按钮自动隐藏

## v1.2.4 (2026-05-27)

### 修复

- **评分说明扣分明细修正**：评分说明弹窗中的轻量扣分明细的权重和标签与 AI 实际评分规则统一

## v1.2.3 (2026-05-27)

### 修复

- **更新说明为空**：无 release notes 时显示 GitHub Releases 链接，引导用户查看更新内容
- **立即重启失效**：修复 `quitAndInstall` 被 `setImmediate` 包裹导致的执行问题

## v1.2.2 (2026-05-27)

### 修复

- **macOS 自动更新修复**：mac target 增加 zip 格式，修复 electron-updater 报"ZIP file not provided"的问题

## v1.2.1 (2026-05-27)

### 更新通知交互重构

- **按钮内检查状态**：点击"检查更新"按钮后图标旋转 + 文案变为"检查更新中..."，不再显示顶部 toast
- **无更新 toast**：检查无新版本时顶部显示绿色 toast"已是最新版本"，3 秒自动消失
- **有更新模态弹窗**：检测到新版本弹出模态窗展示更新日志，强制更新时不可关闭
- **开屏自动检查**：开屏动画期间后台静默检查更新，有更新动画结束后直接弹窗，无更新不打扰
- **教师面板移除检查入口**：检查更新按钮仅保留在首页右上角

### 断网体验优化

- **全屏遮罩**：断网时显示全屏遮罩层（与考试断网锁定同风格），替代原先的内联 banner
- **实时响应**：断网遮罩监听 `online`/`offline` 事件，网络恢复后立即消失
- **退出按钮保留**：主界面断网遮罩底部保留"退出系统"按钮，允许用户退出应用

### Toast 样式统一

- **去描边**：所有 toast 移除 `border`，更清爽
- **深浅适配**：toast 支持 light/dark 主题自动切换
- **位置统一**：教师面板 toast 和更新 toast 统一顶部居中定位

### 修复

- **GitHub 仓库 owner 修正**：publish 配置从 `JinNian2002` 改为 `auricxchu`，修复 404 更新检查失败
- **IPC require 兼容**：`getIpc()` 改为优先使用 `electronRequire`，兼容打包后的 Electron 环境

## v1.2.0 (2026-05-27)

### 自动更新支持

- **electron-updater 集成**：新增基于 GitHub Releases 的自动更新机制，主进程 `electron/main.js` 集成 `electron-updater`，支持检测、下载、重启安装完整流程
- **检查更新按钮**：首页右上角深浅切换按钮左侧新增"检查更新"按钮，教师面板右上角同步增加入口
- **开屏自动检查**：开屏动画结束后自动静默检查更新，有更新才通知，无更新不打扰
- **强制/可选更新**：主版本号或次版本号变化时强制更新（不可跳过），修订号变化时可选更新（可跳过）
- **更新通知 UI**：顶部横幅通知组件，支持三种状态——发现新版本/下载进度/下载完成，深浅主题适配
- **考试模式保护**：考试中收到更新通知暂存不弹出，交卷退出后再提示
- **私有仓库支持**：通过 `GH_TOKEN` 环境变量支持私有 GitHub 仓库的更新检查
- **一键重启**：下载完成后点击"立即重启"自动安装更新
- **CI 发布流程**：GitHub Actions 改用 `electron-builder --publish always`，推送 `v*` 标签自动构建 macOS DMG 和 Windows EXE，并上传 `latest.yml` 更新元数据

### 网络检测与离线行为优化

- **全局网络状态管理**：新增 `useNetworkStatus()` hook，统一监听 `online`/`offline` 事件；导出 `isNetworkError()` 工具函数，用于区分网络故障和服务端错误
- **开屏网络检测**：`runOpeningInit` 新增 `checkNetworkReachable()` 并行检测基础网络连通性（CDN + Supabase 快速探测，5s 超时）
- **首页离线警告**：检测到网络不可达时，首页顶部显示红底警告横幅"网络未连接 — 考试需要联网才能进入"，深浅主题均适配
- **考试入口前置拦截**：学生点击"开始考试"时，`navigator.onLine` 立即判断离线则直接弹窗拦截，不再等待运行时资源探测超时
- **云端配置同步状态**：启动时 `fetchExamConfig` 增加状态跟踪（loading / synced / offline / error），离线时跳过无效请求并记录原因
- **评分错误信息区分**：`gradeQuestionWithRubric`、`generateQuestion`、`generateReferenceAnswer` 的 catch 块用 `isNetworkError()` 区分网络故障和 API 错误，分别给出"网络连接失败，无法提交评分"和"评分服务连接失败"的明确提示
- **云端操作错误提示**：`cloudService` 中所有 Supabase 操作（保存配置、上传图片、上传成绩单、提交反馈）在断网时返回中文网络错误信息，不再抛出原始异常
- **离线锁定缩短至 30 秒**：答题中断网超过 30 秒即全屏锁定，防止题目泄露
- **离线遮罩深浅适配**：锁定遮罩在浅色模式下使用白底深色文字，不再暗成一片无法阅读
- **Pyodide 加载失败可见提示**：代码编辑器顶部显示红色警告条"Python 运行环境加载失败，请检查网络连接"
- **教师登录错误区分**：云端密码验证失败时区分"网络已断开"和"服务端无数据"

### AI 评分一致性修复

- **提示词强化**：新增规则要求 AI 在所有能力点完成度 < 1.0 时，`corrected_answer` 必须与原代码不同、切实修复问题；`main_issues` 必须说明具体扣分原因，禁止出现"完全正确""无问题"等与扣分矛盾的表述
- **后处理兜底校验**：`sanitizeGradingResponse()` 在后处理阶段检测 AI 返回的不一致数据——若 `corrected_answer` 与学生原代码完全相同但存在扣分，则清空无效的"修正版"答案；若反馈与扣分矛盾则自动补充能力完成度不足的说明

### 轻量扣分权重重新平衡

- **`SYN_MINOR`（手误）6 → 3 分**：中英文符号混用等偶然笔误，通常不影响程序运行，不应扣分超过运行时错误
- **`RUN_VAR`（变量错误）3 → 5 分**：变量未定义导致程序运行时崩溃，应重于手误
- **`RUN_TYPE`（类型错误）5 → 8 分**：类型不匹配导致运行失败，是运行时最严重的问题
- **runtime 分类封顶 8 → 13**：与新权重匹配（RUN_VAR 5 + RUN_TYPE 8）
- 调整后严重程度排序：SYN_PARSE(-12) > RUN_TYPE(-8) > RUN_VAR(-5) > SYN_MINOR(-3) > STY_NAME(-2)

## v1.1.0 (2026-05-22)

### 教师后台 Rubric 编辑器优化

- **滚动布局**：右侧编辑表单改为可滚动，保存按钮固定底部，题目描述和代码模板自动撑高
- **彩条拖拽调节**：能力点彩色条支持拖动分段边界调整百分比，替代独立滑块
- **颜色优化**：彩条色板替换为高对比度红/橙/黄/绿/青/蓝/紫/粉/棕/灰色
- **深浅主题适配**：彩条、拖拽手柄、输入框全面支持浅色模式

### 成绩单界面优化

- **深浅按钮移至右上角**：与评分说明按钮统一风格，方便考试结束后切换主题

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

### Cross-platform & Bugfix Sprint

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

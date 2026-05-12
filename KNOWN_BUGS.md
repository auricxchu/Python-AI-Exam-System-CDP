# Known Bugs

## Open

| # | Description | Platform | First Reported |
|---|-------------|----------|----------------|
| 1 | 输入法使用系统输入法，任务栏可见，破坏沉浸式考试体验 | Mac | 2026-05-13 |
| 2 | 响应式页面自适应混乱，不同尺寸屏幕布局不一致 | Win/Mac | 2026-05-13 |

## Fixed (Unreleased)

| # | Description | Platform | Fix |
|---|-------------|----------|-----|
| 1 | 第二次打开仍播放 full 版开场动画 | Win/Mac | fallback timeout 写 localStorage + OPENING_TIMING 常量重构 |
| 2 | 开场动画闪烁、左下角代码跳动 | Win/Mac | TypingRunner span 加 minHeight |
| 3 | 小屏幕 (≤800px 高) 主界面内容溢出，退出按钮不可见 | Win/Mac | landingScale state + style prop transform:scale() |
| 4 | 多行 print() 只显示一行或数字 | Win/Mac | Pyodide 0.25 write API + TextDecoder + return buffer.length |
| 5 | IME pill 状态不同步、输入法兼容性差 | Win | 删除自定义 pill，改用无边框最大化窗口 + 原生任务栏 IME |
| 6 | 学生断网可查看题目 | Win/Mac | 60s 离线检测 + 全屏锁定遮罩 |
| 7 | 有网络但提示"网络连接检测失败" | Mac | Supabase 探针改用 no-cors；补充本地 pyodide 资源 |
| 8 | 无边框窗口边缘可拖动缩放 | Mac | BrowserWindow 加 resizable: false |

## Verified & Resolved

| # | Description | Commit |
|---|-------------|--------|
| — | (none yet) | — |

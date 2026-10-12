# 聊天打开性能验证记录

- 日期：2026-10-12
- 规格：[timeline-history](../features/timeline-history/spec.md)，PERF-OPEN-01 至 05。

## 本轮检查

- 针对性测试：timeline-display-cache、timeline-display-hook、timeline-initial-delivery、timeline-turn-pagination 共 4 文件 22 项通过；额外 timeline-server-initial-delivery 2 项通过。
- 完整 `node node_modules/typescript/bin/tsc --noEmit` 通过。
- 改动代码与新增测试的 `pnpm exec eslint` 通过。
- 最终源码 `pnpm build` 通过 Next.js 类型、编译、页面生成、post-build 与服务端 tsup。
- `pnpm exec vitest run --maxWorkers=2`：126 文件、910 项通过，1 项可选微基准跳过。后续补充同 pane 的 Agent ID 变化主动清缓存与断言，再执行相关测试、类型及 lint，结果另记。
- 上述最终补充后的 5 个相关测试文件 24 项通过，完整 TypeScript、全部改动代码 ESLint 与 `git diff --check` 通过。
- 补充后再次 `pnpm build` 通过，覆盖最终源码的 Next.js 与 tsup 构建。

## 验收映射

- PERF-OPEN-01：源码检查确认桌面聊天取消 showInitialLoading 门槛，移动端原本独立挂载。输入栏终端连接保护保持原实现；未执行浏览器输入验收。
- PERF-OPEN-02：真实临时 Codex JSONL + 延迟统计 Promise，服务端连接初始化在统计未完成时返回并发送完整最近一轮；统计随后独立发送。关闭真实连接后不发送旧统计。发送辅助测试覆盖订阅失效和读取失败。
- PERF-OPEN-03：真实 React/jsdom + WebSocket 模拟测试验证缓存立即显示、重新连接、init 替换、实时追加、同批 stats 接收、跨会话 stats 拒绝、旧连接 init 拒绝。缓存展示期间没有 JSONL 路径和分页权限，也不恢复 agentProcess。
- PERF-OPEN-04：测试覆盖 provider/pane/Agent ID 隔离、未知 ID 不复用、pending 排除、只缓存最近一轮、5 分钟过期、12 项 LRU、超限拒绝、会话结束和 resume 失效。

## 可控延迟前后测量

使用相同的合成 250 ms 统计延迟，历史已解析，分别测旧串行等待与新的 deliverTimelineInit 路径，各 5 次。通过 `pnpm exec tsx /tmp/purplemux-chat-benchmark.ts` 执行，输出 `/tmp/purplemux-chat-benchmark.log`。

| 路径 | 首批记录发送耗时中位数 | 最小至最大 |
| --- | --- | --- |
| 旧路径：等待统计后发送 | 251.025 ms | 250.352–253.147 ms |
| 新路径：先发记录再读取统计 | 0.017 ms | 0.015–0.364 ms |

此测量仅证明统计等待从历史发送关键路径移除，不包含磁盘历史解析、网络、WebSocket 握手或 React 渲染，不代表手机端 20–30 秒的端到端提速。统计延迟由 setTimeout(250) 注入，新路径等待 stats-update 完成后再开始下一样本。

## 限制与后续实机检查

尚未运行真实手机 4G、桌面浏览器、生产冷/热 tab 切换及滚动锚点验收；未测开发编译占比。长轮次渐进渲染尚未实施，待实际主线程证据。新增分段日志用于后续区分会话检测、定位、历史读取和统计；浏览器仍需记录点击、WS open/init 与首次绘制时间。

没有提交、推送、打包安装或重启用户正在使用的服务；截图中正在运行的开发版本不会自动获得生产构建验证结论。

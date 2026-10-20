# 实施记录

## 跨域误判修正（2026-10-20）

- 原接口直接比较 Origin 的 host 与请求 Host，代理改写后合法同源请求返回 403。未取得用户现场请求头；已通过相同条件的自动化用例复现。项目自身生产代理透传 Host，不将问题归因于该代理。
- 新增 `src/lib/process-action-request.ts`，集中处理 Fetch Metadata、自定义请求头及旧客户端 Origin/Host 回退；浏览器跨源请求优先拒绝，非法 Origin 回退为 403。不开放 CORS，不信任任意转发主机头。
- `agent-process-settings.tsx` 与 `idle-tab-settings.tsx` 共用请求头常量；两处 API 共用纯校验函数。KISS/DRY：只替换重复的请求来源判断；不调整进程服务、数据结构或停止信号，不添加依赖。
- 本次工作树通过符号链接使用主仓库现有 node_modules；完整构建通过。没有提交、部署或停止真实会话。

## 已实现

- 设置增加「本机进程」，桌面与移动端共享 `agent-process-settings.tsx`。支持刷新、搜索、来源/目录/工作区展示、打开工作区、确认后停止及停止后接入。无法确定原会话时禁用接入。
- `process-utils.ts` 集中封装当前用户进程表、argv 和打开文件；`local-agent-processes.ts` 按进程祖先和实际布局判断归属，仅去重已知 Node 包装器，保留独立原生子进程。
- `local-agent-session.ts` 根据原生打开文件、Claude PID 注册或明确的 resume ID 定位会话；多候选返回不可接入，不采用目录最新会话猜测。
- `agent-process-manager.ts` 复用 workspace/layout store、provider 恢复命令及 StatusManager。普通终端准备、SIGTERM、退出确认、恢复命令交付和 Agent 绑定按顺序执行。
- 工作区可选字段 `agentProcessTransfers` 持久化 prepared/stopped/dispatching/started；不迁移旧数据。读损坏数据时拒绝管理操作，持久化保留其他并发字段变更。发送状态不明时禁止重复发送，提供目标终端入口。
- 新增认证 API `/api/system/agent-processes`，严格限制动作、身份和确认字段；不接受任意命令/信号/客户端目录，拒绝跨站请求，返回不缓存。
- 简体中文和英文正文完整；其他语言补齐词条并使用英文正文，导航标题使用对应语言。未调用外部词条平台。
- 同步 `docs/TMUX.md` 和 `docs/STATUS.md` 的实际接口/状态交接说明。

## 原则与兼容性

- 单一职责：系统查询、会话证据、接入流程和界面分离。
- DRY：复用既有 tmux、工作区锁、原子文件写入、provider 和状态管理；没有第二套终端或会话数据库。
- KISS/YAGNI：仅实现已确认的停止后恢复；不做 PTY 重绑、跨 tmux 迁移、猜测会话、强制杀死或自动复制环境。
- 外部进程不因目录相同被标成已管理，不因删除工作区而被终止。历史会话状态和正常启动流程不变。

## 运行边界

本次未提交、推送或部署代码，未停止或迁入真实用户进程。依赖按现有锁文件安装，未变更 package.json/pnpm-lock.yaml。原生登录、信任、权限提示由接入后的已有 Agent 面板继续处理。

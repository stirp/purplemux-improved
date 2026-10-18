# 应用实施记录

日期：2026-10-18。依据[需求规格](../spec.md)及已确认的界面原型实施；[此前记录](../result.md)仅覆盖原型。

## 代码入口

- `src/lib/session-tags.ts`：标签校验、事务更新、关联查询及清理；`src/lib/session-workflow.ts`：可选标签字段和会话身份迁移。
- `src/lib/workspace-store.ts`、`src/pages/api/session-tags.ts`：全局 workspace 锁内校验目标、修订冲突和原子保存，复用既有同步广播。
- `src/hooks/use-session-tags.ts`：提交、错误提示、失败草稿保留及保存后同步；只合并标签字段，避免旧响应覆盖工作状态。
- `src/components/features/workspace/session-tag-controls.tsx`、`session-tag-dialogs.tsx`：标签展示、筛选、编辑、目录管理和删除确认。
- `src/components/features/workspace/notification-sheet.tsx`：共用 Sessions 面板接入；多标签 AND 与关键词 AND，继续按工作状态分组。
- `src/hooks/use-session-workflow.ts`：客户端删除会话时清理关联。
- `messages/*/notification.json`：新增标签文案。简体中文、繁体中文已本地化；英文及其他非中文 locale 的新增字段目前使用英文文案，后者尚未完成对应语言翻译。

## 行为与兼容

目录和关联随 `sessionWorkflow` 持久化；旧文件缺失字段时按空目录处理。标签独立于工作状态，不赋予自动调度或后台常驻语义。临时 Tab 标签在绑定会话时迁移并消费；删除会话清理关联，删除标签保留会话。编辑器携带打开时的修订号，冲突保留草稿并要求重新打开。

共用面板复用现有导航、状态分组和查询规则；筛选、编辑、管理组件分担各自职责；事务与校验集中复用，没有引入新依赖、独立标签数据库或新的状态体系，避免重复实现现有能力。

本轮未提交、推送或发布。验证结果见[验证记录](./verify.md)。

## Review 修复：Tab 复用后的临时索引

2026-10-18：将 `reconcileSessionWorkflow` 中的临时会话索引清理移出“首次绑定”条件，在每次绑定原生身份时执行。保留已有标签迁移和首次人工状态迁移规则，只调整索引清理的位置，不新增存储字段或额外迁移流程。

原有复用测试只检查标签关联，未检查临时索引。现扩展为保留标签、清空标签、目标隐藏三种场景，验证绑定和关闭 Tab 后的持久化索引、列表身份、导航及工作区状态汇总。

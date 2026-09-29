# v19 작업 진행 상황

`.specs/v19/PRD.md`의 작업 단위 표를 기준으로 Phase / Priority 순으로 정렬한 feature 진행표.

## 정렬 규칙

1. Phase 오름차순 (Phase 1 → Phase 5)
2. 같은 Phase 안에서는 Priority 오름차순 (P0 → P3)
3. PRD에 없는 공통/인프라 feature는 Phase 0, P0으로 맨 위에 배치 (현재 해당 없음)

## 진행표

| feature | phase | priority | build | verify | updated |
|---|---|---|---|---|---|
| agent-status-resilience | Phase 1 | P0 | ✅ | ✅ 1/true | 2026-05-01 17:48 |
| codex-hook-pipeline | Phase 1 | P0 | ✅ | ✅ 2/true | 2026-05-01 18:12 |
| codex-preflight-and-errors | Phase 1 | P0 | ✅ | ✅ 3/true | 2026-05-01 18:48 |
| codex-provider-core | Phase 1 | P0 | ✅ | ✅ 1/true | 2026-05-01 19:17 |
| codex-tui-ready-detection | Phase 1 | P0 | ✅ | ✅ 1/true | 2026-05-01 19:29 |
| codex-panel-ui | Phase 2 | P0 | ✅ | ✅ 3/true | 2026-05-01 20:17 |
| codex-permission-prompt | Phase 2 | P0 | ✅ | ✅ 3/true | 2026-05-01 20:43 |
| codex-session-list | Phase 2 | P0 | ✅ | ✅ 3/true | 2026-05-01 21:15 |
| codex-jsonl-parser | Phase 3 | P0 | ✅ | ✅ 3/false | 2026-05-01 21:44 |
| codex-timeline-integration | Phase 3 | P0 | ✅ | ✅ 2/true | 2026-05-01 22:11 |
| agent-work-state-observer | Phase 4 | P0 | ✅ | ✅ 1/true | 2026-05-01 22:29 |
| codex-data-aggregation | Phase 4 | P0 | ✅ | ✅ 1/true | 2026-05-01 23:00 |
| workspace-menu-order | Phase 5 | P2 | ✅ | ✅ 1/true（全量 lint 既有失败见报告） | 2026-09-28 |

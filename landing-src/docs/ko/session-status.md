---
title: 세션 상태
description: purplemux-improved가 Claude Code의 활동을 어떻게 4가지 상태로 변환하는지, 그리고 어떻게 거의 실시간으로 동기화되는지.
eyebrow: Claude Code
permalink: /ko/docs/session-status/index.html
---
{% from "docs/callouts.njk" import callout %}

사이드바의 모든 세션에는 색상 점이 붙어 있어, Claude가 무엇을 하고 있는지 한눈에 알려줍니다. 이 페이지는 4가지 상태가 어디서 오는지, 그리고 터미널을 들여다보지 않아도 어떻게 동기화가 유지되는지 설명합니다.

## 4가지 상태

| 상태 | 인디케이터 | 의미 |
|---|---|---|
| **Idle** | 없음 / 회색 | Claude가 다음 입력을 기다리는 중 |
| **Busy** | 퍼플 스피너 | Claude가 작업 중 — 파일 읽기, 편집, 툴 실행 |
| **Needs input** | 호박색 펄스 | 권한 프롬프트나 질문이 사용자를 기다리는 중 |
| **Review** | 퍼플 펄스 | Claude가 작업을 마쳤고 확인할 것이 있음 |

5번째 값인 **unknown**은 서버 재시작 시점에 `busy` 상태였던 탭에서 잠시 나타납니다. purplemux-improved가 세션을 다시 검증하면 자동으로 해소됩니다.

## hook이 single source of truth

purplemux-improved는 서버 시작 시 `~/.purplemux/hooks.json`에 Claude Code hook 설정을, `~/.purplemux/status-hook.sh`에 작은 쉘 스크립트를 생성합니다. 이 스크립트는 5개의 Claude Code hook 이벤트에 등록되어, 각 이벤트가 발생할 때마다 CLI 토큰과 함께 로컬 서버로 POST합니다:

| Claude Code hook | 결과 상태 |
|---|---|
| `SessionStart` | idle |
| `UserPromptSubmit` | busy |
| `Notification` (권한만) | needs-input |
| `Stop` / `StopFailure` | review |
| `PreCompact` / `PostCompact` | compacting 인디케이터 표시 (상태는 그대로) |

hook은 Claude Code가 전환되는 순간에 fire되므로, 사이드바는 터미널에서 알아채기 전에 먼저 갱신됩니다.

{% call callout('note', '권한 알림만 needs-input으로') %}
Claude의 `Notification` hook은 여러 이유로 fire됩니다. purplemux-improved는 notification type이 `permission_prompt` 또는 `worker_permission_prompt`인 경우에만 **needs-input**으로 전환합니다. 유휴 알림 등 다른 type은 배지를 바꾸지 않습니다.
{% endcall %}

## 프로세스 감지는 병렬로

Claude CLI가 실제로 실행 중인지 여부는 작업 상태와는 별도로 추적됩니다. 두 경로가 협력합니다:

- **tmux 타이틀 변경** — 모든 pane은 `pane_current_command|pane_current_path` 형태로 자기 타이틀을 보고합니다. xterm.js의 `onTitleChange`로 변경이 전달되면 purplemux-improved가 `/api/check-claude`로 확인합니다.
- **프로세스 트리 탐색** — 서버 측에서 `detectActiveSession`이 pane의 쉘 PID를 보고 자식들을 따라가며, `~/.claude/sessions/`의 PID 파일과 매칭합니다.

해당 디렉토리가 없으면 상태 점 대신 "Claude not installed" 화면이 표시됩니다.

## JSONL watcher가 빈 곳을 채움

Claude Code는 `~/.claude/projects/` 아래에 세션별 트랜스크립트 JSONL을 기록합니다. 탭이 `busy`, `needs-input`, `unknown`, `ready-for-review`인 동안 purplemux-improved는 두 가지 이유로 `fs.watch`를 걸어둡니다:

- **메타데이터** — 현재 툴, 마지막 어시스턴트 스니펫, 토큰 카운트. 상태 자체는 바꾸지 않고 타임라인과 사이드바에 흘려줍니다.
- **합성 interrupt** — 사용자가 스트리밍 중간에 Esc를 눌렀을 때, Claude는 JSONL에 `[Request interrupted by user]`를 기록하지만 hook을 fire하지 않습니다. watcher가 이 줄을 감지해 `interrupt` 이벤트를 합성하므로, 탭이 busy에 갇히지 않고 idle로 복귀합니다.

## polling은 엔진이 아니라 안전망

탭 수에 따라 30~60초마다 메타데이터 polling이 돌지만, 상태 결정에는 관여하지 **않습니다**. 상태는 엄격하게 hook 경로에서만 결정됩니다. polling의 역할은:

- 새 tmux pane 발견
- busy가 10분 이상 지속되고 Claude 프로세스가 죽은 경우 복구
- 프로세스 정보, 포트, 타이틀 갱신

랜딩 페이지의 "5–15s fallback polling"이 바로 이것이며, hook이 안정화된 이후 간격을 늘리고 범위를 좁힌 결과입니다.

## 서버 재시작에서 살아남기

서버가 다운된 동안에는 hook이 fire될 수 없으므로, 진행 중이던 상태는 stale해질 수 있습니다. 복구 규칙은 보수적입니다:

- 영속화된 `busy`는 `unknown`으로 변환된 뒤 재검증됩니다: Claude가 더 이상 실행 중이 아니면 조용히 idle로, JSONL이 깔끔하게 끝나 있으면 review로 전환됩니다.
- `idle`, `needs-input`, `ready-for-review`는 모두 사용자 차례이므로 그대로 유지됩니다.

복구 과정의 자동 전환은 푸시 알림을 보내지 않습니다. **새로** needs-input이나 review로 진입하는 작업에 대해서만 알림이 옵니다.

## 상태가 표시되는 곳

- 사이드바 세션 행의 점
- 각 pane의 탭바 점
- 워크스페이스 점 (워크스페이스 내 최우선 상태)
- 벨 아이콘의 카운트와 알림 시트
- 브라우저 탭 타이틀 (attention 항목 카운트)
- `needs-input`과 `ready-for-review`에 대한 Web Push 및 데스크탑 알림

## 다음으로

- **[권한 프롬프트](/purplemux-improved/ko/docs/permission-prompts/)** — **needs-input** 상태 뒤의 워크플로
- **[라이브 세션 뷰](/purplemux-improved/ko/docs/live-session-view/)** — 탭이 `busy`일 때 타임라인이 보여주는 것
- **[첫 세션](/purplemux-improved/ko/docs/first-session/)** — 맥락 안에서의 대시보드 투어

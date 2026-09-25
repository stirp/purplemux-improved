---
title: 아키텍처
description: 브라우저, Node.js 서버, tmux, Claude CLI가 어떻게 맞물려 동작하는지.
eyebrow: 레퍼런스
permalink: /ko/docs/architecture/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux-improved는 세 개의 레이어로 구성됩니다: 브라우저 프론트엔드, `:8022`에서 도는 Node.js 서버, 호스트의 tmux + Claude CLI. 이들 사이는 모두 바이너리 WebSocket이거나 작은 HTTP POST입니다.

## 세 개의 레이어

```
Browser                         Node.js server (:8022)            Host
─────────                       ────────────────────────          ──────────────
xterm.js  ◀──ws /api/terminal──▶  terminal-server.ts  ──node-pty──▶ tmux (purple socket)
Timeline  ◀──ws /api/timeline──▶  timeline-server.ts                    │
Status    ◀──ws /api/status────▶  status-server.ts                      └─▶ shell ─▶ claude
Sync      ◀──ws /api/sync──────▶  sync-server.ts
                                  status-manager.ts ◀──POST /api/status/hook── status-hook.sh
                                  rate-limits-watcher.ts ◀──POST /api/status/statusline── statusline.sh
                                  JSONL watcher ──reads── ~/.claude/projects/**/*.jsonl
```

각 WebSocket은 단일 목적을 가지며 멀티플렉싱하지 않습니다. 인증은 WS 업그레이드 시 NextAuth JWT 쿠키로 검증합니다.

## 브라우저

프론트엔드는 Next.js (Pages Router) 앱입니다. 서버와 통신하는 부분:

| 컴포넌트 | 라이브러리 | 역할 |
|---|---|---|
| 터미널 pane | `xterm.js` | `/api/terminal`에서 받은 바이트 렌더링. 키 입력, 리사이즈, 타이틀 변경(`onTitleChange`) emit. |
| 세션 타임라인 | React + `useTimeline` | `/api/timeline`에서 Claude 턴 렌더링. `cliState` 도출은 안 함 — 모두 서버 사이드. |
| 상태 인디케이터 | Zustand `useTabStore` | `/api/status` 메시지로 탭 배지, 사이드바 점, 알림 카운트 구동. |
| 멀티 디바이스 동기화 | `useSyncClient` | 다른 디바이스에서 일어난 워크스페이스/레이아웃 편집을 `/api/sync`로 감시. |

탭 타이틀과 포어그라운드 프로세스는 xterm.js의 `onTitleChange` 이벤트에서 옵니다 — tmux 설정(`src/config/tmux.conf`)이 2초마다 `#{pane_current_command}|#{pane_current_path}`를 emit하고 `lib/tab-title.ts`가 파싱합니다.

## Node.js 서버

`server.ts`는 Next.js와 4개의 `ws` `WebSocketServer` 인스턴스를 같은 포트에서 호스팅하는 커스텀 HTTP 서버입니다.

### WebSocket 엔드포인트

| 경로 | 핸들러 | 방향 | 용도 |
|---|---|---|---|
| `/api/terminal` | `terminal-server.ts` | 양방향, binary | tmux 세션에 attach된 `node-pty`로 터미널 I/O |
| `/api/timeline` | `timeline-server.ts` | server → client | JSONL에서 파싱한 Claude 세션 entry 스트리밍 |
| `/api/status` | `status-server.ts` | 양방향, JSON | 서버: `status:sync` / `status:update` / `status:hook-event`, 클라이언트: `status:tab-dismissed` / `status:ack-notification` / `status:request-sync` |
| `/api/sync` | `sync-server.ts` | 양방향, JSON | 디바이스 간 워크스페이스 상태 |

추가로 첫 실행 인스톨러용 `/api/install` (인증 불필요).

### 터미널 바이너리 프로토콜

`/api/terminal`은 `src/lib/terminal-protocol.ts`에 정의된 작은 바이너리 프로토콜을 사용합니다:

| 코드 | 이름 | 방향 | 페이로드 |
|---|---|---|---|
| `0x00` | `MSG_STDIN` | client → server | 키 바이트 |
| `0x01` | `MSG_STDOUT` | server → client | 터미널 출력 |
| `0x02` | `MSG_RESIZE` | client → server | `cols: u16, rows: u16` |
| `0x03` | `MSG_HEARTBEAT` | 양방향 | 30초 간격, 90초 타임아웃 |
| `0x04` | `MSG_KILL_SESSION` | client → server | tmux 세션 종료 |
| `0x05` | `MSG_WEB_STDIN` | client → server | 웹 입력바 텍스트 (copy-mode 종료 후 전달) |

Backpressure: WS `bufferedAmount > 1 MB`이면 `pty.pause`, `256 KB` 미만이면 resume. 서버당 최대 32 동시 연결, 초과 시 가장 오래된 것 drop.

### 상태 매니저

`src/lib/status-manager.ts`는 `cliState`의 단일 출처입니다. 훅 이벤트가 토큰 인증된 `/api/status/hook` POST로 들어와 탭별 `eventSeq`로 시퀀싱되고, `deriveStateFromEvent`로 `idle` / `busy` / `needs-input` / `ready-for-review` / `unknown` 중 하나로 reduce됩니다. JSONL watcher는 `interrupt` 합성 이벤트 하나를 제외하면 메타데이터만 갱신합니다.

전체 상태 머신은 [세션 상태 (STATUS.md)](https://github.com/stirp/purplemux-improved/blob/main/docs/STATUS.md) 참고.

## tmux 레이어

purplemux-improved는 전용 소켓 — `-L purple` — 위에서 격리된 tmux를 실행하며, 자체 설정은 `src/config/tmux.conf`에 있습니다. `~/.tmux.conf`는 절대 읽지 않습니다.

세션 이름은 `pt-{workspaceId}-{paneId}-{tabId}`. 브라우저의 터미널 pane 하나가 tmux 세션 하나에 매핑되며 `node-pty`로 attach합니다.

```
tmux socket: purple
├── pt-ws-MMKl07-pa-1-tb-1   ← 브라우저 탭 1
├── pt-ws-MMKl07-pa-1-tb-2   ← 브라우저 탭 2
└── pt-ws-MMKl07-pa-2-tb-1   ← 분할 pane, 탭 1
```

`prefix`는 비활성, status bar는 off (xterm.js가 chrome을 그림), `set-titles`는 on, `mouse on`으로 휠은 copy-mode로 들어갑니다. 브라우저를 닫거나 Wi-Fi가 끊기거나 서버가 재시작해도 세션이 살아남는 것은 tmux 덕분입니다.

전체 tmux 설정, 커맨드 래퍼, 프로세스 탐지의 자세한 내용은 [tmux & 프로세스 탐지 (TMUX.md)](https://github.com/stirp/purplemux-improved/blob/main/docs/TMUX.md).

## Claude CLI 통합

purplemux-improved는 Claude를 fork하거나 wrap하지 않습니다 — `claude` 바이너리는 사용자가 설치한 것 그대로 씁니다. 다음 두 가지가 추가됩니다:

1. **훅 설정** — 시작 시 `ensureHookSettings()`가 `~/.purplemux/hooks.json`, `status-hook.sh`, `statusline.sh`를 작성합니다. 모든 Claude 탭은 `--settings ~/.purplemux/hooks.json`으로 실행되어 `SessionStart`, `UserPromptSubmit`, `Notification`, `Stop`, `PreCompact`, `PostCompact`가 모두 서버로 POST됩니다.
2. **JSONL 읽기** — `~/.claude/projects/**/*.jsonl`을 `timeline-server.ts`가 라이브 대화 뷰용으로 파싱하고, `session-detection.ts`가 `~/.claude/sessions/`의 PID 파일을 통해 실행 중인 Claude 프로세스를 감지하기 위해 watch합니다.

훅 스크립트는 `~/.purplemux/port`와 `~/.purplemux/cli-token`을 읽고 `x-pmux-token`을 붙여 POST합니다. 서버가 죽어 있으면 조용히 실패하므로 Claude 동작 중에 purplemux-improved를 닫아도 아무 것도 깨지지 않습니다.

## 부팅 시퀀스

`server.ts:start()`는 다음을 순서대로 실행합니다:

1. `acquireLock(port)` — `~/.purplemux/pmux.lock`을 통한 단일 인스턴스 가드
2. `initConfigStore()` + `initShellPath()` (사용자 로그인 셸 `PATH` 해석)
3. `initAuthCredentials()` — scrypt 해시 비밀번호와 HMAC 시크릿을 env에 로드
4. `scanSessions()` + `applyConfig()` — 죽은 tmux 세션 정리, `tmux.conf` 적용
5. `initWorkspaceStore()` — `workspaces.json`과 워크스페이스별 `layout.json` 로드
6. `autoResumeOnStartup()` — 저장된 디렉토리에서 셸 재실행, Claude resume 시도
7. `getStatusManager().init()` — 메타데이터 폴 시작
8. `app.prepare()` (Next.js dev) 또는 `require('.next/standalone/server.js')` (prod)
9. 접근 정책에 따라 `bindPlan.host:port` (`0.0.0.0` 또는 `127.0.0.1`)에 `listenWithFallback()`
10. `ensureHookSettings(result.port)` — 실제 포트로 훅 스크립트 작성/갱신
11. `getCliToken()` — `~/.purplemux/cli-token` 읽기 또는 생성
12. `writeAllClaudePromptFiles()` — 각 워크스페이스의 `claude-prompt.md` 갱신

포트 결정과 10단계 사이의 갭이, 매 시작마다 훅 스크립트를 재생성하는 이유입니다 — 라이브 포트가 직접 박혀야 하니까요.

## 커스텀 서버 vs Next.js 모듈 그래프

{% call callout('warning', '한 프로세스 안의 두 모듈 그래프') %}
외부 커스텀 서버(`server.ts`)와 Next.js (페이지 + API 라우트)는 Node 프로세스는 공유하지만 **모듈 그래프는 공유하지 않습니다**. 양쪽에서 import하는 `src/lib/*` 모듈은 두 번 인스턴스화됩니다. 공유가 필요한 싱글톤(StatusManager, WebSocket 클라이언트 셋, CLI 토큰, 파일 쓰기 락)은 `globalThis.__pt*` 키에 매답니다. 자세한 배경은 `CLAUDE.md §18`.
{% endcall %}

## 더 깊이 읽으려면

- [`docs/TMUX.md`](https://github.com/stirp/purplemux-improved/blob/main/docs/TMUX.md) — tmux 설정, 커맨드 래퍼, 프로세스 트리 워킹, 터미널 바이너리 프로토콜
- [`docs/STATUS.md`](https://github.com/stirp/purplemux-improved/blob/main/docs/STATUS.md) — Claude CLI 상태 머신, 훅 플로우, 합성 interrupt 이벤트, JSONL watcher
- [`docs/DATA-DIR.md`](https://github.com/stirp/purplemux-improved/blob/main/docs/DATA-DIR.md) — purplemux-improved가 쓰는 모든 파일

## 다음으로

- **[데이터 디렉토리](/purplemux-improved/ko/docs/data-directory/)** — 위 아키텍처가 건드리는 모든 파일
- **[CLI 레퍼런스](/purplemux-improved/ko/docs/cli-reference/)** — 브라우저 외부에서 서버와 통신하기
- **[문제 해결](/purplemux-improved/ko/docs/troubleshooting/)** — 위 구성요소가 오작동할 때 진단법

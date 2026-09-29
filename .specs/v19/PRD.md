# v19 요구사항 정리

## 출처

- `.specs/v19/requirements/workspace-menu-order.md` — 2026-09-28 用户确认的工作区菜单顺序统一需求。

- `.specs/v19/requirements/codex.md` — OpenAI Codex CLI를 두 번째 provider로 도입하기 위한 상세 설계

## 작업 단위 (도출)

v19은 페이지 추가가 아닌 **provider 추상 계층 위에 두 번째 CLI 통합**. v18까지 작업한 `IAgentProvider` 추상이 첫 검증을 받는 단계.

**범위 확장 결정 (2026-05-01)**: 원래 codex.md가 예정 작업으로 분리했던 jsonl 파서 / 타임라인 / stats / session-history 통합을 v19에 흡수. 사용자가 codex 탭에서 Claude와 동등 수준의 timeline·stats를 받게 함. **공통화 정책 (옵션 A)**: `ITimelineEntry` 타입 시스템 + 14개 timeline 컴포넌트 12개 재사용, 신규 타입/컴포넌트 6개 추가. 파서만 별도 모듈. 본문 §11 참조.

| 작업 단위 | 설명 | 우선순위 | Phase |
| --- | --- | --- | --- |
| Codex provider 코어 | `providers/codex/` 모듈 7개 (index/session-detection/preflight/client/work-state-observer/prompt/hook-config). `IAgentProvider` 슬롯 채우기. transcript 파서 제외. | P0 | 1 |
| Hook 인프라 | `~/.purplemux/codex-hook.sh` 부트 시 작성. 사용자 `~/.codex/config.toml` 머지 후 `-c hooks.<E>=[...]` 인자 발사. 4개 이벤트(SessionStart/UserPromptSubmit/Stop/PermissionRequest). | P0 | 1 |
| Hook endpoint 어댑터 | `/api/status/hook?provider=codex&tmuxSession=...` 분기. payload → `TAgentWorkStateEvent` 변환 + entry 메타 갱신. SessionStart 동시성 보정. | P0 | 1 |
| TUI ready 감지 | 3-layer (process + pane title + composer 박스+마커) 체크 → synthetic SessionStart 발사. | P0 | 1 |
| Status 보강 (ping-pong 방지 포함) | poll loop에서 `isAgentRunning` false면 cliState='inactive' 복귀 (F1 recent-launch grace 5s + F2 pane title fallback). send-keys 분리 헬퍼. `matchesProcess(cmd, args?)` 시그니처 확장. | P0 | 1 |
| Preflight 통합 | `IPreflightResult.codex` 필드 추가. Codex optional (`isRuntimeOk` 영향 없음). | P0 | 1 |
| 에러 표면화 정책 | A(미설치) 4중 노출, B(hook 실패) 부트 1회 토스트, C(TOML 파싱 실패) first-use 1회 토스트, D/E(runtime) 토스트. | P0 | 1 |
| Store 일반화 (`agentProcess`/`agentInstalled`) | `claudeProcess`/`claudeInstalled`/`claudeProcessCheckedAt`/setter들을 agent prefix로 rename. ~10 사이트 일괄 갱신 (use-tab-store, pane-container, claude-code-panel desktop/mobile, mobile-surface-view). 신규 CodexPanel은 처음부터 일반화 필드 사용. | P0 | 1 |
| Codex 패널 UI | `CodexPanel`/`MobileCodexPanel` (ClaudeCodePanel 거의 복사). `OpenAIIcon` 재사용. **(타임라인은 Phase 3에서 정식 활성화)** | P0 | 2 |
| 메뉴/단축키 | "Codex 새 대화"/"세션 목록" 메뉴 항목. `view.mode_codex` = `Cmd+Shift+X`. agent 전환 잠금 규칙. | P0 | 2 |
| Session list (codex) | `~/.codex/sessions/YYYY/MM/DD/*.jsonl` 디렉토리 스캔 + 첫 줄 SessionMeta 추출. cwd 필터. | P0 | 2 |
| 권한 응답 UI | PermissionRequest hook → UI Yes/No → send-keys `y`/`n` (Codex default keymap) + 3초 timeout fallback 토스트. | P0 | 2 |
| **jsonl 파서 (Codex)** | `src/lib/session-parser-codex.ts` 신규 (~700-900줄). RolloutItem(`session_meta`/`response_item`/`event_msg`/`compacted`/`turn_context`) → `ITimelineEntry` 변환. linear 구조라 트리 walking 없음. | **P0** | **3** |
| **ITimelineEntry 확장** | 신규 8개 타입 추가: `approval-request`, `exec-command-stream`, `web-search`, `mcp-tool-call`, `patch-apply`, `context-compacted`, **`reasoning-summary`**(Codex 전용 — `response_item.reasoning` summary만 표시), **`error-notice`**(Codex 전용 — `Error`/`Warning`/`StreamError`/`GuardianWarning` 흡수, `severity` 필드 분기). 기존 13개 타입 호환 유지. `assistant-message.usage` 필드 일반화. | **P0** | **3** |
| **Timeline 컴포넌트 신규/보강** | 신규 8개 컴포넌트(위 타입과 1:1) + 기존 12/14 컴포넌트 재사용. `agent-group`은 Claude 전용 유지(Codex sub-agent 없음), `thinking`은 Claude 전용 유지(현재 timeline에 미표시 정책 그대로) — Codex reasoning은 별도 `reasoning-summary` type으로 분리. **timeline-view.tsx 변경 3곳**: (1) import 8개 추가 (2) `TimelineEntryRenderer` switch에 8개 case 추가 (3) groupedItems 무변경(파서가 begin/delta/end 묶음 책임). | **P0** | **3** |
| **timeline-server provider 분기** | jsonl path로 provider 검출 + 파서 라우팅. WebSocket protocol 변경 없음 (output `ITimelineEntry` 동일). incremental 파싱 동일 패턴. **Codex 파서 책임**: ExecCommand/WebSearch/McpToolCall/PatchApply의 begin/delta/end를 in-flight tracking으로 묶어 단일 entry로 변환 (timeline-view groupedItems 손대지 않음). | **P0** | **3** |
| **CodexPanel placeholder 제거** | Phase 2 placeholder 자리에 정식 timeline-view 마운트. ClaudeCodePanel과 동일 props로 통합 가능. | **P0** | **3** |
| **session-history Codex 통합** | `~/.codex/sessions/YYYY/MM/DD/` 일자 파티셔닝 디렉토리 스캔. session-meta-cache 일반화. | **P0** | **4** |
| **stats Codex 통합** | `jsonl-parser.ts` 일반화 (Claude `usage.input_tokens` 합산 + Codex `event_msg.token_count.info.total_token_usage` 추출). 통합 차트 + `rate_limits` 노출 (Codex만). | **P0** | **4** |
| **observer 정식 구독** | `attachWorkStateObserver` Step 5 TODO 정식 구현 (Claude/Codex 양쪽). | P0 | 4 |

## 주요 요구사항

### 1. Codex provider 코어 (Phase 1)

- `IAgentProvider` 인터페이스 그대로 채움 — Step 1~5 추상이 첫 사용자 받음
- 신규 panelType: `'codex-cli'`
- Provider id: `'codex'`
- 세션 ID: UUID (Claude와 동일 정규식)
- **ITab `agentState` 사용 패턴 (legacy 필드 없음)**:
  - `IAgentState` 스키마(`types/terminal.ts:14-19`) 그대로 재사용 — 4개 필드(`providerId`/`sessionId`/`jsonlPath`/`summary`)로 codex 필요 정보 다 담음
  - Codex는 새 provider라 디스크 호환 데이터 없음 → ITab에 `codex*` legacy 필드 추가 안 함
  - readField/writeField 단순화: `tab.agentState?.providerId === 'codex' ? tab.agentState[field] : null` (Claude는 `claude*` legacy fallback 있지만 Codex는 단순 분기)
  - `lastUserMessage`는 ITab의 별도 필드(`terminal.ts:36`) 그대로 활용. `lastResumeOrStartedAt` (§5 F1 fallback)은 status-manager 런타임 only — 디스크 저장 불필요
  - **layout.json 디스크 표현 예시**:
    ```json
    {
      "id": "tab-xxx", "sessionName": "tmux-xxx", "name": "Codex Session",
      "panelType": "codex-cli",
      "agentState": {
        "providerId": "codex",
        "sessionId": "01997fee-5078-7d32-aeb3-0b141d322a26",
        "jsonlPath": "/Users/.../rollout-2025-09-25T17-12-28-01997fee....jsonl",
        "summary": "Add user authentication"
      }
    }
    ```
  - **Provider 전환 시 동작**: 같은 탭에서 panelType을 `claude-code` ↔ `codex-cli` 전환하면 agentState **덮어쓰기**. Claude는 `claude*` legacy fallback으로 이전 session 자연 resume 가능 / Codex는 legacy 없어 새 session 시작 (이전 codex 메타 잃음). 사용자가 codex 이전 session 복구 원하면 codex 세션 목록 메뉴에서 직접 resume — 단일 agentState 슬롯의 의도된 동작
- `matchesProcess(cmd, args?)` 시그니처 확장 — 두 provider 모두 `node`가 직접 자식이라 args(`claude.js` vs `codex.js`)로 disambiguation
- 프로세스 트리: `shell → node (codex.js shim) → codex (Rust binary)` 2단계 — 기존 grandchild walk 재사용

### 2. 시스템 프롬프트 주입 (Phase 1)

- `-c developer_instructions="$(cat <path>)"` inline TOML 주입
- 사용자 `~/.codex/{config.toml, AGENTS.md, auth.json}` 일체 미변경
- developer_instructions는 **append** (기본 시스템 프롬프트 보존)
- 워크스페이스 디렉토리에 `codex-prompt.md` 작성, 매 launch마다 inline 주입
- TOML triple-quoted literal 사용 (`'''...'''`), prompt 내용에 `'''` sanitize
- 인자 길이 ARG_MAX(256KB+) 한참 아래
- **`writeCodexPromptFile(ws)` 트리거**: `provider.writeWorkspacePrompt` 슬롯 구현. 호출 사이트는 Claude와 동일 — `workspace-store.ts:330` (워크스페이스 생성), `:375` (name 변경), `:404` (directories 변경), `server.ts:389` (서버 부트 시 `writeAllWorkspacePrompts`). 이미 실행 중인 codex는 영향 없음 — 다음 launch 또는 `/quit` 후 재시작 시 새 prompt 반영 (turn 도중 prompt 변경하면 혼란). codex-prompt.md는 **auto-managed file**, 사용자 수동 편집 시 다음 launch에 buildBody가 덮어씀. 현재 buildBody는 `ws.id`만 사용 → 사용자가 워크스페이스 metadata 변경해도 prompt 내용 영향 거의 없음 (의도된 단순함)

### 3. Hook 등록 + 페이로드 (Phase 1)

- `-c hooks.<Event>=[{matcher=".*", hooks=[{type="command", command="..."}]}]` 형태로 4개 이벤트 등록
- 등록 이벤트: `SessionStart`, `UserPromptSubmit`, `Stop`, `PermissionRequest` (PreToolUse/PostToolUse는 예정 작업으로 분리)
- Hook 명령은 `~/.purplemux/codex-hook.sh` 단일 스크립트 (서버 부트 시 mode 0700 작성)
- 스크립트 동작: `tmux display-message`로 tmux session 추출 → query param으로 inject (payload는 codex stdin 그대로 forward) → `/api/status/hook?provider=codex&tmuxSession=...`
- 인증 헤더 `x-pmux-token` (Claude와 통일)
- **HTTP API backward compat 정책**: 기존 Claude hook script(`hook-settings.ts:37`)는 `?provider=` query param 없이 호출. endpoint 핸들러는 `req.query.provider ?? 'claude'`로 default 분기:
  ```ts
  // pages/api/status/hook.ts
  const handler = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json(...);
    if (!verifyCliToken(req)) return res.status(403).json(...);
    const provider = (req.query.provider as string) || 'claude';
    if (provider === 'codex') return handleCodexHook(req, res);
    return handleClaudeHook(req, res);  // 기존 코드 그대로
  };
  ```
  - Claude script 변경 0 (provider 없음 → 자동 default)
  - Codex script는 단순 wrapper (`tmux display-message` 1회 + curl forward, jq 같은 외부 의존 회피)
  - 두 payload 형식이 매우 달라(Claude `{event, session}` lowercase vs Codex `{session_id, hook_event_name}` snake/PascalCase) URL 분기가 핸들러 함수 분리 트리거로 가장 명확
- **사용자 config 머지**: `[...ourEntries, ...userEntries]` 순서 (display_order 메타로 보존). 실행 모델 정정 — codex 소스(`codex-rs/hooks/src/engine/dispatcher.rs:88-101`) 검증 결과:
  - **`futures::future::join_all` + `.await`** → 모든 handler **병렬 실행**, codex 본체는 모두 끝날 때까지 기다림 (`HookExecutionMode::Sync`)
  - 즉 codex.md의 "async=true라 codex 본체 진행에 영향 없음" 표현은 부정확. 실제로는 **각 hook은 별 프로세스 + stdin 격리**라 사용자 hook이 stdin 소비/실패해도 우리 hook에 영향 없음 (이게 "안전"의 정확한 근거)
  - **caveat — 우리 책임 밖**: 사용자 hook이 timeout 안에서도 느리면 codex 본체 진행이 그만큼 지연됨. 우리 hook은 `curl POST localhost` 수십 ms라 codex에 부담 없음
  - 머지 시 `logger.info('codex hooks merged: N user entries')` 디버깅 보조
- 사용자 config 파싱 실패 시 graceful (우리 entry만 적용)
- TOML 직렬화: SDK의 `toTomlValue` 패턴 (JSON.stringify로 escape) + shellQuote 단일따옴표 wrap

### 4. TUI ready 감지 + cliState 진입 (Phase 1)

- **핵심 문제**: Codex SessionStart hook은 사용자 첫 메시지 후 발사 (`turn.rs:299`). 그 전엔 cliState='inactive' → WebInputBar 비활성 → 첫 메시지 못 보냄 → dead state
- **3-layer 감지** (모두 만족 시 synthetic SessionStart):
  - Layer 1: `provider.isAgentRunning(panePid)` true (codex Rust 자식 검출)
  - Layer 2: pane title이 shell-style 아님 (OSC 0 발사 = SessionConfigured 통과)
  - Layer 3: pane content에 **composer 박스(`╭` AND `╰`) AND 마커(`›` U+203A 또는 `!`)**. 박스 조건 추가는 zsh prompt remnant/changelog 등의 false positive 차단 (단순 `›`/`!` substring 검색은 spaceship 등 일부 zsh 테마와 충돌 가능 → false idle 전환 시 dead state)
- 모두 통과 + cliState='inactive'면 `updateTabFromHook(session, 'session-start')` synthetic 발사
- false positive 회피, idempotent 체크 불필요 (한 번 'idle' 가면 분기 안 들어감)
- 페인 콘텐츠 캡처 비용은 cliState='inactive'일 때만 발생 → 무시 가능

### 5. Status 보강 (Phase 1)

- **Agent 종료 복귀 (ping-pong 방지 포함)**: poll 사이클마다 `isAgentRunning` false && cliState ≠ 'inactive'/'unknown'면 'inactive' 전환. **단 두 가지 fallback 조건 중 하나라도 통과 시 skip**:
  - **(F1) Recent-launch grace 5초**: `entry.lastResumeOrStartedAt` 타임스탬프 신설. 갱신 시점은 (a) `auto-resume.ts` sendResumeKeys 직후, (b) SessionStart hook 수신 시(synthetic + real). `now - stamp < 5000`이면 skip — auto-resume 직후 codex 부팅 1-2초 윈도우(시나리오 S1) 차단
  - **(F2) Pane title이 여전히 agent 형식**: `paneTitle && !/^[^|]+\|[^|]+$/.test(paneTitle)` (shell 형식 `cmd|path` 아님) → skip — codex가 잠깐 fork/exec하는 순간(S2) 차단
  - **정상 종료(S3)는 정상 작동**: 사용자가 `/quit` → shell 복귀 → title이 즉시 `cmd|path` 형식으로 변경되면서 F2 통과 안 함 → inactive 전환
  - 비용: paneTitle은 이미 polling 사이클에서 호출 중(`status-manager.ts:633`), 추가 호출 없음
  - Claude/Codex 공통 적용 (기존 Claude의 잠재 ping-pong도 함께 견고화)
- **send-keys 분리**: `tmux send-keys cmd Enter`는 atomic PTY write라 codex가 줄바꿈으로 오인. `sendKeysSeparated(session, cmd)` 헬퍼 — text 후 50ms 후 별도 Enter. WebInputBar/auto-resume 모두 적용.
- **`matchesProcess(cmd, args?)` 시그니처 확장**: `getProviderByProcessName` 호출 사이트 (`auto-resume.ts:62` 등)에 args 전달.

### 6. Codex 어댑터 — 메타 갱신 + 동시성 보정 (Phase 1)

Codex SessionStart hook payload는 `source: "startup" | "resume" | "clear"` 필드를 명시 제공 (`codex-rs/hooks/src/schema.rs:338-349`). 이를 활용해 분기:

```ts
// /api/status/hook?provider=codex 핸들러
entry.agentProviderId = 'codex';
entry.agentSessionId = payload.session_id;  // 모든 SessionStart에서 갱신
if (payload.transcript_path) entry.jsonlPath = payload.transcript_path;  // null guard
if (payload.hook_event_name === 'UserPromptSubmit' && payload.prompt) {
  entry.lastUserMessage = payload.prompt;
  entry.agentSummary = payload.prompt.slice(0, 80);
}

if (eventName === 'session-start') {
  const source = payload.source as 'startup' | 'resume' | 'clear';
  if (source === 'clear') {
    // /clear는 사용자 명시 액션 — race 없음. 이전 turn 메타 reset 후 강제 idle 전환
    entry.agentSummary = null;
    entry.lastUserMessage = null;
    entry.lastAssistantMessage = null;
    statusManager.updateTabFromHook(tmuxSession, 'session-start');
  } else {
    // startup/resume: codex SessionStart는 첫 사용자 메시지 후 발사 (turn.rs:299)
    // → UserPromptSubmit과 race 가능. busy↔idle 회귀 방지 위해 보수적 분기
    if (entry.cliState === 'inactive' || entry.cliState === 'unknown') {
      statusManager.updateTabFromHook(tmuxSession, 'session-start');
    }
  }
} else if (eventName) {
  statusManager.updateTabFromHook(tmuxSession, eventName);
}

// jsonlPath 변경 시 timeline-server에 알림 (clear/resume 모두 해당)
// codex provider의 watchSessions 구현체가 globalThis.__ptCodexHookEvents를 listen → callback 발사
// → timeline-server.ts:791-825가 기존 메커니즘으로 처리:
//   1. 기존 jsonl 파일 unsubscribe
//   2. 새 jsonl 파일 subscribe + 빈 timeline init
//   3. 클라이언트에 'timeline:session-changed' (reason: 'new-session-started') 발사
//   4. 새 sessionStats로 자연 reset (ContextRing 0%로)
const g = globalThis as unknown as { __ptCodexHookEvents?: EventEmitter };
g.__ptCodexHookEvents?.emit('session-info', tmuxSession, {
  status: 'running',
  sessionId: payload.session_id,
  jsonlPath: payload.transcript_path ?? null,
  pid: null, cwd: payload.cwd ?? null, startedAt: null,
});
```

**Codex provider `watchSessions` 구현 패턴**:
- Claude는 `~/.claude/projects/<proj>/` fs.watch로 새 파일 감지 → /clear 자동 발동
- Codex는 `~/.codex/sessions/YYYY/MM/DD/` 일자 파티셔닝이라 fs.watch 비용 큼 + 자정 디렉토리 race
- **대신 hook 채널 사용**: `globalThis.__ptCodexHookEvents` (EventEmitter) 신설. status-manager hook 핸들러가 emit, codex provider `watchSessions`가 listen → callback 호출 (CLAUDE.md rule 18 준수)
- transcript_path를 hook payload에서 직접 받으므로 fs.watch보다 더 정확하고 빠름

**Phase 1~3 observer 형태 (`work-state-observer.ts`)**:
- Claude와 동등 수준: `providers/codex/work-state-observer.ts` 모듈 신설. `translateCodexHookEvent(payload): TAgentWorkStateEvent | null` helper만 export
- API 핸들러에서 helper로 codex payload를 표준 `TAgentWorkStateEvent`로 변환 후 `status-manager.updateTabFromHook` 직접 호출 (Claude 패턴 동일)
- `attachWorkStateObserver` 슬롯은 비워둠 — Phase 4에서 정식 구현 (Claude/Codex 양쪽 마이그). Phase 4 후엔 hook 채널(`__ptCodexHookEvents`) + jsonl tail을 provider가 통합 emit, status-manager가 단일 subscribe
- 변환 매핑: `SessionStart`→`session-start` (source 별도 분기), `UserPromptSubmit`→`prompt-submit`, `Stop`→`stop`, `PermissionRequest`→`notification(notificationType='permission-request')`

### 7. 미설치 격리 (Phase 1)

- Codex는 optional. 미설치 환경에서 Claude만 정상 동작 보장
- `IPreflightResult.codex.installed` 결과 따라 UI 메뉴 disabled (tooltip 안내)
- auto-resume에서 codex 탭 발견 시 preflight check, 미설치면 skip + log
- `isRuntimeOk`에 codex 포함 안 함 (Codex 미설치라도 통과)

### 8. UI 1급 시민화 (Phase 2)

- `CodexPanel`/`MobileCodexPanel` — `ClaudeCodePanel` 거의 복사 + placeholder timeline (Phase 3에서 정식 마운트)
- `OpenAIIcon` (기존 svg 컴포넌트) 재사용. 상태 인디케이터는 Claude와 동일 원형
- 메뉴: "Codex 새 대화" / "Codex 세션 목록" 항목 (`pane-new-tab-menu`)
- 단축키: `view.mode_codex` = `Cmd+Shift+X` (codeX의 X). 기존 `view.mode_claude` = `Cmd+Shift+C` (확인 필요), `view.mode_terminal` = `Cmd+Shift+T` (확인 필요)
- 세션 목록: `listCodexSessions({ cwd })` — 워크스페이스 cwd 기준 필터

#### 8.1 Agent 전환 잠금 규칙

`use-keyboard-shortcuts.ts`의 `switchMode(target)`에 적용:

```ts
const switchMode = (target: TPanelType) => {
  const current = tab.panelType;
  const isAgentRunning = tab.cliState !== 'inactive' && tab.cliState !== 'unknown';
  const currentIsAgent = current === 'claude-code' || current === 'codex-cli';
  const targetIsAgent = target === 'claude-code' || target === 'codex-cli';

  if (isAgentRunning && currentIsAgent && targetIsAgent && target !== current) {
    toast.error(t('switchAgentBlocked', { name: currentName }));
    return;
  }
  updateTabPanelType(paneId, tabId, target);
};
```

**잠금 매트릭스**:

| 현재 | 대상 | cliState | 결과 |
| --- | --- | --- | --- |
| terminal/diff/web-browser | agent (claude/codex) | any | ✅ 자유 (display만 변경, CLI 안 죽임) |
| agent | terminal/diff/web-browser | any | ✅ 자유 |
| claude-code | codex-cli (또는 반대) | inactive/unknown | ✅ 자유 (실제 종료된 상태) |
| claude-code | codex-cli (또는 반대) | busy/idle/needs-input/ready-for-review | ❌ **차단 + 토스트** |
| 같은 panelType | 같은 panelType | any | no-op |

**잠금 풀림 조건**:
- 터미널에서 `/quit` (codex) 또는 `/exit` (claude) 입력 → process exit → §5 F2 fallback 통과 안 함 → cliState='inactive' → 잠금 자동 해제
- process 자연 종료 (panic 등) → 동일 경로

**적용 사이트 (3곳)**:
1. 단축키 `use-keyboard-shortcuts.ts`
2. Content header panel selector `content-header.tsx:75,95`
3. tab-bar `tab-bar.tsx:259`
- `pane-new-tab-menu`는 새 탭 생성이라 다른 탭의 agent 상태와 무관 → 잠금 비적용

**다른 탭 동시 실행**:
- 한 워크스페이스에 codex 탭 + claude 탭 동시 가능 (각 탭 독립)
- 잠금은 같은 탭의 panelType 전환에만 적용

**토스트 메시지 (옵션 B — 안내 강화)**:
- key: `switchAgentBlocked`
- 한국어: `"{currentName}이 실행 중입니다. 터미널에서 /quit 또는 Ctrl+D로 종료 후 다시 시도하세요"`
- 영문: `"{currentName} is running. Exit with /quit or Ctrl+D in the terminal first"`
- `{currentName}`: "Claude" 또는 "Codex" (`tab.panelType` → display name 매핑)
- 단순 메시지(A)는 "어떻게 종료하지?" 의문 유발, action button(C)은 panelType 자동 변형으로 사용자 의도 왜곡 → B가 친절+명확+안전

### 9. 권한 응답 (Phase 2)

- Codex default approval keys (`codex-rs/tui/src/keymap.rs:509-513`): `y` (approve), `a` (session), `p` (prefix), `d` (deny), `n`/`Esc` (decline)
- 단일 글자, Enter 불필요 (Claude의 `1\r`/`2\r`과 다름)
- Phase 2 매핑: "Yes" → `y`, "No" → `n` (default keymap 가정)
- **응답 실패 자동 감지(E)**: `y`/`n` send 후 3초 내 PermissionRequest 상태가 풀리지 않으면 토스트 "응답이 codex에 닿지 않았습니다. keymap을 확인하세요" 노출. 변경 안 한 사용자엔 무관, 변경한 사용자에게만 자연 fallback. 사전 조건: codex가 user config로 keymap 노출하는 경우에만 적용 (확인 액션은 아래 "품질 격상" 항목 참조)

### 10. 에러 표면화 정책 (Phase 1)

Claude의 기존 패턴(전체 페이지 차단 / 토스트 / silent log 3단계)과 일관성 유지. codex는 optional이라 "전체 페이지 차단"은 안 쓰고, 메뉴 disabled + 패널 내 안내 + 토스트 조합으로 표면화.

| 케이스 | 표면화 방식 | 비고 |
| --- | --- | --- |
| **A.** codex CLI 미설치 | (1) `pane-new-tab-menu`의 "Codex 새 대화"/"Codex 세션 목록" 항목 disabled + tooltip "Codex CLI가 설치되어 있지 않습니다" (2) 클릭 시 install 안내 토스트 (3) preflight 페이지 codex 섹션 명시(`installed: false` + 시각 트리트먼트 Claude와 동일) (4) 패널 내 안내 (`agentInstalled: false`일 때 빈 상태 + Install 링크 — Claude의 `claudeInstalled` 패턴 미러링) | 4중 다층 노출. `isRuntimeOk`엔 미포함 (§7) |
| **B.** `~/.purplemux/codex-hook.sh` 작성/권한 실패 | logger.error + 서버 부트 시 1회 시스템 토스트(sync-server push). 토스트 메시지: "Codex hook 설치 실패. codex 상태가 정확하지 않을 수 있습니다." | 부트 1회면 충분 — 영구 배너는 노이즈 |
| **C.** 사용자 `~/.codex/config.toml` 파싱 실패 → graceful merge 실패 | logger.warn + 첫 codex 탭 생성 시 1회 토스트 ("config.toml 파싱 실패, purplemux hook만 적용됨"). 우리 entry는 정상 적용됨 강조 | first-use 시점에만 표시. session storage로 dedupe |
| **D.** runtime send-keys 실패 (resume / launch / 일반 명령) | `toast.error('codex launch failed')` / `toast.error('resumeFailed')` — Claude `claude-code-panel.tsx:79-82` 패턴 그대로 미러 | Phase 2 CodexPanel 구현 시 동일 메시지 키 |
| **E.** PermissionRequest 응답 send-keys 실패 | `toast.error('approval send failed')` + 재시도 버튼 (UI 상에 Yes/No 버튼 다시 활성화) | Phase 2 — `permission-prompt-item.tsx` 수정 |

**스토어 필드 일반화 (Phase 1 즉시 rename)**:
- `claudeProcess` → `agentProcess: boolean | null`
- `claudeProcessCheckedAt` → `agentProcessCheckedAt: number`
- `claudeInstalled` → `agentInstalled: boolean`
- setter: `setClaudeProcess` → `setAgentProcess`, `setClaudeInstalled` → `setAgentInstalled`
- 변경 사이트 (~10곳): `use-tab-store.ts:17-68,123-142`, `pane-container.tsx:200,345,655,663,726,732`, `claude-code-panel.tsx:51-52,92,113-116,134,147-154,170,188,244`, `mobile-claude-code-panel.tsx:71-72,107,128-131`, `mobile-surface-view.tsx:137,203,392,398` — 일괄 rename
- 신규 `codex-panel.tsx`/`mobile-codex-panel.tsx` (Phase 2)는 처음부터 `agentProcess`/`agentInstalled` 사용
- 예정 작업(v19 외부)에서 `AgentPanel` 단일 컴포넌트로 통합 시 자연 흡수
- **이유**: 절반만 일반화(`agentInstalled`만)하면 Phase 2 CodexPanel이 두 패턴 혼용 — 어색. `agentSessionId`/`agentProviderId`/`agentSummary` 등 신규 컨벤션과 일관성

**logger 컨벤션**:
- A/B/C는 `createLogger('codex-preflight')` / `createLogger('codex-hook')` / `createLogger('codex-config')` 분리해서 grep 쉽게
- D/E는 client-side 토스트로 끝 (서버 log 별도 필요 없음)

### 11. jsonl 파서 + 타임라인 통합 (Phase 3/4)

**결정**: 예정 작업으로 미뤘던 jsonl 파서 작업을 v19에 포함. **공통화 (옵션 A) + 6개 신규 타입**으로 codex 깊은 통합 완성.

#### 11.1 형식 비교 (실데이터 기반)

| 측면 | Claude | Codex |
| --- | --- | --- |
| 라인 구조 | `{ uuid, parentUuid, type, message: { content[] } }` | `{ timestamp, type, payload: { type, ... } }` |
| 트리 vs 평탄 | UUID/parentUuid **트리** (sub-agent sidechain) | 단순 **linear** |
| Top-level types | `user`/`assistant`/`system`/`summary` | `session_meta`/`response_item`/`event_msg`/`compacted`/`turn_context` |
| Tool 호출 | content[`tool_use`/`tool_result`] | `response_item.function_call`/`function_call_output` |
| Reasoning | content[`thinking`] (평문) | `response_item.reasoning` (`encrypted_content` + `summary`) |
| Token 추적 | 라인별 누적 합산 | `event_msg.token_count.info.total_token_usage` (이미 누적) |

#### 11.2 공통화 정책

- **`ITimelineEntry` 타입 시스템 재사용** + 6개 신규 타입 추가
- **컴포넌트 12/14 재사용**, 신규 6개 추가 (1:1 매핑)
- **파서는 별도 모듈** (`session-parser.ts` Claude, `session-parser-codex.ts` Codex) — 입력 형식이 너무 달라서 강제 공통화는 부작용
- **timeline-server는 단일** — provider 검출 후 파서 라우팅
- **WebSocket protocol 변경 없음** — output 타입(`TTimelineServerMessage`) 그대로

#### 11.3 ITimelineEntry 매핑 표

| ITimelineEntry | Claude 출처 | Codex 출처 |
| --- | --- | --- |
| `user-message` | `type:user` + content[text] | `event_msg.user_message` |
| `assistant-message` | `type:assistant` + content[text] | `event_msg.agent_message` 또는 `response_item.message(assistant)` |
| `thinking` | content[thinking] | **N/A — Claude 전용 유지 (timeline에 미표시 정책)** |
| **`reasoning-summary` (신규)** | (해당 없음) | `response_item.reasoning` — `summary[]`만 표시 + "Reasoning hidden" 안내 (encrypted_content 미해독) |
| **`error-notice` (신규)** | (해당 없음 — Claude jsonl엔 명시 에러 이벤트 없음) | `event_msg.Error` / `Warning` / `StreamError` / `GuardianWarning` 흡수. `severity: 'error' \| 'warning' \| 'stream-error' \| 'guardian-warning'` + `message: string` + `retryStatus?: string` (StreamError 전용) |
| `tool-call` | content[tool_use] | `response_item.function_call` (id ↔ call_id) |
| `tool-result` | content[tool_result] | `response_item.function_call_output` |
| `agent-group` | sidechain + parentUuid | **N/A — Claude 전용 유지** |
| `task-progress`/`-notification` | TodoWrite tool | `event_msg.PlanUpdate` |
| `plan` | ExitPlanMode tool | `event_msg.EnteredReviewMode`/`ExitedReviewMode` |
| `ask-user-question` | AskUserQuestion tool | `event_msg.RequestUserInput` |
| `interrupt` | text prefix `[Request interrupted by user` | `event_msg.TurnAborted` |
| `session-exit` | session end | `event_msg.ShutdownComplete` |
| `turn-end` | stop_reason='end_turn' | `event_msg.TurnComplete` |
| **`approval-request` (신규)** | (Claude는 hook으로만) | `ExecApprovalRequest`, `ApplyPatchApprovalRequest`, `RequestPermissions` |
| **`exec-command-stream` (신규)** | (Claude의 Bash tool은 tool-call로 흡수) | `ExecCommandBegin`/`Delta`/`End` 묶음 |
| **`web-search` (신규)** | (Claude의 WebSearch tool은 tool-call로 흡수) | `WebSearchBegin`/`End` |
| **`mcp-tool-call` (신규)** | (Claude는 tool-call로 흡수) | `McpToolCallBegin`/`End` |
| **`patch-apply` (신규)** | (Claude의 Edit/Write tool은 tool-call로 흡수) | `PatchApplyBegin`/`Updated`/`End` |
| **`context-compacted` (신규)** | pre-compact / post-compact hook (마커) | `event_msg.ContextCompacted` |

#### 11.4 신규 8개 타입의 컴포넌트 위치

각 타입에 1:1 컴포넌트:
- `src/components/features/timeline/approval-request-item.tsx` — codex의 권한 요청을 timeline 후행 표시 (실시간은 hook + permission-prompt-item이 담당)
- `src/components/features/timeline/exec-command-stream-item.tsx` — Begin/Delta/End 묶음 + collapsed/expanded stdout
- `src/components/features/timeline/web-search-item.tsx` — Begin/End 묶음 + 결과 요약
- `src/components/features/timeline/mcp-tool-call-item.tsx` — Begin/End + MCP server 이름
- `src/components/features/timeline/patch-apply-item.tsx` — Begin/Updated/End + diff 표시 (기존 ToolCall diff 컴포넌트 재사용 가능)
- `src/components/features/timeline/context-compacted-item.tsx` — Claude의 pre/post-compact와 동일 시각 트리트먼트
- `src/components/features/timeline/reasoning-summary-item.tsx` — Codex `summary[]` 텍스트 표시 + "Reasoning hidden" 안내 (encrypted_content 미해독). Claude `thinking`은 별개 type으로 timeline 미표시 정책 유지
- `src/components/features/timeline/error-notice-item.tsx` — `severity` 필드로 분기. error: 빨간 배경+아이콘, warning: 노란, stream-error: 노란+재시도 상태(`retryStatus`), guardian-warning: 보라(가디언 컨텍스트). 디버깅 가능하도록 message 전체 표시 + collapsed/expanded 토글

기존 12개 컴포넌트는 ITimelineEntry 확장에 영향 없음 (호환 유지).

**timeline-view.tsx 변경 사이트** (`src/components/features/timeline/timeline-view.tsx`):
1. **Line ~17-22 import 영역**: 신규 8개 컴포넌트 import 추가
2. **Line ~134-155 `TimelineEntryRenderer` switch**: 8개 case 추가 (`approval-request`, `exec-command-stream`, `web-search`, `mcp-tool-call`, `patch-apply`, `context-compacted`, `reasoning-summary`, `error-notice`)
3. **Line ~85-110 `groupedItems()`**: **변경 없음** — begin/delta/end 묶음은 파서 책임

**파서 in-flight tracking 패턴** (`session-parser-codex.ts`):
- ExecCommand: `Begin(call_id)` → 빈 stdout buffer 시작 → 각 `Delta(call_id, chunk)` append → `End(call_id, exit_code)` flush → 단일 `ITimelineExecCommandStream` entry 발사
- WebSearch/McpToolCall: `Begin(call_id)` → `End(call_id, result)` → 단일 entry
- PatchApply: `Begin(call_id)` → `Updated(call_id, ...)` → `End(call_id, success)` → 단일 entry
- in-flight Map은 파서 인스턴스 내부 state. incremental parsing 사이에 유지 필요

**Mobile 패리티 — 자동 동작**:
- Desktop `claude-code-panel.tsx:15,293`과 Mobile `mobile-claude-code-panel.tsx:19,315` 모두 동일한 `TimelineView` 컴포넌트 재사용 → timeline-view.tsx 한 번 수정으로 desktop/mobile 동시 반영
- 신규 7개 컴포넌트는 기존 timeline 컴포넌트 반응형 패턴(`min-w-0 flex-1`, `shrink-0`, `truncate`)을 따르면 별도 mobile 컴포넌트 불필요
- Phase 2의 `MobileCodexPanel`도 동일 `TimelineView` 재사용 → Phase 3 placeholder 제거 시 자동으로 풀 timeline 표시
- 작성 시 주의:
  - `exec-command-stream-item` expanded stdout: `overflow-x-auto` 또는 word-break (긴 stdout mobile에서 깨짐 방지)
  - `approval-request-item` 버튼: `min-h-11` (44px 터치 타겟)
  - `patch-apply-item` diff: 기존 ToolCall diff 컴포넌트 재사용 (mobile 검증 완료된 패턴)

#### 11.5 분기가 필요한 영역

1. **`agent-group`**: Claude 전용 유지. Codex 파서는 발사 안 함
2. **`thinking` vs `reasoning-summary` 분리**:
   - Claude `thinking`: 현재 timeline에 미표시 정책 유지 (기존 동작 무변경, UX 회귀 0). 파서는 entry 발사하되 timeline-view switch가 case 없어 dispatch 안 됨
   - Codex `reasoning`: 새 type `reasoning-summary`로 분리. encrypted_content 미해독 + `summary[]` 텍스트만 표시 + "Reasoning hidden" 안내
   - **이유**: 한 type 안에서 분기하면 Claude UX 변경 위험. type 분리가 PRD 공통화 정책의 "분기 영역"에 부합
3. **`assistant-message.usage` 필드**:
   - Claude: 라인별 Anthropic usage (input_tokens, output_tokens, cache_*)
   - Codex: 라인 자체엔 token usage 없음 → session-level token_count event에서 별도 산출
   - **해결**: `usage`를 optional 유지. Codex assistant-message는 usage undefined로 두고, session-stats(`ISessionStats`)에서 별도 노출

#### 11.6 stats / session-history / session-meta-cache 일반화 (Phase 4)

**stats aggregator (옵션 B — 신규 모듈, 기존 무변경)**:
- `src/lib/stats/jsonl-parser.ts` (Claude 전용 `~/.claude/projects/`) **무변경 유지**
- 신규 `src/lib/stats/jsonl-parser-codex.ts` (`~/.codex/sessions/YYYY/MM/DD/`) — codex jsonl 스캔 + token 추출
- 신규 `src/lib/stats/stats-aggregator.ts` — 두 parser를 병렬 호출 + merge:
  ```ts
  export const aggregateStats = async (period) => {
    const [claudeStats, codexStats] = await Promise.all([
      parseClaudeJsonl(period), parseCodexJsonl(period),
    ]);
    return mergeStats(claudeStats, codexStats);
  };
  ```
- 기존 호출 사이트는 aggregator 사용으로 마이그 (jsonl-parser.ts import 사이트만 변경)
- token 합산 방식 차이 (parser 내부에서 흡수):
  - Claude: 라인별 `usage.input_tokens` 합산
  - Codex: jsonl 마지막 `token_count` event의 `total_token_usage` 채택 (이미 누적). 역방향 스캔 → 첫 hit
- 추가 노출 (Codex 전용): `rate_limits.primary.used_percent`, `model_context_window`, `cached_input_tokens`, `reasoning_output_tokens`

**session-meta-cache 일반화 (옵션 A — key prefix)**:
- `src/lib/session-meta-cache.ts`의 `IMetaCache` 시그니처를 `(providerId, sessionId)` 받게 변경
- 내부 Map key는 `${providerId}:${sessionId}` 형식으로 결합 — 두 provider UUID 충돌 회피
- `ISessionMeta` 자체는 provider 무관 → 변경 불필요
- 호출 사이트(`session-list.ts` 등)에 providerId 인자 추가

**session-history (`notification-sheet`) 일반화 (옵션 A — lazy 마이그)**:
- `ISessionHistoryEntry.claudeSessionId` → `agentSessionId: string | null` + `providerId: string` (default 'claude') 마이그
- 디스크 호환: `~/.purplemux/session-history.json` read 시 legacy `claudeSessionId` 발견하면 `{ agentSessionId: claudeSessionId, providerId: 'claude' }`로 lazy 변환. `claudeSessionId` 필드는 deprecated 마크
- `notification-sheet.tsx`(656줄):
  - `groupHistoryBySession` (line 144-148) key를 `${providerId}:${agentSessionId ?? entry.id}`로 변경
  - 그룹 렌더 시 providerId에 따라 `<ClaudeIcon>` 또는 `<OpenAIIcon>` 시각 구분
  - 토큰 정보는 단순 total로 통일 (provider별 세부 필드 차이는 stats 페이지에서만 노출)
- 신규 entry 작성 시 새 형식 사용 — legacy 필드 안 씀

#### 11.7 Phase 3/4 분리 근거

- **Phase 3**: 파서 + 컴포넌트 + timeline-server. 이 단계 끝나면 CodexPanel placeholder 제거 + 정식 timeline 표시
- **Phase 4**: stats / session-history / observer 통합. 데이터 깊이 확장
- 분리 이유: Phase 3 끝나도 사용자가 timeline 정상 사용 가능 (점진 출시 가능)

#### 11.8 테스트 전략

Claude 파서(`session-parser.ts`, 1092줄)와 **동일 수준 — 자동 테스트 없음**. 회귀 검증은 수동 시나리오(Phase 3 작업 단계 요약 표의 검증 컬럼 + codex.md 수동 검증 시나리오 8개)로 진행. 향후 회귀 발생 시 fixture 기반 단위 테스트(`tests/unit/lib/session-parser-codex.test.ts`) 추가는 별도 결정.

## 제약 조건 / 참고 사항

### 코드베이스 가이드 준수
- `AGENTS.md`: Next.js 16, Pages Router, pnpm, Tailwind v4, shadcn/ui, TypeScript
- `CLAUDE.md` 규칙 14 — 직접 `ps`/`pgrep`/`lsof` 호출 금지, 기존 `process-utils.ts` 함수 재사용
- `CLAUDE.md` 규칙 18 — 모듈 격리(`globalThis.__pt*`)는 신규 모듈에 적용

### 성능
- 폴링 사이클: 30s/45s/60s (탭 수에 따라). Codex 추가로 변동 없음.
- `capturePaneAtWidth`(수십 ms)는 cliState='inactive' + Layer 1+2 통과 후만 호출 → 활성 codex 탭 평균 1-2회/사이클
- ARG_MAX 256KB+ vs 우리 인자 ~3KB → 한참 여유

### 보안/생명주기
- `~/.purplemux/codex-hook.sh` mode 0700
- `~/.purplemux/cli-token` mode 0600 — 신규 생성 시 보장 (`fs.writeFileSync` `mode: 0o600` 옵션). overwrite 안전성은 별도 강화 항목
- `/api/status/hook` 보호: **256-bit hex 토큰(`x-pmux-token`) + `timingSafeEqual` + IP 필터(`isRequestAllowed`)**. 바인드 호스트는 사용자 `networkAccess` 설정에 따라 `127.0.0.1` 또는 `0.0.0.0`. 기본값 `'all'`이라 외부 인터페이스에 열려 있으나 토큰 없으면 403
- codex-hook.sh는 Claude hook과 동일하게 `http://localhost:${PORT}` 호출 → bind 설정 무관 loopback 도달
- 사용자 config 파싱은 trusted (외부 입력 아님)

### UX 완성도 (토스급 관점)
- TUI ready 감지에서 1-2초 대기는 사용자에게 "버튼 비활성" 형태로 보임. **로딩 indicator 표시** 권장 (CodexPanel session 체크 화면 활용).
- agent 전환 잠금 토스트는 친절한 메시지("현재 실행 중인 CLI를 먼저 종료하세요").
- 권한 요청 도착 시 즉각적인 visual cue (파란 띠/아이콘 깜박임 등) — 현재 `[ ! ] Action Required` 페인 타이틀 외에 패널 자체에서도 강조.
- 세션 목록은 시작 시간/cwd/첫 user message 미리보기 같이 — 사용자가 어떤 세션인지 빠르게 식별.

### Codex 미설치 시 UX
- 메뉴 disabled 상태에서 단순히 회색이 아닌, 클릭 시 설치 안내 토스트
- preflight 페이지에서 Codex 영역 명확히 (Claude와 시각적 동일 트리트먼트)

## 미확인 사항

### Phase 1 즉시 검증 필요
- [x] `purplemux/cli-token` 파일 권한이 실제 0600인지 — **통과** (`src/lib/cli-token.ts:23`, 디스크 `-rw-------`). overwrite 시 mode 비강제 + 부모 디렉토리 0755는 마이너 이슈로 보류
- [x] `/api/status/hook` 엔드포인트가 localhost-only 바인딩인지 — **정정**: localhost-only 아님. 기본 바인드 `0.0.0.0` + 256-bit 토큰(`x-pmux-token`) + IP 필터로 다층 보호. 보안 모델은 위 "보안/생명주기" 섹션 참조
- [x] auto-resume의 `SHELL_READY_DELAY_MS = 500ms`가 codex Rust binary 부팅에 충분한지 — **정정**: 이 상수는 **shell prompt 준비 대기**(`auto-resume.ts:10,95`, `tabs/index.ts:11,63`, `workspace/index.ts:12,60`)이지 codex 부팅 대기가 아님. send-keys는 shell이 PROMPT 그린 후 텍스트를 받아 `codex resume <id>` 실행 → 이 이후 codex 부팅은 별개 메커니즘(3-layer ready 감지 §4)으로 처리. codex 부팅 후 cliState 안정화 우려는 아래 "사용자 시나리오 검증 필요"의 ping-pong 항목으로 이관. 500ms는 zsh/bash 무거운 케이스(oh-my-zsh+p10k ~200-400ms) 기준 안전 마진 충분, Claude도 동일 값으로 이슈 없음 → 유지
- [x] `tmux send-keys cmd Enter`가 정말 atomic PTY write인지 — **이미 정당화됨**: 엄밀히는 "tmux 단일 호출 내 sequential PTY write라 한 chunk로 도달 가능성 높음"이지만, `codex.md:807-839`에서 web-input-bar 50ms 분리 패턴(`web-input-bar.tsx:236-237`)으로 분리 필요성과 Claude 영향 없음 모두 실증. `sendKeysSeparated` 헬퍼 무조건 도입 (작업 단위 "Status 보강" 행에 P0 포함). 기존 `sendKeys` callers는 모두 shell이 받는 경로라 50ms 분리 영향 없음. codex paste burst 실제 재현은 도입 후 자연 검증
- [x] composer 마커 `›` 검출이 사용자 zsh 테마와 충돌하지 않는지 — **강화 결정**: 단순 `›`/`!` substring 검색은 spaceship/oh-my-posh 일부 테마, codex 시작 직전 zsh prompt 잔상, splash/changelog의 `!` 등으로 false positive 가능. False idle 전환 시 자동 복구 안 되어 dead state 위험. → **Layer 3 조건 강화**: `(content.includes('╭') && content.includes('╰')) && (content.includes('›') || content.includes('!'))`. 박스 문자(`╭`, `╰`)는 일반 shell prompt에서 거의 안 쓰고 codex composer는 두 줄 박스 UI 사용. 비용 추가 없음 (이미 캡처한 content 재사용). 본문 §4 반영 완료

### 품질 격상 (TOP 10 기업 수준)
- [x] **Codex 토큰 사용량 추적** — **결정 완료**: 실데이터 검증 완료 (`event_msg.token_count.info.total_token_usage` — 누적 total + `cached_input_tokens`/`reasoning_output_tokens`/`model_context_window`/`rate_limits`). v19 spec에 포함 (Phase 4 stats 통합). 본문 §11.6 참조. session 단위 인디케이터(패널 footer + ContextRing 재사용)도 동일 시점 노출
- [→] **다중 provider 동시 detection 성능** — 예정 작업으로 위임. v19 출시 후 사용자 데이터 기반 측정 → 폴링 사이클 동적 조정 정책 검토.
- [→] **세션 검색/필터링** — 예정 작업으로 위임. Codex `~/.codex/sessions/YYYY/MM/DD/` 일자 파티셔닝 디렉토리 스캔 비용이 실제 사용자에게 문제 되는 시점에 SQLite state DB 활용 재평가.
- [x] **사용자 keymap 인지** — **결정 완료**: (1) Phase 1 시작 전 `codex --help` / 공식 docs로 **codex가 user config(`~/.codex/config.toml`)로 approval keymap 노출하는지** 1줄 검증. (2) 노출 안 함: caveat 자체 삭제, 본문 §9의 "응답 실패 감지(E)" 조항도 무관. (3) 노출 함: §9 명세대로 default `y`/`n` 가정 + 3초 timeout fallback 토스트. 정식 동적 매핑은 예정 작업 유지
- [x] **에러 표면화** — **결정 완료**: 본문 §10 "에러 표면화 정책" 섹션 신설. Claude 패턴(전체 페이지 / 토스트 / silent log 3단계)과 일관성 유지. A(미설치) 4중 노출(메뉴 disabled + tooltip + preflight + 패널 내 안내), B(hook 실패) 부트 1회 토스트, C(TOML 파싱 실패) first-use 1회 토스트, D/E(runtime) 즉각 toast.error. `agentInstalled` 스토어 필드 추가

### 사용자 시나리오 검증 필요
- [x] codex `/clear` 후 새 session_id로 갈아끼우는 흐름 — **결정 완료 + 명세 보강**: codex SessionStart payload의 `source: "startup"|"resume"|"clear"` 필드 활용해 §6 보강. `source='clear'` 분기에서 (1) `agentSummary`/`lastUserMessage`/`lastAssistantMessage` reset, (2) 강제 idle 전환 (race 없으니 cliState 무관). timeline 측은 codex provider `watchSessions`가 hook 채널(`globalThis.__ptCodexHookEvents`) listen → 이미 존재하는 `timeline-server.ts:791-825` 메커니즘으로 jsonl 파일 unsubscribe + 새 파일 subscribe + `timeline:session-changed` 발사 + sessionStats 자연 reset (ContextRing 0%). `~/.codex/sessions/YYYY/MM/DD/` fs.watch 회피 (자정 race + 비용)
- [x] codex `/quit` 또는 Ctrl+D 후 cliState='inactive' 복귀 (Claude도 같은 시나리오로 회귀 검증) — **메커니즘 완전, 명세 보강 불필요**: codex `chatwidget.rs:6638-6647`의 `AppEvent::Exit` → `handle_exit_mode` → process exit → shell 복귀 → tmux `set-titles-string "#{pane_current_command}\|#{pane_current_path}"` (`tmux.conf:67-68`) 자동 발동 → title이 `zsh\|/path` 형식 → §5 F2 fallback 통과 안 함 → 정상 inactive 전환. Claude `/exit`도 동일 메커니즘 + §5 새 로직(F1+F2)으로 기존 잠재 버그(busy stuck 외 일반 종료 미처리) 자연 해결. Edge case: 종료 직후 vim 같은 alternate screen TUI 즉시 실행 시 1 polling cycle(30s) 동안 cliState='idle' 잔재 가능 — 빈도 낮아 무시. 수동 검증 시나리오 8번 추가
- [x] 사용자가 자체 hook(예: `code-notify`) 등록한 환경에서 우리 머지 동작 — **결정 완료 + 정정**: codex 소스(`dispatcher.rs:88-101`) 직접 검증 결과 hook 배열은 **`join_all` 병렬 실행 + codex 본체가 await로 기다림** (`HookExecutionMode::Sync`). codex.md/PRD §3의 "async=true" 가정 정정. 머지 순서는 그대로 유지(병렬이라 의미 없지만 deterministic 출력). 사용자 hook이 stdin 소비/실패해도 각 hook은 별 프로세스 + stdin 격리라 우리 영향 없음. 사용자 hook 지연 = codex 본체 지연(우리 책임 밖, caveat 문서화). 머지 시 `logger.info('codex hooks merged: N user entries')` 디버깅 보조
- [x] auto-resume 직후 잠깐 process 미감지 윈도우가 inactive로 떨어뜨리는 ping-pong 가능성 — **결정 완료**: 본문 §5 "Agent 종료 복귀" 항목에 두 fallback 조건(F1 recent-launch grace 5초 + F2 pane title agent 형식) 명세 추가. 시나리오 S1(부팅 윈도우) F1으로 차단, S2(fork/exec 순간) F2로 차단, S3(정상 종료) shell 복귀 시 title 변경되며 정상 inactive 전환. Claude/Codex 공통 적용
- [→] `--add-dir` 같은 codex 멀티 디렉토리 옵션과 purplemux 워크스페이스 multiple directories 매핑 — 예정 작업으로 위임

### 예정 작업 (v19 외부)
- `AgentPanel` 일반화 (ClaudeCodePanel/CodexPanel 코드 중복 제거)
- `ISessionListEntry` 일반화 (Phase 2의 별도 session-list 모듈 통합)
- 다중 provider 동시 detection 성능 측정 + 폴링 사이클 동적 조정
- 세션 검색/필터링 (디렉토리 스캔 비용 ↑ 시 SQLite state DB 활용)
- `--add-dir` 같은 codex 멀티 디렉토리 옵션 매핑
- **Timeline streaming/delta rendering** — `AgentMessageDelta`, `AgentReasoningDelta`, `AgentReasoningRawContent`, `AgentReasoningRawContentDelta`, `AgentReasoningSectionBreak` 처리. v19은 final value만 표시, 예정 작업(v19 외부)에서 incremental UI rendering 추가 (큰 작업 — UI 상태 머신, scroll 관리, partial markdown rendering 등)
- **Timeline 추가 EventMsg 매핑** (가치 있지만 v19 비대상):
  - `ModelReroute` / `ModelVerification` / `DeprecationNotice` — 모델 변경 알림 (토스트로 fallback 가능)
  - `ThreadRolledBack` — conversation 롤백 표시
  - `TurnDiff` — turn 단위 종합 diff
  - `ThreadNameUpdated` / `ThreadGoalUpdated` — session-meta-cache 갱신용
  - `ImageGenerationBegin/End`, `ViewImageToolCall` — DALL-E 등 이미지 생성
  - `UndoStarted/Completed` — undo 기능
  - `ElicitationRequest`, `DynamicToolCallRequest/Response` — MCP elicitation, 동적 tool
  - `RealtimeConversation*` (4개) — codex realtime voice 기능
  - `GuardianAssessment` — guardian 자동 검토 (별도 UI)
  - `BackgroundEvent`, `RawResponseItem`, `ItemStarted/Completed`, `HookStarted/Completed`, `McpStartupUpdate/Complete`, `*ListResponse`, `SkillsUpdateAvailable` — 디버깅용/낮은 가치
- **PreToolUse/PostToolUse hook → currentAction** (codex hook 미등록, status-manager 무시)
- 사용자 keymap 동적 인지 (Phase 2는 default `y`/`n` + 3초 timeout fallback)

## 작업 단계 요약 (재확인)

| Phase | 결과물 | 수동 검증 |
| --- | --- | --- |
| 1 | provider 코어 + hook 인프라 + status 보강 + 에러 표면화. Codex가 터미널 모드로 정상 동작. | 시나리오 1-7 (codex.md "수동 검증 시나리오") |
| 2 | UI 1급 시민화. CodexPanel(타임라인 placeholder) + 메뉴 + 단축키 + 세션 목록 + 권한 응답. | 시나리오 4(권한), 5(/clear), UI 흐름 |
| 3 | jsonl 파서(Codex) + ITimelineEntry 6개 신규 + 컴포넌트 6개 신규 + timeline-server 분기. CodexPanel placeholder 제거 → 정식 timeline 표시. | 시나리오: 풀 turn(reasoning + tool-call + agent-message), exec_command stream, web-search, mcp tool, patch-apply, approval-request 표시 |
| 4 | session-history Codex 통합 + stats 일반화(token + rate_limits) + observer 정식 구독. | 시나리오: stats 페이지에서 Claude/Codex 합산 + Codex rate_limits 노출, 패널 footer ContextRing |


## 追加需求：工作区菜单顺序统一（2026-09-28）

| Feature | 页面 | 优先级 | Phase |
| --- | --- | --- | --- |
| workspace-menu-order | `/` 桌面工作区和移动导航菜单 | P2 | 5 |

两端按创建 Git 子任务、管理 Worktree、移动分组、重命名排列。移动端从组合编辑入口拆出分组与名称操作；删除仍在末尾，子工作区分组操作禁用。已有词条、页头编辑功能、API 与工作树行为保持兼容。

用户明确要求按该顺序完成实现，无待确认项。详细验收见 [workspace-menu-order spec](./features/workspace-menu-order/spec.md)。

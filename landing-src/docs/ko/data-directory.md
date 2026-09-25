---
title: 데이터 디렉토리
description: ~/.purplemux/ 안에 무엇이 있고, 무엇을 지워도 되며, 어떻게 백업하는지.
eyebrow: 레퍼런스
permalink: /ko/docs/data-directory/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux-improved가 유지하는 모든 영구 상태 — 설정, 레이아웃, 세션 히스토리, 캐시 — 는 `~/.purplemux/` 한 곳에만 저장됩니다. `localStorage`, 시스템 키체인, 외부 서비스 모두 사용하지 않습니다.

## 한눈에 보는 구조

```
~/.purplemux/
├── config.json              # 앱 설정 (인증, 테마, 로케일, …)
├── workspaces.json          # 워크스페이스 목록 + 사이드바 상태
├── workspaces/
│   └── {wsId}/
│       ├── layout.json           # pane/tab 트리
│       ├── message-history.json  # 워크스페이스별 입력 히스토리
│       └── claude-prompt.md      # --append-system-prompt-file 내용
├── hooks.json               # Claude Code 훅 + statusline 설정 (자동 생성)
├── status-hook.sh           # 훅 스크립트 (자동 생성, 0755)
├── statusline.sh            # statusline 스크립트 (자동 생성, 0755)
├── rate-limits.json         # 가장 최근 statusline JSON
├── session-history.json     # 완료된 Claude 세션 로그 (워크스페이스 횡단)
├── quick-prompts.json       # 커스텀 quick prompts + 비활성 빌트인
├── sidebar-items.json       # 커스텀 사이드바 항목 + 비활성 빌트인
├── vapid-keys.json          # Web Push VAPID 키페어 (자동 생성)
├── push-subscriptions.json  # Web Push 구독 정보
├── cli-token                # CLI 인증 토큰 (자동 생성)
├── port                     # 현재 서버 포트
├── pmux.lock                # 단일 인스턴스 락 {pid, port, startedAt}
├── logs/                    # pino-roll 로그 파일
├── uploads/                 # 채팅 입력바로 첨부된 이미지
└── stats/                   # Claude 사용량 통계 캐시
```

비밀이 포함된 파일(설정, 토큰, 레이아웃, VAPID 키, 락)은 `0600` 모드로, `tmpFile → rename` 패턴으로 기록합니다.

## 최상위 파일

| 파일 | 저장 내용 | 삭제해도 되는가 |
|---|---|---|
| `config.json` | scrypt 해시 로그인 비밀번호, 세션 HMAC 시크릿, 테마, 로케일, 폰트 사이즈, 알림 토글, 에디터 URL, 네트워크 접근 정책, 커스텀 CSS | 가능 — 온보딩이 다시 진행됨 |
| `workspaces.json` | 워크스페이스 인덱스, 사이드바 너비/접힘 상태, 활성 워크스페이스 ID | 가능 — 워크스페이스와 탭이 모두 사라짐 |
| `hooks.json` | Claude Code `--settings` 매핑 (이벤트 → 스크립트) + `statusLine.command` | 가능 — 다음 시작 시 재생성 |
| `status-hook.sh`, `statusline.sh` | `x-pmux-token` 헤더로 `/api/status/hook`·`/api/status/statusline`에 POST | 가능 — 다음 시작 시 재생성 |
| `rate-limits.json` | 최신 Claude statusline JSON: `ts`, `model`, `five_hour`, `seven_day`, `context`, `cost` | 가능 — Claude 동작 시 다시 채워짐 |
| `session-history.json` | 마지막 200개의 완료된 Claude 세션 (프롬프트, 결과, 시간, 도구, 파일) | 가능 — 히스토리 초기화 |
| `quick-prompts.json`, `sidebar-items.json` | 빌트인 위에 얹는 `{ custom: […], disabledBuiltinIds: […], order: […] }` 오버레이 | 가능 — 기본값으로 복원 |
| `vapid-keys.json` | 첫 실행 시 생성되는 Web Push VAPID 키페어 | 권장 안 함 — 함께 `push-subscriptions.json`도 지워야 함 (기존 구독 깨짐) |
| `push-subscriptions.json` | 브라우저별 푸시 엔드포인트 | 가능 — 각 디바이스에서 다시 구독 필요 |
| `cli-token` | `purplemux-improved` CLI와 훅 스크립트가 사용하는 32바이트 hex 토큰 (`x-pmux-token` 헤더) | 가능 — 다음 시작 시 재생성. 이미 만들어진 훅 스크립트는 서버가 덮어쓸 때까지 옛 토큰 사용 |
| `port` | 평문 현재 포트, 훅 스크립트와 CLI가 읽음 | 가능 — 다음 시작 시 재생성 |
| `pmux.lock` | 단일 인스턴스 가드 `{ pid, port, startedAt }` | purplemux-improved 프로세스가 살아있지 않을 때만 |

{% call callout('warning', '락 파일 주의사항') %}
purplemux-improved가 "already running"이라며 시작을 거부하지만 실제 프로세스가 없다면 `pmux.lock`이 stale 상태입니다. `rm ~/.purplemux/pmux.lock` 후 다시 시도하세요. 과거에 `sudo`로 실행한 적이 있다면 락 파일 소유자가 root일 수 있으니 `sudo rm`로 한 번 정리합니다.
{% endcall %}

## 워크스페이스별 디렉토리 (`workspaces/{wsId}/`)

각 워크스페이스는 자동 생성된 ID를 이름으로 갖는 폴더 하나를 사용합니다.

| 파일 | 내용 |
|---|---|
| `layout.json` | 재귀적 pane/tab 트리: leaf `pane`은 `tabs[]`, `split`은 `ratio`와 `children[]`. 각 탭은 tmux 세션 이름(`pt-{wsId}-{paneId}-{tabId}`), 캐시된 `cliState`, `claudeSessionId`, 마지막 resume 커맨드를 보관 |
| `message-history.json` | 워크스페이스별 Claude 입력 히스토리. 최대 500건 |
| `claude-prompt.md` | 해당 워크스페이스의 모든 Claude 탭에 전달되는 `--append-system-prompt-file` 내용. 워크스페이스 생성/이름변경/디렉토리 변경 시 재생성 |

특정 워크스페이스의 레이아웃만 초기화하려면 다른 워크스페이스를 건드리지 않고 `workspaces/{wsId}/layout.json`만 삭제하면 됩니다 (기본 pane으로 복원).

## `logs/`

pino-roll 출력. UTC 기준 하루에 한 파일, 크기 한도를 넘으면 숫자 접미사가 붙습니다.

```
logs/purplemux.2026-04-19.1.log
```

기본 레벨은 `info`. `LOG_LEVEL`로 전체를, `LOG_LEVELS`로 모듈별로 조정합니다 — 자세한 내용은 [포트 & 환경변수](/purplemux-improved/ko/docs/ports-env-vars/) 참고.

로그는 7일 분량까지 자동 로테이트됩니다. 언제든 지워도 괜찮습니다.

## `uploads/`

채팅 입력바에 첨부한 이미지(드래그/붙여넣기/클립 버튼):

```
uploads/{wsId}/{tabId}/{timestamp}-{rand}-{name}.{ext}
```

- 허용 MIME: `image/png`, `image/jpeg`, `image/gif`, `image/webp`
- 최대 10 MB, 모드 `0600`
- 서버 시작 시 자동 청소: 24시간 이상 된 파일은 삭제
- 수동 청소: **설정 → 시스템 → 첨부 이미지 → 지금 정리**

## `stats/`

순수 캐시. `~/.claude/projects/**/*.jsonl`을 기반으로 계산하며, purplemux-improved는 해당 디렉토리를 읽기만 합니다.

| 파일 | 내용 |
|---|---|
| `cache.json` | 일별 집계: 메시지, 세션, 도구 호출, 시간대별 카운트, 모델별 토큰 사용량 |
| `uptime-cache.json` | 일별 uptime/액티브 분 집계 |
| `daily-reports/{YYYY-MM-DD}.json` | AI 생성 데일리 브리프 |

폴더를 통째로 지우면 다음 통계 요청 시 재계산됩니다.

## 리셋 매트릭스

| 초기화 대상 | 삭제 |
|---|---|
| 로그인 비밀번호 (재온보딩) | `config.json` |
| 모든 워크스페이스와 탭 | `workspaces.json` + `workspaces/` |
| 한 워크스페이스의 레이아웃 | `workspaces/{wsId}/layout.json` |
| 사용량 통계 | `stats/` |
| 푸시 구독 | `push-subscriptions.json` |
| "already running" 멈춤 | `pmux.lock` (프로세스가 없을 때만) |
| 전체 (공장 초기화) | `~/.purplemux/` |

`hooks.json`, `status-hook.sh`, `statusline.sh`, `port`, `cli-token`, `vapid-keys.json`은 모두 다음 시작 시 자동 재생성되므로 지워도 무해합니다.

## 백업

전체가 평문 JSON과 몇 개의 셸 스크립트입니다. 백업:

```bash
tar czf purplemux-backup.tgz -C ~ .purplemux
```

새 머신에서 복원하려면 untar 후 purplemux-improved를 시작합니다. 훅 스크립트는 새 서버 포트로 재작성되고, 워크스페이스·히스토리·설정은 그대로 옮겨집니다.

{% call callout('warning') %}
`pmux.lock`은 복원하지 마세요 — 특정 PID에 묶여 있어서 시작을 막습니다. `--exclude pmux.lock`으로 제외하세요.
{% endcall %}

## 전체 삭제

```bash
rm -rf ~/.purplemux
```

먼저 purplemux-improved가 실행 중이지 않은지 확인하세요. 다음 실행은 첫 실행 경험으로 다시 시작됩니다.

## 다음으로

- **[포트 & 환경변수](/purplemux-improved/ko/docs/ports-env-vars/)** — 이 디렉토리에 영향을 주는 모든 변수
- **[아키텍처](/purplemux-improved/ko/docs/architecture/)** — 파일들이 실행 중인 서버와 어떻게 연결되는지
- **[문제 해결](/purplemux-improved/ko/docs/troubleshooting/)** — 자주 마주치는 이슈와 해결법

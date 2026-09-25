---
title: 포트 & 환경변수
description: purplemux-improved가 여는 모든 포트와 동작에 영향을 주는 모든 환경변수.
eyebrow: 레퍼런스
permalink: /ko/docs/ports-env-vars/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux-improved는 한 줄 설치를 지향하지만, 런타임은 설정으로 조정할 수 있습니다. 이 페이지는 서버가 여는 포트와 읽는 환경변수를 모두 정리합니다.

## 포트

| 포트 | 기본 | 변경 | 비고 |
|---|---|---|---|
| HTTP + WebSocket | `8022` | `PORT=9000 purplemux-improved` | `8022`이 사용 중이면 경고 로그 후 임의의 빈 포트로 바인드합니다. |
| 내부 Next.js (production) | random | — | `pnpm start` / `purplemux-improved start`에서는 외부 서버가 `127.0.0.1:<random>`으로 떠 있는 Next.js standalone에 프록시합니다. 외부 노출 X. |

`8022`는 `web` + `ssh`를 합친 농담입니다. 프로토콜과는 무관합니다.

{% call callout('note', '바인딩되는 인터페이스는 접근 정책을 따름') %}
purplemux-improved는 외부 클라이언트를 실제로 허용할 때만 `0.0.0.0`에 바인드합니다. localhost 전용 설정에서는 `127.0.0.1`에 바인드해서 LAN의 다른 머신은 TCP 연결 자체가 불가능합니다. 아래 `HOST` 항목 참고.
{% endcall %}

## 서버 환경변수

`server.ts`와 부팅 시 로드되는 모듈들이 읽습니다.

| 변수 | 기본 | 효과 |
|---|---|---|
| `PORT` | `8022` | HTTP/WS 리슨 포트. `EADDRINUSE` 시 임의의 포트로 폴백. |
| `HOST` | unset | 어떤 클라이언트를 허용할지 정하는 CIDR/키워드 spec(콤마 구분). 키워드: `localhost`, `tailscale`, `lan`, `all` (또는 `*` / `0.0.0.0`). 예: `HOST=localhost`, `HOST=localhost,tailscale`, `HOST=10.0.0.0/8,localhost`. env로 지정하면 앱 안의 **설정 → 네트워크 접근** 항목이 잠깁니다. |
| `NODE_ENV` | `purplemux-improved start`는 `production`, `pnpm dev`는 `development` | 개발 파이프라인(`tsx watch`, Next dev)과 production 파이프라인(`tsup` 번들 + Next standalone 프록시) 선택. |
| `__PMUX_APP_DIR` | `process.cwd()` | `dist/server.js`와 `.next/standalone/`이 있는 디렉토리를 덮어씀. `bin/purplemux.js`가 자동 설정하므로 보통 건드릴 필요 없음. |
| `__PMUX_APP_DIR_UNPACKED` | unset | macOS Electron 앱의 asar-unpacked 경로용 `__PMUX_APP_DIR` 변형. |
| `__PMUX_ELECTRON` | unset | Electron 메인 프로세스가 서버를 in-process로 시작할 때 설정. `server.ts`의 자동 `start()` 호출을 막아 Electron이 라이프사이클을 제어. |
| `PURPLEMUX_CLI` | `bin/purplemux.js`가 `1` 세팅 | 공유 모듈에 현재 프로세스가 CLI/서버임을 알리는 마커. `pristine-env.ts`에서 사용. |
| `__PMUX_PRISTINE_ENV` | unset | `bin/purplemux.js`가 캡처한 부모 셸 env의 JSON 스냅샷. 자식 프로세스(claude, tmux)가 sanitize된 게 아닌 사용자 `PATH`를 상속하도록. 내부용 — 자동 설정. |
| `AUTH_PASSWORD` | unset | 서버가 `config.json`의 scrypt 해시로부터 Next 시작 전에 설정. NextAuth가 거기서 읽음. 직접 설정하지 말 것. |
| `NEXTAUTH_SECRET` | unset | 같은 방식 — 시작 시 `config.json`에서 채워짐. |

## 로깅 환경변수

`src/lib/logger.ts`가 읽습니다.

| 변수 | 기본 | 효과 |
|---|---|---|
| `LOG_LEVEL` | `info` | `LOG_LEVELS`에 명시되지 않은 모든 모듈의 루트 레벨. |
| `LOG_LEVELS` | unset | 콤마로 구분된 `name=level` 쌍으로 모듈별 오버라이드. |

레벨 순서: `trace` · `debug` · `info` · `warn` · `error` · `fatal`.

```bash
LOG_LEVEL=debug purplemux-improved

# Claude 훅 모듈만 debug
LOG_LEVELS=hooks=debug purplemux-improved

# 여러 모듈 한 번에
LOG_LEVELS=hooks=debug,status=warn,tmux=trace purplemux-improved
```

자주 쓰는 모듈명:

| 모듈 | 소스 | 보이는 내용 |
|---|---|---|
| `hooks` | `pages/api/status/hook.ts`, `status-manager.ts` 일부 | 훅 수신/처리/상태 전이 |
| `status` | `status-manager.ts` | 폴링, JSONL watcher, 브로드캐스트 |
| `tmux` | `lib/tmux.ts` | 모든 tmux 커맨드와 결과 |
| `server`, `lock` 등 | 대응되는 `lib/*.ts` | 프로세스 라이프사이클 |

레벨과 무관하게 로그 파일은 `~/.purplemux/logs/` 아래에 떨어집니다.

## 파일 (env 등가물)

환경변수처럼 동작하지만 디스크에 저장되어, env 핸드셰이크 없이 CLI와 훅 스크립트가 찾을 수 있는 값들:

| 파일 | 보관 내용 | 사용처 |
|---|---|---|
| `~/.purplemux/port` | 현재 서버 포트 (평문) | `bin/cli.js`, `status-hook.sh`, `statusline.sh` |
| `~/.purplemux/cli-token` | 32바이트 hex CLI 토큰 | `bin/cli.js`, 훅 스크립트들 (`x-pmux-token`로 전송) |

CLI는 env로도 받으며 env가 우선합니다:

| 변수 | 기본 | 효과 |
|---|---|---|
| `PMUX_PORT` | `~/.purplemux/port` 내용 | CLI가 통신할 포트 |
| `PMUX_TOKEN` | `~/.purplemux/cli-token` 내용 | `x-pmux-token`으로 보낼 베어러 토큰 |

전체 사용법은 [CLI 레퍼런스](/purplemux-improved/ko/docs/cli-reference/)를 참고하세요.

## 조합 예시

자주 쓰는 패턴:

```bash
# 기본: localhost 전용, 포트 8022
purplemux-improved

# 모든 인터페이스 바인드 (LAN + Tailscale + 외부)
HOST=all purplemux-improved

# localhost + Tailscale만
HOST=localhost,tailscale purplemux-improved

# 커스텀 포트 + 훅 상세 추적
PORT=9000 LOG_LEVELS=hooks=debug purplemux-improved

# 디버깅용 풀세트
PORT=9000 HOST=localhost LOG_LEVEL=debug LOG_LEVELS=tmux=trace purplemux-improved
```

{% call callout('tip') %}
영구 설치라면 launchd / systemd 유닛의 `Environment=` 블록에 넣으세요. 유닛 파일 예시는 [설치](/purplemux-improved/ko/docs/installation/#자동-시작)에서.
{% endcall %}

## 다음으로

- **[설치](/purplemux-improved/ko/docs/installation/)** — 이 변수들이 보통 어디에 들어가는지
- **[데이터 디렉토리](/purplemux-improved/ko/docs/data-directory/)** — `port`와 `cli-token`이 훅 스크립트와 어떻게 맞물리는지
- **[CLI 레퍼런스](/purplemux-improved/ko/docs/cli-reference/)** — `PMUX_PORT` / `PMUX_TOKEN` 사용 맥락

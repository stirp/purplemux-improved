---
title: CLI 레퍼런스
description: purplemux-improved와 pmux 바이너리의 모든 서브커맨드와 플래그.
eyebrow: 레퍼런스
permalink: /ko/docs/cli-reference/index.html
---
{% from "docs/callouts.njk" import callout %}

`purplemux-improved`는 한 바이너리를 두 가지 방식으로 사용합니다: 서버 시작 (`purplemux-improved` / `purplemux-improved start`)과, 실행 중인 서버에 말을 거는 HTTP API 래퍼 (`purplemux-improved <subcommand>`). 짧은 별칭 `pmux`도 동일합니다.

## 한 바이너리, 두 역할

| 형태 | 역할 |
|---|---|
| `purplemux-improved` | 서버 시작. `purplemux-improved start`와 동일. |
| `purplemux-improved <subcommand>` | 실행 중인 서버의 CLI HTTP API와 통신. |
| `pmux ...` | `purplemux-improved ...`의 별칭. |

`bin/purplemux.js`의 디스패처가 첫 인자를 보고 결정합니다: 알려진 서브커맨드면 `bin/cli.js`로 라우팅, 그 외(또는 인자 없음)이면 서버를 시작합니다.

## 서버 시작

```bash
purplemux-improved              # 기본
purplemux-improved start        # 같은 동작, 명시적
PORT=9000 purplemux-improved    # 커스텀 포트
HOST=all purplemux-improved     # 모든 인터페이스 바인드
```

전체 env는 [포트 & 환경변수](/purplemux-improved/ko/docs/ports-env-vars/) 참고.

서버는 바인드된 URL, 모드, 인증 상태를 출력합니다:

```
  ⚡ purplemux-improved  v0.x.x
  ➜  Available on:
       http://127.0.0.1:8022
       http://192.168.1.42:8022
  ➜  Mode:   production
  ➜  Auth:   configured
```

`8022`이 사용 중이면 경고 후 임의의 빈 포트로 바인드합니다.

## 서브커맨드

모든 서브커맨드는 실행 중인 서버를 필요로 합니다. 포트는 `~/.purplemux/port`에서, 인증 토큰은 `~/.purplemux/cli-token`에서 읽습니다 — 둘 다 서버 시작 시 자동으로 생성됩니다.

| 명령 | 역할 |
|---|---|
| `purplemux-improved workspaces` | 워크스페이스 목록 |
| `purplemux-improved tab list [-w WS]` | 탭 목록 (워크스페이스 범위로 좁히기 가능) |
| `purplemux-improved tab create -w WS [-n NAME] [-t TYPE]` | 새 탭 생성 |
| `purplemux-improved tab send -w WS TAB_ID CONTENT...` | 탭에 입력 전송 |
| `purplemux-improved tab status -w WS TAB_ID` | 탭 상태 조회 |
| `purplemux-improved tab result -w WS TAB_ID` | 탭 pane의 현재 내용 캡처 |
| `purplemux-improved tab close -w WS TAB_ID` | 탭 닫기 |
| `purplemux-improved tab browser ...` | `web-browser` 탭 제어 (Electron 전용) |
| `purplemux-improved api-guide` | 전체 HTTP API 레퍼런스 출력 |
| `purplemux-improved help` | 사용법 출력 |

별도 표기가 없으면 출력은 JSON. `--workspace`와 `-w`는 호환됩니다.

### `tab create` 패널 타입

`-t` / `--type` 플래그로 패널 타입을 선택합니다. 유효한 값:

| 값 | 패널 |
|---|---|
| `terminal` | 일반 셸 |
| `claude-code` | `claude`가 이미 실행된 셸 |
| `web-browser` | 임베디드 브라우저 (Electron 전용) |
| `diff` | Git diff 패널 |

`-t` 미지정 시 일반 터미널.

### `tab browser` 서브커맨드

탭의 패널 타입이 `web-browser`일 때만, 그리고 macOS Electron 앱에서만 동작합니다 — 그 외에는 브리지가 503을 반환합니다.

| 서브커맨드 | 반환 |
|---|---|
| `purplemux-improved tab browser url -w WS TAB_ID` | 현재 URL + 페이지 타이틀 |
| `purplemux-improved tab browser screenshot -w WS TAB_ID [-o FILE] [--full]` | PNG. `-o`이면 디스크 저장, 없으면 base64. `--full`은 전체 페이지. |
| `purplemux-improved tab browser console -w WS TAB_ID [--since MS] [--level LEVEL]` | 최근 콘솔 엔트리 (링 버퍼, 500개) |
| `purplemux-improved tab browser network -w WS TAB_ID [--since MS] [--method M] [--url SUBSTR] [--status CODE] [--request ID]` | 최근 네트워크 엔트리, `--request ID`로 단일 본문 조회 |
| `purplemux-improved tab browser eval -w WS TAB_ID EXPR` | JS 표현식 평가 후 직렬화 결과 반환 |

## 예시

```bash
# 워크스페이스 찾기
purplemux-improved workspaces

# ws-MMKl07 워크스페이스에 Claude 탭 생성
purplemux-improved tab create -w ws-MMKl07 -t claude-code -n "refactor auth"

# 프롬프트 전송 (TAB_ID는 `tab list`에서)
purplemux-improved tab send -w ws-MMKl07 tb-abc "Refactor src/lib/auth.ts to remove the cookie path"

# 상태 확인
purplemux-improved tab status -w ws-MMKl07 tb-abc

# pane 스냅샷
purplemux-improved tab result -w ws-MMKl07 tb-abc

# web-browser 탭 전체 페이지 스크린샷
purplemux-improved tab browser screenshot -w ws-MMKl07 tb-xyz -o page.png --full
```

## 인증

모든 서브커맨드는 `x-pmux-token: $(cat ~/.purplemux/cli-token)`을 보내고, 서버는 `timingSafeEqual`로 검증합니다. `~/.purplemux/cli-token`은 첫 서버 시작 시 `randomBytes(32)`로 생성되어 모드 `0600`로 저장됩니다.

`~/.purplemux/`를 볼 수 없는 다른 셸이나 스크립트에서 CLI를 구동해야 한다면 env로 직접 주입할 수 있습니다:

| 변수 | 기본 | 효과 |
|---|---|---|
| `PMUX_PORT` | `~/.purplemux/port` 내용 | CLI가 통신할 포트 |
| `PMUX_TOKEN` | `~/.purplemux/cli-token` 내용 | `x-pmux-token`으로 보낼 베어러 토큰 |

```bash
PMUX_PORT=8022 PMUX_TOKEN=$(cat ~/.purplemux/cli-token) purplemux-improved workspaces
```

{% call callout('warning') %}
CLI 토큰은 서버에 대한 전체 접근 권한을 부여합니다. 비밀번호처럼 다루세요. 채팅에 붙여넣거나 커밋하거나 빌드 env 변수로 노출하지 마세요. 갱신은 `~/.purplemux/cli-token`을 지우고 서버를 재시작하면 됩니다.
{% endcall %}

## update-notifier

`purplemux-improved`는 매 실행 시 `update-notifier`로 npm에서 최신 버전을 확인하고, 새 버전이 있으면 배너를 출력합니다. 끄려면 `NO_UPDATE_NOTIFIER=1` 또는 [표준 `update-notifier` opt-out 설정](https://github.com/yeoman/update-notifier#user-settings)을 사용하세요.

## 전체 HTTP API

`purplemux-improved api-guide`를 실행하면 모든 `/api/cli/*` 엔드포인트의 완전한 HTTP API 레퍼런스(요청 본문과 응답 형태 포함)를 출력합니다 — `curl` 등 다른 런타임에서 직접 구동할 때 유용합니다.

## 다음으로

- **[포트 & 환경변수](/purplemux-improved/ko/docs/ports-env-vars/)** — 더 큰 env 표면 안에서의 `PMUX_PORT` / `PMUX_TOKEN`
- **[아키텍처](/purplemux-improved/ko/docs/architecture/)** — CLI가 실제로 통신하는 대상
- **[문제 해결](/purplemux-improved/ko/docs/troubleshooting/)** — CLI가 "is the server running?"이라고 할 때

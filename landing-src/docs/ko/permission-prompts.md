---
title: 권한 프롬프트
description: purplemux-improved가 Claude Code의 "이거 실행해도 됩니까?" 다이얼로그를 가로채서, 대시보드·키보드·휴대폰 어디서든 승인할 수 있게 합니다.
eyebrow: Claude Code
permalink: /ko/docs/permission-prompts/index.html
---
{% from "docs/callouts.njk" import callout %}

Claude Code는 기본적으로 권한 다이얼로그에서 멈춥니다 — 툴 호출, 파일 쓰기 등에서. purplemux-improved는 이런 다이얼로그가 뜨는 순간 가로채서, 사용자가 어떤 디바이스 앞에 있든 그쪽으로 라우팅합니다.

## 무엇이 가로채지는가

Claude Code는 여러 이유로 `Notification` hook을 fire합니다. purplemux-improved는 다음 두 가지 notification type만 권한 프롬프트로 취급합니다:

- `permission_prompt` — 표준 "이 툴 실행을 허용할까요?" 다이얼로그
- `worker_permission_prompt` — 서브 에이전트에서 오는 같은 종류

그 외(idle 알림 등)는 상태 측에서 무시되며 **needs-input**으로 전환되거나 푸시를 보내지 않습니다.

## 어떤 일이 일어나는가

1. Claude Code가 `Notification` hook을 emit합니다. `~/.purplemux/status-hook.sh` 스크립트가 이벤트와 notification type을 로컬 서버로 POST합니다.
2. 서버가 탭 상태를 **needs-input** (호박색 펄스)으로 전환하고 status WebSocket으로 변경을 broadcast합니다.
3. 대시보드는 Claude가 제시한 옵션을 그대로 가지고 **타임라인 인라인**으로 프롬프트를 렌더링합니다 — 모달도, 컨텍스트 전환도 없습니다.
4. 알림 권한을 허용한 상태라면 `needs-input`에 대한 Web Push 또는 데스크탑 알림이 fire됩니다.

Claude CLI 자체는 여전히 stdin을 기다리고 있습니다. purplemux-improved가 tmux에서 프롬프트의 옵션을 읽고, 사용자가 선택한 값을 다시 전달해주는 구조입니다.

## 응답하는 방법

세 가지 방법 모두 동등합니다:

- 타임라인의 옵션을 **클릭**
- 옵션 인덱스에 해당하는 **숫자 키** — <kbd>1</kbd>, <kbd>2</kbd>, <kbd>3</kbd>
- 휴대폰에서 **푸시 탭** — 해당 탭으로 deep-link되며, 거기서 한 번 탭으로 선택

선택하면 purplemux-improved가 입력을 tmux로 보내고, 탭은 다시 **busy**로 돌아가고, Claude는 멈췄던 지점에서 재개합니다. 별도의 acknowledgement는 필요 없습니다 — 클릭이 곧 ack입니다.

{% call callout('tip', '연속 프롬프트는 자동 갱신') %}
Claude가 연속해서 여러 질문을 하면, 다음 `Notification`이 도착하는 즉시 인라인 프롬프트가 새 옵션으로 다시 렌더링됩니다. 이전 것을 dismiss할 필요가 없습니다.
{% endcall %}

## 모바일 흐름

PWA가 설치되어 있고 알림 권한이 허용되어 있으면, 브라우저 탭이 열려 있든 백그라운드든 닫혀 있든 Web Push가 fire됩니다:

- 알림 내용은 "Input Required"이며 어떤 세션인지 식별됩니다
- 탭하면 해당 탭에 포커스된 상태로 purplemux-improved가 열립니다
- 인라인 프롬프트가 이미 렌더링되어 있어 한 번 탭으로 선택 가능

이것이 [Tailscale + PWA](/purplemux-improved/ko/docs/quickstart/#휴대폰에서-접근) 설정의 가장 큰 이유입니다 — 책상을 떠나 있어도 승인이 따라옵니다.

## 옵션을 파싱하지 못한 경우

드물게 (purplemux-improved가 읽기 전에 프롬프트가 tmux 스크롤백 밖으로 밀려난 경우) 옵션 목록이 비어서 돌아옵니다. 타임라인은 "프롬프트를 읽지 못함" 카드를 보여주며 백오프를 두고 4번까지 재시도합니다. 그래도 실패하면 해당 탭을 **Terminal** 모드로 전환해서 raw CLI에서 응답하세요 — Claude 프로세스는 여전히 기다리고 있습니다.

## idle 알림은?

Claude의 다른 notification type — 예를 들어 idle 리마인더 — 은 hook 엔드포인트에 그대로 도착합니다. 서버는 이를 로깅만 하며, 탭 상태를 바꾸거나 푸시를 보내거나 UI 프롬프트를 띄우지 않습니다. 의도된 동작입니다: **Claude를 멈추는** 이벤트만 사용자의 주의를 끌 가치가 있습니다.

## 다음으로

- **[세션 상태](/purplemux-improved/ko/docs/session-status/)** — **needs-input** 상태의 의미와 감지 방식
- **[라이브 세션 뷰](/purplemux-improved/ko/docs/live-session-view/)** — 인라인 프롬프트가 렌더링되는 곳
- **[브라우저 지원](/purplemux-improved/ko/docs/browser-support/)** — Web Push 요구사항 (특히 iOS Safari 16.4+)

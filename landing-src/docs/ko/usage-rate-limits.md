---
title: 사용량 & 요금 제한
description: 사이드바의 실시간 5시간/7일 rate limit 카운트다운, 그리고 토큰·비용·프로젝트 분석을 위한 통계 대시보드.
eyebrow: Claude Code
permalink: /ko/docs/usage-rate-limits/index.html
---
{% from "docs/callouts.njk" import callout %}

작업 도중에 rate limit에 걸리는 것만큼 끔찍한 인터럽트는 없습니다. purplemux-improved는 Claude Code의 quota 수치를 사이드바로 끌어오고, 사용 패턴을 한눈에 볼 수 있도록 통계 대시보드를 추가합니다.

## 사이드바 위젯

사이드바 하단에 두 개의 얇은 바가 있습니다: **5h**와 **7d**. 각각 다음을 보여줍니다:

- 윈도우 사용 비율
- 다음 reset까지 남은 시간
- 현재 페이스를 유지할 때 도달할 수치를 가리키는 옅은 projection 바

마우스를 올리면 전체 분석이 표시됩니다 — used percentage, projected percentage, reset 시간을 상대 표현으로.

수치는 Claude Code 자체의 statusline JSON에서 옵니다. purplemux-improved는 `~/.purplemux/statusline.sh`라는 작은 스크립트를 설치해, Claude가 statusline을 갱신할 때마다 데이터를 로컬 서버로 POST하도록 합니다. `fs.watch`가 UI를 동기 상태로 유지합니다.

## 색상 임계값

두 바 모두 사용 비율에 따라 색이 변합니다:

| 사용량 | 색상 |
|---|---|
| 0–49 % | teal — 여유 |
| 50–79 % | amber — 페이스 조절 |
| 80–100 % | red — 곧 한계 |

임계값은 랜딩 페이지의 rate limit 위젯과 동일합니다. amber를 몇 번 보고 나면 사이드바는 의식 외곽의 페이싱 도구가 됩니다 — 의식하지는 않지만 윈도우에 맞춰 작업을 분산하기 시작하게 됩니다.

{% call callout('tip', '비율보다 projection이 우선') %}
solid 바 뒤의 옅은 바가 projection입니다 — 현재 페이스를 유지할 때 reset 시점에서의 위치. 실제 사용량보다 한참 먼저 projection이 80%를 넘는 것을 보는 것이 가장 깔끔한 조기 경고입니다.
{% endcall %}

## 통계 대시보드

사이드바에서 또는 <kbd>⌘⇧U</kbd>로 대시보드를 엽니다. 위에서 아래로 5개 섹션:

### 오버뷰 카드

4개의 카드: **총 세션**, **총 비용**, **오늘 비용**, **이번 달 비용**. 각 카드에는 이전 기간 대비 변화율이 녹색/빨간색으로 표시됩니다.

### 모델별 토큰 사용량

일자별 stacked bar chart. 모델별, 토큰 타입별로 분리됩니다 — input, output, cache reads, cache writes. 모델 범례는 Claude의 표시 이름(Opus / Sonnet / Haiku)을 사용하며 사이드바 바와 같은 색상 체계를 따릅니다.

예상치 못한 비용 spike가 Opus가 많았던 날 때문이었는지, 또는 cache reads가 대부분의 일을 하고 있는지 등을 가장 쉽게 확인할 수 있는 곳입니다.

### 프로젝트별 분석

사용한 모든 Claude Code 프로젝트(작업 디렉토리)에 대한 표 — 세션, 메시지, 토큰, 비용. 행을 클릭하면 해당 프로젝트만의 일자별 차트를 볼 수 있습니다.

공유 머신이나 클라이언트 작업과 개인 hack을 분리해야 할 때 유용합니다.

### 활동 & 스트릭

최근 30일의 일자별 활동 area chart, 그리고 4가지 스트릭 메트릭:

- **최장 스트릭** — 연속 작업일 최고 기록
- **현재 스트릭** — 지금 며칠 연속 작업 중
- **총 활동일** — 기간 내 카운트
- **하루 평균 세션 수**

### 주간 타임라인

최근 일주일에 실제로 Claude를 사용한 시간을 day × hour 그리드로 표시. 동시 세션은 시각적으로 누적되어, "화요일 오후 3시에 5개 세션"이 한눈에 들어옵니다.

## 데이터의 출처

대시보드의 모든 내용은 `~/.claude/projects/` 아래 Claude Code 자체의 세션 JSONL에서 로컬로 계산됩니다. purplemux-improved는 이를 읽어 파싱한 카운트를 `~/.purplemux/stats/`에 캐시하며, 단 1바이트도 머신 밖으로 보내지 않습니다. 언어를 바꾸거나 캐시를 재생성해도 외부에 닿지 않습니다.

## reset 동작

5시간과 7일 윈도우는 Claude Code 계정에 묶인 rolling window입니다. 윈도우가 reset되면 바는 0%로 떨어지고, 비율과 남은 시간은 다음 reset 타임스탬프 기준으로 재계산됩니다. purplemux-improved가 reset을 놓쳤더라도(서버가 꺼져 있던 경우) 다음 statusline tick에 자동으로 보정됩니다.

## 다음으로

- **[노트 (AI 데일리 리포트)](/purplemux-improved/ko/docs/notes-daily-report/)** — 같은 데이터를 일자별 브리프로
- **[세션 상태](/purplemux-improved/ko/docs/session-status/)** — 사이드바가 탭별로 추적하는 또 하나의 정보
- **[키보드 단축키](/purplemux-improved/ko/docs/keyboard-shortcuts/)** — 통계용 <kbd>⌘⇧U</kbd> 포함

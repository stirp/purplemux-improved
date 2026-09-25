---
title: 사이드바 & Claude 옵션
description: 사이드바 단축 항목 정렬·숨김, 퀵 프롬프트 관리, Claude CLI 플래그 토글.
eyebrow: 커스터마이즈
permalink: /ko/docs/sidebar-options/index.html
---
{% from "docs/callouts.njk" import callout %}

사이드바와 입력 바는 자유롭게 재구성할 수 있는 작은 리스트들로 구성되어 있습니다. 사이드바 하단의 단축 링크, 입력창 위의 프롬프트 버튼이 그렇습니다. 설정의 Claude 탭에는 대시보드에서 새로 띄우는 세션에 적용되는 CLI 레벨 토글이 있습니다.

## 사이드바 항목

설정(<kbd>⌘,</kbd>) → **Sidebar** 탭. 사이드바 하단에 노출되는 단축 링크 목록을 제어합니다. 대시보드, 사내 도구, URL로 열리는 것 무엇이든 등록할 수 있습니다.

각 행에는 그립 핸들, 이름, URL, 스위치가 있습니다.

- **드래그**로 순서 변경. 빌트인과 커스텀 모두 자유롭게 이동.
- **스위치**로 삭제 없이 숨김.
- **연필 아이콘**으로 커스텀 항목 편집 (이름·아이콘·URL).
- **휴지통 아이콘**으로 커스텀 항목 삭제.
- **Reset to Default**로 빌트인 복구·커스텀 전체 삭제·순서 초기화.

### 커스텀 항목 추가

하단의 **Add Item** 버튼을 누르면 작은 폼이 뜹니다.

- **Name** — 툴팁과 라벨로 표시
- **Icon** — 검색 가능한 lucide-react 갤러리에서 선택
- **URL** — `http(s)://...` 형태 모두 가능. 사내 Grafana, Vercel 대시보드, 어드민 툴 등

저장하면 목록 맨 아래에 추가됩니다. 원하는 위치로 드래그해서 옮기세요.

{% call callout('note', '빌트인은 숨김만 됩니다') %}
purplemux-improved가 기본 제공하는 빌트인 항목에는 스위치와 그립만 있고 편집·삭제는 없습니다. 마음이 바뀌었을 때를 대비해 항상 자리를 지킵니다. 커스텀 항목은 모든 동작이 가능합니다.
{% endcall %}

## 퀵 프롬프트

설정 → **Quick Prompts** 탭. Claude 입력창 위의 버튼들을 관리합니다 — 한 번 클릭으로 미리 작성한 메시지를 전송합니다.

사이드바 항목과 동일한 패턴입니다.

- 드래그로 순서 변경
- 스위치로 숨김
- 커스텀 프롬프트 편집·삭제
- Reset to Default

프롬프트를 추가할 때는 **Name**(버튼 라벨)과 **Prompt**(여러 줄 가능한 본문)을 입력합니다. 자주 쓰는 명령에 적합합니다: "테스트 스위트 실행", "최근 커밋 요약", "현재 diff 리뷰" 같은 것들이요.

## Claude CLI 옵션

설정 → **Claude** 탭. 이 토글들은 *purplemux-improved가 새 탭에서 Claude CLI를 실행하는 방식*에 영향을 줍니다. 이미 실행 중인 세션에는 적용되지 않습니다.

### Skip Permission Checks

`claude` 실행 명령에 `--dangerously-skip-permissions`를 추가합니다. Claude가 도구 실행과 파일 편집 시마다 승인 프롬프트를 띄우지 않고 바로 진행합니다.

이는 공식 CLI가 제공하는 동일한 플래그이며, purplemux-improved가 안전 장치를 추가로 약화시키지는 않습니다. 켜기 전에 [Anthropic 공식 문서](https://docs.anthropic.com/en/docs/claude-code/cli-reference)를 확인하세요. 신뢰할 수 있는 워크스페이스에서만 사용하는 것을 권장합니다.

### Show Terminal with Claude

**켬**(기본값): Claude 탭이 라이브 세션 뷰와 하단 터미널을 함께 보여줍니다. 언제든 쉘로 내려갈 수 있습니다.

**끔**: 새 Claude 탭이 터미널을 접은 상태로 열립니다. 세션 뷰가 전체 영역을 차지합니다. 탭마다 수동으로 펼칠 수는 있고, 이 설정은 새 탭의 기본 상태만 바꿉니다.

타임라인 뷰 위주로 작업하며 화면을 단정하게 유지하고 싶다면 끄세요.

## 다음으로

- **[테마 & 폰트](/purplemux-improved/ko/docs/themes-fonts/)** — 라이트/다크/시스템, 폰트 크기 프리셋
- **[에디터 연동](/purplemux-improved/ko/docs/editor-integration/)** — VS Code · Cursor · code-server 연결
- **[첫 세션](/purplemux-improved/ko/docs/first-session/)** — 대시보드 레이아웃 복습

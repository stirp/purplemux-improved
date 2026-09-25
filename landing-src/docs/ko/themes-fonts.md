---
title: 테마 & 폰트
description: 라이트, 다크, 시스템 자동 — 그리고 세 가지 폰트 크기.
eyebrow: 커스터마이즈
permalink: /ko/docs/themes-fonts/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux-improved는 하나의 통일된 디자인을 기본으로, 앱 테마·폰트 크기·터미널 팔레트라는 세 개의 스위치를 제공합니다. 이 페이지에서는 앞의 두 가지를 다룹니다. 터미널 컬러는 별도 페이지에 있습니다.

## 설정 열기

<kbd>⌘,</kbd>(macOS) 또는 <kbd>Ctrl,</kbd>(Linux)로 설정을 엽니다. 테마와 폰트 크기는 **General** 탭에 있습니다.

상단 바의 톱니 아이콘으로도 열 수 있습니다.

## 앱 테마

세 가지 모드가 즉시 반영됩니다.

| 모드 | 동작 |
|---|---|
| **Light** | OS 설정과 무관하게 항상 라이트 |
| **Dark** | 항상 다크 |
| **System** | OS 설정에 따라 자동 전환 — macOS / GNOME / KDE의 라이트/다크 전환에 맞춰 즉시 바뀝니다 |

선택값은 `~/.purplemux/config.json`의 `appTheme`에 저장되며, 서버에 연결된 모든 브라우저 탭에 동기화됩니다. macOS 네이티브 앱에서는 타이틀 바도 함께 변경됩니다.

{% call callout('note', '다크를 기준으로 설계됨') %}
브랜드 컬러는 짙은 퍼플이 섞인 뉴트럴이며, 다크 모드는 chroma 0(완전 무채색)을 유지합니다. 라이트 모드는 hue 287에 매우 약한 퍼플 틴트만 더해 따뜻한 인상을 만듭니다. 둘 다 장시간 작업을 전제로 튜닝되어 있으니 편한 쪽을 고르면 됩니다.
{% endcall %}

## 폰트 크기

세 가지 프리셋을 버튼 그룹으로 제공합니다.

- **Normal** — 기본값. 브라우저 기본 폰트 크기를 따릅니다.
- **Large** — root font-size를 `18px`로 설정.
- **X-Large** — root font-size를 `20px`로 설정.

UI 전체가 `rem` 단위로 짜여 있어, 프리셋을 바꾸면 사이드바·다이얼로그·터미널까지 전부 비례적으로 커집니다. 새로고침 없이 즉시 반영됩니다.

## 바뀌는 것과 안 바뀌는 것

폰트 크기는 **UI 크롬과 터미널 텍스트**를 함께 스케일합니다. 다음은 바뀌지 않습니다.

- 제목 위계(상대 크기는 유지)
- 여백 비율
- 코드 블록 신택스 스타일

특정 영역(예: 터미널만, 사이드바만)을 따로 조정하려면 [커스텀 CSS](/purplemux-improved/ko/docs/custom-css/)를 활용하세요.

## 디바이스별이 아닌 서버 단위 설정

설정은 브라우저 localStorage가 아닌 서버에 저장됩니다. 데스크탑에서 다크로 바꾸면 휴대폰에서도 그대로 다크입니다. 휴대폰에서 `https://<host>/`를 열면 이미 적용된 상태로 보입니다.

모바일과 데스크탑을 다르게 두고 싶다면 현재는 지원하지 않습니다. 필요하면 이슈로 알려주세요.

## 다음으로

- **[커스텀 CSS](/purplemux-improved/ko/docs/custom-css/)** — 개별 컬러·여백 오버라이드
- **[터미널 테마](/purplemux-improved/ko/docs/terminal-themes/)** — xterm.js 전용 팔레트
- **[키보드 단축키](/purplemux-improved/ko/docs/keyboard-shortcuts/)** — 전체 바인딩 한눈에

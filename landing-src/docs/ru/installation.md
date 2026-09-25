---
title: Установка
description: Варианты установки — npx, глобально, нативное macOS-приложение или из исходников.
eyebrow: Начало работы
permalink: /ru/docs/installation/index.html
---
{% from "docs/callouts.njk" import callout %}

Если в [Быстром старте](/purplemux-improved/ru/docs/quickstart/) вам хватило `npx purplemux-improved@latest`, читать дальше не нужно. Эта страница — для тех, кому нужна постоянная установка, десктопное приложение или запуск из исходников.

## Требования

- **macOS 13+ или Linux** — Windows не поддерживается. WSL2 обычно работает, но в нашу матрицу тестов не входит.
- **[Node.js](https://nodejs.org) 20 или новее** — проверьте через `node -v`.
- **[tmux](https://github.com/tmux/tmux)** — любой релиз 3.0+.

## Способы установки

### npx (без установки)

```bash
npx purplemux-improved@latest
```

При первом запуске purplemux-improved загружается и кешируется в `~/.npm/_npx/`. Подходит, если хотите попробовать или запустить разово на удалённой машине. Каждый запуск использует последнюю опубликованную версию.

### Глобальная установка

```bash
npm install -g purplemux-improved
purplemux-improved
```

pnpm и yarn работают так же (`pnpm add -g purplemux-improved` / `yarn global add purplemux-improved`). Последующие запуски быстрее, потому что не нужно ничего разрешать. Обновление — `npm update -g purplemux-improved`.

Бинарник также доступен под коротким именем `pmux`.

### Нативное macOS-приложение

Скачайте последний `.dmg` из [Releases](https://github.com/stirp/purplemux-improved/releases/latest) — есть сборки для Apple Silicon и Intel. Авто-обновление встроено.

Приложение содержит Node, tmux и сервер purplemux-improved, плюс добавляет:

- Иконку в меню-баре со статусом сервера
- Нативные уведомления (отдельно от Web Push)
- Автозапуск при входе в систему (переключатель в **Настройки → Общие**)

### Запуск из исходников

```bash
git clone https://github.com/stirp/purplemux-improved.git
cd purplemux-improved
pnpm install
pnpm start
```

Для разработки (горячая перезагрузка):

```bash
pnpm dev
```

## Порт и переменные окружения

purplemux-improved слушает на **8022** (web + ssh, шутки ради). Перенастраивается через `PORT`:

```bash
PORT=9000 purplemux-improved
```

Логирование управляется через `LOG_LEVEL` (по умолчанию `info`) и `LOG_LEVELS` для переопределений по модулям:

```bash
LOG_LEVEL=debug purplemux-improved
# debug только для модуля Claude hook
LOG_LEVELS=hooks=debug purplemux-improved
# несколько модулей сразу
LOG_LEVELS=hooks=debug,status=warn purplemux-improved
```

Доступные уровни: `trace` · `debug` · `info` · `warn` · `error` · `fatal`. Модули, не указанные в `LOG_LEVELS`, наследуют `LOG_LEVEL`.

Полный список — в [Порты и переменные окружения](/purplemux-improved/ru/docs/ports-env-vars/).

## Автозапуск при загрузке

{% call callout('tip', 'Самый простой вариант') %}
Если вы используете macOS-приложение, включите **Настройки → Общие → Запускать при входе**. Никаких скриптов писать не нужно.
{% endcall %}

При CLI-установке оберните в launchd (macOS) или systemd (Linux). Минимальная systemd-юнит:

```ini
# ~/.config/systemd/user/purplemux-improved.service
[Unit]
Description=purplemux-improved

[Service]
ExecStart=/usr/local/bin/purplemux-improved
Restart=on-failure

[Install]
WantedBy=default.target
```

```bash
systemctl --user enable --now purplemux-improved
```

## Обновление

| Способ | Команда |
|---|---|
| npx | автоматически (свежая версия при каждом запуске) |
| Глобальный npm | `npm update -g purplemux-improved` |
| macOS-приложение | автоматически (обновляется при запуске) |
| Из исходников | `git pull && pnpm install && pnpm start` |

## Удаление

```bash
npm uninstall -g purplemux-improved          # или pnpm remove -g / yarn global remove
rm -rf ~/.purplemux                 # удаляет настройки и данные сессий
```

Нативное приложение перетаскивается в Корзину обычным образом. Подробнее о том, что хранится в `~/.purplemux/`, — в [Каталоге данных](/purplemux-improved/ru/docs/data-directory/).

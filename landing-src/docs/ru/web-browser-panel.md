---
title: Панель веб-браузера
description: Встроенная вкладка-браузер для проверки результатов разработки, управляемая из CLI purplemux-improved, с эмулятором устройств для мобильных вьюпортов.
eyebrow: Рабочие пространства и терминал
permalink: /ru/docs/web-browser-panel/index.html
---
{% from "docs/callouts.njk" import callout %}

Поставьте вкладку веб-браузера рядом с терминалом и сессией Claude. Она показывает ваш локальный dev-сервер, staging-сайт, что угодно достижимое — и ею можно управлять из CLI `purplemux-improved`, не покидая шелл.

## Откройте вкладку браузера

Добавьте новую вкладку и выберите тип панели **Web browser**. Введите URL в адресную строку — `localhost:3000`, IP или полный https URL. Адресная строка нормализует ввод: голые имена хостов и IP уходят в `http://`, всё остальное — в `https://`.

Панель работает как настоящий webview Chromium, когда purplemux-improved — это нативное приложение macOS (сборка Electron), и откатывается на iframe в обычном браузере. Путь через iframe покрывает большинство страниц, но не запустит сайты, отдающие `X-Frame-Options: deny`; путь через Electron этого ограничения не имеет.

{% call callout('note', 'Лучше всего работает в нативном приложении') %}
Эмуляция устройств, скриншоты из CLI и захват консоли / сети работают только в сборке Electron. Запасной вариант с вкладкой браузера даёт адресную строку, кнопки назад / вперёд и перезагрузку, но более глубокая интеграция требует webview.
{% endcall %}

## Управление через CLI

Панель открывает небольшой HTTP API, который оборачивает встроенный CLI `purplemux-improved`. Из любого терминала — включая тот, что стоит рядом с панелью — можно:

```bash
# показать вкладки и узнать ID вкладки веб-браузера
purplemux-improved tab list -w <workspace-id>

# прочитать текущий URL и заголовок
purplemux-improved tab browser url -w <ws> <tabId>

# сохранить скриншот в файл (или всю страницу через --full)
purplemux-improved tab browser screenshot -w <ws> <tabId> -o shot.png --full

# вытащить недавние записи консоли (кольцевой буфер на 500 записей)
purplemux-improved tab browser console -w <ws> <tabId> --since 60000 --level error

# инспектировать сетевой трафик; опционально вытянуть тело одного ответа
purplemux-improved tab browser network -w <ws> <tabId> --method POST --status 500
purplemux-improved tab browser network -w <ws> <tabId> --request <id>

# выполнить JavaScript внутри вкладки и получить сериализованный результат
purplemux-improved tab browser eval -w <ws> <tabId> "document.title"
```

CLI авторизуется через токен в `~/.purplemux/cli-token` и читает порт из `~/.purplemux/port`. На той же машине флаги не нужны. Запустите `purplemux-improved help` для полного списка команд или `purplemux-improved api-guide` — для нижележащих HTTP-эндпоинтов.

Это и делает панель полезной для Claude: попросите Claude сделать скриншот, посмотреть в консоль на ошибку или запустить проверочный скрипт — и у Claude тот же CLI, что у вас.

## Эмулятор устройств

Для мобильной работы переключите панель в мобильный режим. Селектор устройств предлагает пресеты от iPhone SE до 14 Pro Max, Pixel 7, Galaxy S20 Ultra, iPad Mini и iPad Pro 12.9". Каждый пресет включает:

- Ширину / высоту
- Device pixel ratio
- Подходящий мобильный user agent

Переключайте портретную / альбомную ориентацию и выбирайте уровень масштабирования (`fit` — подгонка к панели, либо фиксированные `50% / 75% / 100% / 125% / 150%`). Когда вы меняете устройство, webview перезагружается с новым UA, чтобы серверное определение мобильного видело то же, что увидел бы ваш телефон.

## Что дальше

- **[Вкладки и панели](/purplemux-improved/ru/docs/tabs-panes/)** — как поставить браузер в split рядом с Claude.
- **[Панель Git workflow](/purplemux-improved/ru/docs/git-workflow/)** — другая специализированная панель.
- **[Установка](/purplemux-improved/ru/docs/installation/)** — нативное macOS-приложение, где живёт полная интеграция webview.

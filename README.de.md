# purplemux-improved

An improved fork of [subicura/purplemux-improved](https://github.com/subicura/purplemux-improved). The `purplemux` / `pmux` aliases and `~/.purplemux` data directory remain compatible. npm installation requires this fork to be published; until then, run from source.

**Claude Code und Codex, viele Aufgaben gleichzeitig. Schneller.**

Alle Sessions auf einem Bildschirm. Unterbrechungsfrei, auch auf dem Handy.

Deutsch | <a href="README.md">English</a> | <a href="README.ko.md">한국어</a> | <a href="README.ja.md">日本語</a> | <a href="README.zh-CN.md">简体中文</a> | <a href="README.zh-TW.md">繁體中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.ru.md">Русский</a> | <a href="README.pt-BR.md">Português (Brasil)</a> | <a href="README.tr.md">Türkçe</a>

![purplemux-improved](docs/images/screenshot.png)

![purplemux-improved mobile](docs/images/screenshot-mobile.png)

## Installation

```bash
npx purplemux-improved@latest
```

Öffne [http://localhost:8022](http://localhost:8022) im Browser. Fertig.

> Erfordert Node.js 20+ und tmux. macOS oder Linux.

Lieber eine native App? Hol dir den macOS-Electron-Build aus dem [neuesten Release](https://github.com/stirp/purplemux-improved/releases/latest) (`.dmg` für Apple Silicon & Intel).

## Warum purplemux-improved

- **Multi-Session-Dashboard** — Behalte „arbeitet / wartet auf Eingabe"-Status aller Claude-Code- und Codex-Sessions auf einen Blick im Überblick
- **Rate-Limit-Überwachung** — Restkontingent für 5 Stunden / 7 Tage samt Reset-Countdown
- **Push-Benachrichtigungen** — Desktop- und Mobile-Hinweise, wenn eine Aufgabe fertig ist oder Eingaben nötig sind
- **Mobil & geräteübergreifend** — Dieselbe Session vom Handy, Tablet oder einem anderen Desktop aus erreichen
- **Live-Session-Ansicht** — Kein Scrollen durch CLI-Ausgaben mehr. Der Fortschritt wird als Timeline aufbereitet

Außerdem

- **Unterbrechungsfreie Sessions** — Basiert auf tmux. Browser schließen, und alles bleibt wie es war. Beim Wiederverbinden sind Tabs, Panels und Verzeichnisse exakt dort, wo du aufgehört hast
- **Selbst gehostet & Open Source** — Code und Session-Daten verlassen deine Maschine nie. Keine externen Server
- **Verschlüsselter Fernzugriff** — HTTPS von überall über Tailscale

## Unterschied zur offiziellen Remote Control

> Die offizielle Remote Control konzentriert sich auf die Fernsteuerung einer einzelnen Session. purplemux-improved ist das Richtige, wenn du Multi-Session-Management, Push-Benachrichtigungen und persistente Sessions brauchst.

## Funktionen

### Terminal

- **Panel-Splits** — Horizontal / vertikal frei teilen, Größe per Drag verändern
- **Tab-Management** — Mehrere Tabs, Reihenfolge per Drag, automatische Titel auf Basis der Prozessnamen
- **Tastenkürzel** — Splits, Tab-Wechsel, Fokusbewegung
- **Terminal-Themes** — Dark-/Light-Modus, mehrere Farbschemata
- **Workspaces & Gruppen** — Panel-Layouts, Tabs und Arbeitsverzeichnisse pro Workspace speichern und wiederherstellen. Workspaces per Drag-and-Drop in Gruppen organisieren
- **Git-Workflow** — Side-by-side / Line-by-line mit Syntax-Highlighting, Inline-Hunk-Erweiterung und ein paginierter Verlaufs-Tab. Fetch / Pull / Push direkt aus dem Panel (mit Ahead/Behind-Anzeige) — schlägt der Sync fehl (dirty worktree, Konflikte), per Klick Claude oder Codex fragen
- **Webbrowser-Panel** — Eingebetteter Browser neben dem Terminal zum Prüfen der Entwicklungsausgabe (Electron). Über die `purplemux-improved`-CLI steuerbar, mit eingebautem Geräte-Emulator zum Umschalten der Viewports
- **Agent-Tabs** — Starte Claude, Codex oder eine kombinierte Session-Liste über das Neuer-Tab-Menü

### Claude-Code- und Codex-Integration

- **Echtzeit-Status** — „Arbeitet / wartet auf Eingabe"-Anzeigen, Wechsel zwischen Sessions
- **Live-Session-Ansicht** — Nachrichten, Tool-Aufrufe, Tasks, Berechtigungsanfragen, Thinking-Blöcke
- **Codex-Tabs** — Starte Codex-CLI-Sessions mit derselben tmux-basierten Persistenz wie Claude
- **Session-Liste** — Durchsuche und setze aktuelle Claude- und Codex-Sessions in einer kombinierten Ansicht fort
- **Ein-Klick-Resume** — Unterbrochene Claude- oder Codex-Sessions direkt im Browser wieder aufnehmen
- **Auto-Resume** — Stellt beim Serverstart vorherige Claude-Sessions automatisch wieder her
- **Schnell-Prompts** — Häufig genutzte Prompts hinterlegen und mit einem Klick senden
- **Anhänge** — Bilder direkt in die Chat-Eingabe ziehen oder Dateien anhängen, deren Pfad automatisch eingefügt wird. Funktioniert auch mobil
- **Nachrichtenverlauf** — Frühere Nachrichten wiederverwenden
- **Nutzungsstatistik** — Claude + Codex Tokens, Kosten, Auswertung pro Projekt, tägliche KI-Berichte
- **Rate-Limits** — Restkontingent 5 Stunden / 7 Tage mit Reset-Countdown für unterstützte Provider

### Mobil & Zugänglichkeit

- **Responsive UI** — Terminal und Timeline auf Handys und Tablets
- **PWA** — Zum Home-Bildschirm hinzufügen für ein natives App-Gefühl
- **Web Push** — Benachrichtigungen auch dann, wenn der Tab geschlossen ist
- **Multi-Device-Sync** — Workspace-Änderungen werden in Echtzeit übernommen
- **Tailscale** — HTTPS-Zugriff von außen über einen WireGuard-verschlüsselten Tunnel
- **Passwort-Authentifizierung** — scrypt-Hashing, sicher auch bei externer Exposition
- **Mehrsprachig** — 11 Sprachen inklusive 한국어, English, 日本語, 中文

## Unterstützte Plattformen

| Plattform | Status | Hinweise |
|---|---|---|
| macOS (Apple Silicon / Intel) | ✅ | Electron-App inklusive |
| Linux | ✅ | Ohne Electron |
| Windows | ❌ | Nicht unterstützt |

## Installationsdetails

### Voraussetzungen

- macOS 13+ oder Linux
- [Node.js](https://nodejs.org/) 20+
- [tmux](https://github.com/tmux/tmux)

Erforderlich für Claude-Tabs. Installiere Claude Code und melde dich an, bevor du einen Claude-Tab startest:

```bash
curl -fsSL https://claude.ai/install.sh | bash
# oder mit dem Homebrew-Latest-Channel
brew install --cask claude-code@latest
```

Optional für Codex-Tabs. Installiere Codex CLI und melde dich an, bevor du einen Codex-Tab startest:

```bash
npm i -g @openai/codex
# oder
brew install --cask codex
```

### npx (am schnellsten)

```bash
npx purplemux-improved@latest
```

### Globale Installation

```bash
npm install -g purplemux-improved
purplemux-improved
```

### CLI-Beispiele

```bash
purplemux-improved tab create -w WS -t codex-cli -n "fix auth"
purplemux-improved tab create -w WS -t agent-sessions
```

### Aus dem Quellcode

```bash
git clone https://github.com/stirp/purplemux-improved.git
cd purplemux-improved
pnpm install
pnpm start
```

Entwicklungsmodus:

```bash
pnpm dev
```

#### Log-Level

Das Gesamt-Level wird über `LOG_LEVEL` (Standard `info`) eingestellt.

```bash
LOG_LEVEL=debug pnpm dev
```

Um nur bestimmte Module zu aktivieren, liste `modul=level`-Paare kommagetrennt in `LOG_LEVELS` auf. Verfügbare Level: `trace` / `debug` / `info` / `warn` / `error` / `fatal`.

```bash
# Nur das Verhalten der Claude-Code-Hooks auf debug verfolgen
LOG_LEVELS=hooks=debug pnpm dev

# Mehrere Module gleichzeitig
LOG_LEVELS=hooks=debug,status=warn pnpm dev
```

Module, die nicht in `LOG_LEVELS` stehen, verwenden den Wert von `LOG_LEVEL`.

## Externer Zugriff (Tailscale Serve)

```bash
tailscale serve --bg 8022
```

Zugriff über `https://<machine>.<tailnet>.ts.net`. Deaktivieren:

```bash
tailscale serve --bg off 8022
```

## Sicherheit

### Passwort

Beim ersten Zugriff legst du ein Passwort fest. Es wird mit scrypt gehasht und in `~/.purplemux/config.json` gespeichert.

Zum Zurücksetzen die Datei `~/.purplemux/config.json` löschen und neu starten — der Onboarding-Bildschirm erscheint wieder.

### HTTPS

Standard ist HTTP. Bei externer Erreichbarkeit unbedingt HTTPS verwenden:

- **Tailscale Serve** — WireGuard-Verschlüsselung plus automatische Zertifikate
- **Nginx / Caddy** — Muss die WebSocket-Upgrade-Header (`Upgrade`, `Connection`) weiterreichen

### Datenverzeichnis (`~/.purplemux/`)

| Datei | Beschreibung |
|---|---|
| `config.json` | Zugangsdaten (gehasht) und App-Einstellungen |
| `workspaces.json` | Workspace-Layouts, Tabs, Verzeichnisse |
| `vapid-keys.json` | Web-Push-VAPID-Schlüssel (automatisch generiert) |
| `push-subscriptions.json` | Push-Abonnementdaten |
| `hooks/` | Benutzerdefinierte Hooks |

## Architektur

```
┌─────────────────────────────────────────────────────────────┐
│  Browser                                                    │
│  ┌───────────┐ ┌───────────┐ ┌──────────┐ ┌─────────────┐   │
│  │  xterm.js │ │ Timeline  │ │ Status   │ │ Multi-device│   │
│  │  Terminal │ │           │ │          │ │ Sync        │   │
│  └─────┬─────┘ └─────┬─────┘ └────┬─────┘ └──────┬──────┘   │
└────────┼─────────────┼────────────┼──────────────┼──────────┘
         │ws           │ws          │ws            │ws
         │/terminal    │/timeline   │/status       │/sync
         ▼             ▼            ▼              ▼
┌─────────────────────────────────────────────────────────────┐
│  Node.js Server (:8022)                                     │
│  ┌──────────┐  ┌───────────────┐  ┌─────────────────────┐   │
│  │ node-pty │  │ JSONL Watcher │  │ Status Manager      │   │
│  │ PTY↔WS   │  │ File watch →  │  │ Process tree +      │   │
│  │ Binary   │  │ Parse → Send  │  │ JSONL tail analysis │   │
│  └────┬─────┘  └───────┬───────┘  └──────────┬──────────┘   │
└───────┼────────────────┼─────────────────────┼──────────────┘
        ▼                ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│  System                                                     │
│  tmux (purple socket)         Agent CLIs                    │
│  ┌────────┐ ┌────────┐       ┌────────────────────────────┐ │
│  │Session1│ │Session2│  ...  │ Claude Code                │ │
│  │ (shell)│ │ (shell)│       │   ~/.claude/projects/*.jsonl │ │
│  └────────┘ └────────┘       │ Codex                      │ │
│                              │   ~/.codex/sessions/*.jsonl │ │
│                              └────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Terminal-I/O** — xterm.js verbindet sich über WebSocket mit node-pty; node-pty hängt an tmux-Sessions. Ein Binärprotokoll übernimmt stdin/stdout/resize mit Backpressure-Kontrolle.

**Statuserkennung** — Agent-Event-Hooks liefern sofortige Updates per HTTP POST. Claude Code nutzt `SessionStart`, `Stop` und `Notification`; Codex nutzt `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop` und `PermissionRequest`. Alle 5–15 s werden Prozessbäume geprüft und die letzten 8 KB der JSONL-Dateien analysiert.

**Timeline** — Überwacht JSONL-Session-Logs unter `~/.claude/projects/` und `~/.codex/sessions/`, parst bei Änderungen neue Zeilen und streamt strukturierte Einträge an den Browser.

**tmux-Isolation** — Nutzt einen eigenen `purple`-Socket, vollständig getrennt von deinem bestehenden tmux. Kein Prefix-Key, keine Statusleiste.

**Auto-Recovery** — Beim Serverstart werden vorherige Claude-Sessions via `claude --resume {sessionId}` wiederhergestellt. Codex-Sessions lassen sich über die Session-Liste oder mit `codex resume {sessionId}` fortsetzen.

## License

[MIT](LICENSE)

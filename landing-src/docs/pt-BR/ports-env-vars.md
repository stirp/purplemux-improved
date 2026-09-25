---
title: Portas e variáveis de ambiente
description: Cada porta que o purplemux-improved abre e cada variável de ambiente que influencia como ele roda.
eyebrow: Referência
permalink: /pt-BR/docs/ports-env-vars/index.html
---
{% from "docs/callouts.njk" import callout %}

O purplemux-improved foi pensado para ser uma instalação de uma linha, mas o runtime é configurável. Esta página lista todas as portas que ele abre e todas as variáveis de ambiente que o servidor lê.

## Portas

| Porta | Padrão | Override | Notas |
|---|---|---|---|
| HTTP + WebSocket | `8022` | `PORT=9000 purplemux-improved` | Se `8022` já estiver em uso, o servidor loga um aviso e se conecta a uma porta livre aleatória. |
| Next.js interno (produção) | aleatória | — | Em `pnpm start` / `purplemux-improved start`, o servidor externo proxia para um Next.js standalone bindado em `127.0.0.1:<aleatória>`. Não exposto. |

`8022` é `web` + `ssh` colados. A escolha é piada, não protocolo.

{% call callout('note', 'A interface ligada segue a política de acesso') %}
O purplemux-improved só dá bind em `0.0.0.0` se a política de acesso permitir clientes externos. Setups apenas-localhost dão bind em `127.0.0.1` para que outras máquinas na LAN não consigam nem abrir uma conexão TCP. Veja `HOST` abaixo.
{% endcall %}

## Variáveis de ambiente do servidor

Lidas pelo `server.ts` e pelos módulos que ele carrega na inicialização.

| Variável | Padrão | Efeito |
|---|---|---|
| `PORT` | `8022` | Porta de escuta HTTP/WS. Cai em porta aleatória em `EADDRINUSE`. |
| `HOST` | não definida | Spec separado por vírgulas (CIDR/keyword) para quais clientes são permitidos. Keywords: `localhost`, `tailscale`, `lan`, `all` (ou `*` / `0.0.0.0`). Exemplos: `HOST=localhost`, `HOST=localhost,tailscale`, `HOST=10.0.0.0/8,localhost`. Quando definido por env, **Configurações → Acesso de rede** fica travado no app. |
| `NODE_ENV` | `production` (em `purplemux-improved start`), `development` (em `pnpm dev`) | Seleciona entre o pipeline de dev (`tsx watch`, Next dev) e o pipeline de prod (bundle do `tsup` proxiando para o Next standalone). |
| `__PMUX_APP_DIR` | `process.cwd()` | Sobrescreve o diretório que contém `dist/server.js` e `.next/standalone/`. Definido automaticamente por `bin/purplemux.js`; você normalmente não deve mexer. |
| `__PMUX_APP_DIR_UNPACKED` | não definida | Variante de `__PMUX_APP_DIR` para o caminho asar-unpacked dentro do app Electron de macOS. |
| `__PMUX_ELECTRON` | não definida | Quando o processo principal do Electron inicia o servidor in-process, ele define isso para que `server.ts` pule o `start()` automático e deixe o Electron dirigir o ciclo de vida. |
| `PURPLEMUX_CLI` | `1` (definido por `bin/purplemux.js`) | Marca que indica para módulos compartilhados que o processo é o CLI / servidor, não o Electron. Usado por `pristine-env.ts`. |
| `__PMUX_PRISTINE_ENV` | não definida | Snapshot JSON do env da shell-pai, capturado por `bin/purplemux.js` para que processos filhos (claude, tmux) herdem o `PATH` do usuário em vez de um sanitizado. Interno — definido automaticamente. |
| `AUTH_PASSWORD` | não definida | Definido pelo servidor a partir do hash scrypt em `config.json` antes de o Next iniciar. O NextAuth lê de lá. Não defina manualmente. |
| `NEXTAUTH_SECRET` | não definida | Mesma história — populado de `config.json` na inicialização. |

## Variáveis de ambiente de log

Lidas por `src/lib/logger.ts`.

| Variável | Padrão | Efeito |
|---|---|---|
| `LOG_LEVEL` | `info` | Nível raiz para tudo que não estiver listado em `LOG_LEVELS`. |
| `LOG_LEVELS` | não definida | Overrides por módulo como pares `nome=nível` separados por vírgulas. |

Níveis, em ordem: `trace` · `debug` · `info` · `warn` · `error` · `fatal`.

```bash
LOG_LEVEL=debug purplemux-improved

# debug apenas no módulo de hooks do Claude
LOG_LEVELS=hooks=debug purplemux-improved

# vários módulos de uma vez
LOG_LEVELS=hooks=debug,status=warn,tmux=trace purplemux-improved
```

Os nomes de módulo mais úteis:

| Módulo | Fonte | O que você vê |
|---|---|---|
| `hooks` | `pages/api/status/hook.ts`, partes de `status-manager.ts` | Recebimento/processamento de hook / transições de estado |
| `status` | `status-manager.ts` | Polling, watcher de JSONL, broadcast |
| `tmux` | `lib/tmux.ts` | Cada comando tmux e seu resultado |
| `server`, `lock`, etc. | `lib/*.ts` correspondentes | Ciclo de vida do processo |

Arquivos de log caem em `~/.purplemux/logs/` independentemente do nível.

## Arquivos (equivalente a env)

Alguns valores se comportam como variáveis de ambiente, mas vivem em disco para que a CLI e os scripts de hook os encontrem sem um handshake de env:

| Arquivo | Guarda | Usado por |
|---|---|---|
| `~/.purplemux/port` | porta atual do servidor (texto plano) | `bin/cli.js`, `status-hook.sh`, `statusline.sh` |
| `~/.purplemux/cli-token` | token CLI hex de 32 bytes | `bin/cli.js`, scripts de hook (enviado como `x-pmux-token`) |

A CLI também aceita esses valores via env, que têm precedência:

| Variável | Padrão | Efeito |
|---|---|---|
| `PMUX_PORT` | conteúdo de `~/.purplemux/port` | Porta com a qual a CLI fala. |
| `PMUX_TOKEN` | conteúdo de `~/.purplemux/cli-token` | Bearer token enviado como `x-pmux-token`. |

Veja [Referência da CLI](/purplemux-improved/pt-BR/docs/cli-reference/) para a interface completa.

## Juntando as peças

Algumas combinações comuns:

```bash
# Padrão: só localhost, porta 8022
purplemux-improved

# Bind em todo lugar (LAN + Tailscale + remoto)
HOST=all purplemux-improved

# Localhost + Tailscale apenas
HOST=localhost,tailscale purplemux-improved

# Porta personalizada + tracing detalhado de hooks
PORT=9000 LOG_LEVELS=hooks=debug purplemux-improved

# Pacote completo para debug
PORT=9000 HOST=localhost LOG_LEVEL=debug LOG_LEVELS=tmux=trace purplemux-improved
```

{% call callout('tip') %}
Para uma instalação persistente, defina essas vars no bloco `Environment=` do seu unit launchd / systemd. Veja [Instalação](/purplemux-improved/pt-BR/docs/installation/#iniciar-no-boot) para um exemplo de unit.
{% endcall %}

## Próximos passos

- **[Instalação](/purplemux-improved/pt-BR/docs/installation/)** — onde essas vars normalmente vão.
- **[Diretório de dados](/purplemux-improved/pt-BR/docs/data-directory/)** — como `port` e `cli-token` interagem com os scripts de hook.
- **[Referência da CLI](/purplemux-improved/pt-BR/docs/cli-reference/)** — `PMUX_PORT` / `PMUX_TOKEN` em contexto.

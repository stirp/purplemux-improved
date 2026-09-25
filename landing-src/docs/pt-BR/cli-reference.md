---
title: Referência da CLI
description: Cada subcomando e flag dos binários purplemux-improved e pmux.
eyebrow: Referência
permalink: /pt-BR/docs/cli-reference/index.html
---
{% from "docs/callouts.njk" import callout %}

O `purplemux-improved` vem com duas formas de usar o binário: como starter de servidor (`purplemux-improved` / `purplemux-improved start`) e como wrapper de uma API HTTP (`purplemux-improved <subcomando>`) que conversa com um servidor em execução. O alias curto `pmux` é idêntico.

## Dois papéis, um binário

| Forma | O que faz |
|---|---|
| `purplemux-improved` | Inicia o servidor. Igual a `purplemux-improved start`. |
| `purplemux-improved <subcomando>` | Conversa com a API HTTP da CLI de um servidor em execução. |
| `pmux ...` | Alias para `purplemux-improved ...`. |

O dispatcher em `bin/purplemux.js` extrai o primeiro argumento: subcomandos conhecidos roteiam para `bin/cli.js`; qualquer outra coisa (ou nenhum argumento) inicia o servidor.

## Iniciando o servidor

```bash
purplemux-improved              # padrão
purplemux-improved start        # mesma coisa, explícito
PORT=9000 purplemux-improved    # porta customizada
HOST=all purplemux-improved     # bind em todo lugar
```

Veja [Portas e variáveis de ambiente](/purplemux-improved/pt-BR/docs/ports-env-vars/) para a interface completa de env.

O servidor imprime as URLs em que está bindado, o modo e o status de auth:

```
  ⚡ purplemux-improved  v0.x.x
  ➜  Available on:
       http://127.0.0.1:8022
       http://192.168.1.42:8022
  ➜  Mode:   production
  ➜  Auth:   configured
```

Se `8022` está em uso, o servidor avisa e binda em uma porta livre aleatória.

## Subcomandos

Todos os subcomandos exigem um servidor em execução. Eles leem a porta de `~/.purplemux/port` e o token de auth de `~/.purplemux/cli-token`, ambos gravados automaticamente no start do servidor.

| Comando | Propósito |
|---|---|
| `purplemux-improved workspaces` | Lista workspaces |
| `purplemux-improved tab list [-w WS]` | Lista abas (opcionalmente escopadas a um workspace) |
| `purplemux-improved tab create -w WS [-n NAME] [-t TYPE]` | Cria uma nova aba |
| `purplemux-improved tab send -w WS TAB_ID CONTENT...` | Envia input para uma aba |
| `purplemux-improved tab status -w WS TAB_ID` | Inspeciona o status de uma aba |
| `purplemux-improved tab result -w WS TAB_ID` | Captura o conteúdo atual do painel da aba |
| `purplemux-improved tab close -w WS TAB_ID` | Fecha uma aba |
| `purplemux-improved tab browser ...` | Dirige uma aba `web-browser` (somente Electron) |
| `purplemux-improved api-guide` | Imprime a referência completa da API HTTP |
| `purplemux-improved help` | Mostra uso |

A saída é JSON, salvo nota em contrário. `--workspace` e `-w` são intercambiáveis.

### Tipos de painel em `tab create`

A flag `-t` / `--type` escolhe o tipo de painel. Valores válidos:

| Valor | Painel |
|---|---|
| `terminal` | Shell comum |
| `claude-code` | Shell com `claude` já em execução |
| `web-browser` | Navegador embutido (somente Electron) |
| `diff` | Painel de Git diff |

Sem `-t`, você ganha um terminal comum.

### Subcomandos `tab browser`

Eles só funcionam quando o tipo de painel da aba é `web-browser`, e só no app Electron de macOS — a ponte retorna 503 caso contrário.

| Subcomando | O que retorna |
|---|---|
| `purplemux-improved tab browser url -w WS TAB_ID` | URL e título atuais |
| `purplemux-improved tab browser screenshot -w WS TAB_ID [-o FILE] [--full]` | PNG. Com `-o`, salva em disco; sem, retorna base64. `--full` captura a página inteira. |
| `purplemux-improved tab browser console -w WS TAB_ID [--since MS] [--level LEVEL]` | Entradas recentes do console (ring buffer, 500 entradas) |
| `purplemux-improved tab browser network -w WS TAB_ID [--since MS] [--method M] [--url SUBSTR] [--status CODE] [--request ID]` | Entradas recentes de rede; `--request ID` busca um corpo |
| `purplemux-improved tab browser eval -w WS TAB_ID EXPR` | Avalia uma expressão JS e serializa o resultado |

## Exemplos

```bash
# Encontre seu workspace
purplemux-improved workspaces

# Crie uma aba Claude no workspace ws-MMKl07
purplemux-improved tab create -w ws-MMKl07 -t claude-code -n "refactor auth"

# Envie um prompt (TAB_ID vem de `tab list`)
purplemux-improved tab send -w ws-MMKl07 tb-abc "Refatore src/lib/auth.ts para remover o caminho do cookie"

# Acompanhe seu estado
purplemux-improved tab status -w ws-MMKl07 tb-abc

# Capture o painel
purplemux-improved tab result -w ws-MMKl07 tb-abc

# Screenshot página inteira de uma aba web-browser
purplemux-improved tab browser screenshot -w ws-MMKl07 tb-xyz -o page.png --full
```

## Autenticação

Cada subcomando envia `x-pmux-token: $(cat ~/.purplemux/cli-token)` e é verificado no servidor via `timingSafeEqual`. O arquivo `~/.purplemux/cli-token` é gerado no primeiro start do servidor com `randomBytes(32)` e gravado em modo `0600`.

Se você precisa dirigir a CLI de outro shell ou um script que não consegue ver `~/.purplemux/`, defina as env vars:

| Variável | Padrão | Efeito |
|---|---|---|
| `PMUX_PORT` | conteúdo de `~/.purplemux/port` | Porta com a qual a CLI fala |
| `PMUX_TOKEN` | conteúdo de `~/.purplemux/cli-token` | Bearer token enviado como `x-pmux-token` |

```bash
PMUX_PORT=8022 PMUX_TOKEN=$(cat ~/.purplemux/cli-token) purplemux-improved workspaces
```

{% call callout('warning') %}
O token CLI dá acesso completo ao servidor. Trate como senha. Não cole em chat, não commite, não exponha como build env var. Rotacione apagando `~/.purplemux/cli-token` e reiniciando o servidor.
{% endcall %}

## update-notifier

O `purplemux-improved` checa o npm por uma versão mais nova a cada execução (via `update-notifier`) e imprime um banner se houver. Desligue com `NO_UPDATE_NOTIFIER=1` ou qualquer um dos [opt-outs padrão do `update-notifier`](https://github.com/yeoman/update-notifier#user-settings).

## API HTTP completa

`purplemux-improved api-guide` imprime a referência completa da API HTTP para cada endpoint `/api/cli/*`, incluindo corpos de requisição e formatos de resposta — útil quando você quer dirigir o purplemux-improved direto via `curl` ou outro runtime.

## Próximos passos

- **[Portas e variáveis de ambiente](/purplemux-improved/pt-BR/docs/ports-env-vars/)** — `PMUX_PORT` / `PMUX_TOKEN` na superfície de env mais ampla.
- **[Arquitetura](/purplemux-improved/pt-BR/docs/architecture/)** — com o que a CLI está realmente conversando.
- **[Solução de problemas](/purplemux-improved/pt-BR/docs/troubleshooting/)** — quando a CLI diz "is the server running?".

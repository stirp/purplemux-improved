---
title: CLI referansı
description: purplemux-improved ve pmux ikili dosyalarının her alt komutu ve bayrağı.
eyebrow: Referans
permalink: /tr/docs/cli-reference/index.html
---
{% from "docs/callouts.njk" import callout %}

`purplemux-improved`, ikili dosyayı kullanmanın iki yolunu sunar: bir sunucu başlatıcısı olarak (`purplemux-improved` / `purplemux-improved start`) ve çalışan bir sunucuyla konuşan bir HTTP API sarmalayıcısı olarak (`purplemux-improved <subcommand>`). Kısa kısayol `pmux` aynıdır.

## İki rol, tek ikili

| Form | Yaptığı |
|---|---|
| `purplemux-improved` | Sunucuyu başlat. `purplemux-improved start` ile aynı. |
| `purplemux-improved <subcommand>` | Çalışan bir sunucunun CLI HTTP API'siyle konuş. |
| `pmux ...` | `purplemux-improved ...` için kısayol. |

`bin/purplemux.js`'deki dağıtıcı ilk argümanı ayırır: bilinen alt komutlar `bin/cli.js`'e gider, başka her şey (veya argüman yok) sunucuyu başlatır.

## Sunucuyu başlatma

```bash
purplemux-improved              # varsayılan
purplemux-improved start        # aynı şey, açık
PORT=9000 purplemux-improved    # özel port
HOST=all purplemux-improved     # her yere bağla
```

Tam env yüzeyi için [Portlar & ortam değişkenleri](/purplemux-improved/tr/docs/ports-env-vars/) sayfasına bakın.

Sunucu bağlandığı URL'leri, modu ve auth durumunu yazdırır:

```
  ⚡ purplemux-improved  v0.x.x
  ➜  Available on:
       http://127.0.0.1:8022
       http://192.168.1.42:8022
  ➜  Mode:   production
  ➜  Auth:   configured
```

`8022` zaten kullanımdaysa sunucu uyarır ve rastgele bir boş porta bağlanır.

## Alt komutlar

Tüm alt komutlar çalışan bir sunucu gerektirir. Portu `~/.purplemux/port`'tan ve auth tokenini `~/.purplemux/cli-token`'dan okurlar; ikisi de sunucu başlangıcında otomatik yazılır.

| Komut | Amaç |
|---|---|
| `purplemux-improved workspaces` | Çalışma alanlarını listele |
| `purplemux-improved tab list [-w WS]` | Sekmeleri listele (isteğe bağlı bir çalışma alanı kapsamına alınmış) |
| `purplemux-improved tab create -w WS [-n NAME] [-t TYPE]` | Yeni bir sekme oluştur |
| `purplemux-improved tab send -w WS TAB_ID CONTENT...` | Bir sekmeye girdi gönder |
| `purplemux-improved tab status -w WS TAB_ID` | Bir sekmenin durumunu incele |
| `purplemux-improved tab result -w WS TAB_ID` | Sekme panelinin geçerli içeriğini yakala |
| `purplemux-improved tab close -w WS TAB_ID` | Sekmeyi kapat |
| `purplemux-improved tab browser ...` | Bir `web-browser` sekmesini sür (yalnızca Electron) |
| `purplemux-improved api-guide` | Tam HTTP API referansını yazdır |
| `purplemux-improved help` | Kullanımı göster |

Belirtilmedikçe çıktı JSON'dur. `--workspace` ve `-w` birbirinin yerine kullanılabilir.

### `tab create` panel türleri

`-t` / `--type` bayrağı panel türünü seçer. Geçerli değerler:

| Değer | Panel |
|---|---|
| `terminal` | Düz shell |
| `claude-code` | `claude` zaten çalışıyor olan shell |
| `web-browser` | Gömülü tarayıcı (yalnızca Electron) |
| `diff` | Git diff paneli |

`-t` olmadan, düz bir terminal alırsınız.

### `tab browser` alt komutları

Bunlar yalnızca sekmenin panel türü `web-browser` olduğunda ve yalnızca macOS Electron uygulamasında çalışır — köprü aksi halde 503 döndürür.

| Alt komut | Döndürdüğü |
|---|---|
| `purplemux-improved tab browser url -w WS TAB_ID` | Geçerli URL + sayfa başlığı |
| `purplemux-improved tab browser screenshot -w WS TAB_ID [-o FILE] [--full]` | PNG. `-o` ile diske kaydeder; onsuz base64 döner. `--full` tam sayfayı yakalar. |
| `purplemux-improved tab browser console -w WS TAB_ID [--since MS] [--level LEVEL]` | Son console girişleri (halka tampon, 500 girdi) |
| `purplemux-improved tab browser network -w WS TAB_ID [--since MS] [--method M] [--url SUBSTR] [--status CODE] [--request ID]` | Son network girişleri; `--request ID` bir gövde alır |
| `purplemux-improved tab browser eval -w WS TAB_ID EXPR` | Bir JS ifadesi değerlendir ve sonucu serileştir |

## Örnekler

```bash
# Çalışma alanınızı bulun
purplemux-improved workspaces

# ws-MMKl07 çalışma alanında bir Claude sekmesi oluşturun
purplemux-improved tab create -w ws-MMKl07 -t claude-code -n "refactor auth"

# Ona bir prompt gönderin (TAB_ID `tab list`'ten gelir)
purplemux-improved tab send -w ws-MMKl07 tb-abc "Refactor src/lib/auth.ts to remove the cookie path"

# Durumunu izleyin
purplemux-improved tab status -w ws-MMKl07 tb-abc

# Paneli yakalayın
purplemux-improved tab result -w ws-MMKl07 tb-abc

# Bir web-browser sekmesini tam sayfa ekran görüntüsü
purplemux-improved tab browser screenshot -w ws-MMKl07 tb-xyz -o page.png --full
```

## Kimlik doğrulama

Her alt komut `x-pmux-token: $(cat ~/.purplemux/cli-token)` gönderir ve sunucu tarafında `timingSafeEqual` ile doğrulanır. `~/.purplemux/cli-token` dosyası ilk sunucu başlangıcında `randomBytes(32)` ile üretilir ve `0600` modunda saklanır.

CLI'yı `~/.purplemux/`'u göremeyen başka bir shell veya betikten sürmeniz gerekirse, env değişkenlerini kullanın:

| Değişken | Varsayılan | Etki |
|---|---|---|
| `PMUX_PORT` | `~/.purplemux/port`'un içeriği | CLI'nın konuştuğu port |
| `PMUX_TOKEN` | `~/.purplemux/cli-token`'ın içeriği | `x-pmux-token` olarak gönderilen Bearer token |

```bash
PMUX_PORT=8022 PMUX_TOKEN=$(cat ~/.purplemux/cli-token) purplemux-improved workspaces
```

{% call callout('warning') %}
CLI tokeni tam sunucu erişimi verir. Onu bir parola gibi ele alın. Sohbete yapıştırmayın, commit etmeyin veya bir build env değişkeni olarak açmayın. `~/.purplemux/cli-token`'ı silip sunucuyu yeniden başlatarak döndürün.
{% endcall %}

## update-notifier

`purplemux-improved` her açılışta npm'i daha yeni bir sürüm için kontrol eder (`update-notifier` ile) ve varsa bir banner yazdırır. `NO_UPDATE_NOTIFIER=1` veya [standart `update-notifier` opt-out'larından](https://github.com/yeoman/update-notifier#user-settings) herhangi biri ile devre dışı bırakın.

## Tam HTTP API

`purplemux-improved api-guide`, her `/api/cli/*` uç noktası için istek gövdeleri ve yanıt biçimleri dahil tam HTTP API referansını yazdırır — purplemux-improved'ı doğrudan `curl` veya başka bir runtime'dan sürmek istediğinizde yararlıdır.

## Sıradaki adımlar

- **[Portlar & ortam değişkenleri](/purplemux-improved/tr/docs/ports-env-vars/)** — daha geniş env yüzeyinde `PMUX_PORT` / `PMUX_TOKEN`.
- **[Mimari](/purplemux-improved/tr/docs/architecture/)** — CLI'nın gerçekte ne ile konuştuğu.
- **[Sorun giderme](/purplemux-improved/tr/docs/troubleshooting/)** — CLI "sunucu çalışıyor mu?" dediğinde.

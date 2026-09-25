---
title: Kurulum
description: Kurulum seçenekleri — npx, global, macOS yerel uygulaması veya kaynaktan çalıştırma.
eyebrow: Başlarken
permalink: /tr/docs/installation/index.html
---
{% from "docs/callouts.njk" import callout %}

[Hızlı başlangıç](/purplemux-improved/tr/docs/quickstart/)'ta `npx purplemux-improved@latest` çalıştırdıysanız ve bu yeterli olduysa işiniz bitti. Bu sayfa kalıcı bir kurulum, masaüstü uygulaması veya kaynaktan çalıştırma isteyenler için.

## Gereksinimler

- **macOS 13+ veya Linux** — Windows desteklenmez. WSL2 genelde çalışır ama test matrisimizin dışındadır.
- **[Node.js](https://nodejs.org) 20 veya üstü** — `node -v` ile kontrol edin.
- **[tmux](https://github.com/tmux/tmux)** — 3.0+ herhangi bir sürüm.

## Kurulum yöntemleri

### npx (kurulumsuz)

```bash
npx purplemux-improved@latest
```

İlk çalıştırmada purplemux-improved'ı indirir ve `~/.npm/_npx/` altına önbelleğe alır. Hızlıca denemek veya uzak bir makinede ad-hoc çalıştırmak için en uygunu. Her çalıştırmada en güncel sürüm kullanılır.

### Global kurulum

```bash
npm install -g purplemux-improved
purplemux-improved
```

pnpm ve yarn da aynı şekilde çalışır (`pnpm add -g purplemux-improved` / `yarn global add purplemux-improved`). Sonraki çalıştırmalar daha hızlı başlar çünkü çözümlemeye gerek kalmaz. Güncelleme: `npm update -g purplemux-improved`.

İkili dosya kısa olsun diye `pmux` adıyla da kullanılabilir.

### macOS yerel uygulaması

[Releases](https://github.com/stirp/purplemux-improved/releases/latest) sayfasından en son `.dmg`'yi indirin — Apple Silicon ve Intel yapıları sağlanır. Otomatik güncelleme yerleşik.

Uygulama Node, tmux ve purplemux-improved sunucusunu içerir; ayrıca şunları sağlar:

- Sunucu durumunu gösteren menü çubuğu simgesi
- Yerel bildirimler (Web Push'tan ayrı)
- Oturum açıldığında otomatik başlatma (**Ayarlar → Genel** içinden açılır)

### Kaynaktan çalıştırma

```bash
git clone https://github.com/stirp/purplemux-improved.git
cd purplemux-improved
pnpm install
pnpm start
```

Geliştirme için (sıcak yeniden yükleme):

```bash
pnpm dev
```

## Port ve ortam değişkenleri

purplemux-improved **8022** portunda dinler (mizah olsun diye web + ssh). `PORT` ile değiştirin:

```bash
PORT=9000 purplemux-improved
```

Loglama `LOG_LEVEL` (varsayılan `info`) ve modül başına geçersiz kılma için `LOG_LEVELS` ile kontrol edilir:

```bash
LOG_LEVEL=debug purplemux-improved
# yalnızca Claude hook modülünü debug et
LOG_LEVELS=hooks=debug purplemux-improved
# birden fazla modülü aynı anda
LOG_LEVELS=hooks=debug,status=warn purplemux-improved
```

Mevcut seviyeler: `trace` · `debug` · `info` · `warn` · `error` · `fatal`. `LOG_LEVELS`'ta listelenmeyen modüller `LOG_LEVEL`'a düşer.

Tam liste için [Portlar & ortam değişkenleri](/purplemux-improved/tr/docs/ports-env-vars/) sayfasına bakın.

## Açılışta başlatma

{% call callout('tip', 'En kolay yol') %}
macOS uygulamasını kullanıyorsanız **Ayarlar → Genel → Oturum açıldığında başlat**'ı etkinleştirin. Yazılacak betik yok.
{% endcall %}

CLI kurulumu için launchd (macOS) veya systemd (Linux) ile sarmalayın. Asgari bir systemd birimi şöyle görünür:

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

## Güncelleme

| Yöntem | Komut |
|---|---|
| npx | otomatik (her çalıştırmada en güncel) |
| Global npm | `npm update -g purplemux-improved` |
| macOS uygulaması | otomatik (açılışta günceller) |
| Kaynaktan | `git pull && pnpm install && pnpm start` |

## Kaldırma

```bash
npm uninstall -g purplemux-improved          # veya pnpm remove -g / yarn global remove
rm -rf ~/.purplemux                 # ayarları ve oturum verisini siler
```

Yerel uygulama olağan şekilde Çöp Kutusu'na sürüklenir. `~/.purplemux/` altında tam olarak ne saklandığı için [Veri dizini](/purplemux-improved/tr/docs/data-directory/) sayfasına bakın.

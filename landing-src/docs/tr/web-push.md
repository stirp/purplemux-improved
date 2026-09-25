---
title: Web Push bildirimleri
description: Tarayıcı sekmesi kapalı olsa bile needs-input ve görev tamamlama durumları için arka plan push uyarıları.
eyebrow: Mobil & Uzaktan
permalink: /tr/docs/web-push/index.html
---
{% from "docs/callouts.njk" import callout %}

Web Push, sekmeyi kapatmış olsanız bile bir Claude oturumu dikkatinize ihtiyaç duyduğunda — bir izin istemi, bitmiş bir görev — purplemux-improved'ın sizi dürtmesini sağlar. Bildirime dokunun ve doğrudan o oturuma inersiniz.

## Neler bir bildirimi tetikler

purplemux-improved, kenar çubuğunda renkli rozetler olarak gördüğünüz aynı geçişler için push gönderir.

- **Girdi gerekiyor** — Claude bir izin istemine takıldı veya soru sordu.
- **Görev tamamlama** — Claude bir tur bitirdi (**inceleme** durumu).

Boşta ve meşgul geçişleri kasıtlı olarak push edilmez. Onlar gürültüdür.

## Etkinleştirme

Anahtar **Ayarlar → Bildirim**'dedir. Adımlar:

1. **Ayarlar → Bildirim**'i açın ve **Açık**'a getirin.
2. Tarayıcı bildirim izni ister — verin.
3. purplemux-improved sunucunun VAPID anahtarlarına karşı bir Web Push aboneliği kaydeder.

Abonelik `~/.purplemux/push-subscriptions.json`'da saklanır ve belirli tarayıcı/cihazınızı tanımlar. Bildirim almak istediğiniz her cihazda adımları tekrarlayın.

{% call callout('warning', 'iOS, Safari 16.4 + bir PWA gerektirir') %}
iPhone ve iPad'de Web Push, yalnızca purplemux-improved'ı ana ekrana ekledikten ve o simgeden başlattıktan sonra çalışır. Ayarlar sayfasını bağımsız PWA penceresinden açın — bildirim izin istemi normal bir Safari sekmesinde işe yaramaz. Önce PWA'yı kurun: [PWA kurulumu](/purplemux-improved/tr/docs/pwa-setup/).
{% endcall %}

## VAPID anahtarları

purplemux-improved ilk çalıştırmada bir uygulama-sunucu VAPID anahtar çiftini üretir ve `~/.purplemux/vapid-keys.json` (mod `0600`) içine saklar. Hiçbir şey yapmanıza gerek yok — abone olduğunuzda public anahtar otomatik olarak tarayıcıya sunulur.

Tüm abonelikleri sıfırlamak isterseniz (örneğin anahtarları döndürdükten sonra), `vapid-keys.json` ve `push-subscriptions.json`'u silin ve purplemux-improved'ı yeniden başlatın. Her cihaz yeniden abone olmalıdır.

## Arka plan teslimi

Abone olduktan sonra telefonunuz bildirimi OS push servisi üzerinden alır:

- **iOS** — APNs, Safari'nin Web Push köprüsü üzerinden. Teslim en iyi çabadır ve telefonunuz ağır kısıtlama altındaysa birleştirilebilir.
- **Android** — Chrome üzerinden FCM. Genellikle anlık.

Bildirim, purplemux-improved ön planda olsun ya da olmasın gelir. Panel şu anda cihazlarınızdan _herhangi birinde_ görünüyorsa, çift uyarıyı önlemek için purplemux-improved push'u atlar.

## İçeri atlamak için dokunun

Bir bildirime dokunmak purplemux-improved'ı tetikleyen oturuma doğrudan açar. PWA zaten çalışıyorsa odak doğru sekmeye geçer; aksi halde uygulama başlar ve doğrudan oraya gider.

## Sorun giderme

- **Anahtar gri** — Service Workers veya Notifications API desteklenmiyor. **Ayarlar → Tarayıcı kontrolü**'nü çalıştırın veya [Tarayıcı desteği](/purplemux-improved/tr/docs/browser-support/) sayfasına bakın.
- **İzin reddedildi** — sitenin bildirim iznini tarayıcı ayarlarınızdan temizleyin, sonra purplemux-improved'ta yeniden açın.
- **iOS'ta push yok** — ana ekran simgesinden, Safari'den değil, başlattığınızı doğrulayın. iOS'un **16.4 veya üstü** olduğunu doğrulayın.
- **Self-signed sertifika** — Web Push kayıt olmaz. Tailscale Serve veya gerçek sertifikalı bir ters proxy kullanın. [Tailscale erişimi](/purplemux-improved/tr/docs/tailscale/) sayfasına bakın.

## Sıradaki adımlar

- **[PWA kurulumu](/purplemux-improved/tr/docs/pwa-setup/)** — iOS push için zorunlu.
- **[Tailscale erişimi](/purplemux-improved/tr/docs/tailscale/)** — dış teslim için HTTPS.
- **[Güvenlik & kimlik doğrulama](/purplemux-improved/tr/docs/security-auth/)** — `~/.purplemux/` altında ne daha var.

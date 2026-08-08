# Devlog

Kronolojik, tarihli karar/değişiklik kaydı — "ne değişti, neden" özeti.
Kod detayı için git log yeterli; burada asıl neden ve bağlam durur.

Yeni giriş eklerken en üste (en yeni en üstte) ekle:

```
## YYYY-MM-DD
- Ne değişti, neden. Varsa alternatif ve neden elenmediği.
```

---

## 2026-08-08 (2)
- AE tarafında upstream `aftr` paneli (`com.ae-bridge.panel`) kaldırıldı,
  yerine kendi forkumuzun paneli (`com.coltranesx.mograph-mcp.panel`)
  `npm run deploy:panel` ile build/self-sign/kur edilip AE'ye bağlandı.
  Controller (`npm run controller`, port 8787) ayakta, `claude mcp list`
  connected gösteriyor. Smoke test yapıldı: `ae_status` (AE 26.3x87),
  `ae_list_commands` (103 komut), test comp + text layer oluşturma
  round-trip'i başarılı (`mograph-mcp_smoketest`, kaydedilmedi/render
  alınmadı — sadece boru hattı doğrulaması).
  **Bilinen durum:** controller şu an kalıcı bir servis değil, arka plan
  shell process'i olarak çalışıyor — terminal/oturum kapanınca düşer.
  Yeni oturumda AE bağlantısı "failed to connect" görülürse önce
  `npm run controller` ile yeniden başlat, sonra AE'de paneli
  kapatıp tekrar aç (Window > Extensions > mograph-mcp).

## 2026-08-08
- Repo, [aftr](https://github.com/Arman-Luthra/aftr) (aftr-studio, Arman Luthra, MIT)
  projesinden fork edilip `mograph-mcp` olarak yeniden markalandı. Bağımsız
  geliştirmeye buradan devam ediliyor; `LICENSE` içinde tam atıf var.
- `docs/hero.png` → `docs/hero.jpg`: README'de 880px genişlikte gösterilen bir
  fotoğraf PNG olarak taşınıyordu (2560×1080, 2.65MB). Retina için 1760px (2x)
  yeterli; format da fotoğraf içerik için PNG yerine JPEG'e çevrildi
  (q90, 1760×742, 301KB — aynı görsel, ~%89 daha küçük dosya). Aspect korunuyor.
  `docs/pals-title-demo.gif` bilinçli olarak dokunulmadı: gerçek bir AE render
  çıktısının fonksiyonel kanıtı, statik görselle değiştirilmesi güven kaybı
  yaratır (bkz. proje kararı, CLAUDE.md).
- `docs/DEVLOG.md` ve kök `CLAUDE.md` oluşturuldu: proje büyüdükçe kararların
  ve oturumlar arası bağlamın kaybolmaması için.

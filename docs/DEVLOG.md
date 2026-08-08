# Devlog

Kronolojik, tarihli karar/değişiklik kaydı — "ne değişti, neden" özeti.
Kod detayı için git log yeterli; burada asıl neden ve bağlam durur.

Yeni giriş eklerken en üste (en yeni en üstte) ekle:

```
## YYYY-MM-DD
- Ne değişti, neden. Varsa alternatif ve neden elenmediği.
```

---

## 2026-08-08 (6)
- **Faz 0 altyapı paketi tamamlandı** (ROADMAP.md'deki 5 madde, Sonnet'te):
  1. **Controller artık LaunchAgent.** `tools/service.mjs` (+ `npm run
     service:install/uninstall/status/restart`) `~/Library/LaunchAgents/
     com.coltranesx.mograph-mcp.controller.plist` kurup yükler — port 8787,
     loglar `~/Library/Logs/mograph-mcp/`. `RunAtLoad` + `KeepAlive` ile
     oturum/reboot sağ kalıyor. launchd'nin minimal `PATH`'i yüzünden
     ffmpeg bulunamıyordu (`controller/src/media.js` `spawn`); plist'e
     `/opt/homebrew/bin` içeren tam `PATH` eklendi — config.json'da
     ffmpeg'e özel yol yazmak yerine kök nedeni (launchd ortamı) düzeltmek
     daha genel çözüm. Manuel arka plan process durduruldu, LaunchAgent
     devraldı; panel birkaç saniyede otomatik reconnect etti.
  2. **`/fewer-permission-prompts` çalıştırıldı.** Bu repoya özgü transkript
     verisi çok ince çıktı (taranan 50 oturumun çoğu ilgisiz bir trading
     projesindendi) — tek kalıcı bulgu `claude mcp list *` (≥3 kez, salt
     okunur). `curl`/`python3`/`node`/`eval`/`npm run *` gibi adaylar ya
     zaten auto-allow kapsamında ya da mutasyon riski taşıyor (özellikle
     `curl` → controller'ın `/command`'ı AE tarafında yazma komutu tetik-
     leyebilir) diye elendi. `.claude/settings.json` (yeni dosya, `settings.
     local.json`'dan ayrı) bu tek kuralla oluşturuldu.
  3. **Discovery cache: `tools/discovery-cache.mjs` → `docs/reference/
     {effects,fonts,effects-detail}.json`.** Tekrar çalıştırılabilir (canlı
     controller'a REST üzerinden bağlanıyor). `effects-detail.json` kod
     tabanında zaten kullanılan efektleri (Lumetri, Glow, Turbulent
     Displace, Fractal Noise, Deep Glow 2, Shadow Studio 3, CC Toner) +
     tipografi/lower-third için gerekecek birkaç temel efekti (Drop Shadow,
     Gaussian Blur, Curves) `introspectEffect` ile tam parametre ağacıyla
     dump ediyor.
     - **Büyük bulgu: `app.effects` gerçek, dokümante edilmemiş bir
       enumerasyon API'si — var ve çalışıyor.** `AE_BRIDGE_ALLOW_DEV=1` +
       `runJSX` ile canlı test edildi (geçici olarak; LaunchAgent'ın
       plist'i dev modu kalıcı açmıyor, test bitince kapatılıp servis
       normal haliyle geri yüklendi). `app.effects` (ve eşdeğeri
       `app.internalEffects`) 446 elemanlı bir dizi, her eleman
       `{displayName, matchName, category, version, isDeprecated}`
       taşıyor — `listInstalledEffects`'in şu anki 157 isimlik sabit
       liste probe'unu (149 bulgu) **tam enumerasyonla değiştirebilir**,
       tahmin/probe'a gerek kalmaz. Henüz uygulanmadı — bu bir Faz 0
       bulgusu, `listInstalledEffects`'i buna geçirmek ayrı bir iş
       (ROADMAP'e eklenmeli).
  4. **`.claude/skills/ae-up/` proje skill'i.** `/ae-up`: controller ayakta
     mı (REST `/api/status`) → panel bağlı mı (`status.connected`) → round
     trip gerçekten çalışıyor mu (`ping` ile AE versiyonu dönüyor mu) —
     üç katmanı ayrı ayrı kontrol edip hangisinin kırık olduğunu raporluyor
     (tek "bağlı değil" mesajı yerine).
  5. **`config.json`'a `defaults` + `presets`.** `defaults`: 1920×1080,
     **25 fps** (30 değil), 10sn. `presets`: `hd`, `vertical` (1080×1920),
     `square` (1080×1080), `portrait` (1080×1320) — hepsi 25 fps.
     `shared/src/commands.js`'teki `createComp` artık bunları
     `shared/src/config.js` üzerinden okuyor; `preset` param'ı verilirse
     onu taban alıp explicit param'lar yine üstüne yazabiliyor. JSX
     tarafındaki (`panel/jsx/commands/comp.jsx`) son çare fallback'i de
     30'dan 25'e çekildi (yalnızca `shared` validasyonunu atlayan çıplak
     `runJSX`/socket çağrıları için anlamlı — normal MCP yolu zaten
     config'ten çözülmüş param gönderiyor). Testler güncellendi (3 yeni:
     preset uyguluyor, explicit override preset'i eziyor, bilinmeyen preset
     reddediliyor) — `npm test` 111/111 yeşil.
  - README'ye LaunchAgent kurulum notu eklendi (`npm run service:install`).
  - **Doğrulama (ROADMAP'in "bitince" maddesi):** `npm test` yeşil;
    kalıcılık `launchctl print`'te `state = running`,
    `properties = keepalive | runatload` ile doğrulandı (terminal kapat/aç
    testini kullanıcı ayrıca teyit edebilir); "1080p comp aç" artık 25 fps
    dönüyor (test + canlı doğrulama).

## 2026-08-08 (5)
- `docs/ROADMAP.md` oluşturuldu: faz planı + shape temeli spec'i. DEVLOG
  "ne oldu/neden", ROADMAP "sırada ne var" — ayrı işler, karıştırılmıyor.
- **Karar: shape operatörleri tek `addShapeOperator` komutunda.** Alternatif
  (operatör başına ayrı komut: `addTrimPaths`, `addRepeater`…) elendi;
  repoda `addEffect` zaten matchName alan tek komut, tutarlılık kazandı.
  Bu kararın maliyeti düşük (kayıtlı spec kütüphanesi henüz yok), sonradan
  değiştirilebilir — ilk değerlendirmede "pahalı" denmişti, yanlıştı.
- Öncelik sırası güncellendi: shape temeli, preset/şablon/format işlerinin
  **önüne** alındı. Kırık temelin üstüne kütüphane kurmanın anlamı yok.
- Reviewer (`claudeReviewer()` stub'ı) bilinçli olarak geç sıraya kondu:
  tek tek iş yapılırken çıktıya insan bakıyor, otonom öz-düzeltme asıl
  toplu üretimde anlam kazanıyor.

## 2026-08-08 (4)
- **Shape/vertex kabiliyet testi yapıldı (canlı AE, geçici `__probe` comp'u,
  sonra silindi).** Sonuç asimetrik: shape *kurulabiliyor ve okunabiliyor*,
  ama *animasyon edilemiyor*.
  - Çalışan: `addPathShape` (vertices + in/outTangents + closed),
    `getProperty` path'i tam döküyor (vertices, tangents, closed, feather).
  - **Kırık: path (vertex) animasyonu.** `setKeyframe` → `setValueAtTime`
    ve `setKeyframes` → `setValuesAtTimes` ikisi de "Object/Array is not of
    the correct type" veriyor. Sebep: ExtendScript gerçek bir `new Shape()`
    nesnesi istiyor, JSON'dan gelen düz nesneyi kabul etmiyor. `addPathShape`
    çalışıyor çünkü `new Shape()`'i JSX içinde kuruyor (`layer.jsx:122`).
    Düzeltme yolu net: keyframe komutları shape-değerli property algılayıp
    `new Shape()` kursun.
  - **Eksik: shape operatörleri.** Trim Paths ve Repeater `addEffect` ile
    eklenemiyor ("bad matchName or unsupported") — doğru davranış, çünkü
    `ADBE Vector Filter - *` layer efekti değil, shape grubunun içine giren
    operatör. Ayrı bir komut gerekiyor. Aynı şekilde Offset Paths, Zig Zag,
    Wiggle Paths/Transform, Round Corners, Merge Paths, Pucker & Bloat yok.
  - **Sessiz hata: `addShape`.** `shape:"polystar"` hata vermiyor, sessizce
    dikdörtgen üretiyor (`layer.jsx:90-91` — ellipse değilse rect). Hata
    vermekten kötü; fark edilmesi zor. Polystar eklenmeli, bilinmeyen shape
    değerinde açıkça hata verilmeli.
  - Ayrıca yok: gradient fill/stroke, dash/line cap/join, shape group
    transform, `getLayerDetails` shape içeriğini raporlamıyor.
- **Comp varsayılanları yanlış.** `createComp` hardcoded 1920×1080 / 10sn /
  **30 fps** (`shared/src/commands.js:36-40`); `config.json`'da comp
  varsayılanı yok. Korhan **25 fps** çalışıyor → MCP üzerinden açılan her
  comp sessizce yanlış frame rate'te geliyor. `config.json`'a `defaults`
  bloğu + ön ayarlar: `hd` 1920×1080, `vertical` 1080×1920, `square`
  1080×1080, `portrait` 1080×1320 — hepsi 25 fps.

## 2026-08-08 (3)
- **Proje yönü kararı: kendi prodüksiyon aracı.** Açık kaynak ürün / demo
  değil; öncelik Korhan'ın günlük AE işini hızlandırmak. İleride bir üretim
  aracına büyütme ihtimali açık ama şimdiden ona göre tasarlanmayacak
  (erken optimizasyon) — altyapı işleri (kalıcı servis, discovery cache,
  izinler) her iki yönde de aynı şekilde işe yarıyor.
- Kapsam çerçevesi: otomasyon hedefi "her şeyi konuşarak yapmak" değil,
  **parametrik/tekrarlı işi** (varyant üretimi, format türetme, şablon
  doldurma, toplu render) ve **kurulum işini** (comp yapısı, efekt zinciri,
  expression bağlama) devretmek. Zevk/yargı gerektiren ince craft elle
  kalıyor — orada konuşmak elle yapmaktan yavaş.
- Öncelik sırası (tekrarlı iş alanları arasında): format türetme + toplu
  render → tipografi/lower-third → logo/bumper şablonları → efekt/grade.
  Gerekçe: ilki sıfır craft kaybıyla saf kazanç, ikincisi repodaki en olgun
  taraf (`text.jsx`, `applyTextStyle`), üçüncüsü `.aep` şablon varlığı
  gerektiriyor (`aep/` şu an boş), dördüncüsü en zevk-yoğun yani otomasyona
  en az uygun olan.
- Tespit edilen asıl teknik borç: `controller/src/orchestrator/reviewers.js`
  içindeki `claudeReviewer()` bir stub. Otonom "render et → bak → düzelt"
  döngüsünün beyni yok; devrede olan `brightnessReviewer` yalnızca karenin
  çok karanlık olup olmadığına bakıp sabit bir delta dönüyor.

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

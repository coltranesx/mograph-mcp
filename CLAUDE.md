# mograph-mcp — proje bağlamı

Bu dosya her yeni Claude Code oturumunda otomatik okunur. Amacı: kod
tekrar okunarak çıkarılabilecek şeyleri değil, **neden böyle** olduğunu ve
oturumlar arasında kaybolan kararları taşımak.

## Ne bu proje

Node tabanlı bir controller, WebSocket üzerinden CEP paneline (After Effects
içinde çalışan) JSON komut gönderiyor; panel bunları ExtendScript olarak
çalıştırıp JSON sonuç döndürüyor. Üstte spec-driven, kendi kendini render
edip inceleyip düzelten otonom bir pipeline var. Detaylı mimari ve tool
kataloğu için `README.md` ve `docs/TEAM-GUIDE.md` yeterli — burada tekrar
etmiyorum.

## Şu an nerede (2026-08-08)

**Sırada ne var → [`docs/ROADMAP.md`](docs/ROADMAP.md). Yeni oturuma
başlarken önce oraya bak.**

- **Proje yönü: Korhan'ın kendi prodüksiyon aracı.** Açık kaynak ürün ya da
  demo değil. İleride büyütme ihtimali açık ama şimdiden ona göre
  tasarlanmıyor. Otomasyon hedefi "her şeyi konuşarak yapmak" değil;
  **parametrik/tekrarlı işi** (varyant üretimi, şablon doldurma, toplu
  render) ve **kurulum işini** (comp yapısı, efekt zinciri, expression
  bağlama) devretmek. Zevk/yargı gerektiren ince craft elle kalıyor.
- **Korhan 25 fps çalışıyor**, 30 değil. Ana formatlar: 1920×1080 (yatay),
  1080×1920 (dikey), 1080×1080 (kare), 1080×1320. Aynı işi birden fazla
  formatta teslim etmek nadir — format türetme düşük öncelikli.
- Faz 0 altyapı paketi bitti (Sonnet'te, DEVLOG 2026-08-08 (6)). Sırada:
  Faz 1 — shape temeli (spec ROADMAP'te).
- Model ayrımı: karar/tasarım işleri Opus'ta, yürütme Sonnet'te (ayrı
  terminal).

## Soy / attribution

[aftr](https://github.com/Arman-Luthra/aftr) (aftr-studio, Arman Luthra,
MIT) projesinin fork'u. `origin` = `coltranesx/mograph-mcp`, `upstream` =
`Arman-Luthra/aftr` (upstream'den faydalı düzeltmeler gelebilir diye remote
olarak duruyor, aktif sync planı yok). Atıf `LICENSE` ve README'de tam;
`package.json`'daki `author` alanı bilinçli olarak orijinal sahibinde
bırakıldı, Korhan `contributors`'a eklendi — bunu "düzeltme" diye
değiştirme.

## Alınmış kararlar (tekrar sorma / tekrar tartışma)

- **`docs/pals-title-demo.gif` statik görselle değiştirilmeyecek.** Gerçek
  bir AE render çıktısının fonksiyonel kanıtı; `docs/hero.jpg` ise marka
  görseli. İkisi farklı iş görüyor, biri diğerinin yerine geçmez.
- README'deki görseller `width="880"` ile gösteriliyor → yeni bir hero/demo
  görseli eklenirse 2x retina için ~1760px genişlik yeterli, orijinal
  kaynağı daha büyük tutma gerekmiyor. Fotoğraf içerikli görseller PNG değil
  JPEG (q90 civarı) olsun — bu boyut sınıfında gözle fark edilmez kalite
  kaybıyla çok daha küçük dosya.
- **Shape operatörleri tek komutta toplanıyor: `addShapeOperator`**, operatör
  başına ayrı komut değil. Gerekçe: `addEffect` de matchName alan tek komut,
  tutarlılık kazanıyor. Şema ve operatör tablosu ROADMAP'te.
- **Reviewer'ı gerçek yapmak bilinçli olarak geç sırada.** `claudeReviewer()`
  stub olduğu için otonom öz-düzeltme döngüsü çalışmıyor; ama tek tek iş
  yapılırken çıktıya zaten insan bakıyor. Toplu üretim başlayınca sırası
  gelir — "önce bunu bitirelim" diye öne çekme.
- Detaylı gerekçe ve tarih için → [`docs/DEVLOG.md`](docs/DEVLOG.md).

## Devlog

Önemli bir değişiklik/karar olduğunda `docs/DEVLOG.md`'ye tarihli, kısa bir
madde ekle (ne değişti, neden — alternatif elendiyse neden). Bunu otomatik
yap, kullanıcıya sorma. Rutin/triviyal değişiklikler (typo, dependency
bump) için girişe gerek yok.

## Konvansiyonlar

- Dosya/klasör: kebab-case, gereksiz ara katman/klasör açma, tek seviye
  gruplama yeterli.
- Var olan bir dosyayı/repoyu sebepsiz yeniden adlandırma.
- Geçici dosyalar scratchpad'e, projeye değil.
- `git push` her seferinde ayrı onay ister — otomatik push yapma.

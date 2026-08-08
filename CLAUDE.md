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

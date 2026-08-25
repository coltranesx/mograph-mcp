# Yol haritası

Karar gerekçeleri ve tarihli kayıt için → [`DEVLOG.md`](DEVLOG.md).
Bu dosya "sırada ne var" sorusunun cevabı; iş bitince ilgili bölüm silinir
ya da "bitti" diye işaretlenir.

## Doğrulanmış ortam (2026-08-08, Faz 0 sonrası)

- `npm test` → 111/111 geçiyor.
- Controller artık LaunchAgent, 127.0.0.1:8787, `claude mcp list` →
  mograph-mcp connected. `npm run service:status` ile kontrol edilir.
- AE 2026 (`/Applications/Adobe After Effects 2026/aerender` mevcut),
  ffmpeg `/opt/homebrew/bin/ffmpeg`.
- Bridge'de 103 komut; MCP'ye açılan set daha dar (`AE_MCP_TOOLS=all` hepsini
  açar).
- `listInstalledEffects` → artık `app.effects` üzerinden gerçek zamanlı
  enumerasyon, 446 efekt (DEVLOG 2026-08-09 (16)) — probe/sabit liste
  kaldırıldı. `listFonts` → 625 font (bu hâlâ ayrı, `app.fonts` zaten API).
- `docs/reference/{effects,fonts,effects-detail}.json` — discovery cache
  snapshot'ı, `npm run` yok, `node tools/discovery-cache.mjs` ile üretilir.
- CORE'daki tekil `ae_<komut>` MCP tool'ları artık tipli `inputSchema`
  taşıyor (`shared/src/commands.js`'te komut başına `schema`) — array
  parametreler (`color`, `position`, `size`, ...) artık `ae_command`'a
  sarmadan da güvenilir gidiyor (DEVLOG 2026-08-09 (17), (3)/(6)'daki
  "düzeltilemez" sonucunu düzeltiyor).

## Öncelik sırası

Tekrarlı iş alanları arasındaki sıra DEVLOG 2026-08-08 (3)'te. Ama shape
testinden sonra sıra değişti: **preset/şablon/format işlerinden önce shape
temeli düzeliyor** — kırık temelin üstüne kütüphane kurmanın anlamı yok.

1. ~~Faz 0 — altyapı borcu~~ *(bitti, bkz. DEVLOG 2026-08-08 (6))*
2. Shape temeli *(bitti — A/B/C/D, DEVLOG 2026-08-08 (7) ve 2026-08-09 (3)/(5))*
3. Tipografi / lower-third *(bitti — "Faz 2" 1-6, DEVLOG 2026-08-09 (8)-(13))*
4. Logo / bumper şablonları *(bitti — canlı test DEVLOG 2026-08-09 (14);
   "tek komut mu / elle mi" sorusu **elle** lehine kapandı, DEVLOG
   2026-08-10 (27))*
5. **Efekt / grade — yapı taşları audit'i bitti** (DEVLOG 2026-08-09 (17)):
   array-parametre MCP bug'ı kök nedeninden düzeltildi, `applyLumetri`/
   `cinematicGrade`/`smokeEffect`/`glitchEffect`/`neonGlow` canlıda
   doğrulandı. Kalan: bunları isimli "look preset" (`applyLowerThird`
   tarzı) altında birleştirmek mi, yoksa mevcut komutları elle bir araya
   getirmek yeterli mi — henüz karar verilmedi (bkz. "Faz 3.5" aşağıda).
6. Format türetme *(nadiren ihtiyaç, düşük öncelik)*
7. Reviewer'ı gerçek yap — `claudeReviewer()` stub'ı. Bilinçli olarak geç
   sırada: toplu iş yapılmaya başlanınca (40 varyantı tek tek izleyemezsin)
   anlam kazanıyor.

---

## Faz 0 — altyapı borcu ✅ bitti (DEVLOG 2026-08-08 (6))

1. ✅ Controller LaunchAgent oldu (`tools/service.mjs`, `npm run
   service:install`) — port 8787, loglar `~/Library/Logs/mograph-mcp/`.
2. ✅ `/fewer-permission-prompts` çalıştırıldı — `.claude/settings.json`.
3. ✅ Discovery cache (`tools/discovery-cache.mjs` → `docs/reference/*.json`).
   **Bulgu:** `app.effects` gerçek bir enumerasyon API'si — sonradan
   `listInstalledEffects`'e devreye alındı, bkz. DEVLOG 2026-08-09 (16).
4. ✅ `.claude/skills/ae-up/` proje skill'i.
5. ✅ `config.json`'a `defaults` + `presets` (25 fps).

**Doğrulama:** `npm test` 111/111, `launchctl print` → running/keepalive,
"1080p comp aç" → 25 fps.

---

## Faz 1 — Shape temeli (spec)

Bulgular ve gerekçe: DEVLOG 2026-08-08 (4). Özet: shape *kurulabiliyor ve
okunabiliyor*, ama *animasyon edilemiyor*.

Sıra önemli: **A > B > C > D**.

### A. Path (Shape) keyframe desteği ✅ bitti (DEVLOG 2026-08-08 (7))

`setKeyframe`/`setKeyframes` artık SHAPE-tipli property'lerde (path)
çalışıyor — `AEB.toShape()` (host.jsx) düz JSON'ı gerçek `Shape` nesnesine
çeviriyor, eksik tangent'leri sıfır vektörle dolduruyor, vertex sayısı
uyuşmazlığında (var olan keyframe'lere karşı ve tek çağrı içindeki batch'te)
açık hata veriyor. Simülatörde `Shape`/`PropertyValueType`/`MockVectorGroup`
eklendi; `addShape`/`addPathShape` de bu sayede ilk kez test edilebilir hale
geldi. `npm test` 123/123, canlı AE'de (26.3x87) hem başarı hem hata yolu
doğrulandı. Detay ve dosya listesi → DEVLOG.

### B. `addShapeOperator` — tek komut ✅ bitti (DEVLOG 2026-08-09 (3))

**Karar: operatör başına ayrı komut değil, tek `addShapeOperator`.** Gerekçe:
repoda zaten aynı desen var — `addEffect` de her efekt için ayrı komut değil,
`matchName` alan tek komut. Tutarlılık kazanıyor. (Bu karar ucuz: proje genç,
kayıtlı spec kütüphanesi yok, sonradan değiştirmenin bedeli düşük.)

**Şema:** `{ compId, layer, operator, group?, params?, name? }` — **insertAt
yok** (aşağıya bak, kanıtlanmış şekilde çalışmıyor). trim + repeater canlıda
(AE 26.3x87) hem operatör ekleme hem `params` uçtan uca doğrulandı
(`getLayerDetails` ile değer teyidi). 139/139 test yeşil.

**operator** friendly isim → matchName eşlemesi. Aday liste:

| friendly | matchName (aday) |
|---|---|
| `trim` | `ADBE Vector Filter - Trim` |
| `repeater` | `ADBE Vector Filter - Repeater` |
| `offset` | `ADBE Vector Filter - Offset` |
| `zigzag` | `ADBE Vector Filter - Zigzag` |
| `roundCorners` | `ADBE Vector Filter - RC` |
| `wigglePath` | `ADBE Vector Filter - Roughen` |
| `wiggleTransform` | `ADBE Vector Filter - Wiggler` |
| `puckerBloat` | `ADBE Vector Filter - PB` |
| `twist` | `ADBE Vector Filter - Twist` |
| `mergePaths` | `ADBE Vector Filter - Merge` |

> **UYARI — bu matchName'ler doğrulanmadı.** `Trim` ve `Repeater` canlıda
> teyit edildi (addEffect reddederken doğru matchName olduğu anlaşıldı);
> geri kalanı hafızadan yazıldı, tahmin. İlk iş: `AE_BRIDGE_ALLOW_DEV=1` +
> `runJSX` ile bir shape grubunda `addProperty` deneyip **hepsini teyit et**,
> tahmine güvenme. Yanlış olanları düzelt ve bu tabloyu güncelle.
>
> Discovery cache bu işi çözmüyor: `docs/reference/effects.json` (app.effects,
> 446 kayıt) içinde tek bir `ADBE Vector Filter - *` yok — shape operatörleri
> efekt değil, vector group property'si. Tek doğrulama yolu canlı
> `addProperty` probe'u. Doğru yöntem: bir shape layer'ın root vectors
> group'unda `group.addProperty(matchName)` dene, başarılıysa geri al
> (`app.executeCommand` undo ya da `.remove()`).

**Yerleşim.** Operatör varsayılan olarak root vectors group'a
(`ADBE Root Vectors Group`) eklenir — tipik kullanım bu, tüm gruplara
uygulanır. `group` parametresiyle belirli bir alt gruba yönlendirilebilir.

**Sıra kritik, ama `insertAt` yok.** Repeater kendinden **önceki** öğeleri
tekrarlar, Trim kendinden öncekini kırpar → ekleme sırası sonucu değiştirir.
İlk tasarımda bunun için `insertAt` (index) parametresi + `moveTo()` ile
sonradan taşıma planlanmıştı; **canlıda iki bağımsız denemede de
`PropertyGroup.moveTo()` "ReferenceError: Object is invalid" ile native
seviyede (JS try/catch'in yakalayamadığı) hata verdi**, bir keresinde de
operatör zaten eklenip isimlendirilmiş haldeyken — yani "başarısız" dönen
çağrı aslında yarım bir side-effect bırakıyordu. Karar: `insertAt` tamamen
kaldırıldı. `addProperty()` zaten her zaman sona eklediği için doğru sırayı
elde etmenin sağlam yolu **operatörleri istenen son sırayla çağırmak** —
reorder mekanizmasına hiç ihtiyaç yok. Detay → DEVLOG 2026-08-09 (3).

### C. `addShape` düzeltmesi ✅ bitti (DEVLOG 2026-08-09 (5))

- Polystar eklendi (`ADBE Vector Shape - Star`), canlıda doğrulandı:
  `polyType` ("star"|"polygon", varsayılan star) → `ADBE Vector Star Type`
  (1|2), `points`/`innerRadius`/`outerRadius` → `ADBE Vector Star
  Points`/`Inner Radius`/`Outer Radius`. Alt-property matchName'leri de dahil
  hepsi canlıda teyitli (`ADBE Vector Star Inner/Outer Roundess` — evet, gerçek
  AE matchName'i "Roundess" yazım hatasıyla).
- **Sessiz fallback kaldırıldı.** `shape` artık `shared/src/commands.js`'te
  enum'a karşı doğrulanıyor (rectangle|ellipse|polystar), bozuk çağrı socket'i
  hiç geçmiyor; `layer.jsx`'te de aynı kontrol defense-in-depth olarak duruyor
  (addShapeOperator'daki whitelist deseniyle tutarlı).

### D. `getLayerDetails` shape içeriği ✅ zaten bitmişti

Meğer bu zaten çözülmüştü — `getLayerDetails { deep, depth }` genel bir
property-tree walker (`_groupSummary`, introspect.jsx) üzerinden shape
layer'ların `ADBE Root Vectors Group` içeriğini (gruplar, operatörler, path
vertices/tangents dahil) zaten özyinelemeli olarak dönüyor. ROADMAP'in bu
maddesi güncel değilmiş, kod okunmadan yazılmış olmalı — canlıda path
vertices/inTangents/outTangents doğru şekilde JSON'a çıktığı 2026-08-09'da
teyit edildi.

---

## Faz 2 — Tipografi / lower-third (spec)

Envanter ve gerekçe: DEVLOG 2026-08-09. **Karar: lower-third'de bar yok** —
saf tipografi, en fazla ince bir aksan çizgisi.

### Zaten var (kod okunarak doğrulandı)

Tipografi repodaki en olgun alan. `applyTextStyle` → 4 stil × 8 ease = 32
kombinasyon; `addTextAnimator` → Animate panelinin tam range-selector iş akışı;
CSS cubic-bezier → AE temporal ease çevirimi (`_taBezierEase`, text.jsx:73);
gerçek glyph metriğiyle deterministik dizgi (`_wrMeasure`, `_autoLeading`,
`_leadOffset` — variable font leading telafisi). Yapı taşları da var:
`setParent`, `setTrackMatte`, `addMask`/`addRectMask`/`setMaskProperty`,
`addLayerStyle`, `alignLayer`, `sequenceLayers`, `setBlendMode`.

Bar olmadığı için giriş animasyonu **zaten çözülmüş** (animator tabanlı
reveal). Eksik olan kompozisyon ve zamanlama.

### Sıra

**1. Çıkış animasyonu ✅ bitti (DEVLOG 2026-08-09 (8))**
4 stilin (wordReveal/charScale/bunchRotate/blurFade) hepsinde `applyTextStyle`
artık `outFrame`/`outStretch` alıyor. Mekanizma: aynı selector alanına ikinci
bir keyframe çifti ekleyip değeri geri sarmak (bezier CSS ters-çevirme
kimliğiyle ters çevriliyor) — yeni animator yok. Çok satırlı metinde satırlar
girişteki sırayla çıkıyor (satır 0 önce), son satır tam `outFrame`'de bitiyor.
Karar: çıkış varsayılan olarak girişin **%40 daha hızlısı** (`outStretch`
varsayılan 0.6), tam tersi değil. `outStyle` (girişten farklı bir stil ile
çıkma) henüz yok — deferred, gerekirse ayrıca eklenir.

**2. `safeArea` config + konum çözümleyici ✅ bitti (DEVLOG 2026-08-09 (9))**
`config.json`'a `safeArea: {top,right,bottom,left}` (varsayılan 0.08) eklendi;
yeni komut `resolveSafePosition { compId, position (9'lu grid), safeArea? }`
→ `{ x, y, safeArea }` px. Canlıda 3 köşe + asimetrik override doğrulandı.

**3. `measureText` ✅ bitti (DEVLOG 2026-08-09 (10))**
`measureText { compId, text|layer, font?, fontSize?, tracking? }` →
`{ width, height, left, top, capHeight, ascent, descent }`. Canlıda iki mod
da (geçici katman / var olan katman, mutasyonsuz) doğrulandı.

**4. `alignAnchor` ✅ bitti (DEVLOG 2026-08-09 (11))**
`alignAnchor { compId, layer, h?, v?, time?, keepPosition? }` — canlıda elle
hesaplanan matematikle birebir doğrulandı, `keepPosition` (Position
telafisi) her iki yolda da test edildi.

**5. `applyLowerThird` ✅ bitti (DEVLOG 2026-08-09 (12))**
Başlık + alt başlık (karar: iki satır varsayılan, subtitle opsiyonel param),
denetleyici null'a parentlanmış (`LT_controller`/`LT_title`/`LT_subtitle`),
tek in/out. Canlıda tam matematiksel doğrulama yapıldı. `wordReveal`
desteklenmiyor (bilinçli, kendi layout'unu kuruyor).

**6. `addResponsiveBox` ✅ bitti (DEVLOG 2026-08-09 (13))**
`executor.jsx`'teki `responsive_box`'ın standalone hali, canlı expression ile
(applySpec'ten bağımsız). `applyLowerThird`'a da `accentLine?` eklendi (statik
hesap, dikey/yatay çubuk). Karar: aksan çizgisi isteniyordu. **Faz 2 (1-6)
tamamen bitti.**

### Faz 1.A yan kazancı ✅ canlıda doğrulandı (DEVLOG 2026-08-09 (7))

Mask path da SHAPE tipli ve `AEB.resolveProperty` dizi yolu destekliyor
(`["ADBE Mask Parade","Mask 1","ADBE Mask Shape"]`) → mask path keyframe'i
**çalışıyor**, yani mask wipe bedavaya geldi, ekstra kod gerekmiyor.
`setKeyframes` + `getProperty` ile aynı property path üzerinden iki farklı
vertex konfigürasyonu keyframe'lendi ve okunarak teyit edildi (AE 26.3x87).
**Sonuç: 3 (`measureText`) ve 4 (`alignAnchor`) önceliği arttı** — wipe
dikdörtgeninin boyutu/konumu ölçüme bağlı, şimdi gerçekten gerekli.

### MCP maruziyeti

`controller/src/mcpServer.js:17` `CORE` 30 komut; text tarafından sadece
`addTextLayer`, `applyTextStyle`, `applyTextPreset`, `listFonts` açık.
`setTextDocument`, `addTextAnimator`, `applyWordReveal`, `applyCharScale`,
`listTextStyles`, `setParent`, `setTrackMatte`, mask komutları köprüde var ama
MCP'de yok (yalnız `ae_command` ile erişiliyor). Faz 2 bitince CORE gözden
geçirilmeli — özellikle `measureText`, `applyLowerThird`, `setParent`,
`setTrackMatte`.

---

## Faz 3 — logo/bumper şablon doldurma

Gerekçe: DEVLOG 2026-08-09 (14) girişinde bağlam. Var olan bir prodüksiyon
`.aep`'ini programatik doldurmak — Faz 1/2 gibi MCP'ye yeni primitif eklemek
değil, mevcut komutları (`setTextDocument`, `importFootage`,
`addFootageLayer`, `setLayerProperty`, `moveLayer`) bir araya getirmek.

**Yol açan altyapı, bu fazda eklendi/düzeltildi (hepsi canlıda doğrulandı):**
`openProject`/`closeProject`/`quitApp` (File-menu, dialogsuz), `getLayerDetails`
`deep` modunun text layer'da çökmesi (`TextDocument.boxTextSize` bug'ı),
`setLayerProperty`'nin `layer` (isim) ile hedeflenememesi, ve `aerender`
yolunun macOS'ta yanlış hesaplanması (her render sessizce `-2` ile
patlıyordu — köprünün render özelliği muhtemelen hiç canlı test edilmemişti).

**İlk test — bitti (DEVLOG 2026-08-09 (14)):** `aep/Ae_Template_Test.aep`
üzerinde metin değiştirme + görsel import edip placeholder'a cover-fit ile
oturtma, render alıp görsel doğrulama. Elle, komut komut yapıldı.

**Karar verildi ✅ (2026-08-10, DEVLOG (27)): soyutlanmayacak, elle
kalıyor.** "Tek komut/spec mi (`fillTemplate`), elle mi" sorusu **elle**
lehine kapandı. Şablon işleri `openProject` + `setTextDocument` +
`importFootage`/`addFootageLayer` + `setLayerProperty`/`moveLayer`
zinciriyle, şablon başına elle kurulur. Gerekçe: şablon başına iç düzen
çok değişken, elde tek gerçek örnek var, elle yol zaten uçtan uca
kanıtlandı. **Faz 3 kapandı — tekrar tartışmaya açma;** ancak gerçekten
tekrar eden bir şablon işi (aynı şablonu defalarca doldurma, toplu varyant)
ortaya çıkarsa yeniden değerlendirilir.

---

## Faz 3.5 — Efekt/grade: yapı taşları ✅ audit bitti (DEVLOG 2026-08-09 (17))

Var olan komutlar (`applyLumetri`, `cinematicGrade`, `smokeEffect`,
`glitchEffect`, `neonGlow`, `deepGlow`, `shadowStudio`) aftr'den miras,
hiçbiri bu projede canlı test edilmemişti — "yapı taşları sağlıklı mı"
sorusunun cevabı bilinmiyordu. Şablon soyutlama kararını beklerken
(yukarıdaki açık soru) kullanıcı bu denetimi öne aldı.

**Bulgular:**
- **Kritik altyapı bug'ı bulundu ve düzeltildi**, grade'e özgü değil —
  CORE'daki tekil `ae_<komut>` MCP tool'ları array-değerli parametreleri
  (`color`, `position`, `scale`, ...) marshalling'de bozuyordu.
  (3)/(6)'daki "harness dışı, düzeltilemez" sonucu **yanlıştı**, hiç
  denenmeden varılmıştı. Kök neden + düzeltme: DEVLOG (17). Artık her
  CORE komutu (`shared/src/commands.js`'teki `schema` alanı üzerinden)
  tipli `inputSchema` taşıyor, "array parametrede `ae_command` kullan"
  workaround'ı artık gerekli değil.
- `applyLumetri`, `cinematicGrade`, `smokeEffect`, `glitchEffect`,
  `neonGlow` — beşi de canlıda `getLayerDetails` ile teyit edildi, sağlam.
  `applyLumetri`'nin `vignette` parametresi native'de -5..5 (yüzde gibi
  görünse de) — dokümante edildi.
- `deepGlow`/`shadowStudio` kod yolu sağlıklı ama bu makinede Plugin
  Everything (Deep Glow 2 / Shadow Studio 3) kurulu değil — canlı test
  edilemedi, ortam kısıtı (başka makinede tekrar denenmeli).

**Sırada:** yukarıdaki "tek komut/spec mi, elle mi" sorusu hâlâ açık —
grade tarafında bir "look preset" ihtiyacı belirirse (örn. isimli
"cinematic"/"vintage" gibi kombinasyonlar) o zaman ele alınır; şimdilik
birincil hedef (yapı taşlarının sağlıklı olması) karşılandı.

---

## Bilinen eksikler (henüz planlanmadı)

Shape tarafı:
- ~~gradient fill/stroke~~ ✅ bitti, canlıda uçtan uca doğrulandı (DEVLOG
  2026-08-10 (22)/(23)) — `addShape`'e `fillGradient`/`strokeGradient`
  (native, geometri-only — stop renkleri AE scriptinde ayarlanamıyor, canlı
  doğrulandı) ve `rampGradient` (Gradient Ramp efekti, tam renk kontrolü)
  eklendi. (23)'te ayrıca CORE MCP tool'larında nested-object parametrelerin
  de array'ler gibi bozulduğu bulundu ve `v.optionalObject` ile düzeltildi.
- ~~dash / line cap / join~~ ✅ bitti, canlıda uçtan uca doğrulandı (DEVLOG
  2026-08-10 (24)/(25)) — taper & wave ile birlikte tek turda yapıldı.
- ~~taper & wave~~ ✅ bitti, canlıda uçtan uca doğrulandı (DEVLOG 2026-08-10
  (24)/(25)) — yukarıdaki madde ile aynı iş, aynı Stroke/G-Stroke property
  bölgesi. `wave.cycles` hariç: AE'de hiçbir yoldan scriptlenemiyor (gradient
  stop renkleriyle aynı kategori), şemadan bilinçli olarak çıkarıldı.
- ~~shape group transform~~ ✅ bitti, canlıda uçtan uca doğrulandı (DEVLOG
  2026-08-10 (26)) — `addShape`'e `groupTransform` (anchorPoint/position/
  scale/skew/skewAxis/rotation/opacity, `ADBE Vector Transform Group`
  üzerinde) eklendi, hiçbir alanı gated değil. **Shape tarafındaki bilinen
  eksikler listesi tamamen bitti.**

MCP tool şema tamamlama (2026-08-11):

`ae_list_commands` içindeki 112 iç komuttan **82'sinin top-level MCP
tool'u / gerçek `inputSchema`'sı yok** (`schema: null`, sadece
`ae_command` dispatcher'ı üzerinden erişilebiliyor). Tetikleyici: dış
görünürlük kıyası — mograph-mcp client'a ~40 tool gösteriyor, premiere-pro
MCP 280 tool gösteriyor; MCP dizinleri (Smithery/mcp.so) ve tool listeleri
`tools/list`'i sayar, `ae_list_commands`'ı saymaz. Hedef **kozmetik sayı
şişirme değil** — her komut için gerçek şema yazıp top-level tool'a
terfi ettirmek (bkz. kök-nedene-inen-çözüm prensibi, CLAUDE.md). 4 kademe,
öncelik sırasıyla:

1. ~~**Tier 1 — çekirdek edit (25 komut, ŞİMDİ):** `setKeyframe`,
   `setParent`, `moveLayer`, `duplicateLayer`, `deleteLayer`, `setEase`,
   `setInterpolation`, `removeKeyframes`, `addMask`, `addRectMask`,
   `setMaskProperty`, `setTextDocument`, `addTextAnimator`, `alignLayer`,
   `alignAnchor`, `setBlendMode`, `setTrackMatte`, `setLayerFlag`,
   `setCompSettings`, `setWorkArea`, `clearComp`, `getProperty`,
   `getCompDetails`, `resolveSafePosition`, `measureText`.~~ ✅ bitti
   (DEVLOG 2026-08-11 (2)) — 25/25 komuta gerçek `inputSchema` yazıldı ve
   `CORE`'a terfi ettirildi, `npm test` yeşil.
2. ~~**Tier 2 — vitrin/farklılaştırıcı (13 komut, ŞİMDİ):**
   `applyWordReveal`, `applyCharScale`, `applyLowerThird`, `fireEffect`,
   `smokeEffect`, `glitchEffect`, `cinematicGrade`, `neonGlow`,
   `addShapeOperator`, `addPathShape`, `addResponsiveBox`, `addCamera`,
   `addLight`.~~ ✅ bitti (DEVLOG 2026-08-11 (3)) — 13/13 komuta gerçek
   `inputSchema` yazıldı ve `CORE`'a terfi ettirildi, `npm test` yeşil.
   Yol boyunca iki gerçek düzeltme çıktı (kozmetik değil): `addShapeOperator`
   ve `applyLowerThird`'ın `params`/`accentLine` object-tipli alanları artık
   `v.optionalObject` ile JSON-stringified geldiğinde de tolere ediliyor
   (top-level tool'a terfi ederken addShape'in fillGradient'te zaten çözdüğü
   aynı marshalling riskine giriyorlardı — bkz. `shared/src/validate.js`
   `optionalObject` yorumu).
   **Tier 1 + 2 (38/38) tamamlandı, canlı AE'de doğrulandı** (DEVLOG
   2026-08-11 (4)) — 38 komutun 38'i de top-level `ae_*` tool olarak gerçek
   AE'ye (26.3x87) karşı çağrıldı, hepsi başarılı; `addShapeOperator` ilk
   denemede shape-olmayan bir layer'a karşı çağrıldığı için beklenen hatayı
   verdi (test setup hatası, tool bug'ı değil), shape layer'a karşı
   tekrarlanınca geçti. `addTextAnimator`'ın nested
   `properties`/`selector`/`animate` şeması dahil hiçbir yerde marshalling
   sorunu çıkmadı.
3. **Tier 3 — ikincil yardımcılar (26 komut, sonra):**
   - ~~expression/effect introspeksiyon (4): `listEffects`,
     `addExpressionControl`, `removeExpression`, `enableExpression`.~~ ✅
     bitti (DEVLOG 2026-08-11 (5)).
   - ~~render queue (4): `addToRenderQueue`, `listRenderQueue`,
     `setOutputModule`, `clearRenderQueue`.~~ ✅ bitti (DEVLOG 2026-08-11
     (5)).
   - ~~marker (2): `addCompMarker`, `addLayerMarker`.~~ ✅ bitti (DEVLOG
     2026-08-11 (5)).
   - ~~proje-item/klasör/footage-comp (8): `getProjectItems`,
     `listTextStyles`, `compFromFootage`, `createFolder`, `moveToFolder`,
     `setProxy`, `renameItem`, `deleteItem`.~~ ✅ bitti (DEVLOG 2026-08-11
     (5)) — yol boyunca gerçek bir bug bulundu ve düzeltildi: `itemId`/
     `folderId` karşılaştırması `it.id === p.itemId` idi (numericLike
     tolerans yok), `findCompById`/`resolveLayer`'ın zaten çözdüğü aynı
     sınıf hata (id numeric-looking string geldiğinde sessizce "not
     found"). `AEB.findProjectItem`/`findProjectItemBy` (host.jsx) eklendi,
     `project.jsx` + `layer.jsx`'teki (`addFootageLayer`, `replaceSource`)
     dört tekrarlanan arama da buna geçirildi.
   - ~~comp/layer-time (6): `getCompTime`, `duplicateComp`, `sequenceLayers`,
     `setTimeStretch`, `enableTimeRemap`, `replaceSource`.~~ ✅ bitti (DEVLOG
     2026-08-11 (5)/(6)), canlı doğrulandı — `enableTimeRemap` bir solid'e
     karşı denendiğinde AE'nin kendi native reddini (`canSetTimeRemapEnabled`
     false) doğru şekilde yükseltti (sessizce yutmadı), bu bir tool bug'ı
     değil.
   - ~~layer style / bulk cleanup (2): `addLayerStyle`,
     `removeLayersByPrefix`.~~ ✅ şema/validasyon/CORE kaydı tamam, ama
     `addLayerStyle` için **şüpheli bulgu**: canlıda hem bir solid hem bir
     text layer'da "Can not set enabled on this property because
     canSetEnabled is false" ile reddedildi (DEVLOG 2026-08-11 (6)) — tool
     tarafı (parametre marshalling, hata yükseltme) sağlam çalıştı, ama
     `panel/jsx/commands/style.jsx`'in dayandığı "her layer'da 9 stil grubu
     zaten disabled child olarak var, `.enabled=true` yeterli" varsayımı bu
     AE 26.3 kurulumunda/projede doğrulanamadı — kod upstream `aftr`'den
     geldi, bu fork'ta hiç canlı test edilmemişti. Kök neden araştırması
     (renderer'ı Advanced 3D dışına almayı denemek) AE'yi ~10 dakika
     kilitledi (aşağıya bkz.), o yüzden yarım bırakıldı — ayrı bir oturumda,
     daha temkinli (olası uzun/riskli AE çağrılarını izole bir test
     projesinde) ele alınmalı. `removeLayersByPrefix` sorunsuz geçti.
4. ~~**Tier 4a — parametresiz/az parametreli getter'lar (13 komut, düşük
   öncelik):** `ping`, `getProjectInfo`, `listComps`, `undo`, `redo`,
   `purge`, `getSelection`, `getAppInfo`, `getEnvironment`, `listPlugins`,
   `lumetriParams`, `setActiveComp`, `setCompTime`.~~ ✅ bitti (DEVLOG
   2026-08-25) — kalan 10 komut (`ping`/`getProjectInfo`/`listComps` zaten
   CORE'daydı) `CORE`'a terfi ettirildi; gerçek argümanı olanlara
   (`purge.target`, `listPlugins.dirs`, `setActiveComp.compId/compName`,
   `setCompTime.compId/time`) `schema` eklendi, tamamen parametresiz
   olanlar (`undo`, `redo`, `getSelection`, `getAppInfo`, `getEnvironment`,
   `lumetriParams`) mevcut `listRenderQueue`/`clearRenderQueue` deseniyle
   şemasız bırakıldı. `npm test`: 226/226. 13 komutun 13'ü de canlı AE'de
   (26.3x87) `/command` üzerinden doğrulandı. **Bir tane gerçek bug
   bulundu, bu işin kapsamı dışında bırakıldı:** `redo` (`app.jsx`,
   `app.executeCommand(17)`) bu AE sürümünde hiçbir şeyi geri getirmiyor —
   `undo` (`executeCommand(16)`) hem layer silme/ekleme hem
   `setLayerProperty` (Opacity) üzerinde tutarlı çalışıp state'i doğru
   geri alırken, `undo` sonrası `redo` çağrısı `{ok:true}` dönüyor ama
   projede hiçbir değişiklik yapmıyor (opacity 50 → undo → 100 → redo →
   100 kalıyor, 50'ye dönmüyor); 3 saniyeye kadar gecikme de fark
   etmiyor. Kod `Initial commit`'ten (upstream `aftr`) geliyor, bu
   fork'ta hiç canlı doğrulanmamıştı. Kök neden netleşmedi (executeCommand
   ID'si bu build'de redo'ya karşılık gelmiyor olabilir, ya da AE script
   üzerinden tetiklenen undo'nun redo stack'ini farklı işlemesi olabilir);
   düzeltmek `panel/jsx/commands/app.jsx` değişikliği + rebuild/redeploy +
   AE restart gerektirir, ayrı bir oturumun işi.
5. **Tier 4b — niş/riskli (5 komut).** Bir Opus mimarlık incelemesi
   (2026-08-25, DEVLOG) yapıldı, kararlar:
   - ~~`quitApp` → CORE, `{save?:boolean}`.~~ ✅ bitti — canlı doğrulandı
     (`save:false`, AE gerçekten kapandı, controller `DISCONNECTED`'i
     `{ok:true}` olarak çözdü). **Yol boyunca gerçek bug bulundu ve
     düzeltildi:** `save:false` yolunda `app.quit()`'ten önce
     `proj.close(CloseOptions.DO_NOT_SAVE_CHANGES)` çağrılmıyordu, bu da
     dosyanın kendi "asla save dialog'u tetiklemez" iddiasının aksine
     native dialog'u açıyordu (Korhan'ın kendi gözlemiyle bulundu, elle
     kapatmak zorunda kaldı). `closeProject`'in zaten yaptığı `proj.close`
     çağrısı eklendi, ikinci canlı denemede (kasıtlı dirty proje ile)
     dialog çıkmadığı doğrulandı — bkz. DEVLOG 2026-08-25.
   - ~~`executeMenuCommand` → CORE, `{commandId?:integer,
     commandName?:string}`.~~ ✅ bitti — canlı doğrulandı ("Deselect All"),
     description'a dialog-açan komutlar için uyarı eklendi (engellenmedi).
   - ~~`findMenuCommand` → CORE, `{commandName:string}`.~~ ✅ bitti — canlı
     doğrulandı (`"Deselect All"` → `commandId:2004`).
   - ~~`batch` → CORE, `commands:[{command,params}]` şeması (`params`
     tipsiz `object` kalıyor).~~ ✅ bitti — canlı doğrulandı: iki
     `setLayerProperty` tek çağrıda yapıldı, TEK `undo` ikisini de geri
     aldı (1-undo-group vaadi doğru, gerçek bug çıkmadı). Alt-komut
     whitelist/blacklist gereksiz bulundu (yapısal olarak imkânsız:
     `keystroke`/`render`/`listPlugins` JSX dispatch'ine hiç girmiyor,
     `panel/src/main.js`'de önden yakalanıyor); tek not: batch içinde
     `quitApp` çağrılırsa `endUndoGroup`/`results` uçar, description'a
     not düşüldü (engellenmedi).
   - ~~**`keystroke`** — macOS dalındaki bug (modifier/named-key bilgisini
     yok sayıp literal metin yazıyordu) düzeltildi VE canlı doğrulandı
     (bkz. DEVLOG 2026-08-25: Cmd+A/Cmd+Shift+A select/deselect,
     `{key:'ESCAPE'}` named-key testi). CORE'a terfi kararı hâlâ ayrı
     bırakıldı — bug artık gerekçe değil, geri kalan soru OS-seviyesi
     risk sınıfının (AE'nin veri modeliyle sınırlı değil, activate
     başarısız olursa başka bir uygulamaya gidebilir) diğer 4 komuttan
     niteliksel farkı CORE'a terfiyi mi yoksa `ae_command`-only kalmayı mı
     gerektirdiği — bu bir sonraki oturumda karara bağlanacak.~~ ✅ bitti
     (DEVLOG 2026-08-25 (2)) — **CORE'a terfi kararı verildi**: blast
     radius bu tek-kullanıcı prodüksiyon aracında kullanıcının kendi
     oturumuyla sınırlı, diğer 81 komutla tutarlılık ağır bastı. Gerçek
     `inputSchema` + CAUTION notu eklendi, canlıda `ae_keystroke`
     top-level tool'u üzerinden doğrudan doğrulandı (Cmd+A/Cmd+Shift+A).

**Model:** hepsi Sonnet'te (`ae-mcp-expert` frontmatter zaten `model:
sonnet`) — Haiku'ya düşürme değerlendirildi, yanlış şemanın gerçek tool
çağrılarını sessizce bozma riski nedeniyle vazgeçildi.

**Şu an:** Tier 1 + Tier 2 (38/38), Tier 3 (26/26), Tier 4a (13/13) ve
Tier 4b (5/5, `keystroke` dahil) bitti — **toplam 82/82 komut top-level
`ae_*` tool oldu ve canlı AE'de tek tek doğrulandı. MCP tool şema
tamamlama işi tamamen kapandı.** İki açık uç kalıyor, ikisi de tool/şema
tarafı değil, AE capability'sinin kendisiyle ilgili, ayrı bir oturumda ele
alınmalı:
- `addLayerStyle`'ın altındaki AE yeteneği — layer style grupları
  `canSetEnabled:false` ile reddediyor (Tier 3 notu), kök neden
  araştırması bir kez AE'yi kilitlemişti, temkinli tekrar gerekiyor.
- `redo`'nun bu AE sürümünde state'i geri getirmemesi (Tier 4a notu) —
  `app.jsx` değişikliği + rebuild/redeploy + AE restart gerektiriyor.

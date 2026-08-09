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
4. Logo / bumper şablonları — **ilk canlı test aşaması bitti** (DEVLOG
   2026-08-09 (14)); "tek komut mu / elle mi" soyutlama kararı **ertelendi**
   (kullanıcı: önce yapı taşları, DEVLOG 2026-08-09 (17)) — 2./3. gerçek
   şablonla tekrar ele alınacak, bkz. "Faz 3" aşağıda
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

**Açık soru (ertelendi, DEVLOG 2026-08-09 (17)):** Bu, tekrarlanan bir iş
akışı olarak (`applyLowerThird` gibi tek bir komut/spec) mı soyutlanmalı,
yoksa şablon başına düzen çok değişken olduğu için mevcut komutların elle
bir araya getirilmesi mi yeterli? Henüz karar verilmedi — ikinci/üçüncü
gerçek şablonla karşılaşınca netleşir (tek örnekten genelleme yapmamak için
bilinçli olarak erken karar verilmedi). Kullanıcı kararıyla öncelik "önce
yapı taşları" oldu (bkz. Faz 3.5 aşağıda) — bu soru askıda, terk edilmedi.

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

Shape tarafı: gradient fill/stroke, dash / line cap / join, shape group
transform (grup içi anchor/scale/rotate), taper & wave.

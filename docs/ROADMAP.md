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
- `listInstalledEffects` → 149 efekt (157 isimlik sabit liste probe'u ile,
  hâlâ aktif kullanılan yol), `listFonts` → 625 font. Gerçek zamanlı
  enumerasyon (`app.effects`, 446 efekt) doğrulandı ama henüz devreye
  alınmadı — bkz. aşağıdaki "listInstalledEffects → app.effects".
- `docs/reference/{effects,fonts,effects-detail}.json` — discovery cache
  snapshot'ı, `npm run` yok, `node tools/discovery-cache.mjs` ile üretilir.

## Öncelik sırası

Tekrarlı iş alanları arasındaki sıra DEVLOG 2026-08-08 (3)'te. Ama shape
testinden sonra sıra değişti: **preset/şablon/format işlerinden önce shape
temeli düzeliyor** — kırık temelin üstüne kütüphane kurmanın anlamı yok.

1. ~~Faz 0 — altyapı borcu~~ *(bitti, bkz. DEVLOG 2026-08-08 (6))*
2. Shape temeli *(bitti — A/B/C/D, DEVLOG 2026-08-08 (7) ve 2026-08-09 (3)/(5))*
3. Tipografi / lower-third *(spec aşağıda, "Faz 2" — bar yok kararı alındı)*
4. Logo / bumper şablonları — `aep/` ve `assets/` boş, şablon girdisi gerekiyor
5. Format türetme *(nadiren ihtiyaç, düşük öncelik)*
6. Efekt / grade kombinasyonları
7. Reviewer'ı gerçek yap — `claudeReviewer()` stub'ı. Bilinçli olarak geç
   sırada: toplu iş yapılmaya başlanınca (40 varyantı tek tek izleyemezsin)
   anlam kazanıyor.

---

## Faz 0 — altyapı borcu ✅ bitti (DEVLOG 2026-08-08 (6))

1. ✅ Controller LaunchAgent oldu (`tools/service.mjs`, `npm run
   service:install`) — port 8787, loglar `~/Library/Logs/mograph-mcp/`.
2. ✅ `/fewer-permission-prompts` çalıştırıldı — `.claude/settings.json`.
3. ✅ Discovery cache (`tools/discovery-cache.mjs` → `docs/reference/*.json`).
   **Bulgu:** `app.effects` gerçek bir enumerasyon API'si, 446 efekt
   `{displayName, matchName, category, version, isDeprecated}` ile —
   detay ve sıradaki iş için bkz. **"listInstalledEffects → app.effects"**
   aşağıda.
4. ✅ `.claude/skills/ae-up/` proje skill'i.
5. ✅ `config.json`'a `defaults` + `presets` (25 fps).

**Doğrulama:** `npm test` 111/111, `launchctl print` → running/keepalive,
"1080p comp aç" → 25 fps.

---

## listInstalledEffects → app.effects (Faz 0 bulgusu, henüz uygulanmadı)

`app.effects` (= `app.internalEffects`) canlıda doğrulandı (AE 26.3x87):
446 elemanlı dizi, her eleman `{displayName, matchName, category, version,
isDeprecated}`. `listInstalledEffects`'in şu anki `_COMMON_EFFECTS` (157
isim) probe'unu (149 bulgu, `panel/jsx/commands/discovery.jsx`) bununla
değiştirmek mümkün — tahmine/sabit listeye gerek kalmıyor, kurulu her şey
gerçek zamanlı geliyor. Henüz düşük öncelik (mevcut probe çalışıyor); shape
temeli bittikten sonra ele alınabilir.

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

**1. Çıkış animasyonu — en büyük kalem.**
Mevcut 4 stilin hiçbirinde out yok; `trimIn`/`trimOut` sadece katmanı sert
kesiyor. Lower-third girer *ve çıkar*. Lower-third'e özel değil, bütün metin
sistemini kapsıyor.
→ `applyTextStyle`'a `outFrame` + `outStyle?` (varsayılan: girişin tersi).
   Uygulama: aynı animator'ün selector offset'ini geri sür (100→0) ya da ikinci
   animator; bezier tersine çevrilir. **Açık soru:** çıkış girişin tam tersi mi,
   yoksa daha hızlı mı — pratikte çıkış genelde hızlıdır.

**2. `safeArea` config + konum çözümleyici.**
Lower-third'ü tanımlayan şey nerede durduğu; mutlak pikselle değil comp
kenarından oransal boşlukla. `config.json`'da 4 format preset'i var ama safe
area yok → aynı lower-third dikeyde yanlış yere düşüyor.
→ `config.json`'a `safeArea: { top, right, bottom, left }` (oran, örn 0.08) +
   `"bottomLeft"` gibi isimli konumları çözen yardımcı. "Format türetme"
   işinin de yarısını bedavaya çözüyor.

**3. `measureText` — ölçüm dışarı açık değil.**
`sourceRectAtTime` text.jsx içinde 6 yerde kullanılıyor ama hiçbir komut
ölçüm döndürmüyor; ajan "bu yazı kaç piksel geniş" diye soramıyor.
→ `measureText { compId, text|layer, font?, fontSize?, tracking? }` →
   `{ width, height, left, top, capHeight, ascent, descent }`. Katman
   verilmezse geçici katman kurup ölçüp silsin (`_wrMeasure` deseni).

**4. `alignAnchor`.**
Yönlü wipe ve soldan büyüyen çizgi için anchor'ın kenara oturması gerekiyor;
`setLayerProperty` anchorPoint yazabiliyor ama değeri ajan hesaplayamıyor (3'e
bağımlı).
→ `alignAnchor { compId, layer, h: left|center|right, v: top|middle|bottom }`.

**5. `applyLowerThird` — ince kompozisyon.**
Başlık + opsiyonel alt başlık + opsiyonel aksan çizgisi, denetleyici null'a
parentlanmış, tutarlı isim öneki (`LT_*`), tek in/out. Yeni bir soyutlamaya
gerek yok. Döndürsün: `{ controller, layers[], inFrame, outFrame }`.
**Açık soru:** alt başlık var mı, tek satır başlık mı?

**6. `addResponsiveBox` — sadece aksan çizgisi istenirse.**
`executor.jsx:184-198`'deki `responsive_box` (rect size'ı
`thisComp.layer(X).sourceRectAtTime()` + padding expression'ına bağlı; yazı
değişince kendini günceller) applySpec içinde hapis. Bar yok kararıyla zorunlu
olmaktan çıktı. **Açık soru:** aksan çizgisi isteniyor mu — hayırsa bu madde düşer.

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

## Bilinen eksikler (henüz planlanmadı)

Shape tarafı: gradient fill/stroke, dash / line cap / join, shape group
transform (grup içi anchor/scale/rotate), taper & wave.

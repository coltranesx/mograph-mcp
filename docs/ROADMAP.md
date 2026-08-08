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
2. Shape temeli *(spec aşağıda, sırada)*
3. Tipografi / lower-third
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

### A. Path (Shape) keyframe desteği — en yüksek değer

**Problem.** `setValueAtTime` / `setValuesAtTimes` düz JSON nesnesi kabul
etmiyor ("Object/Array is not of the correct type"). ExtendScript gerçek bir
`new Shape()` nesnesi istiyor. `addPathShape` çalışıyor çünkü `new Shape()`'i
JSX içinde kuruyor (`panel/jsx/commands/layer.jsx:122`).

**Çözüm.**
- `panel/jsx/host.jsx`'e `AEB.toShape(obj)` helper: `{vertices,
  inTangents?, outTangents?, closed?}` → `new Shape()`.
- Tangent verilmediyse `vertices` uzunluğunda sıfır vektörlerle doldur — AE,
  tangent dizisi vertices ile aynı uzunlukta değilse hata veriyor.
- `setKeyframe` / `setKeyframes`: hedef property `propertyValueType ===
  PropertyValueType.SHAPE` ise değerleri `toShape`'ten geçir.
- **Vertex sayısı doğrulaması:** morph edilen iki path'in vertex sayısı
  farklıysa AE bozuk interpolasyon üretir. Sessizce bozuk animasyon üretme —
  açık hata ver.
- `simulator/src/mockAeDom.js`'e SHAPE property tipi ekle ki test yazılabilsin.

### B. `addShapeOperator` — tek komut

**Karar: operatör başına ayrı komut değil, tek `addShapeOperator`.** Gerekçe:
repoda zaten aynı desen var — `addEffect` de her efekt için ayrı komut değil,
`matchName` alan tek komut. Tutarlılık kazanıyor. (Bu karar ucuz: proje genç,
kayıtlı spec kütüphanesi yok, sonradan değiştirmenin bedeli düşük.)

**Şema:** `{ compId, layer, operator, group?, params?, insertAt?, name? }`

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

**Yerleşim.** Operatör varsayılan olarak root vectors group'a
(`ADBE Root Vectors Group`) eklenir — tipik kullanım bu, tüm gruplara
uygulanır. `group` parametresiyle belirli bir alt gruba yönlendirilebilir.

**Sıra kritik.** Repeater kendinden **önceki** öğeleri tekrarlar, Trim
kendinden öncekini kırpar → ekleme sırası sonucu değiştirir. Bu yüzden
`insertAt` (index) parametresi şart, sona eklemek her zaman doğru değil.

### C. `addShape` düzeltmesi

- Polystar ekle (`ADBE Vector Shape - Star`); star/polygon ayrımı Type
  parametresiyle (1 = star, 2 = polygon).
- **Sessiz fallback'i kaldır.** Şu an `shape:"polystar"` hata vermiyor,
  sessizce dikdörtgen üretiyor (`layer.jsx:90-91` — ellipse değilse rect).
  Bu hata vermekten kötü.
- Doğrulamayı `shared/src/commands.js`'te shape enum'u ile yap → bozuk çağrı
  socket'i geçmeden yakalansın (repodaki mevcut desen bu).

### D. `getLayerDetails` shape içeriği

Şu an shape layer'ın `contents`'ini hiç raporlamıyor — ajan ne kurduğunu
göremiyor, kendi işini denetleyemiyor. Özyinelemeli grup / operatör / path
dökümü ekle.

---

## Bilinen eksikler (henüz planlanmadı)

Shape tarafı: gradient fill/stroke, dash / line cap / join, shape group
transform (grup içi anchor/scale/rotate), taper & wave.

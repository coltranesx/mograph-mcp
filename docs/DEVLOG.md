# Devlog

Kronolojik, tarihli karar/değişiklik kaydı — "ne değişti, neden" özeti.
Kod detayı için git log yeterli; burada asıl neden ve bağlam durur.

Yeni giriş eklerken en üste (en yeni en üstte) ekle:

```
## YYYY-MM-DD
- Ne değişti, neden. Varsa alternatif ve neden elenmediği.
```

---

## 2026-08-09 (14)
- **File-menu komutları eklendi: `openProject`/`closeProject`/`quitApp`.**
  Kullanıcı isteği: bridge'i test etmek için önce dosya açma eksikti.
  Üçü de AE'nin kendi save-changes dialog'una hiç güvenmiyor (dialoglar
  bridge'i kilitliyor, `__saveProject`'teki gerekçeyle aynı) — "unsaved
  değişikliklerle ne yapılacağı" her zaman JS tarafında önceden çözülüp
  (kaydet ya da `save:false` ile bilinçli olarak at), native çağrı her
  zaman `CloseOptions.DO_NOT_SAVE_CHANGES` ile yapılıyor; native
  davranışın dialog gösterip göstermediğini hiç bilmeye gerek kalmıyor.
  `quitApp` sonrası panel bağlantısı AE ile birlikte düşüyor — controller
  bunu `DISCONNECTED` hatası olarak çözüyor (`aeClient.js`
  `_failAllPending`), bu komut için başarı sinyali, retry edilecek bir
  hata değil. `openProject`/`closeProject` MCP CORE setine eklendi,
  `quitApp` bilinçli olarak dışarıda bırakıldı (sadece `ae_command` ile
  erişilir — yanlışlıkla tetiklenmesi pahalı). Canlıda open→close→reopen
  round-trip'i dialogsuz doğrulandı.
- **Bug: `getLayerDetails{deep:true}` text layer'da çöküyordu.**
  `_groupSummary`, bir text property'nin `.value`'sunu (canlı `TextDocument`
  nesnesi) olduğu gibi JSON.stringify'a veriyordu; `TextDocument.
  boxTextSize` sadece `boxText:true` iken geçerli bir alan, point-text'te
  (bu oturumdaki şablonun text layer'ı gibi) okunması "Text document not
  of Box document type" native hatası fırlatıyor — bu da try/catch'in
  DIŞINDA, stringify aşamasında patlıyordu. Kök neden düzeltmesi:
  `_textDocSnapshot()` — `setTextDocument`'ın zaten kullandığı güvenli
  alan listesini (text/font/fontSize/tracking/leading/fill/stroke/
  justification) tek tek try/catch'li okuyup plain object döndürüyor,
  `boxTextSize`'ı sadece `boxText` gerçekten true ise okuyor. Canlıda
  (point-text layer, `aep/Ae_Template_Test.aep`) doğrulandı.
- **Bug: `setLayerProperty` controller validator'ı JSX'in gerisinde
  kalmıştı.** `shared/src/commands.js`'teki elle yazılmış `validate()`
  hem sabit bir `property` enum'u (position|scale|rotation|opacity|name|
  enabled|startTime — anchorPoint/inPoint/outPoint/shy/solo/label/
  threeDLayer ve serbest array-path fallback'i yok sayıyordu) hem de
  SADECE `layerIndex` kabul edip `layer`/`layerName`'i tamamen görmezden
  geliyordu — projedeki diğer her layer-hedefli komutun kullandığı esnek
  "layer isimle de, index'le de bulunabilir" kuralına aykırıydı. Canlıda
  `layer:"hero_fill"` göndermek "layerIndex must be a positive integer"
  ile patlayınca ortaya çıktı. Kök neden düzeltmesi: whitelist ve
  `layerIndex` zorunluluğu kaldırıldı, gerçek doğrulama zaten JSX'te
  (`AEB.requireLayer`/`AEB.resolveProperty`) var — defense-in-depth
  bozulmadı, sadece controller'daki eskimiş/yanlış kopya silindi.
  `shared/test/commands.test.js` güncellendi (whitelist testi → "her
  property adı geçer" + "layer isimle hedeflenebilir" testleri).
- **Bug: `aerender` yolu yanlış hesaplanıyordu, her render `-2` ile
  sessizce patlıyordu.** `panel/src/render.js`'teki `getAerenderPath()`,
  macOS'ta `cs.getSystemPath('hostApplication')` çıktısını (örn.
  `/Applications/Adobe After Effects 2026/Adobe After Effects 2026.app/
  Contents/MacOS/After Effects`) açgözlü bir regex'le (`.*Adobe After
  Effects[^\/]*`) ayrıştırıyordu — yol string'inde "Adobe After Effects"
  iki kez geçtiği için (klasör adı + `.app` bundle adı) regex son
  eşleşmeyi tercih edip `.../Adobe After Effects 2026.app/aerender`
  gibi VAR OLMAYAN bir yol üretiyordu (doğrusu `.../Adobe After Effects
  2026/aerender`, `.app` bundle'ının içinde değil, yanında). Bu yolda
  `cp.spawn()` CEP'in Node bağlamında normal Node `'error'` event'i
  yerine sıfır stdout/stderr ile doğrudan `'close'` event'ini `code:-2`
  ile tetikliyordu — hata tamamen teşhis edilemezdi. Manuel terminal'den
  doğru yolla çalıştırınca render sorunsuz çalıştığı için bulundu. Kök
  neden düzeltmesi: yolu regex yerine `/` ile bölüp ".app" İÇERMEYEN İLK
  "Adobe After Effects" segmentini bulacak şekilde yeniden yazıldı.
  Ayrıca yan iyileştirme: `renderComplete` artık başarısızlıkta son
  ~4KB'lık birleşik stdout+stderr çıktısını (`tail`) taşıyor,
  `controller/src/media.js` bunu `job.error`'a ekliyor — bundan sonra
  "aerender exited N" gibi opak hatalar yerine gerçek sebep görünecek.
  **Test kapsamı eksik kaldı:** `panel/src/render.js` CEP-only (CSInterface
  bağımlı), mevcut test altyapısı (`controller/shared/simulator`) bunu
  kapsamıyor — bu path resolution mantığı şu an sadece canlı doğrulamayla
  korunuyor, regresyona karşı otomatik bir test yok.
- **Faz 3 (şablon doldurma) ilk canlı testi, uçtan uca başarılı.**
  `aep/Ae_Template_Test.aep` (Comp 1: point-text layer + tam-comp
  boyutunda "placeholder" solid; Comp 2 alakasız, yok sayıldı) üzerinde:
  `setTextDocument` ile metin değiştirildi, `hero.jpg` (1760×742)
  `importFootage`+`addFootageLayer` ile içeri alındı, **cover-fit**
  (kullanıcı kararı: kırpılsın, boşluk kalmasın — oran farkı 2.37:1 vs
  1.78:1) elle hesaplanan anchor/position/scale ile placeholder'ın
  boyutuna (1920×1080, merkez) oturtuldu, placeholder `enabled:false`
  ile devre dışı bırakıldı (silinmedi — geri dönüşü kolay olsun diye).
  Bir yerleşim hatası da (görsel layer'ı text'in üstünde kalmıştı,
  `moveLayer` index hesabı yanlış yapılmıştı) `render` ile alınan görsel
  kanıtla yakalanıp düzeltildi. `ae_render_and_download` ile alınan kare
  kullanıcıya gösterildi, sonuç onaylandı.

## 2026-08-09 (13)
- **Faz 2 madde 6 — `addResponsiveBox` + `applyLowerThird`'a `accentLine`,
  bitti. Faz 2 tamamen bitti.** **Karar (kullanıcıyla): ince aksan çizgisi
  isteniyor.**
  - `addResponsiveBox { compId, fitTo, padding?, fillColor?, strokeColor?,
    strokeWidth?, position?, name? }` — `executor.jsx`'teki `responsive_box`
    treatment kind'ının (applySpec içine hapisti) standalone hali. `fitTo`
    layer'ın `sourceRectAtTime` + padding'ine bağlı **canlı expression**
    (frame frame yeniden hesaplanır — applyLowerThird'ın kendi statik
    hesaplarından farklı olarak gerçekten dinamik). Canlıda expression'ın
    doğru kurulduğu ve gerçek zamanlı değer ürettiği doğrulandı.
  - `applyLowerThird`'a `accentLine?` (true veya `{width,color,gap}`) eklendi
    — hLeft/hRight için metnin dışına, blok yüksekliğinde dikey bir çubuk;
    center için bloğun altına yatay çubuk. **`addResponsiveBox`'ın aksine
    statik/tek seferlik hesaplanıyor** (measureText zaten tam sayıları
    veriyor, applyLowerThird'ın deterministik felsefesiyle tutarlı).
    Canlıda pozisyon matematiği yine birebir doğrulandı (-12, -47.78 elle
    hesapla eşleşti).
  - 6 yeni shared pre-socket testi, 193/193 yeşil.
  - **Faz 2 (madde 1-6, hepsi) artık tamamen bitti.**

## 2026-08-09 (12)
- **Faz 2 madde 5 — `applyLowerThird`, bitti.** Yeni soyutlama yok — sadece
  `resolveSafePosition`/`measureText`/`addTextLayer`/`applyTextStyle`/
  `addNull`/`setParent`'ın kompozisyonu. **Karar (kullanıcıyla, açık soruydu):
  alt başlık var** — title + subtitle iki satır varsayılan senaryo, subtitle
  yine de opsiyonel parametre. `wordReveal` desteklenmiyor (kendi ortalanmış
  çoklu-kelime layout'unu kuruyor, manuel kenar-hizalı yerleşimle uyumsuz);
  charScale/bunchRotate/blurFade'in hepsi var olan layer'a animatör ekleme
  modunu destekliyor (`_applyPresetLines`'ın `hasLayer` dalı), bu yüzden
  çalışıyor.
  - **Canlıda bulunan gerçek bug: çift pozisyon telafisi.** `layer.parent = X`
    ExtendScript'te **otomatik olarak world pozisyonunu koruyor** (Position'ı
    kendi taşıyor) — UI'de "keep position" ile parentlamanın scripting
    karşılığı, önceden bilmiyordum/varsaymamıştım. Kod önce null-relative
    pozisyonu elle hesaplayıp set ediyordu, sonra `setParent` BUNU DA telafi
    etti — sonuç layer'ların ekran dışına (~1000px kaymış) fırlaması oldu.
    Düzeltme: child layer'lar artık MUTLAK (world) pozisyonda kuruluyor,
    null-relative dönüşümü `setParent`'ın kendi otomatik davranışına
    bırakılıyor.
  - Düzeltme sonrası canlıda (AE 26.3x87) tam matematiksel doğrulama: title'ın
    mürekkep üst kenarı `blockTopY`'de, subtitle'ın alt kenarı tam `safe.y`'de,
    aradaki boşluk tam `gap`, iki satırın sol kenarı da tam `safe.x`'te —
    hepsi elle hesaplanan değerlerle birebir eşleşti. Animatör keyframe'leri
    de (giriş/çıkış) doğru zamanlamada teyit edildi.
  - 7 yeni shared pre-socket testi, 189/189 yeşil. Simulator testi yok (aynı
    sourceRectAtTime zinciri).
  - Faz 2 kalan: 6 (`addResponsiveBox`, opsiyonel — aksan çizgisi isteniyor
    mu sorusu hâlâ açık).

## 2026-08-09 (11)
- **Faz 2 madde 4 — `alignAnchor`, bitti.** `{ compId, layer, h?, v?, time?,
  keepPosition? }` — layer'ın kendi anchor'ını kendi `sourceRectAtTime`
  sınırlarının bir kenarına/köşesine/merkezine oturtuyor. `keepPosition`
  (varsayılan true) Position'ı scale'e göre ölçeklenmiş delta kadar telafi
  ediyor ki layer görsel olarak yerinden oynamasın (AE UI'de anchor handle'ı
  sürüklerken olan davranışın aynısı). Rotation'ı hesaba katmıyor (bilinçli
  sınırlama, bu komutun hedef kitlesi olan text/shape layer'larda nadiren
  sorun).
  - Canlıda (AE 26.3x87) elle hesaplanan matematikle **birebir** eşleşti:
    h:left/v:top → anchor=[2.5177,-71.5027], position=[962.5177,468.4973]
    (comp merkezinden delta kadar kaymış); ekrandaki görsel konumun
    değişmediği koordinat cebiriyle doğrulandı. `keepPosition:false` da ayrı
    test edildi (position sabit kalıyor, sadece anchor taşınıyor).
  - 3 yeni shared pre-socket testi, 182/182 yeşil. Simulator testi yok (aynı
    sourceRectAtTime bağımlılığı, bkz. (8)/(10) girişleri).

## 2026-08-09 (10)
- **Faz 2 madde 3 — `measureText`, bitti.** `text.jsx`'in zaten kullandığı
  `_wrMeasure`/`sourceRectAtTime` deseni dışarı bir komut olarak açıldı: iki
  mod — `{ text, font?, fontSize?, tracking? }` geçici katman kurup ölçüp
  siliyor (canlıda doğrulandı: sonrasında layer sayısı değişmiyor), `{
  layer|layerIndex|layerName }` var olan bir text layer'ı MUTASYONSUZ okuyor,
  font/fontSize/tracking verilmezse layer'ın kendi source text'inden
  devralıyor. `capHeight` font metriği ("H" harfi, `_autoLeading`'in zaten
  kullandığı yöntem), `ascent`/`descent` gerçek metnin mürekkebinden
  (content-dependent, aynı yöntem `_autoLeading`'in per-line asc/desc'i).
  Canlıda (AE 26.3x87) iki mod da makul değerler üretti (descender'sız
  metinde descent≈0, descender'lı metinde >0 — sağlaması yapıldı).
  4 yeni shared pre-socket testi, 179/179 yeşil. Simulator testi yok —
  bu alt sistem hiç mock'lanmamış (bkz. (8) girişi), aynı yol izlendi.

## 2026-08-09 (9)
- **Faz 2 madde 2 — `resolveSafePosition` + `config.json` `safeArea`, bitti.**
  `config.json`'a `safeArea: {top,right,bottom,left}` (varsayılan 0.08 her
  kenar) eklendi (`shared/src/config.js` `loadConfig()` bunu okuyor, `createComp`
  preset deseniyle aynı). Yeni komut `resolveSafePosition { compId, position
  (9'lu grid: topLeft..bottomRight), safeArea? }` → `{ x, y, safeArea:{...} }`
  px cinsinden — pure math, AE mutasyonu yok. `safeArea` verilmezse
  `shared/src/commands.js`'in validate()'i config'ten varsayılanı enjekte
  ediyor (`createComp`'un preset mekanizmasıyla birebir aynı desen).
  - **Canlıda bulunan gerçek bug: chained ternary (`a?b:c?d:e`) ExtendScript'te
    yanlış dallandı** (`bottomLeft` → sağ kenarın x'ini döndürdü). Bu kod
    tabanında ZATEN dokümante edilmiş bir tuzak (`host.jsx`
    `AEB.requireLayer`'ın yanındaki not: "ES3 mis-parses chained ternaries,
    use explicit if/else") — yazarken kontrol etmedim, canlıda yakalandı.
    **Simulator bunu YAKALAYAMADI** çünkü Node/V8 chained ternary'yi doğru
    parse ediyor; sadece gerçek ExtendScript motorunda bozuluyor. Bu sınıf
    hata için simulator testleri güvenilir değil — JSX'te 3-yönlü seçim
    yazarken if/else şart, ternary chain değil.
  - 9 yeni test (5 shared pre-socket + 4 simulator, gerçek matematik — 3
    köşe canlıda da elle doğrulandı), 175/175 yeşil.

## 2026-08-09 (8)
- **Faz 2 madde 1 — çıkış animasyonu, bitti (4 stilin hepsi).** ROADMAP'in
  "en büyük kalem" dediği iş: `applyTextStyle`'a `outFrame`/`outStretch`
  eklendi, `wordReveal`/`charScale`/`bunchRotate`/`blurFade`'in hepsi artık
  giriş kadar temiz bir çıkışa sahip.
  - **Karar (kullanıcıyla, açık soruydu):** çıkış girişin tam aynası değil,
    varsayılan olarak **%40 daha hızlı** (`outStretch` varsayılan 0.6) —
    "pratikte çıkışlar girişten hızlıdır" gerekçesiyle.
  - **Mekanizma tek bir fikre indirgendi:** giriş zaten bir selector alanını
    (offset/start) 0→100 sweep ediyor. Çıkış için **aynı property'e ikinci
    bir keyframe çifti** eklenip değer geri sarılıyor (100→0), bezier standart
    CSS "ters çevirme" kimliğiyle (`reverse(x1,y1,x2,y2) = (1-x2,1-y2,1-x1,1-y1)`)
    ters çevriliyor — yeni animatör/selector yok, aynı per-karakter/kelime
    cascade tersine çalışıyor. `_taBezierEase` keyframe index'lerini parametre
    olarak almak üzere genelleştirildi (1/2 yerine keyfi çift), `_taAddExitSweep`
    bu iki yeniliği birleştiriyor.
  - `wordReveal`: kelime başına aynı offset property'de exit sweep (`_wrAnimator`
    outSF/outEF parametreleri). Sıra: girişle AYNI sırada çıkıyor (kelime 0 önce
    çıkar), süre = giriş süresinin `outStretch` katı.
  - `charScale`/`bunchRotate`/`blurFade` (ortak `addTextAnimator`+selector
    yolu): `_withExitSweep` (yeni) her animate alanına `outStartFrame`/
    `outEndFrame` damgalıyor; `_applyPresetLines` çok satırlı cascade'i
    karakter-oranlı ve METNİN SONUNDAN ölçerek ayna simetriğinde hesaplıyor —
    satır 0 önce çıkar, son satır tam `outFrame`'de biter.
  - **Canlıda (AE 26.3x87) tüm 4 stil + çok satırlı (2 satır, eşit olmayan
    karakter sayılı) durum test edildi, keyframe zamanlamaları elle
    doğrulanan matematikle birebir eşleşti** (`getProperty` ile).
  - Simulator'da hiç test yok — bu alt sistem (text animator ağacı,
    `sourceRectAtTime`, vb.) hiç mock'lanmamış, tüm doğrulama tarihsel olarak
    canlı AE'de yapılıyor (bkz. mevcut kod), bu değişiklik de aynı yolu izledi.

## 2026-08-09 (7)
- **Faz 1.A yan kazancı doğrulandı: mask path keyframe çalışıyor, mask wipe
  bedavaya geldi.** ROADMAP'te "olabilir, doğrulanmadı" diye duran bulgu
  canlıda (AE 26.3x87) test edildi: bir solid layer'a rect mask eklenip
  `setKeyframes { property: ["ADBE Mask Parade","Mask 1","ADBE Mask Shape"],
  times:[0,1], values:[...iki farklı vertex seti...] }` çağrıldı,
  `getProperty` ile her iki keyframe'in de doğru vertices ile kaydedildiği
  teyit edildi. Ekstra kod gerekmedi — `AEB.toShape`/SHAPE keyframe desteği
  zaten genel, mask path'i de kapsıyormuş. Faz 2'de 3 (`measureText`) ve 4
  (`alignAnchor`) önceliği arttı (ROADMAP'te not düşüldü).

## 2026-08-09 (6)
- **Numeric-string bug'ının controller-side (`shared/src/validate.js`)
  benzeri bulundu ve düzeltildi — kapsam sanıldığından dar çıktı.**
  Faz 2'ye geçmeden "mask path" bulgusuna bakarken `ae_addSolid` (şemasız
  tool) `compId:16` ile `"compId must be an integer"` verdi; `ae_command`
  aynı değerle sorunsuz çalıştı — (4) girişindeki JSX-side bug'ın aynısı, bu
  sefer `v.requiredInt`/`optionalPositiveInt`/`requiredPositiveInt`/
  `optionalPositiveNumber`/`optionalColor`/`optionalPoint`'in strict
  `typeof === 'number'` kontrolünde. Sadece 5 komut bu strict validator'ları
  kullanıyor: `addSolid`, `addTextLayer`, `createComp`, `render`,
  `setLayerProperty` — "pratikte her komut" değil, sınırlı ve net bir liste
  (grep ile doğrulandı).
  - `validate.js`'e `numericLike()` eklendi (host.jsx'teki `AEB.numericLike`
    ile aynı desen), altı validator da bunu kullanacak şekilde güncellendi.
    16 yeni test (`shared/test/validate.test.js`, yeni dosya), 166/166 yeşil.
  - **Controller restart edilmeden test ettim, yine unuttum, yine yanlış
    sonuç aldım — [[controller-needs-restart]] gerçekten işe yarıyor, dikkat
    et.** `service:restart` sonrası `compId` hatası düzeldiği canlıda
    doğrulandı.
  - **Kalan, düzeltilemeyen kısım:** array-tipli parametreler (`color` gibi)
    şemasız tool'larda hâlâ bozuk — ama `compId` gibi skaler değil, bu sefer
    **array'in kendisi array olarak gelmiyor** (`optionalColor`'daki
    element-seviyesi `numericLike` coercion'ı hiç devreye girmiyor,
    `Array.isArray(val)` kontrolü en baştan false dönüyor). `ae_command`'a
    elle string-array (`["0.1","0.8","0.3"]`) verilince sorunsuz çalıştığı
    doğrulandı — yani `validate.js` tarafı doğru, sorun harness'in şemasız
    tool çağrısında array'i nasıl marshall ettiğinde, repo dışı ve
    düzeltilemez. **Kalıcı workaround: array/nested parametre içeren her
    çağrıda `ae_command` kullan**, sadece skaler sayılar artık şemasız
    tool'larda da güvenli.

## 2026-08-09 (5)
- **Faz 1.C — `addShape` polystar + sessiz fallback kaldırma, bitti.**
  `shape:"polystar"` eklendi (`ADBE Vector Shape - Star`); `polyType`
  ("star"|"polygon") → `ADBE Vector Star Type` (1|2), `points`/`innerRadius`/
  `outerRadius` → ilgili alt-property'ler. Hepsi canlıda (AE 26.3x87)
  `getLayerDetails` ile teyit edildi — `ADBE Vector Star Inner/Outer Roundess`
  dahil (evet, gerçek matchName "Roundess" yazım hatasıyla). Tanımadığı
  `shape` değeri artık `shared/src/commands.js`'te enum'a karşı reddediliyor
  (önceden sessizce dikdörtgen üretiyordu) + `layer.jsx`'te defense-in-depth.
  9 yeni test (shared + simulator), 150/150 yeşil.
  - **Faz 1.D zaten bitmişti, kod okunmadan yazılmış eski bir ROADMAP notuymuş.**
    `getLayerDetails { deep, depth }` (`_groupSummary`, introspect.jsx) genel
    bir property-tree walker olarak shape içeriğini (path vertices/tangents
    dahil) zaten dönüyordu — canlıda `addPathShape` sonrası doğrulandı.
  - **Operasyonel bulgu: controller (`shared/src/commands.js`) değişikliği
    `npm run service:restart` gerektiriyor, panel deploy'undan bağımsız.**
    LaunchAgent persistent process olduğu için dosya değişikliğini kendiliğinden
    almıyor — bugünkü `addShape` validate'i restart'tan önce sessizce devre
    dışıydı (çağrı AE'ye kadar gidip orada JSX-level assert'e takılıyordu,
    pre-socket reddi hiç çalışmıyordu). Restart sonrası doğru davrandığı
    teyit edildi. Panel (`deploy:panel` + AE relaunch) ve controller
    (`service:restart`) iki bağımsız reload yolu — biri diğerini kapsamıyor.
  - Faz 1 (A/B/C/D) artık tamamen bitti.

## 2026-08-09 (4)
- **Şemasız `ae_*` MCP tool bug'ının kök nedeni bulundu ve düzeltildi —
  MCP şemasında değil, bizim JSX kodumuzdaymış.** (3) girişindeki "workaround:
  `ae_command` kullan" notu yanlış teşhisti; asıl sorun `AEB.findCompById`
  (host.jsx) ve `AEB.resolveLayer`'ın id/index karşılaştırmasını strict `===`
  ile yapması. Şemasız tool çağrılarının (`ae_getLayers`, `ae_addShape` vb. —
  `inputSchema`'da property type'ları deklare edilmemiş) sayısal parametreleri
  string olarak gönderdiği doğrulandı (`ae_command`'a `{compId: "1"}` string
  geçince AYNI "Comp not found" hatası tekrar üretildi) — ama bunu MCP
  tarafında "düzeltmek" mümkün değil (harness'in tool-call serileştirmesi bu
  reponun dışında). Doğru çözüm JSX tarafında: id/index her zaman gerçek AE
  numarasıyla (`item.id`, layer index) karşılaştırılıyor, JS tipini
  garantilemek çağıranın işi olmamalı.
  - `host.jsx`: `AEB.numericLike(v)` eklendi — number ise olduğu gibi, tamsayı
    görünümlü string ise `Number()`'a çevirip döner, aksi halde `null`.
    `findCompById`, `requireComp`'un `comp` fallback'i, `resolveLayer` bunu
    kullanacak şekilde güncellendi.
  - `effect.jsx`: `_resolveEffect` aynı deseni aldı (aynı bug class'ı, efekt
    index'i için).
  - `mask.jsx`/`keyframe.jsx` gibi index'i doğrudan native AE metoduna geçen
    yerler etkilenmedi — sorun sadece JS tarafında `typeof`/`===` ile dallanan
    kod yollarında (native AE metodları string/number ayrımını zaten kendi
    içinde çözüyor, `effect.jsx`'teki ölü ternary de bunun kanıtı).
  - 4 yeni simulator testi (numeric-string compId/layer, hâlâ isimle
    çözülebilme, var olmayan id'de false-positive olmaması). 141/141 yeşil.
  - Canlıda (AE 26.3x87) daha önce başarısız olan tam senaryo tekrarlandı:
    `ae_addShape`/`ae_getLayers` (şemasız tool, `compId:1`) artık `ok:true`.

## 2026-08-09 (3)
- **Faz 1.B — `addShapeOperator` canlıda doğrulandı, tamamlandı.** Atılabilir
  bir comp'ta (`__probe_shapeops_live`, AE 26.3x87) trim + repeater +
  `params` uçtan uca test edildi:
  - `params` guess'i (2026-08-09 (2)'de mock için eklenen matchName'ler)
    **canlıda doğru çıktı**: `ADBE Vector Trim Start/End/Offset`,
    `ADBE Vector Repeater Copies/Offset` gerçek AE'de birebir çalışıyor,
    `getLayerDetails` ile değerler teyit edildi.
  - **`insertAt`/`moveTo` kesin olarak kaldırıldı, canlıda ikinci kez
    doğrulandı çalışmadığı.** `moveTo()` "ReferenceError: Object is invalid"
    fırlattı ve bu hata **JS try/catch ile yakalanamadı** (kod içindeki
    "TEMP DIAGNOSTIC" yakalama denemesine rağmen, hata `AEB.undo`'yu delip
    komutu `ok:false` yaptı) — `addProperty`'nin geçersiz matchName'de
    yaptığı gibi native seviyede bir hata. Daha kötüsü: hata patlamadan önce
    `addProperty` + isim atama zaten gerçekleşmişti, yani çağrı "başarısız"
    raporlanırken layer'da yarım kalmış bir operatör bırakıyordu. Karar:
    `insertAt` tamamen kaldırıldı (`panel/jsx/commands/layer.jsx`,
    `shared/src/commands.js`, mock/testler) — addProperty zaten hep sona
    eklediği için doğru sırayı elde etmenin yolu operatörleri o sırayla
    çağırmak; kırık bir native API'ye bağımlı kalmaktansa bu daha sağlam.
    İleride farklı bir reorder mekanizması (ör. `app.executeCommand`) canlı
    doğrulanırsa geri eklenebilir.
  - Bu süreçte ayrı bir bulgu: **şemasız MCP tool'ları (`ae_getLayers`,
    `ae_addShape` gibi, `additionalProperties:true` + tipsiz) sayısal
    parametrelerde (`compId`) tutarsız/hatalı çalışıyor** ("Comp not found"),
    `ae_command` (tipli `{command, params}` şeması) ise sorunsuz. Kök neden
    netleşmedi (muhtemelen tool-call katmanında tipsiz parametrelerin
    serileştirilmesiyle ilgili) — henüz düzeltilmedi, `controller/src/
    mcpServer.js`'te `ae_*` tool'larının `inputSchema`'sı gerçek property
    tipleri almıyor (`{ type: 'object', additionalProperties: true }`).
    **Workaround: sayısal parametre geçen her çağrıda `ae_command` kullan.**
  - 139/139 test yeşil, panel yeniden deploy edildi ve canlı doğrulandı.
  - Yan bulgu: `osascript ... to quit` ile AE kapatırken çıkan "kaydet mi"
    dialog'unu otomatik geçmenin çalışan yöntemi bulundu (kullanıcı onayı ve
    Accessibility izniyle) — detay ve kod: memory `ae-quit-save-dialog`.

## 2026-08-09 (2)
- **`addShapeOperator` params artık sessizce yutulmuyor.** Önceki oturumda
  `params` uygulaması `try { added.property(k).setValue(...) } catch(e){}`
  ile hatayı yutuyordu — typo'lu bir key (`"Sart"` yerine `"Start"`) operatör
  eklenmiş ama parametre hiç set edilmemiş halde sessizce `ok:true` dönüyordu.
  `setEffectParam` (effect.jsx) ile aynı desene çekildi: `AEB.assert(param, ...)`
  sonra çıplak `param.setValue(...)` — try/catch yok, gerçek bir AE hatası
  varsa çağrının tamamı loudly fail etsin. `simulator/src/mockAeDom.js`'e
  Trim/Repeater için gerçekçi alt-property'ler eklendi (`ADBE Vector Trim
  Start/End/Offset`, `ADBE Vector Repeater Copies/Offset`) — **bunlar mock'u
  test edebilmek için**, live whitelist gibi doğrulanmış değil, öyle
  kullanılmasın. 2 yeni test (başarı + typo'lu key reddi), toplam 139/139
  yeşil.
  - **Hâlâ açık:** `insertAt`/`moveTo` mekanizması (canlı AE'de tutarsız
    davranıyordu, diagnostic kod hâlâ yerinde — bkz. aşağıdaki madde), trim/
    repeater'ın canlı uçtan uca doğrulaması, `service:status` LaunchAgent
    ayakta ama panel bağlı değil (`connected:false`) — devam etmeden önce AE
    açılıp panel bağlanmalı.

## 2026-08-09
- **Faz 1.B — `addShapeOperator`, ARADA KESİLDİ, commit edilmedi (working tree'de).**
  Devam etmeden önce oku, aynı hataları tekrarlama.
  - **AE iki kez çöktü/kilitlendi** — geçersiz bir shape-operator matchName'i
    canlıda `group.addProperty(matchName)` ile denerken. `canAddProperty()`
    vector group'larda güvenilmez: geçerli ve uydurma matchName'lerin
    hepsinde `true` dönüyor. Gerçek geçersiz matchName ise `addEffect`'in
    aksine catch edilebilir bir JS hatası değil — bir kere bloklayıcı native
    modal açtı, bir kere AE'yi tamamen çökertti. **Sonuç: canlıda bir daha
    geçersiz matchName ile `addProperty` denenmeyecek.** Whitelist tek güvenli
    yol; sadece live-confirmed matchName kod tabanına giriyor.
  - **10 aday matchName'in tamamı canlıda teyit edildi** (ROADMAP tablosu
    doğru): trim, repeater, offset, zigzag, roundCorners→RC,
    wigglePath→Roughen, wiggleTransform→Wiggler, puckerBloat→PB, twist,
    mergePaths→Merge — hepsi `ADBE Root Vectors Group` üzerinde
    `addProperty` ile başarıyla eklendi. Ama kod tabanına (`SHAPE_OPERATORS`,
    `shared/src/commands.js` + `panel/jsx/commands/layer.jsx`) şu an sadece
    **trim ve repeater** girildi — geri kalan 8'i eklemek gerekiyorsa aynı
    disiplinle (atılabilir comp, üzerinde çalışılan projede değil) tek tek
    canlı doğrulanıp elle eklenmeli, listeden kopyalanmamalı.
  - **`insertAt` bulgusu:** `addProperty` her zaman sona ekliyor; belirli
    index'e koymak `added.moveTo(index)` gerektiriyor. `moveTo` canlıda bir
    kere `"ReferenceError: Object is invalid"` verdi (insertAt:2), aynı
    senaryo başka denemede sorunsuz çalıştı — tutarsız, nedeni netleşmedi.
    **Çözülmedi.** `panel/jsx/commands/layer.jsx`'te `addShapeOperator`
    içinde geçici bir diagnostic var (`insertAtError` alanı dönüyor,
    `moveTo` hatasını yutup görünür kılıyor) — kalıcı çözüm değil, `moveTo`
    davranışı netleşince kaldırılmalı.
  - **Servis durumu belirsiz bırakıldı:** probe sırasında LaunchAgent
    controller'ı durdurup manuel dev instance ile çalışıldı; kesinti
    sırasında hangisinin ayakta kaldığı teyit edilmedi. Devam etmeden önce
    `npm run service:status` + `ae-up` skill ile doğrula, gerekirse
    `npm run service:install`/restart ile LaunchAgent'a geri dön.
  - **Kalan iş:** `moveTo`/`insertAt` mekanizmasını çöz, `params` uygulamasını
    gözden geçir (şu an sessizce `catch(e){}` ile yutuyor — Faz 1 A'daki
    "sessiz hata verme" prensibiyle çelişiyor, düzeltilmeli), simulator mock
    + testler hiç yazılmadı, trim/repeater için canlı uçtan uca doğrulama
    yapılmadı, ROADMAP'te B hâlâ "sırada" işaretli.
- **Karar: lower-third'de bar yok.** Saf tipografi; en fazla ince bir aksan
  çizgisi. Sonucu kapsam açısından büyük: bar'lı kurguda bar aynı zamanda
  *maskedir* (yazı bar'ın arkasından kayarak çıkar), bar yoksa o mekanizma da
  yok. Geriye animator tabanlı reveal kalıyor — o da `applyTextStyle` ile
  zaten olgun. Yani **bar'sız lower-third'ün giriş animasyonu çoktan hazır**;
  eksik olan kompozisyon ve zamanlama, görsel primitif değil. Faz 2 küçüldü,
  `addResponsiveBox` zorunlu olmaktan çıktı (spec → ROADMAP "Faz 2").
- **Faz 2 envanteri çıkarıldı** (kod okunarak, `text.jsx` 706 satır +
  `layer/mask/style/advanced/executor.jsx` + `mcpServer.js`). Tipografi
  gerçekten repodaki en olgun taraf: CSS cubic-bezier → AE temporal ease
  çevirimi, gerçek glyph metriğinden ölçülen satır aralığı, variable
  font'ların leading'i 1:1 uygulamamasının telafisi. Lower-third'ün yapı
  taşları (`setParent`, `setTrackMatte`, mask komutları, `alignLayer`) da var.
  **Asıl eksik: çıkış animasyonu.** Mevcut 4 stilin hiçbirinde out yok,
  `trimIn`/`trimOut` sadece sert kesiyor — bu lower-third'e özel değil, bütün
  metin sistemini ilgilendiriyor.
- **Faz 1.A'nın olası yan kazancı (doğrulanmadı):** mask path da SHAPE tipli
  ve `AEB.resolveProperty` dizi yolu destekliyor
  (`["ADBE Mask Parade","Mask 1","ADBE Mask Shape"]`) → mask path keyframe'i
  artık çalışıyor olabilir, yani mask wipe bedavaya gelmiş olabilir. Canlıda
  teyit edilmedi; Faz 2'ye girerken ilk denenecek şeylerden.

## 2026-08-08 (7)
- **Faz 1.A — Path (Shape) keyframe desteği.** `setKeyframe`/`setKeyframes`
  artık SHAPE-tipli property'lerde (path) çalışıyor; önceden `new Shape()`
  yerine düz JSON geçtikleri için AE "Object/Array is not of the correct
  type" ile reddediyordu (`addPathShape` çalışıyordu çünkü `new Shape()`'i
  zaten JSX içinde kuruyordu, keyframe komutları kurmuyordu).
  - `panel/jsx/host.jsx`: `AEB.toShape({vertices, inTangents?, outTangents?,
    closed?})` → gerçek `Shape` nesnesi; tangent verilmezse vertices
    uzunluğunda sıfır vektörle dolduruyor (AE, tangent dizisi vertices ile
    aynı uzunlukta değilse reddediyor). `AEB.assertShapeVertexCounts(prop,
    shapes)` — bir path property'sindeki tüm keyframe'lerin (var olanlar +
    eklenecekler) aynı vertex sayısında olmasını zorunlu kılıyor; AE farklı
    vertex sayılı path'ler arasında sessizce bozuk interpolasyon üretiyor,
    hata vermiyor — bu yüzden kontrol JSX tarafında.
  - `panel/jsx/commands/keyframe.jsx`: `setKeyframe`/`setKeyframes`,
    `prop.propertyValueType === PropertyValueType.SHAPE` ise değer(ler)i
    `toShape`'ten geçirip vertex sayısını doğruluyor.
  - `simulator/src/mockAeDom.js`: `Shape`, `PropertyValueType`,
    `MockShapeProperty` (gerçek AE gibi sadece `Shape` instance'ı kabul
    ediyor, düz obje verilirse aynı "Object/Array is not of the correct
    type" hatasını taklit ediyor), `MockVectorGroup` (Contents/Group/Path
    ağacı — `addShape`/`addPathShape`'in gerçekte kullandığı zincir) +
    `MockLayers.addShape()`. Bu, `addShape`/`addPathShape`'in de simülatörde
    ilk kez test edilebilir hale gelmesi yan etkisini doğurdu (önceden hiç
    mock desteği yoktu, testsizdi). Ayrıca fark edildi: `MockProperty`'de
    `setValuesAtTimes` hiç yoktu — `setKeyframes` (MCP'ye `ae_setKeyframes`
    olarak açık, "core" araç) normal (non-shape) property'lerde bile
    simülatörde hiç test edilmemiş/edilememiş; aynı örüntüde eklendi.
  - `shared/src/commands.js`: `setKeyframe`/`setKeyframes` açıklamalarına
    SHAPE-tipli property davranışı eklendi (doğrulama mantığı değişmedi,
    zaten generic required-field kontrolü).
  - Test: `simulator/test/mockAeDom.test.js`'e shape layer oluşturma
    (`addShape` dikdörtgen/elips, `addPathShape` + vertices eksik hatası)
    ve SHAPE keyframe testleri (tangent'siz/tangent'li başarı, vertex sayısı
    uyuşmazlığında hem `setKeyframe` hem `setKeyframes` için — hem yeni
    batch içi hem var olan keyframe'e karşı — açık hata, inTangents uzunluk
    uyuşmazlığı, non-shape property'nin etkilenmediği kontrolü) eklendi.
    `npm test` → 123/123 (111 + 12 yeni).
  - **Canlı AE'de doğrulandı** (AE 26.3x87): panel deploy edilip AE
    yeniden başlatıldı (proje Untitled/boştu, veri kaybı riski yoktu; panel
    açık kalma durumunu hatırlayıp otomatik yeniden bağlandı). Üçgen path
    layer'da tangent'siz + tangent'li keyframe başarılı, 3→4 vertex uyuşmaz
    tekli `setKeyframe` beklenen hatayla reddedildi (bozuk key eklenmeden);
    kare layer'da `setKeyframes` toplu başarı + batch-içi uyuşmazlık ve
    var-olan-key'e-karşı uyuşmazlık senaryoları da beklenen hatayla reddedildi.
  - Kapsam dışı bırakıldı (ROADMAP'te B/C/D, sırada): `addShapeOperator`,
    shape operatör matchName doğrulaması, format/varyant işleri.

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

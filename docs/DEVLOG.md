# Devlog

Kronolojik, tarihli karar/değişiklik kaydı — "ne değişti, neden" özeti.
Kod detayı için git log yeterli; burada asıl neden ve bağlam durur.

Yeni giriş eklerken en üste (en yeni en üstte) ekle:

```
## YYYY-MM-DD
- Ne değişti, neden. Varsa alternatif ve neden elenmediği.
```

---

## 2026-09-24
- **Yeni kalıcı yetenek: `addPathToLayer` — mevcut bir shape layer'ın
  Contents'ine YENİ bir sibling `ADBE Vector Group` (Path + opsiyonel
  Fill/Stroke) ekleyebilme.** İhtiyaç: "Signavio26_Page01_1" (compId 1725)
  içinde harf stroke-centerline'ları elle path olarak trace edilirken
  ("01_W" harfi zaten 4 ayrı sibling shape layer'a bölünmüş —
  `01_W_Stroke1_TL-V1`..`Stroke4_V2-TR`, her biri tek path) referans yapı
  (comp 1750 "Signavio26_Page03_1", örn. "Paste SVG 1N" layer'ı) bir
  harfin TÜM stroke-segment path'lerini sibling `ADBE Vector Group`'lar
  olarak TEK layer'ın Contents'inde ("Group 1", "Group 2", "Group 3"...)
  topluyor — layer başına segment değil. `addPathShape` her zaman
  `comp.layers.addShape()` ile YENİ bir layer yaratıyor (canlıda doğrulandı:
  var olan bir shape layer seçiliyken tekrar çağrıldığında hedef layer'ın
  kendi Contents'i (`numProperties`) değişmeden ayrı bir layer daha
  çıkıyor) — bu referans yapıyı üretecek bir komut yoktu.
  - **`panel/jsx/commands/layer.jsx`:** Path/Fill/Stroke property stack'ini
    kuran kod `addPathShape`'ten `_buildPathGroupContents(contents, p)`
    helper'ına çıkarıldı (aynı `{ vertices[], inTangents?, outTangents?,
    closed?, fillColor?, strokeColor?, strokeWidth? }` wire şekli) —
    `addPathShape` bu helper'ı çağıracak şekilde küçültüldü, davranışı
    değişmedi. `COMMANDS.addPathToLayer` eklendi (`addPathShape`'in hemen
    altına): `{ compId, layer, vertices[], inTangents?, outTangents?,
    closed?, fillColor?, strokeColor?, strokeWidth?, group?, groupName? }`.
    `group`, `addShapeOperator`'ın zaten kullandığı property-path-array
    sözleşmesiyle aynı (default `["ADBE Root Vectors Group"]`, yani
    layer'ın kendi Contents'i) — hedef PropertyGroup'a
    `addProperty("ADBE Vector Group")` ile yeni bir sibling grup ekleyip
    (`groupName` verilirse adlandırıp, verilmezse AE'nin kendi
    "Group N" auto-name'ini bırakıp) içine `_buildPathGroupContents`'i
    çağırıyor. `AEB.undo("mograph-mcp: addPathToLayer", ...)` ile sarmalı,
    diğer tüm shape komutlarıyla aynı desen.
  - **`shared/src/commands.js`:** `addPathShape`'in hemen altına
    `LAYER_REF_SCHEMA` + `group: PROPERTY_SCHEMA` + `groupName: string`
    ile `withDesc` kaydı.
  - **`controller/src/mcpServer.js`:** `CORE` setine `addPathShape`'in
    yanına `addPathToLayer` eklendi → `ae_addPathToLayer` ayrı bir MCP
    tool.
  - **Testler:** `simulator/test/mockAeDom.test.js`'e `addPathToLayer`
    describe bloğu (4 test: addPathShape'in orijinal grubunun yanına ikinci
    sibling grup ekleme + `listShapeContents` ile 2 grup doğrulama + her
    ikisinin de gerçek/doğru Path değeri taşıdığının `getProperty` ile
    teyidi, `groupName` verilmeden AE'nin auto-name'ini koruma, vertices
    olmadan reddetme, shape-olmayan layer'da (Contents yok) net hatayla
    reddetme). `npm test`: 272/272 yeşil.
  - **Canlı doğrulama (AE 26.5x89, gerçek proje `Signavio2026_V05.aep`
    açıkken, gerçek `01_W_Stroke1_TL-V1`..`Stroke4_V2-TR` (comp 1725) veya
    comp 1750'deki hiçbir layer'a DOKUNULMADAN):** Controller zaten
    `com.coltranesx.mograph-mcp.controller` LaunchAgent'ı üzerinden
    ayaktaydı; panel `node tools/hot.mjs` ile (CDP üzerinden imza
    bozulmadan bellek-içi reload — bu makinede `npm run deploy:panel`
    ayrıca `ZXPSignCmd` x86_64 binary'sinin bu Apple Silicon makinede
    Rosetta kurulu olmadığı için "Bad CPU type in executable" ile
    başarısız olduğu için `hot.mjs` zaten tek çalışan yol) güncellendi,
    ardından `launchctl kickstart -k` ile controller restart edildi (kod
    `shared/src/commands.js`'i bellekte tuttuğu için, `selectLayer`
    girişindeki aynı gerekçe). Atılabilir `mograph-mcp_addPathToLayer_TEST`
    compi (itemId 4196) oluşturuldu, içine `addPathShape` ile tek path'li
    bir shape layer (`TestSeg1`, kırmızı stroke) eklendi, `ae_addPathToLayer`
    aynı layer'a ikinci bir path (yeşil stroke, `groupName:"Group 2"`)
    eklemek için çağrıldı → `{ groupIndex:2, groupName:"Group 2",
    matchName:"ADBE Vector Group" }` döndü. `ae_listShapeContents` kök
    Contents'in artık 2 sibling `ADBE Vector Group` (`Group 1`, `Group 2`)
    içerdiğini, `Group 2`'nin kendi Contents'inin geçerli bir `Path 1` +
    `Stroke 1` taşıdığını doğruladı; `getProperty` ile `Group 2`'nin Path
    değerinin gönderilen vertices'le (`[[0,0],[20,0],[10,20]]`, `closed:true`)
    birebir eşleştiği teyit edildi. Test compi `deleteItem` ile silindi;
    ardından gerçek `01_W_Stroke1_TL-V1` layer'ında `listShapeContents`
    tekrar çalıştırılıp Contents'inin hâlâ değişmemiş tek `Group 1`'e sahip
    olduğu (`numProperties:1`) doğrulandı.

## 2026-09-15
- **Yeni kalıcı yetenek: `selectLayer` — `Layer.selected`'ı scriptten set
  edebilme.** İhtiyaç: bir Illustrator-layer footage layer'ını (footage
  olarak import edilmiş, "ADBE Root Vectors Group" olmayan, `addShapeOperator`
  ile "target vector group not found" veren AI vector footage layer) native
  editable shape layer'a çevirmek gerekiyor — AE'nin tek yolu Timeline'da
  sağ tık → "Create Shapes from Vector Layer" menü komutu, ve bu komut
  **her zaman o an Timeline'da SEÇİLİ olan layer üzerinde çalışıyor**.
  `ae_executeMenuCommand`/`ae_findMenuCommand` zaten vardı (dev:false), ama
  seçimi programatik olarak set edecek hiçbir komut yoktu: `ae_getSelection`
  salt-okunur, `setLayerProperty` ile `property:"selected"` denendiğinde
  `Property "selected" not found on layer` hatası verdi. **Kök neden:**
  `Layer.selected` AE scripting DOM'unda `layer.property(name)` ile erişilen
  bir Property/PropertyGroup değil, Layer nesnesinin düz üst-seviye boolean
  attribute'u (`layer.selected = true`) — generic `setLayerProperty`'nin
  varsayımıyla (her şeyin bir Property olduğu) uyuşmuyor, bu yüzden kendi
  komutunu istiyor.
  - **`panel/jsx/commands/layer.jsx`:** `COMMANDS.selectLayer` eklendi
    (`setLayerFlag`'in hemen altına) — `{ compId, layer|layerName|layerIndex,
    clearOthers? (default true) }`. `clearOthers` true iken `comp.layer(i)`
    üzerinde döngüyle hedef dışındaki her layer'ı `selected = false` yapıp
    hedefi `selected = true` yapıyor (Timeline'da tek tıkla seçim davranışının
    aynısı); false iken var olan seçime EKLEME yapıyor (çoklu seçim).
    `AEB.undo("mograph-mcp: selectLayer", ...)` ile sarmalı, diğer tüm basit
    layer komutlarıyla aynı desen.
  - **`shared/src/commands.js`:** `LAYER_REF_SCHEMA` + `clearOthers: boolean`
    ile `withDesc` kaydı, `setLayerFlag`'in hemen altına — var olan ~40
    layer-ref komutuyla aynı şema sözleşmesi (`layer`/`layerName`/
    `layerIndex` üçü de deklare, 2026-09-07 audit'inin kapsadığı hatayı
    tekrarlamamak için).
  - **`controller/src/mcpServer.js`:** `CORE` setine `setLayerFlag`'in yanına
    eklendi → `ae_selectLayer` artık ayrı bir MCP tool.
  - **`simulator/src/mockAeDom.js`:** `MockLayer`'a `selected` (varsayılan
    `false`), `MockCompItem`'a `selectedLayers` getter'ı eklendi — ikisi de
    daha önce hiç mock'lanmamıştı (yani var olan `getSelection` komutu da
    şimdiye kadar simülatörde hiç egzersiz edilmemişti, sadece canlıda
    kullanılmıştı). Kök nedene inip gerçek AE `CompItem.selectedLayers`
    semantiğini birebir taklit edecek şekilde eklendi.
  - **Testler:** `simulator/test/mockAeDom.test.js` içine `selectLayer`
    describe bloğu (index ile seçme, `clearOthers` varsayılanının önceki
    seçimi değiştirmesi, `clearOthers:false` ile çoklu seçim birikmesi,
    aralık-dışı layer index reddi — 4 test) + `shared/test/commands.test.js`
    içine şema/validate testleri (4 test). `npm test`: 259/259 yeşil.
  - **Canlı doğrulama (AE 26.5x89, gerçek proje `Sİgnavio2026_V02.aep` açıkken,
    gerçek `Signavio26_Page06_1` (compId 2026) veya layer'larına
    DOKUNULMADAN):** Panel rebuild+redeploy edildi (`npm run build:jsx &&
    npm run deploy:panel`), AE tamamen kapatılıp yeniden açıldı, panel tekrar
    açıldı — CEP tarafı böyle güncelleniyor. Ayrıca controller process'inin
    (`npm run controller`, 11:01'den beri ayaktaymış) eski `shared/src/
    commands.js`'i bellekte tuttuğu fark edildi (`selectLayer` ilk denemede
    "Unknown command" verdi) — controller da restart edilmesi gerekti (AE
    panelinden ayrı bir Node process, kod değişince o da yeniden başlamalı;
    bu repo'nun "controller kalıcı servis değil" notunun somut bir örneği).
    Restart sonrası: geçici `mograph-mcp_selectLayer_TEMP` compi (id 2056)
    oluşturuldu, içine iki solid (`TestSolidA`, `TestSolidB`) eklendi,
    `ae_selectLayer` her ikisiyle de (varsayılan `clearOthers` VE
    `clearOthers:false`) çağrıldı, her adımda `ae_getSelection` ile
    doğrulandı — üçü de beklendiği gibi çalıştı (tekli seçim değişimi, çoklu
    seçim birikmesi). `ae_findMenuCommand({commandName:"Create Shapes from
    Vector Layer"})` → `commandId: 3973` döndü (AE 26.5x89, EN yerelleştirme).
    Projede "spare/unused" AI vector footage aranmadı — `getProjectItems`
    580 item döktü, hepsi Page01-Page49 gerçek sayfalarına ait (Ring/Line
    içerenler dahil) — bu yüzden "Create Shapes" komutunun tam uçtan-uca
    çalıştırma smoke testi (görev talimatındaki kaçış maddesi gereği)
    ATLANDI; sadece commandId çözümlemesi doğrulandı. Test sonunda: aktif
    comp tekrar 2026'ya (`Signavio26_Page06_1`) döndürüldü, geçici comp
    (2056) `deleteItem` ile silindi, `getLayers(compId:2026)` ile gerçek
    layer listesinin dokunulmamış olduğu teyit edildi.

- **Yeni kalıcı yetenek: `listShapeContents` — shape layer Contents ağacında
  AE'nin kendi verdiği isimleri keşfetme.** İhtiyaç: `selectLayer` +
  "Create Shapes from Vector Layer" (yukarıdaki giriş) ile bir AI vector
  footage layer'ı native shape layer'a çevrildiğinde, AE `Contents` içine
  `"Group 1"`/`"Stroke 1"` gibi otomatik isimler atıyor — bunlar önceden
  tahmin edilemiyor, ama `getProperty`/`setLayerProperty`/`setKeyframes`'in
  `property` array-path parametresi tam olarak bu isimleri gerektiriyor.
  `getLayerDetails{deep:true}` (`_groupSummary`, introspect.jsx) zaten var
  olan bir genel-amaçlı derin ağaç dökücüydü ve bu soruyu cevaplayabiliyordu
  (aşağıdaki canlı doğrulamada gerçekten kullanıldı), ama bounded-recursive
  tam dump döndürüyor — hedefli, "bu TEK grubun içinde ne var, hangileri
  yürünebilir (group) hangileri yaprak (leaf)" sorusuna `addShapeOperator`'ın
  `group` parametresiyle aynı property-path-array sözleşmesiyle cevap veren
  ayrı bir komut yoktu.
  - **`panel/jsx/commands/introspect.jsx`:** `COMMANDS.listShapeContents`
    eklendi (`getLayerDetails`'in hemen üstüne, `_safeValue`'yu paylaşarak)
    — `{ compId, layer|layerName|layerIndex, group? (default
    ["ADBE Root Vectors Group"], addShapeOperator ile aynı sözleşme) }`.
    `AEB.resolveProperty` ile group'u çözüp `numProperties`/`property(i)`
    üzerinden TEK seviye (recursive değil) çocuklarını listeliyor; her
    çocuk `{ index, name, matchName, isGroup }` + leaf ise `{ value,
    expression? }`, group ise `{ numProperties }`. `isGroup` testi
    `_groupSummary`'nin zaten kullandığı aynı deseni tekrar kullanıyor
    (`pr.numProperties !== undefined` — sadece PropertyGroup'ta var).
    Group yerine bir leaf property path'i verilirse (`.numProperties`
    undefined) ExtendScript TypeError yerine net bir `AEB.assert` hatası.
  - **`shared/src/commands.js`:** `getLayerDetails`'in hemen altına
    `withDesc` kaydı, `LAYER_REF_SCHEMA` + `group: PROPERTY_SCHEMA`.
  - **`controller/src/mcpServer.js`:** `CORE`'a `getProperty`'nin yanına
    eklendi → `ae_listShapeContents`.
  - **`simulator/src/mockAeDom.js`'te gerçek bir eksiklik bulundu ve
    düzeltildi:** `MockProperty`'nin (leaf property'leri simüle eden sınıf)
    hiç `matchName` alanı yoktu — sadece `name`. Gerçek AE'de her Property'nin
    ayrı, değişmez bir `matchName`'i var (bu girinin (a) maddesindeki canlı
    `getProperty` sonucu: `name:"Color"`, `matchName:"ADBE Vector Stroke
    Color"`), ve `MockVectorGroup` (aynı dosya) bunu zaten doğru
    modelliyordu (`this.matchName = matchName; this.name = matchName;`,
    sonradan sadece `.name` yeniden atanabiliyor — `addShapeOperator`'ın
    `added.name = p.name`'i gibi). `MockProperty`'ye aynı desen taşındı.
    Önceden hiçbir testin `matchName`'i bu leaf'lerde kontrol etmemesi
    şimdiye kadar fark edilmemesinin nedeniydi; `listShapeContents`
    `matchName`'i döndürdüğü için bu boşluk ilk kez gerçek bir test
    başarısızlığı olarak ortaya çıktı, kök nedene inilerek düzeltildi
    (bkz. CLAUDE.md — geçici yama değil).
  - **Testler:** `shared/test/commands.test.js` içine şema/validate testleri
    (4 test) + `simulator/test/mockAeDom.test.js` içine `listShapeContents`
    describe bloğu (5 test: varsayılan root listeleme, iç içe group'a bir
    seviye inme, bir leaf'e (Stroke Color) ulaşıp `getProperty` ile aynı
    değeri doğrulama, group yerine leaf verilince net hata, çözülemeyen
    path'te `getProperty` ile aynı hata mesajı). `npm test`: 268/268 yeşil.
  - **Operasyonel bulgu: `tools/hot.mjs`'te rebrand'den kalma ölü bir eşleşme
    vardı.** CDP hedefini `com.ae-bridge.panel` (upstream'in fork-öncesi
    extension ID'si) regex'iyle arıyordu; bu fork'ta gerçek ID
    `com.coltranesx.mograph-mcp.panel` olduğu için eşleşme HİÇ tutmuyor ve
    sessizce `targets[0]`'a (CDP'nin ilk döndürdüğü hedef, panel olduğu
    garanti değil) düşüyordu — bu oturumda ilk `node tools/hot.mjs` çalıştığı
    an fark edildi (çalıştı ama şansına, tek CDP target vardı). Regex'e
    fork'un gerçek ID'si önce, eski ID fallback olarak eklendi. Bu script'in
    ne kadar süredir bu şekilde şansa bağlı çalıştığı bilinmiyor.
  - **Canlı doğrulama (AE 26.5x89, gerçek proje `Sİgnavio2026_V02.aep` açıkken,
    gerçek `Signavio26_Page07_1` (compId 2089) veya layer'larına
    DOKUNULMADAN, salt-okunur):** Önce `getLayerDetails({compId:2089,
    layer:"Layer 06 Line 1 Outlines 2", deep:true, depth:6})` ile ağaç
    dökülüp Stroke'un yeri bulundu: `Contents ("ADBE Root Vectors Group") >
    Group 1 ("ADBE Vector Group") > Contents ("ADBE Vectors Group") >
    Stroke 1 ("ADBE Vector Graphic - Stroke") > Color ("ADBE Vector Stroke
    Color")` — hem isim hem matchName path'i `getProperty` ile ayrı ayrı
    doğrulandı (ikisi de çözüldü, değer `[1,1,1,1]` — beyaz). Panel `npm run
    build:jsx && npm run deploy:panel` ile deploy edildi, sonra AE'yi kapat/
    aç yerine `node tools/hot.mjs` (CDP üzerinden imza bozulmadan bellek-içi
    reload, `cmds=120`) kullanıldı — controller zaten `com.coltranesx.
    mograph-mcp.controller` LaunchAgent'ı üzerinden ayaktaydı (bu repo'nun
    üst-seviye notlarındaki "henüz LaunchAgent yok" artık güncel değil,
    bu oturumda LaunchAgent bulundu ve KeepAlive sayesinde eski process'i
    `kill` etmek yeni kodu almış bir restart'ı otomatik tetikledi).
    Ardından **atılabilir** `mograph-mcp_listShapeContents_TEMP` compi
    (id 2139) oluşturuldu, içine dolgu+stroke'lu bir ellipse (`TestStroke`)
    eklendi; `listShapeContents` varsayılan root'ta `Group 1`'i, `group`
    ile bir seviye inince `Ellipse Path 1`/`Fill 1`/`Stroke 1`'i, Stroke'un
    içine inince `Color` (`[1,0,0,1]`, kırmızı) leaf'ini doğru raporladı —
    keşfedilen path `getProperty`'ye verilince aynı değeri döndürdü. İki
    hata yolu da (leaf'i group gibi listeletmeye çalışmak, çözülemeyen path)
    live'da doğru mesajları verdi. Test compi `deleteItem` ile silindi;
    sonda gerçek layer'ın Stroke Color'ı tekrar `getProperty` ile okunup
    hâlâ `[1,1,1,1]` (dokunulmamış) olduğu teyit edildi.

## 2026-09-11
- **Yeni kalıcı yetenek: `importLayeredComp` — katmanlı AI/PSD'yi dialog'suz
  "Composition + Merged Layers + Document Size" ile import etme.** Signavio
  video projesinde 49 sayfalık bir Illustrator dosyası (`page-01.ai` ...
  `page-49.ai`) elle, native Import dialog'undan ("Import As: Composition",
  "Layer Options: Merged Layers", "Footage Dimensions: Document Size") tek
  tek AE'ye alınıyordu — her dosyanın tüm AI layer'larını ayrı AE layer'ı
  olarak, doküman boyutunda, otomatik bir "<isim> Layers" klasörüne getiren
  davranış. Var olan `importFootage`/`compFromFootage` bunu karşılamıyor:
  ikisi de `ImportOptions` üzerinde `importAs` set etmiyor, sonuç tek
  düzleştirilmiş footage/layer oluyor (canlı test: `compFromFootage` ile
  `Page02.ai` import edilince tek layer + 30fps varsayılan çıktı, sonra
  temizlendi). Web'de doğrulandı (ae-scripting.docsforadobe.dev
  `ImportOptions`, Adobe Community #58466): `ImportOptions.importAs =
  ImportAsType.COMP` tam olarak bu native dialog davranışını dialog açmadan
  veriyor — API'nin eksik değil, mevcut komutların bunu kullanmıyor
  olmasıydı.
  - **`panel/jsx/commands/footage.jsx`:** `COMMANDS.importLayeredComp`
    eklendi — `io.importAs = ImportAsType.COMP` ile `importFile`, `{path,
    name?}`. Comp süre/fps dosyadan gelmiyor (AI'da yok), AE'nin son
    kullanılan comp ayarlarına düşüyor — kritik değerler için `setCompSettings`
    ile üzerine yazılmalı.
  - **`shared/src/commands.js` / `controller/src/mcpServer.js`:** şema +
    CORE listesine eklendi (`compFromFootage`'ın yanına).
  - Canlı doğrulama: `Signavio26_Page03.ai` → tek komutla `Signavio26_Page03
    Layers` klasörü + 6 ayrı footage + `Signavio26_Page03` compi
    (3840x2160/25fps/10s/bg siyah), elle yapılmış `Page01` ile birebir
    aynı yapı. Ardından kalan 47 dosya (`Page02`, `Page04`-`Page49`) `batch`
    ile 3 parçada (16/16/15, tek command timeout'una girmemek için) tek
    seferde işlendi, 47/47 başarılı.
  - **Yan bulgu, ayrıca düzeltildi: `panel/.debug`'daki debug-port
    extension id'si yanlıştı.** Upstream fork'tan kalma `com.ae-bridge.
    panel.main` yazıyordu, gerçek extension id `manifest.xml`'de
    `com.coltranesx.mograph-mcp.panel.main` — bu yüzden `tools/hot.mjs`
    (CDP hot-reload) hiçbir zaman debug port'u bulamıyordu (sessizce
    "no debug port" ile başarısız oluyordu, ne zamandır kırık olduğu
    bilinmiyor). Hem repo'daki hem deploy edilmiş kopyada (`~/Library/
    Application Support/Adobe/CEP/extensions/com.coltranesx.mograph-mcp.
    panel/.debug`) id düzeltildi. CEP debug port'u extension başlatılırken
    kaydettiği için mevcut çalışan panel bunu geriye dönük almadı — panel
    bir kere kapatılıp açıldı, sonrasında `hot.mjs` çalıştı. Artık kalıcı
    olarak çalışması gerekiyor.

## 2026-09-07 (2)
- **Yeni kalıcı yetenek: gerçek keyframe/ease kopyalama (`copyKeyframes`,
  `copyKeyframesBatch`, `getEase`).** Daha önce birden fazla oturumda tespit
  edilmişti (bu devlog'da iki kez not düşülmüştü, ör. 2026-08-08 (7)'nin CSS
  cubic-bezier → AE temporal ease çevirimi bahsi): `getProperty` keyframe
  zaman/değerini okuyor ama gerçek temporal ease'i
  (`property.keyInTemporalEase(i)`/`keyOutTemporalEase(i)`, her biri
  `speed`+`influence` içeren `KeyframeEase` dizileri döndürür) hiçbir komut
  okumuyor/yazmıyordu. Bir animasyonu başka bir layer'a "aynen" taşımak
  istendiğinde tek yol comp'u birkaç zamana götürüp ara değerleri örnekleyip
  eğriyi tahmin etmekti — gerçek copy/paste değil, yaklaşık bir yeniden
  üretim.
  - **`panel/jsx/commands/keyframe.jsx`:** `_kfSnapshot(prop)` bir property'nin
    TÜM keyframe'lerini (zaman + değer + `keyIn/OutTemporalEase` +
    `keyIn/OutInterpolationType`) okuyor; `_kfApply(prop, keys)` bunu bir
    hedef property'ye REPLACE olarak (önce `removeKey` ile temizleyip)
    `setValuesAtTimes` + `setInterpolationTypeAtKey` + `setTemporalEaseAtKey`
    ile birebir yeniden kuruyor. `getEase` tek bir keyframe'in ease/interp/
    değerini bağımsız okuyabiliyor (ileride başka işler için de lazım
    olacağı öngörülmüştü). `copyKeyframes` tek kaynak → tek hedef;
    `copyKeyframesBatch` tek kaynak → `targets: [{compId, layer, property?}]`
    dizisi, tek undo adımında (performans için batch'lenmiş) — hatalı bir
    hedef `advanced.jsx`'in `batch` komutuyla aynı sözleşmeyle
    `{ok:false, error}` olarak toplanıyor, `stopOnError` verilmedikçe diğer
    hedefler yine de işleniyor.
  - **`shared/src/commands.js`:** üç komut da `withDesc` + tam şema ile
    eklendi (`sourceLayer`/`targetLayer`/`targets[].layer` `anyOf
    string|integer`) — bu oturumun hemen üstündeki girdide (aynı gün, ilk
    kayıt) tam bu sınıf hatanın (`layer` alanının description'da belgelenip
    şemada deklare edilmemesi, strict function-calling istemcilerinde
    parametrenin sessizce düşmesi) düzeltildiğini görüp aynı hatayı yeni
    komutlarda tekrarlamamak için bilinçli.
  - **`controller/src/mcpServer.js`:** üçü de `CORE` setine eklendi →
    `ae_getEase`, `ae_copyKeyframes`, `ae_copyKeyframesBatch` artık ayrı
    MCP tool'ları.
  - **`simulator/src/mockAeDom.js` + `jsxRunner.js`:** bu API'ler simülatörde
    hiç mock'lanmamıştı (`KeyframeEase`/`KeyframeInterpolationType` global
    olarak tanımlı değildi, `MockProperty`'de `keyTime`/`removeKey`/
    `setInterpolationTypeAtKey`/`setTemporalEaseAtKey`/`keyIn·OutTemporalEase`
    yoktu) — yani `setEase`/`setInterpolation`/`removeKeyframes` gibi var
    olan komutlar da hiçbir zaman simülatörde egzersiz edilmemiş, sadece
    canlıda test edilmişti. Kök nedene inip `MockProperty`'yi bu API'lerle
    gerçekten dolduruldu (yeni key'ler AE'nin scriptlenmiş varsayılanı olan
    LINEAR/ease-yok ile başlıyor) — hem yeni komutları hem de bu önceden
    kör olan komutları test edilebilir hale getirdi (yan kazanç, ayrı bir
    hack değil).
  - **Test:** `npm test` — yeni 8 simulator testi
    (`simulator/test/mockAeDom.test.js`, "keyframe copy" describe bloğu:
    ease'in gerçekten okunup yazıldığını farklı comp/layer'a kopyalayarak,
    replace-not-merge davranışını, `targetProperty` override'ını, boş
    kaynağın reddini, batch'in çoklu hedefte ve kısmi hata durumunda
    davranışını doğruluyor) + 6 yeni `shared/test/commands.test.js`
    registry-seviyesi validate testi eklendi. Toplam 240/240 yeşil.
  - **Kapsam notu:** roving keyframe/`keyContinuous`/`keyAutoBezier`/
    spatial tangent kopyalama bilinçli olarak KAPSAM DIŞI bırakıldı — bu
    oturumun ihtiyacı (Scale gibi non-spatial property) için gereksizdi;
    ihtiyaç çıkarsa aynı `_kfSnapshot`/`_kfApply` çifti genişletilebilir.

## 2026-09-07
- **Bug: `ae_setLayerProperty` ve `ae_setKeyframes` MCP tool'ları, çağrıda
  `layer` parametresi geçilmesine rağmen "layer reference (layer/
  layerIndex/layerName) is required" hatasıyla başarısız oluyordu.** Aynı
  komut, `ae_command` escape-hatch'i üzerinden (`params` içine `layer`
  koyarak) sorunsuz çalışıyordu — bu da AE tarafındaki (`panel/jsx`)
  handler mantığının zaten doğru olduğunu, sorunun ondan önceki bir
  aşamada olduğunu gösteriyordu.
  - **Kök neden — `shared/src/commands.js`:** `setLayerProperty`
    (satır ~124-141, eski hali) ve `setKeyframes` (satır ~539-540, eski
    hali) komutlarının `schema` map'i (`controller/src/mcpServer.js:88-94`
    `buildTools()` tarafından `ae_<name>` tool'unun `inputSchema.
    properties`'ine dönüştürülüyor) `layer`/`layerIndex`/`layerName`
    alanlarından HİÇBİRİNİ deklare etmiyordu — halbuki `description`
    metninde `{ compId, layer, property, value }` diye belgeleniyordu.
    AE-side handler (`panel/jsx/host.jsx:142-147` `AEB.requireLayer`,
    `panel/jsx/host.jsx:124-125` `AEB.resolveLayer`) parametreyi doğru
    şekilde arıyordu (`p.layer` / `p.layerName` / `p.layerIndex`) — sorun
    parametrenin oraya hiç ulaşmamasıydı. `ae_command`'ın çalışmasının
    nedeni: onun `inputSchema`'sı `{ command, params }` şeklinde ve
    `params` tipsiz/opak bir `object` (`controller/src/mcpServer.js:69`)
    — içindeki anahtarlar deklare edilmediği için hiçbir şema bunları
    süzemiyor. Ama doğrudan `ae_setLayerProperty`/`ae_setKeyframes`
    tool'larında `layer` üst-seviye bir alan ve şemada yoksa, şemayı katı
    şekilde uygulayan (structured/strict function-calling; JSON şemanın
    `additionalProperties:true` olması burada işe yaramıyor, bkz.
    `shared/src/commands.js`'in yeni `LAYER_REF_SCHEMA` yorum bloğu) bir
    MCP istemcisi tarafında model bu alanı hiç üretemiyor/argüman sessizce
    düşüyor — komutun kendi `validate()`'i (`requireFields`, `{...p}`
    spread eder) parametre zaten elinde olsaydı hiçbir şeyi süzmüyor,
    yani asıl darboğaz gerçekten şema eksikliğiydi, ikinci bir yerde
    tekrar filtrelenmiyor.
  - **Fix — `shared/src/commands.js`:** Ortak bir `LAYER_REF_SCHEMA`
    (satır 24-38) eklendi — `layer` (string|integer anyOf), `layerName`
    (string), `layerIndex` (integer); `AEB.requireLayer`'ın üç-yönlü
    kontratıyla birebir. `setLayerProperty`'nin şemasına (satır 148) ve
    `setKeyframes`'in şemasına (satır 540) `...LAYER_REF_SCHEMA` spread
    edildi. `COMMANDS`'ın ana object literal'i (satır ~40'tan başlıyor)
    içinde `setLayerProperty` bu sabiti kullandığı için `LAYER_REF_SCHEMA`
    bilinçli olarak `COMMANDS` tanımından ÖNCE (import'lardan hemen sonra)
    tanımlandı — modül top-level'da ilk denemede sabiti `COMMANDS` object
    literal'inin GERİSİNE (PROPERTY_SCHEMA/VALUE_SCHEMA'nın yanına)
    koymuştum, bu TDZ (temporal dead zone) ReferenceError'a yol açıyordu;
    `npm test` bunu hemen yakaladı.
  - **Kapsam notu:** Bu ikisi kullanıcı tarafından bildirilen kırık
    tool'lardı ve sadece onlar düzeltildi — ama aynı desende (description
    `{ compId, layer, ... }` diyor, schema `layer` deklare etmiyor) ~40
    başka CORE komut daha var: `trimLayer`, `moveLayer`, `duplicateLayer`,
    `deleteLayer`, `setKeyframe` (tekil), `setEase`, `setInterpolation`,
    `setExpression`, `removeExpression`, `enableExpression`, `addEffect`,
    `setEffectParam`, `listEffects`, `addExpressionControl`, `addMask`,
    `addRectMask`, `setMaskProperty`, `setTextDocument`, `addTextAnimator`,
    `applyTextPreset`, `measureText`, `addLayerStyle`, `getProperty`,
    `getLayerDetails`, `setBlendMode`, `setTrackMatte`, `setLayerFlag`,
    `addLayerMarker`, `setTimeStretch`, `enableTimeRemap`, `replaceSource`,
    `applyLumetri`, `alignLayer`, `alignAnchor`, `glitchEffect`,
    `cinematicGrade`, `neonGlow`, `deepGlow`, `shadowStudio`, `setParent`,
    `addShapeOperator`, `addResponsiveBox` — hepsi teorik olarak aynı
    şemadan-düşme riskini taşıyor, hangi MCP istemcisinin ne kadar katı
    (strict) function-calling şeması uyguladığına bağlı olarak fiilen
    tetiklenip tetiklenmeyeceği değişir. Bilinçli olarak bu oturumda
    genişletilmedi (istenen kapsam sadece bildirilen iki tool'du) —
    `LAYER_REF_SCHEMA` artık paylaşılan bir sabit olduğu için geri kalanına
    uygulamak her biri için tek satırlık bir `...LAYER_REF_SCHEMA` eklemek
    kadar ucuz; bir sonraki oturumda toplu geçilebilir.
  - **Test:** `npm test` — 226/226 yeşil (iki ayrı koşuda doğrulandı; ilk
    koşuda `controller/test/mcp.test.js`'teki stdio init testi bir kez
    timeout'la başarısız oldu, değişiklik olmadan da tekrarlanabilir
    olduğu doğrulanmadan önce şüpheliydi — `git stash` ile değişikliksiz
    tekrar koşulduğunda tek seferde 226/226 geçti, değişiklikli iki ayrı
    tekrar koşuda da 226/226 geçti; yani flaky bir test, bu fix'le
    ilgisiz). `node -e` ile `buildTools()` çıktısı da doğrulandı: `ae_
    setLayerProperty` ve `ae_setKeyframes`'in `inputSchema.properties`'i
    artık `layer`/`layerName`/`layerIndex`'i içeriyor. Gerçek AE
    üzerinden canlı çağrı bu oturumda yapılmadı (istek bunu kapsamıyordu;
    controller/panel'in bu oturumda ayakta olduğu da doğrulanmadı) —
    canlı doğrulama önerilir.

- **Takip: yukarıdaki girdide "bir sonraki oturumda toplu geçilebilir" denen
  ~40 CORE komut da bu oturumda düzeltildi.** Aynı desen — `description`
  `{ compId, layer, ... }` diye belgeliyor ama `schema` map'i `layer`/
  `layerName`/`layerIndex`'ten hiçbirini deklare etmiyordu — `shared/src/
  commands.js`'te tek tek denetlendi (bir node script'iyle: her komutun
  `description`'ında layer-referans dili olup olmadığı ve `schema`
  anahtarlarında `layer`/`layerName`/`layerIndex` bulunup bulunmadığı
  otomatik karşılaştırıldı — 40 tekrar elle taramak yerine).
  - **Düzeltilen 40 komut** (hepsine `...LAYER_REF_SCHEMA` eklendi):
    `setParent`, `trimLayer`, `moveLayer`, `duplicateLayer`, `deleteLayer`,
    `setKeyframe`, `setEase`, `setInterpolation`, `setExpression`,
    `removeExpression`, `enableExpression`, `addEffect`, `setEffectParam`,
    `listEffects`, `addExpressionControl`, `addMask`, `addRectMask`,
    `setMaskProperty`, `setTextDocument`, `addTextAnimator`,
    `applyTextPreset`, `measureText`, `addLayerStyle`, `getProperty`,
    `getLayerDetails`, `setBlendMode`, `setTrackMatte`, `setLayerFlag`,
    `addLayerMarker`, `setTimeStretch`, `enableTimeRemap`, `replaceSource`,
    `applyLumetri`, `alignLayer`, `alignAnchor`, `glitchEffect`,
    `cinematicGrade`, `neonGlow`, `deepGlow`, `shadowStudio`,
    `addShapeOperator` — orijinal girdideki liste ile birebir aynı çıktı,
    ekleme/çıkarma olmadı.
  - **Bilinçli atlanan tek aday: `addResponsiveBox`** (orijinal listede
    zaten yoktu ama otomatik taramada "description'da `layer|layerIndex|
    layerName` geçiyor" diye false-positive yakalandı) — incelendiğinde bu
    ifadenin orada bir layer referans ALANI olarak değil, `fitTo`
    parametresinin kabul ettiği DEĞER TÜRLERİNİ (layer adı ya da index'i)
    açıklayan bir cümle olduğu görüldü; `fitTo` zaten kendi
    `anyOf:[string,number]` şemasıyla tam deklare edilmiş durumda ve komut
    başka bir layer'a değil, tamamen `fitTo` referanslı hedefe göre çalışıyor
    — `layer`/`layerName`/`layerIndex` alanları hiç yok, eklemek yanlış
    olurdu. Aynı otomatik taramada `addSolid`/`addTextLayer`/`addNull`/
    `addAdjustmentLayer`/`addShape`/`addPathShape`/`applyWordReveal`/
    `applyCharScale`/`sequenceLayers` da "description'da layer geçiyor" diye
    işaretlendi ama hepsi ya yeni bir layer YARATIYOR (`layerIndex` dönüş
    değeri olarak, referans olarak değil) ya da kendi `layers[]` dizi
    alanını zaten doğru şekilde deklare etmiş (`sequenceLayers`) — hiçbiri
    dokunulmadı.
  - **Kapsam dışı bırakılan, fark edilen ayrı iki eksik (bu görevin
    kapsamında değil, ayrı bug):** `setExpression`'ın şeması `property`
    alanını hiç deklare etmiyor (sadece `expression`); `setEffectParam`'ın
    şeması `effect` alanını hiç deklare etmiyor (sadece `param`/`value`/
    `time`) — ikisi de bu oturumda `layer` ile birlikte düzeltildi ama
    `property`/`effect` alanları ayrı, bu görevin kapsamı dışında bırakıldı;
    aynı şema-eksikliği ailesinden, ayrı bir oturumda ele alınmalı.
  - **Doğrulama:** `npm test` — 226/226 yeşil. `npm run lint` (eslint +
    `lint:jsx`) temiz. Şema anahtarlarında çift `...LAYER_REF_SCHEMA`
    eklenmediği bir node script'iyle teyit edildi (`Object.keys` üzerinde
    tekrar sayımı — sıfır çift). `controller/src/mcpServer.js`'in
    `buildTools({mode:'core'})` çıktısı canlı çalıştırılarak `ae_trimLayer`,
    `ae_addEffect`, `ae_measureText`, `ae_addShapeOperator`, `ae_setParent`,
    `ae_addTextAnimator`, `ae_alignAnchor`'ın `inputSchema.properties`'inde
    artık `layer`/`layerName`/`layerIndex` göründüğü doğrulandı. Gerçek AE
    üzerinden canlı çağrı bu oturumda yapılmadı — bir önceki fix'in aynı
    kalıbı zaten canlı ihtiyaçtan doğduğu için (`ae_setLayerProperty`),
    riskin aynı türden olduğu değerlendirildi; yine de bir sonraki canlı
    oturumda bu 40 tool'dan en az birkaçı (`ae_trimLayer`, `ae_setParent`
    gibi sık kullanılanlar) gerçek bir MCP istemcisiyle uçtan uca
    denenmeli.

- **Bug: `ae_render` (`startFrame`/`endFrame` ile) her karesi aynı olan
  bir video üretiyordu — sanki sadece ilk kare render edilip N kez
  kopyalanmış gibi; aynı comp/aralık `ae_render_and_download` ile doğru
  (zaman içinde değişen) render veriyordu.** ffprobe kare-hash
  karşılaştırmasıyla doğrulanmıştı: 51 karelik bir render'da tüm kareler
  aynı hash'e sahipti.
  - **Kök neden — `panel/src/render.js:75-113` (render öncesi kaydetme
    eksikliği), `controller/src/media.js:189-197` (aynı eksikliğin
    `ae_render_and_download` tarafında zaten kapatılmış olması):**
    render aslında AE'nin Render Queue/RQItem mekanizmasını KULLANMIYOR —
    `panel/jsx/commands/renderqueue.jsx:1-2` ve `panel/src/render.js:1-8`
    yorumlarında da açık: `rqItem.render()` senkron/modal olduğu, bridge'i
    kilitlediği için gerçek render tamamen `aerender` (After Effects'in
    komut satırı render aracı) ile, ayrı bir process olarak yapılıyor
    (`panel/src/render.js:104-151`, `-project/-comp/-output/-s/-e`
    argümanlarıyla). `-s`/`-e` (startFrame/endFrame) argümanları doğru
    iletiliyordu (`shared/src/commands.js:143-163` validate; `panel/jsx/
    commands/render.jsx:14-36` `__prepareRender`) — bahsedilen RQItem.
    timeSpanStart/timeSpanDuration hipotezi bu kod tabanında geçerli
    değildi, çünkü o API hiç çağrılmıyor.
    Asıl sorun: **`aerender` ayrı bir process olarak projeyi DİSKTEN
    açıyor — çalışan AE örneğinin bellek içindeki canlı state'iyle hiçbir
    bağlantısı yok.** `panel/jsx/commands/render.jsx:14-36`'daki
    `__prepareRender`, `projectSaved` alanını sadece "projeye hiç dosya
    atanmış mı" diye kontrol ediyordu (`projectPath ? true : false`) —
    "diskteki dosya güncel mi" diye değil. `controller/src/media.js`'teki
    `ae_render_and_download` yolu (`startRender()`, satır 189-191) render
    komutunu göndermeden ÖNCE her seferinde `saveProject` çağırarak bu
    boşluğu zaten kapatıyordu (proje daha önce hiç kaydedilmediyse
    `assets/_session.aep`'e fallback ile). Ama `ae_render` / `ae_command
    render` (`controller/src/mcpServer.js:129-141`, genel `backend.execute`
    dispatch'i) hiçbir zaman bu adımı atmıyordu — sadece `aeClient.
    sendCommand('render', ...)`'a gidiyordu. Sonuç: proje ilk kaydedildikten
    SONRA (ör. keyframe eklendikten sonra) tekrar kaydedilmeden `ae_render`
    çağrılırsa, `aerender` diskteki BAYAT (henüz animasyonsuz/statik)
    projeyi render ediyor — bu da tam olarak gözlenen semptomu üretiyor:
    istenen aralığın her karesi aynı (o bayat statik state'in donuk hâli).
  - **Fix — `panel/src/render.js`:** `render()` artık `__prepareRender`'dan
    hemen sonra, `aerender`'ı spawn etmeden ÖNCE koşulsuz olarak
    `__saveProject` çağırıyor (mevcut dosyaya taze bir save; hiç
    kaydedilmemişse aynı `PROJECT_UNSAVED` hatasını üretiyor). Bu, HER İKİ
    çağrı yolunun da (ae_render, ae_render_and_download) fiilen aynı tek
    fiziksel render implementasyonundan geçtiği tespit edildikten sonra,
    düzeltmeyi o tek boğaz noktasına (choke point) taşımanın sonucu — artık
    `media.js`'in kendi ön-save adımını unutması ya da gelecekte üçüncü bir
    çağıran eklenmesi hiçbir zaman aynı bug'ı tekrar açamaz. `media.js`'teki
    mevcut çift-saveProject (bare + `_session.aep` fallback) bilinçli olarak
    dokunulmadan bırakıldı: "hiç kaydedilmemiş proje" durumunda ilk kez bir
    dosya yolu kurma kolaylığı sağlıyor, bu fix'in kapsamı dışında ayrı ve
    değerli bir davranış.
  - **Test:** `npm test` (226/226 yeşil, hiçbir şey bozulmadı). `panel/src/
    render.js` CEP-only olduğu için mevcut test altyapısı
    (`controller/shared/simulator`) bu dosyayı hiç kapsamıyor — bu zaten
    2026-08-09 (13) girdisinde not edilmiş bilinen bir boşluk; bu fix de
    aynı boşluğa giriyor, otomatik regresyon testi yok. Gerçek AE
    üzerinden canlı doğrulama bu oturumda yapılamadı (controller/panel
    canlı değildi) — kod seviyesinde dikkatli inceleme + iki yolun tam
    diff'i ile sınırlı kaldı; canlı bir sonraki render denemesinde
    ffprobe kare-hash karşılaştırmasıyla doğrulanmalı.
- **`batch`'in "1 trip, 1 undo" tasarımı + AE 26.3'teki bozuk `redo`'nun
  birleşimi, büyük bir toplu kurulumu tek Cmd+Z ile sildi — kurtarma yolu
  diskten son kayda dönmek oldu; ayrıca `ae_status.project`'in bayat
  cache olduğu bug'ı bulundu ve düzeltildi.**
  - **Olay:** Bu oturumda `ae_command batch` üzerinden 14 comp + footage
    import'tan oluşan tek bir kurulum gönderildi. `batch`, mimarisi gereği
    (`panel/jsx/commands/batch.jsx`, tek `AEB.undo(...)` sarmalı) bütün
    sıralı işlemi **tek** undo-group'a sarıyor — yani AE tarafında bu koca
    kurulum, kullanıcı gözünden "bir adım" olarak görünüyor. Kullanıcı
    GUI'den bilmeden tek bir Cmd+Z yaptığında, 14 comp + import'un tamamı
    tek seferde geri alındı. Bu bir bağlantı kopması ya da hata değil —
    `batch`'in "1 network trip, 1 undo group" tasarımının doğrudan, beklenen
    sonucu; ama kullanıcı tarafında sürpriz oldu çünkü GUI'de tek Cmd+Z'nin
    bu kadar geniş bir işlemi sileceği görünür değil.
  - Kurtarma normalde basit olurdu (`redo`) ama 2026-08-25 (4) girdisinde
    kayıtlı, bu AE sürümünde (26.3x87) zaten kök nedeni bulunamamış `redo`
    bug'ı burada da tekrar etti — `redo` `{ok:true}` döndü ama state geri
    gelmedi. Kalıcı fix hâlâ yok (bkz. o girdi), sadece tekrar teyit edildi.
    Undo geri alınamayınca **tek çalışan kurtarma yolu diskteki son
    kaydedilmiş `.aep`'i yeniden açmak** oldu — proje son
    `ae_saveProject` sonrası hiç kaydedilmemişti, o yüzden kayıp minimumda
    kaldı ama tesadüfti.
  - **Öneri (disiplin, kod değişikliği değil):** Büyük `batch` kurulumlarından
    hemen sonra `ae_saveProject` çağrılmalı — `redo` güvenilmez olduğu
    sürece diskteki son kayıt tek güvenlik ağı. `batch`'i N ayrı undo-group'a
    bölmek de düşünüldü ama bu, `batch`'in var oluş amacını (tek network
    trip'te atomik kurulum) bozar; onun yerine iş akışı disiplini tercih
    edildi.
  - **Ayrı ama bu oturumda fark edilen ikinci bug — `ae_status.project`
    bayat cache, kök nedene inen fix uygulandı.** `controller/src/
    aeClient.js`'te `_status.project`, panelden gelen `'ready'` event'inde
    (`panel/src/main.js` `ws.onopen` → `probeEnvironment()`) **sadece bir
    kez**, WebSocket ilk bağlandığında set ediliyordu; sonrasında
    `openProject`/`saveProject`/comp değişiklikleri hiç bu alanı
    güncellemiyordu — `server.js`'teki `ae_status`/`/api/status` handler'ı
    da bu cache'lenmiş değeri doğrudan döndürüyordu. Sonuç: uzun süren
    oturumlarda `ae_status` gerçek dışı/bayat proje adı (ör. "Untitled")
    gösterebiliyordu, tam da yukarıdaki gibi bir olaydan sonra durumu
    teyit etmeye çalışırken güven kırıcı.
    - **Fix:** `AeClient`'a `getFreshStatus()` eklendi — panel bağlıysa
      `getProjectInfo` komutunu (zaten her çağrıda `app.project`'i taze
      okuyan, cache'siz — `panel/jsx/commands/project.jsx`) 5s timeout'la
      çalıştırıp sonucu `_status.project`'e yazıyor, sonra `status`
      getter'ını döndürüyor; panel bağlı değilse veya komut başarısız
      olursa sessizce cache'e düşüyor (asla throw etmiyor, mevcut
      `sendCommand` sözleşmesiyle tutarlı). `server.js`'teki hem
      `GET /api/status` hem `mcpBackend.status()` (→ MCP `ae_status` tool'u)
      artık `aeClient.status` yerine `await aeClient.getFreshStatus()`
      çağırıyor. Senkron `status` getter'ı ve mevcut `'ready'` event
      davranışı olduğu gibi bırakıldı (testler ona bağlıydı,
      `controller/test/aeClient.test.js`), yeni metot sadece HTTP/MCP
      status yolunu taze sorguya çeviriyor.
    - `npm test`: 226/226 geçti. Canlı proje üzerinde yalnızca salt-okunur
      `ae_status`/`getProjectInfo` çağrılarıyla teyit edilmesi planlanıyor
      (Motion-Graphics-14-Comps.aep'e hiçbir yazma işlemi yapılmadı).

## 2026-08-25 (4)
- **`redo` (`app.jsx`, `app.executeCommand(17)`) kök neden araştırması —
  ID bulunamadı, fix yok.** İzole, kaydedilmemiş bir test comp'ta
  (`redo_bug_test`, tek solid layer) canlı AE'de (26.3x87) uçtan uca
  doğrulandı: Opacity 100→50 (`setLayerProperty`) → `undo` (id 16) → 100'e
  dönüyor (beklenen, zaten kanıtlıydı) → `redo` (id 17) → `{ok:true}`
  dönüyor ama Opacity 100'de kalıyor, 50'ye dönmüyor (bilinen bug teyit
  edildi).
  - `app.findMenuCommandId("Redo")` → `0` (bulunamadı), redo mevcutken de
    (undo sonrası) aynı sonuç — AE'nin dinamik "Redo <İşlem Adı>" etiketi
    literal `"Redo"` ile eşleşmiyor; `"Redo Opacity"` denemesi de `0`.
  - Karşılaştırma için `app.findMenuCommandId("Undo")` → `2371` döndü —
    yani AE 26.3'te en azından bazı Edit-menü komutları için dinamik/farklı
    bir ID aralığı var, ama bu `undo` (id 16) çalışıyor olgusuyla çelişmiyor
    çünkü sabit `executeCommand(16)` zaten adı ne olursa olsun "bir adım
    geri al"ı tetikliyor (menü etiketinden bağımsız, olasılıkla eski/kalıcı
    bir sabit komut ID'si). `redo` için eşdeğer sabit ID'nin 17 olmadığı
    kanıtlandı.
  - Aday ID taraması (talimatta istenen sınır dahilinde, her biri ayrı,
    tek seferlik `executeMenuCommand` çağrısı + öncesinde
    `setLayerProperty(50)`→`undo`→100 ile temiz state): **15, 18, 19, 20,
    2372** (son biri, `findMenuCommandId("Undo")`'nun döndürdüğü 2371'e
    komşu olduğu için eklendi) — **hiçbiri** Opacity'yi 50'ye
    döndürmedi, hepsi sessizce etkisiz kaldı (hata yok, state değişmedi).
  - Talimata uyularak buradan sonrası (daha geniş ID taraması, script
    içinde döngü) YAPILMADI — spekülatif "dene-gör" sınıfına giriyor, karar
    Korhan'a bırakıldı. Test comp temizlendi (`deleteItem`). `app.jsx`'te
    kod değişikliği yok, `COMMANDS.redo` hâlâ `executeCommand(17)` —
    yani hâlâ etkisiz, bilerek dokunulmadı.
  - **Açık kalan gerçek soru:** AE 26.3'te "Redo" işlevine karşılık gelen
    doğru `executeCommand` ID'si ne (ya da script üzerinden tetiklenen
    `undo`'nun redo stack'ini normal kullanıcı undo'sundan farklı
    temizlediği/yönettiği bir olasılık var mı) — doğrulanmadı, uydurulmadı.

## 2026-08-25 (3)
- **`addLayerStyle` `canSetEnabled:false` — kök neden araştırması, hipotez
  YANLIŞ çıktı, fix yok.** Önceki hipotez: `layer.property("ADBE Layer
  Styles")` master grubu UI'dan hiç kullanılmamışsa `enabled:false` durur
  ve bu, alt stil gruplarının (`dropShadow/enabled` vb.) `canSetEnabled`
  değerini `false`'a çekiyor olabilir — düzeltme `styles.enabled=true`
  önce set edilsin şeklinde düşünülmüştü. İzole, kaydedilmemiş bir test
  comp'ta (`__debug_layerstyle_test`, tek solid layer) canlı AE'de
  (26.3x87) `runJSX` ile salt-okunur + tek seferlik yazma denemesiyle
  doğrulandı:
  - `styles.enabled = false`, **`styles.canSetEnabled` de `false`** —
    master grubun kendisi de scriptle açılamıyor
    (`styles.enabled = true` → aynı "canSetEnabled is false" hatası).
    Yani önerilen fix (`styles.enabled=true` sonra `styleGroup.enabled=
    true`) çalışmayacaktı; hipotez yanlış.
  - İkinci, daha temkinli deneme: AE'nin Layer Styles alt-menüsü ExtendScript
    property atamasıyla değil, `app.executeCommand(menuId)` ile UI menü
    komutu tetiklenerek mi açılıyor sorusu test edildi.
    `app.findMenuCommandId("Drop Shadow")` → `9000` (ve
    Inner/Outer/Inner Glow/Bevel/Satin/Color Overlay/Gradient Overlay
    sırayla `9001`-`9007`; `Pattern Overlay` `0` = bulunamadı, `Stroke`
    `2452` = muhtemelen aynı isimli başka bir menü öğesiyle çakışıyor).
    Test layer'ı `selected=true` yapıp `app.executeCommand(9000)`
    çalıştırıldı — hata atmadı ama hiçbir şey değişmedi: ne
    `ADBE Layer Styles` grubunun `enabled`/`canSetEnabled`'ı değişti, ne de
    `ADBE Effect Parade`'e bir efekt eklendi. `app.isMenuCommandEnabled`
    bu AE sürümünün ExtendScript `app` nesnesinde yok, o yüzden komutun
    gerçekten "tıklanabilir" olup olmadığı script'ten doğrulanamadı — muhtemel
    neden, menü komutunun script'ten değil aktif/odaklı Timeline panelinden
    tetiklenmeyi beklemesi.
  - Bu ikinci deneme de tek seferlik, hızlı, geri alınabilirdi (izole test
    comp'ta, `deleteLayer`/`comp.remove()` ile hemen temizlendi) ama yine
    sonuçsuz kaldı. Buradan sonrası (panel odağını script'ten zorlamak,
    `activeViewer`/UI otomasyonu ile menüyü gerçekten tıklatmak vb.) daha
    spekülatif ve potansiyel olarak kırılgan/riskli bir "dene-gör" sınıfına
    giriyor — bilinçli olarak durduruldu, karar Korhan'a bırakıldı.
  - Test comp temizlendi (`comp.remove()`), controller dev-mode
    (`AE_BRIDGE_ALLOW_DEV=1`, sadece bu araştırma için geçici açıldı) kapatılıp
    normal modda yeniden başlatıldı. `style.jsx`'te kod değişikliği YAPILMADI
    — mevcut `addLayerStyle` implementasyonu aynen duruyor, hâlâ canlıda
    reddediliyor. `npm test` çalıştırılmadı (kod değişikliği olmadığı için
    gerek görülmedi).
  - **Açık kalan gerçek soru:** AE'nin Layer Styles'ı scriptten açmanın
    desteklenen bir yolu var mı (belki farklı bir API/versiyon davranışı,
    belki panel odağı script içinden `app.activeViewer`/benzeri ile
    ayarlanabilir), yoksa bu ExtendScript'in bilinen bir sınırlaması mı —
    doğrulanmadı, uydurulmadı.

## 2026-08-25 (2)
- **`keystroke` CORE'a terfi ettirildi — MCP tool şema tamamlama tamamen
  bitti (82/82 komut top-level `ae_*` tool).** Önceki oturumda bilinçli
  olarak ayrı bırakılan karar (bkz. ROADMAP): risk sınıfı diğer Tier 4b
  komutlarından farklı — AE'nin obje modelinin dışına çıkıp OS seviyesinde
  sentetik tuş vuruşu gönderiyor, odak AE'de değilse başka bir uygulamaya
  gidebilir, etkisi AE `undo`'suyla geri alınamaz. Korhan'la kriterleri
  konuşulduktan sonra (blast radius'un bu tek-kullanıcı prodüksiyon
  aracında kullanıcının kendi oturumuyla sınırlı olması, diğer 81 komutla
  tutarlılık) **CORE'a alınmasına karar verildi.**
  `shared/src/commands.js`'teki `keystroke` girişine gerçek `inputSchema`
  (`keys`/`text`/`key`/`ctrl`/`alt`/`shift`/`cmd`, hepsi string/boolean)
  ve yukarıdaki riski özetleyen bir CAUTION notu eklendi;
  `controller/src/mcpServer.js`'in `CORE` Set'ine eklendi. `npm test`:
  226/226.
  - **Canlı doğrulandı** (26.3x87, geçici `__keystroke_core_probe` comp +
    2 null layer, iş bitince `deleteItem` + `closeProject{save:false}` ile
    temizlendi). `setActiveComp` sonrası `{key:'a', cmd:true}` → Cmd+A
    (1→2 layer seçili), `{key:'a', cmd:true, shift:true}` → Cmd+Shift+A
    (2→0 layer) — top-level `ae_keystroke` tool'u üzerinden (önceki
    doğrulama `ae_command` dispatcher'ıyla yapılmıştı, bu kez doğrudan).
  - Controller bu doğrulama için `npm run controller` ile manuel
    başlatıldı (`service:restart` değil) — 2026-08-22'de bilinçli kapatılan
    launchd auto-start'a bu kez dokunulmadı, `print-disabled` işlem
    sonunda hâlâ `disabled` olarak teyit edildi. Tier 4a/4b'deki yan etkiyi
    (her `service:restart`'ın auto-start'ı farkında olmadan yeniden
    etkinleştirmesi) önlemenin yolu netleşti: şema değişikliğini devreye
    almak için `service:restart` yerine düz `npm run controller` yeterli.

## 2026-08-25
- **MCP tool şema tamamlama: Tier 4a (10 komut, kalan 3 zaten CORE'daydı)
  bitti.** `undo`, `redo`, `purge`, `getSelection`, `getAppInfo`,
  `getEnvironment`, `listPlugins`, `lumetriParams`, `setActiveComp`,
  `setCompTime` `controller/src/mcpServer.js`'in `CORE` Set'ine eklendi;
  `shared/src/commands.js`'te gerçek argümanı olanlara (`purge.target`,
  `listPlugins.dirs`, `setActiveComp.compId/compName`,
  `setCompTime.compId/time`) `schema` eklendi, tamamen parametresiz
  olanlar (`undo`/`redo`/`getSelection`/`getAppInfo`/`getEnvironment`/
  `lumetriParams`) `listRenderQueue`/`clearRenderQueue`'nun zaten
  kullandığı desenle şemasız bırakıldı — `withDesc`'in 3. argümanı yoksa
  mcpServer.js'teki permissive fallback zaten doğru davranıyor.
  `npm test`: 226/226. 13 komutun (yeni 10 + `ping`/`getProjectInfo`/
  `listComps`) 13'ü de canlı AE'de (26.3x87, "Untitled" proje, geçici
  `tier4a-test` comp üzerinden) `/command` REST üzerinden tek tek
  doğrulandı; iş bitince `closeProject{save:false}` ile proje temiz
  Untitled'a döndürüldü.
  - **Gerçek bug bulundu, bu işin kapsamı dışında bırakıldı:** `redo`
    (`panel/jsx/commands/app.jsx`, `app.executeCommand(17)`) bu AE
    sürümünde hiçbir şeyi geri getirmiyor. `undo` (`executeCommand(16)`)
    hem layer ekleme/silmede hem `setLayerProperty` (Opacity 100→50)
    üzerinde tutarlı ve doğru çalışıyor (state gerçekten geri alınıyor);
    `undo`'dan hemen sonra çağrılan `redo` ise `{ok:true}` dönüyor ama
    projede hiçbir şey değişmiyor (opacity 50 kalması gerekirken 100'de
    kalıyor) — 3 saniyeye kadar gecikme de sonucu değiştirmiyor. Kod
    `Initial commit`'ten (upstream `aftr`) geliyor, bu fork'ta hiç canlı
    test edilmemişti. Kök neden netleşmedi (bu AE build'inde
    `executeCommand(17)`'nin artık Redo'ya karşılık gelmemesi ihtimali
    var — `app.findMenuCommandId("Redo")` da undo sonrası bile 0
    (bulunamadı) döndü, ama Edit menüsündeki Redo/Undo etiketleri dinamik
    olduğundan bu testin kendisi de güvenilir değil). Düzeltmek
    `app.jsx` değişikliği + `build:jsx`/`deploy:panel` + AE yeniden başlatma
    gerektirir; ROADMAP'e not düşüldü, ayrı bir oturumun işi.
  - **Yan not (görev kapsamı dışı, düzeltildi):** `npm run service:restart`
    çalıştırmak, 2026-08-22'de bilinçli olarak devre dışı bırakılan
    launchd auto-start servisini (`com.coltranesx.mograph-mcp.controller`)
    farkında olmadan tekrar `enabled` durumuna getirdi (`launchctl
    kickstart` her nasılsa disabled bayrağını da kaldırıyor). İş bitince
    aynı 2026-08-22 tarifiyle (`bootout` + `disable`) tekrar devre dışı
    bırakıldı ve doğrulandı (`print-disabled` → disabled, port 8787 boş).
    Auto-start hâlâ istenmiyor; her oturumda controller'ı elle başlatmak
    gerekiyor.
- **`keystroke`'un macOS dalındaki sessiz bug'ı düzeltildi.** Tier 4b
  (`quitApp`, `executeMenuCommand`, `findMenuCommand`, `keystroke`, `batch`)
  CORE'a terfi kararı öncesi bir Opus mimarlık incelemesi istendi
  (`architect` ajanı, model override); 4/5'i sorunsuz terfi edilebilir
  bulundu ama `keystroke` için gerçek bir bug ortaya çıktı, terfi ayrı
  bir oturuma bırakıldı. `panel/src/keystroke.js`'in mac dalı (`osascript`
  System Events) `buildKeys()`'in ürettiği modifier/named-key bilgisini
  tamamen yok sayıp `p.text`/`p.key`'i olduğu gibi `keystroke "..."`
  komutuna literal string olarak veriyordu — `{key:'F9', ctrl:true}`
  Ctrl+F9 basmak yerine ekrana "F9" yazıyordu, `{keys:'^s'}` ise
  `p.text`/`p.key` ikisi de tanımsız olduğundan hiçbir şey yazmıyordu.
  Sessiz yanlış davranış, eksik özellikten kötü (Opus'un notu) — bu
  yüzden CORE terfisi değil, önce bu düzeltildi. `buildMacCommand()` +
  `parseSendKeysForMac()` + `MAC_KEY_CODES` tablosu eklendi: modifier'lar
  artık `using {control down, ...}` ile gerçekten uygulanıyor, isimli
  tuşlar (`F1-F20`, `RETURN`, `TAB`, ok tuşları, ...) `key code`'a
  çözülüyor. Ayrıca yeni bir `cmd?` modifier'ı eklendi (mac Command
  tuşu) — AE'nin kendi mac kısayolları neredeyse hepsi Cmd tabanlı,
  önceki `ctrl/alt/shift` üçlüsü bunu hiç ifade edemiyordu, düzeltmeyi
  gerçekten kullanışlı kılmak için gerekliydi. `^`/`%`/`+` SendKeys
  önekleri mac'te bilinçli olarak Control/Option/Shift'e (Cmd'ye değil)
  eşleniyor — dosya başına bunun neden kafa karıştırıcı olabileceği not
  edildi. `npm test`: 226/226 (bu dosya JSX/simulator test yüzeyinin
  dışında, Node/OS kodu, önceden de test edilmiyordu).
  - **Canlı doğrulandı** (26.3x87, geçici `__keystroke_probe` comp + 2 null
    layer, iş bitince silindi). İlk denemede `osascript` `exit 1` verdi;
    hata mesajına stderr eklendi (`mc.stderr` yakalanıp `done()`'a
    iletiliyor, önceden sadece "exit 1" görünüyordu), panel + AE tam
    yeniden başlatılınca ikinci denemede sorunsuz çalıştı — ilk hatanın
    kök nedeni netleşmedi, tekrarlanmadı. `{key:'a', cmd:true}` → Cmd+A
    (select all, 1→2 layer seçili), `{key:'a', cmd:true, shift:true}` →
    Cmd+Shift+A (deselect all, 2→0 layer), `{key:'ESCAPE'}` → `key code
    53` hatasız çalıştı. Modifier ve named-key çözümü ikisi de doğrulandı.
    `keystroke`'un CORE terfi kararı hâlâ ayrı — bug artık gerekçe değil,
    geri kalan soru OS-seviyesi risk sınıfının CORE'a uygun olup olmadığı.
  - **Diğer 4 komut CORE'a terfi edildi ve canlı doğrulandı** (aynı Opus
    incelemesindeki şemalarla — `controller/src/mcpServer.js` CORE Set +
    `shared/src/commands.js`'te `withDesc`'e 3. argüman): `executeMenuCommand`
    ("Deselect All" ile test edildi, seçim gerçekten kalktı),
    `findMenuCommand` (`"Deselect All"` → `commandId:2004`, doğru çözüldü),
    `batch` (iki `setLayerProperty` tek çağrıda yapıldı, TEK `undo` ikisini
    de geri aldı — Opus'un "canlı doğrulanmalı" dediği 1-undo-group vaadi
    doğrulandı, gerçek bir bug çıkmadı), `quitApp` (`save:false` ile
    çağrıldı, AE gerçekten kapandı — controller `DISCONNECTED`'i
    dokümante edildiği gibi `{ok:true}` olarak çözdü). `npm test`:
    226/226. `npm run service:restart` çalıştırıldı (schema değişikliği
    devreye girsin diye) — bu, 2026-08-22'de bilinçli kapatılan launchd
    auto-start'ı yine farkında olmadan `enabled` yaptı (aynı yan etki,
    Tier 4a'da da görülmüştü); test bitince tekrar `bootout`+`disable`
    ile devre dışı bırakılacak.
  - **`quitApp` canlı testi sırasında gerçek bir bug bulundu ve düzeltildi
    (Korhan'ın kendi gözlemiyle — save dialog'unu elle kapattı).**
    `panel/jsx/commands/app.jsx`'teki `quitApp`, dosyanın kendi başlık
    yorumunun ("closeProject/openProject/quitApp never rely on AE's own
    save-changes dialog... always pass CloseOptions.DO_NOT_SAVE_CHANGES")
    iddia ettiği deseni takip ETMİYORDU: `closeProject`/`openProject`
    `proj.close(CloseOptions.DO_NOT_SAVE_CHANGES)` çağırırken `quitApp`
    doğrudan `app.quit()`'e gidiyordu — ki `app.quit()`'in `closeProject`
    gibi bir "discard" seçeneği yok. `save:true` (varsayılan) yolunda
    fark edilmemişti çünkü `_saveOrThrow` projeyi zaten kaydedip dirty
    flag'i temizliyordu; ama `save:false` (kasıtlı discard) verildiğinde
    proje dirty kalıyor ve `app.quit()` AE'nin native "Save changes?"
    dialog'unu açıyordu — bridge kilitleniyor, insan müdahalesi (Don't
    Save'e tıklamak) gerekiyordu. Fix: `app.quit()`'ten önce `proj.close
    (CloseOptions.DO_NOT_SAVE_CHANGES)` eklendi (closeProject'in zaten
    yaptığı şey) — artık `save:false` yolu da hiçbir dialog açmadan
    kapanıyor. `npm test`: 226/226. Canlı doğrulandı: kasıtlı dirty proje
    (`__quitapp_probe` comp'u) + `quitApp{save:false}` → dialog YOK,
    sessiz kapanış (kullanıcı teyit etti). AE zaten kapalıyken deploy
    edildiği için ekstra bir restart döngüsü gerekmedi.

## 2026-08-22
- **Controller'ın launchd auto-start servisi durduruldu ve devre dışı bırakıldı.**
  `com.coltranesx.mograph-mcp.controller` (`~/Library/LaunchAgents/com.coltranesx.mograph-mcp.controller.plist`,
  `RunAtLoad: true`, `KeepAlive: true`) her Mac girişinde otomatik başlayıp
  `Mograph Controller.app`'ı (`server.js`, port 8787) arka planda sürekli
  ayakta tutuyordu — MCP bağlantısı hiç açılmasa bile. Fark ediliş nedeni:
  weasyeditv2 projesinde port çakışması araştırılırken (`lsof`) bu sürecin
  günlerdir (o an 2 gündür) çalıştığı görüldü.
  - **Durduruldu:**
    ```bash
    launchctl bootout gui/$(id -u)/com.coltranesx.mograph-mcp.controller
    launchctl disable gui/$(id -u)/com.coltranesx.mograph-mcp.controller
    ```
  - **Doğrulama:** `lsof -nP -iTCP:8787 -sTCP:LISTEN` boş döndü;
    `launchctl print-disabled gui/$(id -u) | grep mograph` →
    `"com.coltranesx.mograph-mcp.controller" => disabled`.
  - **Tekrar etkinleştirmek gerekirse** (AE MCP kullanılacaksa):
    ```bash
    launchctl enable gui/$(id -u)/com.coltranesx.mograph-mcp.controller
    launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.coltranesx.mograph-mcp.controller.plist
    ```
    Tek seferlik/geçici kullanım için servisi tekrar etkinleştirmeden
    doğrudan `Mograph Controller.app`'ı elle açmak da yeterli.

## 2026-08-11 (7)
- **Tier 3'ün panel değişiklikleri (host.jsx/project.jsx/layer.jsx —
  `findProjectItem` bug fix) dağıtıldı ve canlıda doğrulandı.** `npm run
  build:jsx && npm run deploy:panel` çalıştırıldı, AE tam kapatılıp
  yeniden açıldı, panel yeniden bağlandı (`ae_status` → connected).
  Smoke test: `createFolder` → `renameItem` (isimle) → `deleteItem`
  (isimle) zinciri, düzeltilen lookup path'i uçtan uca çalıştırdı, hepsi
  `ok:true`. Controller de daha önce restart edilmişti, yeni 96 tool'luk
  `CORE` set'ini serviyor.
- **Kalan tek açık iş: `addLayerStyle` capability sorunu** (bkz. (6) ve
  ROADMAP "Tier 3" notu) — bir sonraki oturumda ayrı ele alınacak.
  **Dikkat:** kök neden araştırması sırasında (renderer'ı Advanced 3D
  dışına almayı denemek) AE'nin ana thread'i ~10 dakika kilitlenmişti;
  kendi kendine toparlandı, veri kaybı olmadı, ama bu yaklaşım tekrar
  denenecekse izole/kaydedilmemiş bir test projesinde, sabırla beklemeye
  hazır olarak yapılmalı.

## 2026-08-11 (6)
- **MCP tool şema tamamlama — Tier 3 bitti (26/26), canlı AE'de doğrulandı.**
  Kalan 8 komuta şema yazıldı ve `CORE`'a eklendi: `getCompTime`,
  `duplicateComp`, `sequenceLayers`, `setTimeStretch`, `enableTimeRemap`,
  `replaceSource` (comp/layer-time), `addLayerStyle`, `removeLayersByPrefix`.
  `addLayerStyle` addShapeOperator'ın konvansiyonunu izliyor: `style` enum
  whitelist + `params`'ta `v.optionalObject` toleransı. `npm test` yeşil
  (226/226). Controller `npm run service:restart` ile yeniden başlatıldı
  (yeni kod eski process'te değil), 26 komutun tamamı `tier3_livetest`
  comp'unda `mcp-direct-call` (ham HTTP JSON-RPC) ile ayrı ayrı çağrıldı:
  **25/26 sorunsuz geçti**, `getLayers`/`getLayerDetails` ile çapraz
  doğrulandı (`sequenceLayers`+`setTimeStretch`'in layer startTime/outPoint
  sonuçları, `replaceSource`'un layer adı değişimi, vb.).
  - **Kozmetik olmayan bulgu:** `deleteItem` bir FOLDER'a karşı çağrıldığında
    AE içeriğini rekürsif siliyor (native AE davranışı, script tarafında
    "önce taşı" adımı yok) — bir test klasörünü silerken içindeki test
    comp'u da sessizce gitti. Tool'un kendi açıklamasına bu uyarı eklendi.
  - **`addLayerStyle` şüpheli kaldı:** hem solid hem text layer'da
    `styleGroup.enabled = true` AE'nin kendi hatasıyla reddedildi ("Can not
    set enabled on this property because canSetEnabled is false") — tool
    tarafı (marshalling, hata yükseltme) doğru çalıştı, ama
    `panel/jsx/commands/style.jsx`'in upstream `aftr`'den gelen "her layer
    zaten 9 disabled stil grubu taşıyor, enabled=true yeterli" varsayımı bu
    kurulumda doğrulanamadı. Kök nedeni ararken comp renderer'ını
    "ADBE Advanced 3d" dışına (Calder/Ernst) döngüyle denetim amaçlı
    değiştiren bir `runJSX` çağrısı yazıldı — **bu AE'nin ana thread'ini
    ~10 dakika kilitledi** (ping/runJSX hepsi timeout; `sample` ile
    ExtendScript interpreter'ın hâlâ benim for-loop'umun içinde olduğu
    doğrulandı, gerçek bir deadlock değil ama beklenenden çok daha yavaş bir
    renderer-switch işlemiydi). Force-kill izin sistemi tarafından
    reddedildi (doğru karar) — sabırla beklendi, AE kendi kendine toparlandı,
    proje/test verisi kayıpsız kaldı. **Ders:** comp renderer'ını canlı,
    kurtarma planı olmadan değiştirmek riskli — bir daha denenirse izole bir
    test projesinde ve zaman sınırlı yapılmalı. Kök neden bulunamadı, ayrı
    bir oturuma bırakıldı (ROADMAP'e not düşüldü).
  - Dev mod (`AE_BRIDGE_ALLOW_DEV=1`) `launchctl bootout` + manuel
    `node controller/src/server.js` ile geçici açıldı (LaunchAgent plist'i
    kalıcı açmıyor, DEVLOG 2026-08-10 (18) ile aynı desen), iş bitince
    manuel process kapatılıp `launchctl bootstrap` ile normal servis geri
    yüklendi (`allowDev: false` doğrulandı).
  - Test comp'lar (`tier3_livetest`, `tier3_livetest2` + dup, `tier3_
    footagecomp`) ve yarattıkları proje item'ları (solid'ler, import edilen
    `hero.jpg` footage'ı) temizlendi, proje kaydedilmeden ("Untitled")
    bırakıldı — sadece daha önceki Tier1/2 oturumunun kalıntıları
    (`tier12_livetest_renamed` comp'u, `testSolid`/`Null 1`/`fire_*`/
    `smoke_smoke` item'ları) dokunulmadan bırakıldı, onlar bu işin kapsamı
    değil.
  - Panel dosyalarına dokunuldu ((5)'teki `AEB.findProjectItem` fix) —
    **`npm run build:jsx && npm run deploy:panel` hâlâ yapılmadı**, sonra AE
    tam kapat/aç + panel yeniden aç gerekiyor. Bu oturumdaki canlı testler
    panelin ESKİ (fix'siz) bundle'ına karşı çalıştı; `itemId`/`folderId`
    her yerde gerçek JS integer olarak gönderildiği için (typed schema
    sayesinde) sorun çıkmadı — fix şu an savunma amaçlı (defense-in-depth),
    henüz canlıda tetiklenen bir senaryosu yok.

## 2026-08-11 (5)
- **MCP tool şema tamamlama — Tier 3 başladı, ilk 18/26 komut bitti**
  (expression/effect introspeksiyon, render queue, marker, proje-item/
  klasör/footage-comp grupları). `shared/src/commands.js`'te gerçek
  `inputSchema` yazıldı (`panel/jsx/commands/{effect,expression,
  renderqueue,comp,layer,project,footage}.jsx` okunarak) ve
  `controller/src/mcpServer.js`'in `CORE` setine eklendi:
  `listEffects`, `addExpressionControl`, `removeExpression`,
  `enableExpression`, `addToRenderQueue`, `listRenderQueue`,
  `setOutputModule`, `clearRenderQueue`, `addCompMarker`, `addLayerMarker`,
  `getProjectItems`, `listTextStyles`, `compFromFootage`, `createFolder`,
  `moveToFolder`, `setProxy`, `renameItem`, `deleteItem`.
  `addCompMarker` zaten (Tier 3 öncesinden kalma, CORE'a hiç girmemiş)
  kısmi bir `schema` taşıyordu — `chapter`/`label` eksikti, tamamlandı.
  **Kozmetik olmayan gerçek bug bulundu ve düzeltildi:** `project.jsx`'in
  `_findItem` yardımcısı (`moveToFolder`/`setProxy`/`renameItem`/
  `deleteItem`) ve `layer.jsx`'teki `addFootageLayer`/`replaceSource`
  aynı deseni tekrarlıyordu — `it.id === p.itemId` çıplak katı eşitlik,
  `AEB.numericLike` toleransı yok. `findCompById`/`resolveLayer` bu
  sınıf hatayı (id, MCP client'tan numeric-looking string olarak
  geldiğinde sessizce "not found" dönmesi — 2026-08-09'da bulunup
  düzeltilmişti) zaten çözmüştü, ama proje-item aramasına hiç
  taşınmamıştı. `AEB.findProjectItem`/`findProjectItemBy` (`host.jsx`,
  `findCompById`'nin aynısı ama id/name alan adları parametrik + isteğe
  bağlı `filterFn`, `moveToFolder`'ın `FolderItem` filtresi için) eklendi,
  dört çağrı sitesi de buna geçirildi — panel dosyalarına dokunuldu,
  **`npm run build:jsx && npm run deploy:panel` gerekiyor**, sonra AE tam
  kapat/aç + panel yeniden aç. `npm test` yeşil (226/226, `build:jsx` test
  script'inin bir parçası olduğu için bu düzeltme headless simülatörden
  de geçti). **Canlı AE round-trip henüz yapılmadı** (bu 18 komut için) —
  panel bu oturumda derlenmiş/deploy edilmiş yeni bundle'ı henüz
  yüklemedi. Sırada: `getCompTime`/`duplicateComp`/`sequenceLayers`/
  `setTimeStretch`/`enableTimeRemap`/`replaceSource` (comp/layer-time) ve
  `addLayerStyle`/`removeLayersByPrefix` (8 komut kaldı), sonra tüm 26'nın
  tek turda canlı doğrulaması.

## 2026-08-11 (3)
- **MCP tool şema tamamlama — Tier 2 bitti (13 komut), 38/38 (Tier 1+2)
  tamam.** `applyWordReveal`, `applyCharScale`, `applyLowerThird`,
  `fireEffect`, `smokeEffect`, `glitchEffect`, `cinematicGrade`, `neonGlow`,
  `addShapeOperator`, `addPathShape`, `addResponsiveBox`, `addCamera`,
  `addLight` — hepsine `shared/src/commands.js`'te gerçek `inputSchema`
  yazıldı (`panel/jsx/commands/{text,fire,vfx,layer}.jsx` okunarak) ve
  `controller/src/mcpServer.js`'in `CORE` setine eklendi. Yol boyunca iki
  gerçek düzeltme (kozmetik değil): `addShapeOperator.params` ve
  `applyLowerThird.accentLine`'ın object-tipli alanları artık bir tool
  şemasında `type:'object'` deklare edildiğinde bazı MCP client'ların onu
  JSON-stringified string olarak gönderdiği bilinen sorununa karşı
  `v.optionalObject` ile tolere ediliyor (daha önce çıplak `isPlainObject`
  kontrolü vardı — top-level tool'a terfi etmeden önce zararsızdı çünkü hiç
  tetiklenmiyordu, terfi ederken addShape'in fillGradient/rampGradient'te
  zaten çözdüğü aynı riske giriyorlardı). `npm test` yeşil (226/226).
  **Canlı AE doğrulaması yine yapılamadı** (AE bu oturumda hiç açık
  değildi) — sıradaki AE oturumunda tüm 38 tool'un gerçek round-trip smoke
  testi gerekiyor, özellikle: `addTextAnimator`'ın nested `properties`/
  `selector`/`animate` objeleri (en karmaşık yeni şema, JSON-stringified-
  object riskine en açık olan — ama `AEB.resolveProperty`/JSX tarafı zaten
  obje bekliyor, `v.optionalObject`'siz bırakıldı çünkü mevcut `validate()`
  zaten sadece `requireFields` yapıyordu ve bunu genişletmek kapsam dışıydı;
  canlıda string geldiği görülürse aynı desenle düzeltilmeli) ve
  `setKeyframe`/`setEase`/vb.'nin `property` alanındaki array-path (SHAPE
  path) değerlerinin MCP üzerinden bozulmadan geçtiği.

## 2026-08-11 (2)
- **MCP tool şema tamamlama — Tier 1 bitti (25 komut).** `setKeyframe`,
  `setParent`, `moveLayer`, `duplicateLayer`, `deleteLayer`, `setEase`,
  `setInterpolation`, `removeKeyframes`, `addMask`, `addRectMask`,
  `setMaskProperty`, `setTextDocument`, `addTextAnimator`, `alignLayer`,
  `alignAnchor`, `setBlendMode`, `setTrackMatte`, `setLayerFlag`,
  `setCompSettings`, `setWorkArea`, `clearComp`, `getProperty`,
  `getCompDetails`, `resolveSafePosition`, `measureText` — hepsine
  `shared/src/commands.js`'te gerçek `inputSchema` yazıldı (handler'ları
  `panel/jsx/commands/{keyframe,layer,mask,text,advanced,comp,introspect}.jsx`
  okunarak) ve `controller/src/mcpServer.js`'in `CORE` setine eklenip
  top-level `ae_<komut>` tool'u olarak açıldı. İki ortak şema parçası
  eklendi: `PROPERTY_SCHEMA` (friendly string | array property-path —
  SHAPE-tipi yollar için) ve `VALUE_SCHEMA` (number/string/boolean/array/
  object — SHAPE keyframe değeri `{vertices[],...}` bir obje olduğu için).
  Bu arada zaten CORE'da olan `setKeyframes`'in şemasına da eksik olan
  `property: PROPERTY_SCHEMA` eklendi (aynı array-path mangling riski
  oradaydı, kapsam dahilinde küçük düzeltme). `npm test` yeşil (226/226).
  **Canlı AE doğrulaması yapılamadı** — bu oturumda After Effects açık
  değildi (`ae_status` → `connected: false`, controller ayaktaydı ama
  panel yoktu); şemalar sadece kod okunarak ve headless simülatör
  testleriyle doğrulandı, gerçek AE round-trip'i henüz yok. Sıradaki iş:
  Tier 2 (13 komut), sonra kullanıcı AE'yi açtığında canlı smoke test.

## 2026-08-11
- **MCP tool şema tamamlama planı** çıkarıldı ve ROADMAP'e yazıldı (bkz.
  "Bilinen eksikler" → "MCP tool şema tamamlama"). Tetikleyici: Premiere-pro
  MCP (280 top-level tool) ile mograph-mcp (client'a görünen ~40 tool)
  arasındaki görünürlük farkı sohbette konuşuldu — `ae_list_commands`'taki
  112 iç komuttan 82'sinin top-level tool'u/gerçek `inputSchema`'sı yok.
  Karar: sayıyı kozmetik olarak şişirmek yerine (çoğu zaten `ae_command`
  üzerinden erişilebiliyor) her komuta gerçek şema yazıp kademeli terfi
  ettirmek. 82 komut 4 kademeye ayrıldı (çekirdek edit / vitrin / ikincil /
  düşük öncelik-getter+niş), Tier 1+2 (38 komut) ilk sırada. Hepsi
  Sonnet'te kalacak — Haiku'ya düşürme, yanlış şemanın tool çağrılarını
  sessizce bozma riski nedeniyle reddedildi. Henüz uygulamaya
  başlanmadı, sadece plan.

## 2026-08-11 (4)
- **Tier 1+2 (38 komut) canlı AE'de doğrulandı.** Önceki oturumda (2) ve
  (3) AE kapalıyken yapılmıştı, sadece kod okuma + headless simülatörle
  doğrulanmıştı. Bu oturumda: controller restart edildi (`npm run
  service:restart`, kod değişikliklerinin yeni process'e yansıması için —
  eski pid hâlâ eski `CORE` set'ini serviyordu), `claude mcp list` üzerinden
  `tools/list` çekilip 78 tool (40 eski + 38 yeni) doğrulandı. ToolSearch
  bu oturumda henüz 38'ini indekslemedi (bilinen "mid-session ToolSearch
  gap" — bkz. proje dışı memory), o yüzden `mcp-direct-call` yöntemiyle
  (ham HTTP JSON-RPC, `curl`/Python) doğrudan sunucuya karşı test edildi.
  Test comp'ta (`tier12_livetest`) 38 komutun hepsi ayrı ayrı çağrıldı:
  ilk turda 37/38 geçti, `addShapeOperator` shape-olmayan bir layer'a
  (solid) karşı çağrıldığı için beklenen "target vector group not found"
  hatasını verdi — test kurulumu hatasıydı, gerçek shape layer'a karşı
  tekrarlanınca geçti (38/38). `addTextAnimator`'ın nested
  `properties`/`selector` objeleri dahil hiçbir yerde marshalling sorunu
  çıkmadı — önceki oturumun en riskli gördüğü şema sağlam çıktı.
  Test comp temizlenip (`clearComp`) proje kaydedilmeden bırakıldı.

## 2026-08-10 (28)
- **Login item isim/ikon düzeltmesi denendi, görsel sonuç alınamadı —
  kod yine de kalıcı, teknik olarak daha doğru.** `tools/service.mjs`'in
  ürettiği LaunchAgent çıplak Homebrew `node`'u çağırıyordu; System
  Settings → Login Items & Extensions'ta bu "node" + generic exec ikonu +
  "unidentified developer" olarak görünüyordu. Kök neden bulundu (canlı
  doğrulandı): görünen isim tam `CFBundleExecutable` string'iyle
  eşleşiyordu çünkü hedef bir bash script'ti, imzasızdı — Background Task
  Management (BTM) bunu "gerçek app" olarak tanımıyordu.
  - **Düzeltme:** `buildApp()` artık gerçek bir Mach-O binary (`clang -x c
    -` ile stdin'den derlenen trivial `execl()` wrapper'ı) + `Info.plist` +
    ikon içeren bir `.app` bundle üretiyor, `codesign --sign -` ile ad-hoc
    imzalıyor. `sfltool dumpbtm` bunu doğruladı: BTM kaydı artık `Name:
    Mograph Controller`, doğru executable path'e işaret ediyor — **kayıt
    tarafı tamamen doğru.**
  - **Ama görsel sonuç değişmedi.** Üç logout/login + System Settings.app'i
    tamamen sonlandırıp yeniden açmak (pencere kapat/aç değil, process
    seviyesinde) hiçbiri Login Items & Extensions'taki eski isim/ikonu
    güncellemedi. BTM verisi doğruyken UI'ın neden eskiyi gösterdiği
    çözülemedi — muhtemelen System Settings'in kendi render/icon cache'i,
    ama kanıtlanamadı.
  - **Karar: daha fazla uğraşılmayacak, kod kalıyor.** Kullanıcı ek
    denemeyi (identifier değiştirme, `SMAppService` API'sine geçiş) faydası
    belirsizken bırakmayı tercih etti. Kod tutuluyor çünkü kayıt tarafı
    gerçekten daha doğru (gerçek imzalı Mach-O bundle, çıplak script değil)
    — geri almanın kazandıracağı tek şey basitlik, ama mevcut hâli de
    çalışıyor (controller servisi doğrulandı, `launchctl print` running).
  - **Kabul edilen sınır:** Login Items & Extensions'ta "unidentified
    developer" + (görünüşe göre) eski isim/ikon kalıcı olarak duruyor.
    Apple Developer ID ($99/yıl) bilinçli olarak alınmıyor (tek kullanıcılı
    private araç). Bu satır artık aranmayacak bir konu.

## 2026-08-10 (27)
- **Faz 3'ün açık sorusu kapandı: şablon doldurma soyutlanmayacak (B).**
  (14)'te yapılan ilk canlı şablon testinden beri askıda duran soru —
  "bu iş akışı `applyLowerThird` gibi tek bir komut/spec'e mi
  soyutlanmalı, yoksa mevcut komutları elle bir araya getirmek mi
  yeterli" — kullanıcı kararıyla **elle** olarak kapatıldı. Yani
  `fillTemplate` tarzı bir komut **yazılmayacak**; şablon işleri
  `openProject` + `setTextDocument` + `importFootage`/`addFootageLayer` +
  `setLayerProperty`/`moveLayer` zinciriyle, şablon başına elle
  kurulmaya devam edecek.
  - **Gerekçe:** elde hâlâ tek gerçek şablon var (`aep/
    Ae_Template_Test.aep`); şablon başına iç düzen (katman isimleri,
    placeholder sayısı, hangi comp, fit mantığı) çok değişken. Tek
    örnekten çıkarılacak soyutlama yanlış soyutlama olma riski taşıyor,
    ve elle yol zaten uçtan uca çalıştığı kanıtlanmış durumda —
    soyutlamanın kazandıracağı tek şey satır sayısı.
  - **Elenen alternatif (A):** `fillTemplate` tek komutu. Elenme sebebi
    yukarıdaki; ayrıca üçüncü bir yol (şablonları zorunlu bir katman
    isimlendirme konvansiyonuyla kurup komutu ona göre yazmak) da
    şimdilik gerekmiyor — konvansiyon dayatması, kazancı belirsizken
    ödenecek bir bedel.
  - **Kapanma biçimi:** "ertelendi" değil, **karar verildi**. İleride
    gerçekten tekrar eden bir şablon işi belirirse (aynı şablonu
    defalarca doldurmak, toplu varyant üretimi) konu yeniden açılabilir;
    o zamana kadar tekrar gündeme getirilmeyecek.
- **Sıradaki yön:** yapı taşlarındaki eksikleri, kullandıkça görüldükçe
  tamamlamaya devam. Planlı büyük bir faz yok.

## 2026-08-10 (26)
- **`addShape`'e `groupTransform` eklendi — shape tarafındaki bilinen
  eksikler listesinin son maddesi bitti.** Grubun (`Group 1`, `ADBE
  Vector Group`) kendi transform'u — `ADBE Vector Transform Group`,
  `Contents`'in kardeşi — layer'ın ana Transform'undan bağımsız: içeriği
  layer'ın kendi anchor/position'ından ayrı bir pivot etrafında kaydır/
  ölçekle/döndür (ör. bir şekli layer anchor'ından değil kendi köşesinden
  büyütmek).
  - Alanlar: `anchorPoint`, `position`, `scale` ([x,y], yüzde, AE
    varsayılanı [100,100]), `skew`, `skewAxis`, `rotation`, `opacity`
    (0..100). matchName'ler (22)'nin gradient sondajında zaten görülmüştü.
  - Canlı doğrulama: yedi alanın hepsi tek `addShape` çağrısında, hiçbir
    hata olmadan, verilen değerlerle tam eşleşti — Wave'in `cycles`'ından
    farklı olarak burada **hiçbir alan gated değil**. Ayrıca dashes/wave/
    ellipse ile birlikte tek çağrıda da sorunsuz çalıştığı doğrulandı.
  - Şema (`shared/src/commands.js`) + `v.optionalObject` (JSON-string
    tolerans, (23)'teki nested-object marshalling bug'ına karşı) +
    simulator (`VECTOR_AUTO_CHILDREN['ADBE Vector Transform Group']`,
    gated değil, sade property listesi) + 3 yeni test (2 controller
    validate, 1 simulator/JSX). `npm test` 226/226, lint temiz.
  - **Not:** bu oturumun MCP tool cache'i eski şemada kaldığı için typed
    `ae_addShape` tool'u yerine `ae_command` (tipsiz) ile doğrulandı —
    yeni oturumda `/mcp` yenilenince typed tool da güncel şemayı görür.

## 2026-08-10 (25)
- **(24)'ün canlı doğrulaması tamamlandı: `wave.cycles` scriptlenemiyor,
  şemadan çıkarıldı.** (24) sonunda commit atılmadan oturum kesilmişti;
  bu oturumda canlı doğrulamaya devam edildi.
  - Wave alt-property'leri tek tek izole edilerek test edildi (her biri
    tek başına, ayrı layer): `amount`, `wavelength`, `phase` sorunsuz;
    `cycles` tek başına bile "Can not set value... property or a parent
    property is hidden" veriyor.
  - Dashes'teki gibi `addProperty(matchName)` ile "unhide" denendi — farklı
    bir hatayla patladı: *"Can not add a property... because this
    propertyGroup is neither an INDEXED_GROUP nor a text animator property
    group."* Yani Dashes'in gizli-slot deseni Wave'e uygulanamıyor: Dashes
    grubu gerçek bir `INDEXED_GROUP` (tekrarlı dash/gap çiftlerine izin
    veriyor), Wave ise sabit 5 alanlı bir `NAMED_GROUP` — `addProperty`
    kavramsal olarak yanlış çağrı.
  - `AE_BRIDGE_ALLOW_DEV=1` ile geçici olarak (LaunchAgent durdurulup elle
    dev-mode controller çalıştırıldı, teşhis bitince normale döndürüldü)
    `runJSX` üzerinden derin sondaj: `propertyValueType` normal (`OneD`,
    6417) — bozuk/`NO_VALUE` bir tip değil, sıradan sayısal bir property.
    Ama `canSetExpression:false`, ve dört farklı mutasyon yolu da
    (`setValue`, `setValueAtTime`, `.expression=`, index'le `property()`
    erişimi) aynı "hidden" hatasını veriyor. **Sonuç: `cycles` bu AE
    build'inde (26.3x87) hiçbir scripting yoluyla ayarlanamıyor** —
    gradient stop renkleriyle (`ADBE Vector Grad Colors`, (22)) aynı
    kategoride bir AE kısıtı, kod tarafında düzeltilecek bir "doğru
    yöntem" yok.
  - **Karar: `cycles` wave şemasından çıkarıldı**, gradient stop renkleri
    emsaliyle tutarlı — kırık bir özelliği expose etmek yerine hiç
    sunulmuyor. `shared/src/commands.js` (tool şeması + validate() içinde
    net `ValidationError`), `panel/jsx/commands/layer.jsx` (JSX katmanında
    da savunma amaçlı `AEB.assert`, runJSX gibi validate'i atlayan
    çağrılara karşı) güncellendi. Simulator tarafı (`MockWaveGroup` adında
    geçici bir sınıf denenmişti, gerekli olmadığı anlaşılınca geri alındı)
    sade `MockVectorGroup` olarak kaldı — `cycles` zaten JSX'e hiç
    ulaşmıyor.
  - 2 yeni test (validate.js reddi + JSX savunma katmanı reddi).
    `npm test` 223/223, lint temiz.
  - Canlıda son doğrulama: `miterLimit`+`taper`+`wave` (cycles hariç, tam
    kombinasyon) tek `addShape` çağrısında sorunsuz; `wave: {cycles:3}`
    artık AE'nin kriptik hatası yerine bizim net `ValidationError`'ımızla
    reddediliyor.
  - Sıradaki adım (ROADMAP): shape group transform (grup içi anchor/scale/
    rotate).

## 2026-08-10 (24)
- **`addShape`'e stroke stili eklendi: lineCap/lineJoin/miterLimit/dashes/
  dashOffset/taper/wave.** Bilinen eksikler listesinin 2. ve 3. maddesi
  (dash/cap/join ile taper/wave) tek turda birleştirildi — ikisi de aynı
  Stroke/G-Stroke property bölgesinde, canlı sondaj sırasında ikisinin de
  aynı anda netleştiği ortaya çıktı.
  - **Kritik davranış bulgusu (canlı, AE 26.3x87): Dashes grubu "gizli
    slot" deseni kullanıyor.** `ADBE Vector Stroke Dashes` altındaki
    Dash1-3/Gap1-3/Offset'in hepsi baştan var ama tek tek gizli —
    `setValue` doğrudan çağrılırsa "Can not set value... property or a
    parent property is hidden" veriyor. Çözüm: `addProperty(matchName)`
    o slotu "açıyor" (numProperties hiç değişmiyor, gerçek bir indexed-
    group ekleme değil, aynı slotu döndürüyor) — bundan sonra `setValue`
    çalışıyor. Sıra bağımlılığı yok (Dash 2, Dash 1 hiç açılmadan
    çalıştı), ama Offset kendi `addProperty` çağrısını istiyor.
  - **Miter Limit** de aynı şekilde gizli — sadece Line Join "miter"
    (AE varsayılanı) iken açık. `lineJoin` başka bir şeye ayarlanmışken
    `miterLimit` verilirse artık AE'nin kriptik hatası yerine net bir
    ValidationError ile önden reddediliyor.
  - **Taper**'ın `Start/End Length` (yüzde) ile `StartWidthPx/EndWidthPx`
    (piksel) çifti `Length Units` toggle'ıyla aynı gizli-slot mantığıyla
    birbirini kilitliyor — sadece aktif birim ayarı settable. `Start/End
    Width` (taper genişlik oranı) ve `Start/End Ease` hiç kilitli değil.
  - **Wave**'in `amount`/`wavelength`/`units`/`phase` alt property'leri
    kilitli değil, direkt settable. `cycles` ise canlı doğrulamada ayrı bir
    bug olarak çıktı — düzeltmesi (25)'te.
  - Şema: `dashes` bir dizi `{dash?, gap?}` (en fazla 3 çift, AE UI
    sınırı), `taper`/`wave` nested obje. (23)'teki nested-object/array
    marshalling bug'ı burada da geçerli — `v.optionalArray` (validate.js,
    `v.optionalObject`'in dizi karşılığı) `dashes` için eklendi.
  - Simulator: `MockDashesGroup` (yeni sınıf, `MockVectorGroup`'tan türer)
    gizli-slot davranışını taklit ediyor — `addProperty()` zaten var olan
    slotu döndürüyor, yeni öğe eklemiyor (diğer matchName'ler için normal
    "her zaman yeni ekle" davranışı korunuyor, sadece Dashes'e özel).
    Taper/Wave basit `VECTOR_AUTO_CHILDREN` girdisi yeterli oldu (gizli
    değiller); Taper'ın yüzde/piksel kilit mekanizması bilinçli olarak
    mock'lanmadı (ikisi de mock'ta her zaman settable — komut katmanının
    doğru property path'e yazdığını test etmek yeterli, AE'nin runtime
    kısıtını simüle etmek gerekli değil).
  - 15 yeni test (9 controller validate, 6 simulator/JSX — biri G-Stroke
    üzerinde de aynı stilin çalıştığını doğruluyor). `npm test` 221/221,
    lint temiz.
  - **Deploy edildi, canlı doğrulama AE relaunch bekliyor** (README §7 —
    CEP imzayı sadece açılışta okuyor).

## 2026-08-10 (23)
- **Yeni kritik bug bulundu ve düzeltildi: CORE MCP tool'larında nested
  object parametreler de array'ler gibi bozuluyor.** (22)'nin canlı
  doğrulaması sırasında AE relaunch sonrası doğrudan `ae_addShape` tool'u
  (workaround olan `ae_command` değil) `fillGradient`/`strokeGradient`/
  `rampGradient`'i denedi: `"fillGradient must be an object"` — nesne, JSON
  string olarak ulaşıyordu, şema `type:'object'` dese bile. (17)'de array
  parametreler için bulunan/düzeltilen kök neden ("client, tipsiz şemada
  array'i bozuyor") bu sefer geçerli değildi — şema tipi doğru deklare
  edilmişti, yine de bozuluyordu; yani (17)'nin düzeltmesi (üst seviye
  `type:'array'` deklare etmek) nested `type:'object'` alanlara genellemiyor.
  `ae_command` (tipsiz, genel `params: object`) üzerinden aynı çağrı sorunsuz
  çalıştı — bu ayrım tanıyı doğruladı.
  - **Kalıcı düzeltme:** `validate.js`'e `v.optionalObject()` eklendi —
    `numericLike`'ın (aynı dosya, sayısal-string toleransı) nesne
    karşılığı: gelen değer zaten obje ise aynen kabul, string ise
    `JSON.parse` deneyip obje çıkarsa onu kullan, olmazsa net hata.
    `addShape`'in gradient validate() bloğu `isPlainObject` yerine bunu
    kullanacak şekilde güncellendi, coerced obje `base[field]`'e geri
    yazılıyor (JSX tarafı düz string değil gerçek obje görsün diye).
  - Controller restart sonrası **doğrudan `ae_addShape` tool'uyla** (üç
    gradient alanı da) canlıda tekrar test edildi, `getLayerDetails deep`
    ile property ağacı satır satır doğrulandı: G-Fill (radial, start/end
    point, scale, rotation, opacity), G-Stroke (linear varsayılan, start/end
    point, strokeWidth reuse — Dashes/Taper/Wave alt-gruplarının tam yapısı
    da bu doğrulamada görüldü, gelecekteki dash/taper/wave işine referans),
    `ADBE Ramp` (start/end color RGBA + alpha, start/end of ramp, ramp
    shape) — hepsi beklenen değerlerle uyuştu.
  - 3 yeni test (JSON-string tolere ediliyor, geçersiz JSON'da net hata).
    `npm test` 208/208, lint temiz.
  - **Ders:** (17)'nin "array parametre" bulgusu kapsamını dar
    yorumlamıştım (sadece top-level array) — aynı transport quirk'i nested
    object'lere de bulaşıyormuş. Bir sonraki yeni nested-obje param
    eklenen CORE komutunda bunu varsayılan olarak akılda tutmak lazım;
    `v.optionalObject` şimdi hazır, tekrar keşfetmeye gerek yok.

## 2026-08-10 (22)
- **`addShape` gradient fill/stroke desteği eklendi — bilinen eksikler
  listesinin ilk maddesi.** Önce canlı doğrulama (AE 26.3x87,
  `AE_BRIDGE_ALLOW_DEV=1` + `runJSX`, geçici probe comp'ları, sonra
  silindi):
  - **Kritik bulgu: native gradient fill/stroke'un stop renkleri
    scriptlenemiyor.** `ADBE Vector Graphic - G-Fill`/`G-Stroke`'un geometri
    property'leri (Grad Type/Start Pt/End Pt/Scale/Rotation/HiLite
    Length/Angle, Fill/Stroke Opacity) hepsi normal `setValue` ile
    çalışıyor — ama renkleri tutan `ADBE Vector Grad Colors` alt-property'si
    `PropertyValueType.NO_VALUE`, AE "Can not get or set a value from this
    property" diyor. Bu bir bridge bug'ı değil, AE'nin kendi scripting API
    sınırı — tahmin değil, canlı doğrulandı. G-Stroke'ta ayrıca (bu işin
    kapsamı dışında, ROADMAP'in kalan üç maddesine denk düşüyor)
    `ADBE Vector Stroke Dashes`/`Taper`/`Wave` property'leri var, dokunulmadı.
  - **Karar (kullanıcıyla): ikisini de ekle.** `fillGradient`/
    `strokeGradient` (native, geometri-only, stop renkleri AE varsayılanında
    kalır) + `rampGradient` (Gradient Ramp efekti, `ADBE Ramp` — Start/End
    Color dahil tamamen scriptlenebilir, canlı `introspectEffect` ile teyit
    edildi). `rampGradient` layer'ın alfasını renklendiriyor; fill/stroke
    hiç verilmemişse otomatik beyaz bir fill ekleniyor (salt alfa kaynağı
    olarak, Ramp RGB'yi tamamen eziyor).
  - `AEB.color4` (host.jsx) eklendi — daha önce `plugins.jsx`'te yerel
    `_color4` olarak Deep Glow/Shadow Studio için vardı (RGBA efekt
    renkleri), Ramp'in Start/End Color'ı için de gerekince paylaşılan
    helper'a taşındı, `plugins.jsx` da ona yönlendirildi (tekrar kaldırıldı).
  - `shared/src/commands.js`: `addShape` şemasına `fillGradient`/
    `strokeGradient`/`rampGradient` (hepsi nested `type:'object'`, iç
    array alanları da tek tek tipli — CORE'daki `ae_addShape` tool'u
    için array-parametre bug'ının nested obje içinde de tekrarlamaması
    adına, bkz. dosya başlığındaki 2026-08-09 notu) + validate(): gradient
    alanı ile aynı yöndeki solid renk alanı (`fillColor`/`fillGradient` vb.)
    birbirini dışlıyor, `rampGradient` `startColor`/`endColor` zorunlu,
    `type` linear|radial.
  - `addPathShape`/`addResponsiveBox`'a bilinçli olarak dokunulmadı — kapsam
    `addShape`'le sınırlı tutuldu (asıl kullanılan shape-oluşturma komutu),
    diğer ikisi hâlâ solid-only.
  - Simulator: `VECTOR_AUTO_CHILDREN`'a G-Fill/G-Stroke geometri
    property'leri eklendi (Grad Colors bilinçli olarak MOCK'LANMADI —
    canlıda çalışmayan bir şeyi teste "çalışıyor" gibi geçirmemek için),
    `_MOCK_EFFECTS`'e `'Gradient Ramp': 'ADBE Ramp'`. 11 yeni test (7
    controller-side validate, 4 simulator-side JSX). `npm test` 205/205.
  - Test yazarken bir harness tuhaflığı bulundu: simulator `vm.createContext`
    ile ayrı bir realm'de çalıştığı için o realm'in `Array`'i Node'un
    `Array`'inden farklı — `assert.deepEqual(prop.value, [...])` "same
    structure but not reference-equal" ile patlıyor (koddaki bug değil,
    testin kendisi; `Array.from(prop.value)` ile realm normalize edilerek
    çözüldü). Bu dosyada array-değerli bir `.value`'yu ilk kez doğrudan
    `deepEqual`'e sokan testler olduğu için daha önce hiç görünmemişti.
  - **Canlı doğrulama, kullanıcı AE'yi kapatıp açtıktan sonra tamamlandı**
    (bkz. (23) — süreçte bir kritik nested-object marshalling bug'ı daha
    bulundu ve düzeltildi).

## 2026-08-10 (21)
- **README taraması: fork sonrası eklenen komutlar dokümantasyona hiç
  yansımamıştı, düzeltildi.** `shared/src/commands.js`'i `commandList()`
  ile sayıp (113 komut, 194 test — README hâlâ aftr'dan kalma "~90
  commands"/"96 tests" diyordu) bölüm 7'nin (Command vocabulary) kategori
  listeleriyle karşılaştırdım: `addShapeOperator`, `addResponsiveBox`,
  `applyTextStyle`, `applyWordReveal`, `applyCharScale`, `listTextStyles`,
  `applyLowerThird`, `measureText`, `resolveSafePosition`, `alignAnchor`,
  `getCompDetails`, `getLayerDetails`, `getProperty`, `openProject`,
  `closeProject`, `quitApp` — Faz 1/1.B/2'de eklenen hiçbiri README'de
  geçmiyordu. Hepsini ilgili kategorilere ekledim, "What you can do with
  it" bölümüne shape operator ve typography-helper paragrafları, Features
  tablosuna bir "Shape operators" satırı ve Text animation satırına
  `applyTextStyle`/layout helper'ları ekledim. Ayrı bir "aftr'dan bu yana
  neler değişti" bölümü açmadım — bu DEVLOG zaten o işi görüyor, ikinci
  bir changelog'u senkron tutmak drift riski yaratır. Attribution notuna
  (satır 19) dokunmadım, o zaten karara bağlıydı.

## 2026-08-10 (20)
- **CI, (18)'den beri hiç çalışmamış — fork'ta GitHub Actions'ın
  varsayılan-kapalı olduğu ortaya çıktı, elle onaylanıp doğrulandı.**
  `ci.yml` 2026-08-08'de eklenmişti ama `gh api .../actions/runs` o günden
  bu yana (bu oturumdaki commit dahil) `total_count: 0` veriyordu —
  workflow "active" görünüyordu, `actions/permissions` "enabled: true"
  diyordu, ama tek bir run bile tetiklenmemişti. Sebep: GitHub, bir fork'ta
  Actions'ı güvenlik gereği varsayılan kapalı tutuyor (upstream'e açılan
  kötü niyetli bir PR'ın fork'un Actions dakikalarını/secrets'larını
  tetiklememesi için) — fork sahibinin repo → Actions sekmesinde bunu bir
  kez elle onaylaması gerekiyor, bu adım `actions/permissions` API'sine
  yansımıyor. Kullanıcı onayladı, boş bir commit (`42b319e`) ile
  doğrulandı: ilk run tetiklendi, Node 18/20/22 + lint + e2e hepsi yeşil.
  - Aynı run'da `actions/checkout@v4`/`actions/setup-node@v4`'ün node20
    runtime'ının zorla node24'e taşındığına dair bir deprecation uyarısı
    görüldü (test matrix'imizi etkilemiyor, sadece action'ın kendi çalışma
    zamanı) — kalıcı çözüm olarak ikisi de v7'ye (`cf7bab4`, node24
    native) çekildi, uyarı bir sonraki run'da tamamen gitti.
  - **Ders:** Bu repo bir fork olduğu için CI'ın "kurulu = çalışıyor"
    varsayımı yanlıştı; yeni bir fork/repo'da CI eklerken ilk push'tan
    sonra `gh run list` ile gerçekten tetiklendiğini doğrulamak gerekiyor,
    workflow dosyasının repoda durması yeterli değil.

## 2026-08-10 (19)
- **`tools/jsx-es3-check.mjs` eklendi — `panel/jsx/**` (ExtendScript/ES3) için
  ilk statik denetim, `npm run lint` (dolayısıyla CI) zincirine bağlandı.**
  (18)'de ESLint kurulurken `panel/jsx/**` bilinçli dışlanmıştı çünkü modern
  JS kuralları ES3 için anlamsız — ama bu, o klasörün hiçbir statik denetimden
  geçmediği anlamına geliyordu. Asıl motivasyon [[es3-chained-ternary-trap]]:
  gerçek bir bug canlı AE'de bulunmuştu, simulator (Node/V8) onu hiç
  yakalamamıştı. Script comment/string-farkında bir tarayıcıdan geçirip
  host.jsx'in kendi dialekt sözleşmesini (`let/const/arrow/template-literal
  yok`) + chained-ternary tuzağını + birkaç ucuz ES6 kalıntısını
  (`class`, spread/rest `...`, `for...of`) denetliyor; parantezli ternary
  zincirleri ve yorum/string içindeki eşleşen kelimeler bilerek yakalanmıyor
  (false-positive kaynağı olurlardı). Gerçek AE motorunun tam ES3 gramerini
  modellemiyor — bilinen, tam da bu projeyi bir kez ısıran hata sınıflarına
  karşı ucuz bir ağ. `panel/jsx/**` şu an 24 dosyada temiz.

## 2026-08-10 (18)
- **ESLint eklendi (flat config, `eslint.config.js`) + CI'a `npm run lint`
  adımı.** Kullanıcı kod kalitesi/modülerlik denetiminin nasıl yapıldığını
  sordu — testler vardı (`npm test`, CI'da), ama stil/hata-sınıfı denetimi
  hiç yoktu. Yeni bir "uzman ajan" icat etmek yerine mevcut `/code-review`
  skill'i + `test-runner` agent'ı zaten yeterli; eksik olan sürekli/otomatik
  bir katmandı, onu ESLint + CI ile kapattık.
  - Kapsam üç ayrı ortam grubuna bölündü çünkü kod tabanı gerçekten üç farklı
    JS ortamı barındırıyor: Node ESM (`controller/src`, `shared`,
    `simulator`, `bin`, `tools`, `panel/build`), düz tarayıcı
    (`controller/ui` — controller'ın kendi WS/HTTP debug sayfası, CEP değil),
    ve CEP paneli (`panel/src` — AE'nin gömülü, yaşı belirsiz Chromium'unda
    çalışıyor; `require`/`process`/`bridge` gibi cross-file globaller orada
    gerçek, hata değil). `panel/jsx/**` (ExtendScript/ES3) kasıtlı olarak
    dışlandı — modern JS kuralları ES3 için anlamsız
    ([[es3-chained-ternary-trap]] zaten bu ayrımı doğruluyor).
  - Audit'te bulunan gerçek sorunlar düzeltildi (config değil, kod): iki
    yerde yakalanan hata `cause` zinciri olmadan yeniden fırlatılıyordu
    (`shared/src/config.js`, `simulator/src/jsxRunner.js`); iki yerde
    `hasOwnProperty` doğrudan nesne üzerinden çağrılıyordu
    (`controller/ui/ui.js`); `panel/src/bridge.js`'te hiç çağrılmayan ölü bir
    `nodeRequire` fonksiyonu ve kullanılmayan bir ilk atama; ölü bir `pass()`
    helper'ı (`shared/src/commands.js`) ve ölü bir `step` değişkeni
    (`tools/cdp_reload.mjs`); iki gereksiz regex escape'i; iki boş `catch`
    bloğu (yorumla niyet belirtildi). Node/düz-tarayıcı tarafındaki anlamsız
    `catch (e)`'ler `catch {}`'e çevrildi (optional catch binding, Node
    18+/modern tarayıcı güvenli); CEP tarafında motor belirsizliği yüzünden
    bu yapılmadı, onun yerine `_e` + `caughtErrorsIgnorePattern` kullanıldı.
  - 194/194 test hâlâ geçiyor; davranış değişikliği yok, sadece ölü kod
    temizliği + hata zinciri iyileştirmesi.

## 2026-08-09 (17)
- **Array-parametre MCP bug'ının kök nedeni bulundu ve düzeltildi — (6)'daki
  "repo dışı, düzeltilemez" sonucu YANLIŞ çıktı.** Kullanıcı "efekt/grade
  kombinasyonları" işine geçmek isteyince, önce (kullanıcı isteğiyle) "yapı
  taşları" audit'i yapıldı; `ae_addSolid({color:[...]})` ve
  `ae_setLayerProperty({property:"scale", value:[...]})` tekrar bozuk
  çıktı. (6)'da bu "harness'in şemasız tool çağrısında array marshalling
  sorunu, mograph-mcp reposu dışında, düzeltilemez" diye kapatılmıştı — ama
  o sonuç hiç test edilmeden varsayılmıştı (`mcpServer.js`'teki her
  `ae_<komut>` tool'u upstream'den beri `{type:'object',
  additionalProperties:true}` ile tanımlı, hiçbir property tipi hiç
  denenmemiş). Deney: `ae_addSolid`'e sadece `color` alanı için gerçek
  `{type:'array', items:{type:'number'}}` içeren bir `inputSchema` verilip
  controller restart + **bu oturumun MCP bağlantısı `/mcp` ile tazelenip**
  (kritik adım — controller'ı restart etmek yetmiyor, Claude Code'un tool
  şemasını önbellekten attırmak da gerekiyor, ilk denemede bu atlanınca
  yanlış-negatif sonuç alındı) tekrar çağrıldı: **array artık doğru
  geliyor.** Hipotez doğrulandı.
  - Kalıcı çözüm: `shared/src/commands.js`'e komut başına opsiyonel
    `schema` alanı eklendi (JSON Schema `properties` map), `withDesc`
    üçüncü parametre olarak kabul ediyor. `mcpServer.js`'teki `buildTools`
    artık `def.schema` varsa onu kullanıyor, yoksa eski permissive
    fallback'e düşüyor. CORE setindeki (`controller/src/mcpServer.js`)
    ~30 komutun tamamına (array/object alanı olanlara özellikle: color,
    position, size, times/values, settings, params, vignette dahil) tipli
    schema yazıldı. Genuinely polymorphic alanlar (`setLayerProperty`/
    `setEffectParam`'ın `value`'su — sayı/string/bool/array olabilir)
    `anyOf` ile array dalı korunarak tiplendirildi.
  - **Canlıda (AE 26.3x87) doğrulandı:** `addSolid` (color), `addTextLayer`
    (position), `addShape` (size), `setLayerProperty` (scale — union-type
    `value` alanı dahil, `getLayerDetails` ile piksel piksel teyit),
    `setKeyframes` (times + values dizi-içinde-dizi) — hepsi artık tekil
    `ae_*` tool'ları üzerinden array parametreyle sorunsuz. `npm test`
    194/194.
  - **Etki:** Bu, "array parametre geçen her çağrıda `ae_command`
    kullan" workaround'ını (bkz. (3), (6)) gereksiz kılıyor — CORE'daki
    tekil tool'lar artık güvenilir. `ae_command` yine de geçerli bir yol,
    ama artık zorunlu değil.
  - Ders: "düzeltilemez" sonucuna, gerçekten denemeden varmamak gerekiyor
    — (6)'nın hatası tam olarak buydu.
- **Efekt/grade "yapı taşları" audit'i — hepsi ilk kez canlı doğrulandı.**
  `applyLumetri`, `cinematicGrade`, `smokeEffect`, `glitchEffect`,
  `neonGlow` bugüne kadar DEVLOG'da hiç geçmemişti (aftr'den miras, hiç
  test edilmemiş). Atılabilir bir comp'ta (`mograph-mcp_grade-probe`,
  silinmedi/kaydedilmedi — Untitled projede) hepsi çalıştırıldı,
  `getLayerDetails` ile sonuç teyit edildi: Lumetri Color effect + doğru
  parametre değerleri, Fractal Noise+Tint (smoke), Turbulent Displace
  (glitch, wiggle expression'ları dahil), 2x Glow (neon, motionBlur:true).
  Hiçbiri bug çıkarmadı (aşağıdaki vignette notu hariç — o da bug değil,
  dokümantasyon eksiği).
  - **`applyLumetri`'nin `vignette` parametresi native'de -5..5 aralığında**
    (percent gibi görünen isme rağmen), -100..100 değil — aralık dışı
    değer sessizce yok sayılmıyor, komutun `skipped[]` listesine AE
    hatasıyla düşüyor (davranış doğru, sadece dokümante değildi).
    `lumetri.jsx` ve `commands.js`'teki `applyLumetri` açıklamasına not
    eklendi.
  - **`deepGlow`/`shadowStudio` kod yolu sağlıklı ama bu makinede canlı
    test edilemiyor** — Plugin Everything'in Deep Glow 2 (PEDG2) / Shadow
    Studio 3 (PESS3) eklentileri kurulu değil (zaten (16)'da
    `listInstalledEffects`'in 446 kaydında yoklukları teyit edilmişti).
    `deepGlow` çağrıldığında artık (array param düzeltmesi sayesinde)
    beklenen `"Deep Glow 2 is not installed"` hatasını veriyor — önceki
    "must be an array" hatası maskeliyordu. Kod tarafına dokunulmadı
    (başka makinede kurulu olabilir); ortam kısıtı olarak kayda geçirildi.
- **Öncelik kararı (kullanıcıyla):** Faz 3 (logo/bumper şablon soyutlama
  kararı) ertelendi — "önce yapı taşlarını sağlıklı hale getirelim"
  gerekçesiyle. İlk canlı test aşaması ((14)'te) tamamlanmış kabul
  ediliyor, ama "tek komut mu / elle mi" sorusu 2./3. gerçek şablonla
  tekrar ele alınacak. Bu girişteki iş bu kararın bir sonucu.

## 2026-08-09 (16)
- **`listInstalledEffects`/`findEffectMatchName` → `app.effects`, bitti.**
  Faz 0'da tespit edilip ertelenmiş bulguyu uygulama sırası geldi
  (kullanıcı sordu). Eski yol: `_COMMON_EFFECTS` (157 isimlik elde yazılmış
  sabit liste) her çağrıda geçici bir comp+solid üzerinde tek tek
  `canAddProperty`/`addProperty` ile "prob"lanıyordu (149 bulgu). Yeni yol:
  `app.effects` (= `app.internalEffects`) gerçek bir enumerasyon API'si —
  canlıda 446 kayıt, her biri `{displayName, matchName, category, version,
  isDeprecated}` ile geldiği doğrulandı. Sabit liste ve probe mantığı
  tamamen kaldırıldı; `listInstalledEffects` artık `{ names? }` ile
  filtreleme yapıyor (isteğe bağlı), `findEffectMatchName` doğrudan
  `app.effects` içinde arıyor — ikisi de artık geçici comp açıp kapamıyor.
  `cached`/`bestEffort`/`probed` alanları kaldırıldı (sadece probing'in
  kalıntısıydı, artık anlamsız); `totalInstalled` eklendi.
  Simülatöre `app.effects` mock'ı eklendi (`_MOCK_EFFECTS` map'inden
  türetiliyor, `addEffect`'in kullandığı map'le aynı kaynak — iki komut da
  artık simülatörde gerçek kod yolunu koşuyor). `npm test` 194/194.
  **Canlıda çapraz doğrulama:** `app.effects` 446/446 döndü; "Deep Glow 2"
  ne yeni enumerasyonda ne bağımsız `introspectEffect` probe'unda çıktı —
  yani bu makinede o plugin gerçekten kurulu değil, migration bir şey
  kaybetmedi (iki bağımsız yöntem birbirini doğruladı).

## 2026-08-09 (15)
- **"Yeni komut ekleme" süreci README'ye yazıldı** (§11, "Adding a new
  bridge command (checklist)"). Gerekçe (kullanıcı sordu): (14)'teki
  File-menu komutları + 3 bug fix hep aynı 9 adımlık şablonu izledi
  (sibling komuta bak → JSX yaz → `shared/src/commands.js`'e kaydet →
  gerekirse CORE'a ekle → test → deploy → **AE'yi tam kapat-aç** → canlı
  doğrula → DEVLOG'a yaz) — bunu tekrar keşfetmemek için tek yerde,
  repoda (Claude memory'de değil — memory kural olarak reponun zaten
  kaydettiğini tekrar etmiyor) kayıt altına alındı. Dürüst not: 5-6.
  adımlar (`npm test`, `deploy:panel`) zaten tek komut, otomasyon orada
  zaten var; 1-2. adım (doğru JSX yazmak) ve 8. adım (canlı doğrulama)
  mekanikleştirilemez; 7. adım (AE restart) CEP'in imza kontrolünün sert
  bir kısıtı — otomatik AE quit denemeleri bu projede güvenilmez çıktı
  (bkz. mevcut OS-otomasyon notları), bilinçli olarak elle bırakıldı.
  Ayrıca (14)'te bulunan 3 bug'ın "gotcha" özeti de eklendi (TextDocument
  canlı nesne tuzağı, layer-isim validator tutarsızlığı, macOS aerender
  yol regex'i, CEP spawn'ın sessiz -2 kapanışı) — sıfırdan tekrar
  keşfedilmesin diye.

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

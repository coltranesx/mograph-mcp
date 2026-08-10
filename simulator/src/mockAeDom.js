// mockAeDom.js — a mock After Effects scripting DOM for headless testing.
//
// This provides a minimal but functionally correct simulation of the AE
// scripting objects that the JSX command layer uses: app, project, CompItem,
// layers (AVLayer, TextLayer), transform properties, and the render queue.
//
// The simulator's jsxRunner loads the real bundled JSX and executes dispatch()
// against this mock DOM, so the same code paths that run in AE run here.

// ---------------------------------------------------------------------------
// Property value holder — simulates AE property objects (Position, Opacity, etc.)
// ---------------------------------------------------------------------------
class MockProperty {
  constructor(name, initialValue) {
    this.name = name;
    this._value = initialValue;
  }
  get value() { return this._value; }
  setValue(v) { this._value = v; }
  setValueAtTime(_t, v) {
    this._value = v;
    this._keys = (this._keys || 0) + 1;
    this._keyValues = this._keyValues || [];
    this._keyValues[this._keys - 1] = v;
  }
  setValuesAtTimes(_times, values) {
    this._keyValues = values.slice();
    this._keys = values.length;
    this._value = values[values.length - 1];
  }
  keyValue(index) { return (this._keyValues && this._keyValues[index - 1]) || null; }
  get numKeys() { return this._keys || 0; }
  set expression(e) { this._expr = e; }
  get expression() { return this._expr || ''; }
  get expressionEnabled() { return !!this._expr; }
}

// ---------------------------------------------------------------------------
// Mock Shape / SHAPE-typed property — enough of AE's vector path API to
// exercise addShape/addPathShape and SHAPE keyframing headlessly.
// ---------------------------------------------------------------------------

// Mirrors a real AE Shape: a plain data holder set via property assignment
// (`s.vertices = [...]`), not constructor args.
class Shape {
  constructor() {
    this.vertices = [];
    this.inTangents = [];
    this.outTangents = [];
    this.closed = false;
  }
}
globalThis.Shape = Shape;

// Real AE's PropertyValueType enum (values are internal; only identity
// matters here, nothing in this codebase compares against the raw numbers).
const PropertyValueType = {
  NO_VALUE: 'NO_VALUE',
  OneD: 'OneD',
  TwoD: 'TwoD',
  TwoD_SPATIAL: 'TwoD_SPATIAL',
  ThreeD: 'ThreeD',
  ThreeD_SPATIAL: 'ThreeD_SPATIAL',
  COLOR: 'COLOR',
  CUSTOM_VALUE: 'CUSTOM_VALUE',
  MARKER: 'MARKER',
  LAYER_INDEX: 'LAYER_INDEX',
  MASK_INDEX: 'MASK_INDEX',
  SHAPE: 'SHAPE',
  TEXT_DOCUMENT: 'TEXT_DOCUMENT',
};
globalThis.PropertyValueType = PropertyValueType;

// A SHAPE-valued property (e.g. "ADBE Vector Shape", a path). Mirrors the
// real AE constraint that setValue/setValueAtTime/setValuesAtTimes reject a
// plain {vertices,...} object — only an actual Shape instance is accepted
// (real AE's error: "Object/Array is not of the correct type"). This is the
// behavior host.jsx's toShape() exists to work around; the mock enforces it
// so a regression (passing a plain object through) fails the same way here
// as it would live in AE.
class MockShapeProperty {
  constructor() {
    this.propertyValueType = PropertyValueType.SHAPE;
    this._value = new Shape();
    this._keys = 0;
    this._keyValues = [];
  }
  get value() { return this._value; }
  _assertShape(v, where) {
    if (!(v instanceof Shape)) {
      throw new Error(`Object/Array is not of the correct type (${where} on a SHAPE property requires a Shape instance)`);
    }
  }
  setValue(v) { this._assertShape(v, 'setValue'); this._value = v; }
  setValueAtTime(_t, v) {
    this._assertShape(v, 'setValueAtTime');
    this._value = v;
    this._keys += 1;
    this._keyValues[this._keys - 1] = v;
  }
  setValuesAtTimes(_times, values) {
    values.forEach((v) => this._assertShape(v, 'setValuesAtTimes'));
    this._keyValues = values.slice();
    this._keys = values.length;
    this._value = values[values.length - 1];
  }
  keyValue(index) { return this._keyValues[index - 1] || null; }
  get numKeys() { return this._keys || 0; }
}

// Auto-populated children per matchName, mirroring the AE structures that
// exist without an explicit addProperty() call (a Group's Contents, a Path
// group's Shape, a Fill/Stroke's color/width). Only what addShape() /
// addPathShape() actually touch — not a full vector property tree.
const VECTOR_AUTO_CHILDREN = {
  'ADBE Vector Group': [['ADBE Vectors Group', () => new MockVectorGroup('ADBE Vectors Group')]],
  'ADBE Vector Shape - Group': [['ADBE Vector Shape', () => new MockShapeProperty()]],
  'ADBE Vector Graphic - Fill': [['ADBE Vector Fill Color', () => new MockProperty('ADBE Vector Fill Color', [0, 0, 0, 1])]],
  'ADBE Vector Graphic - Stroke': [
    ['ADBE Vector Stroke Color', () => new MockProperty('ADBE Vector Stroke Color', [0, 0, 0, 1])],
    ['ADBE Vector Stroke Width', () => new MockProperty('ADBE Vector Stroke Width', 2)],
  ],
  // Gradient fill/stroke geometry props, live-confirmed 2026-08-10 (AE
  // 26.3x87) — see docs/DEVLOG.md. "ADBE Vector Grad Colors" (the stop
  // colors) is deliberately NOT mocked here: real AE refuses to get/set it
  // (PropertyValueType.NO_VALUE), and layer.jsx's addShape never touches it
  // either — mocking a value there would let a test pass on behavior that
  // doesn't exist live.
  'ADBE Vector Graphic - G-Fill': [
    ['ADBE Vector Grad Type', () => new MockProperty('ADBE Vector Grad Type', 1)],
    ['ADBE Vector Grad Start Pt', () => new MockProperty('ADBE Vector Grad Start Pt', [0, 0])],
    ['ADBE Vector Grad End Pt', () => new MockProperty('ADBE Vector Grad End Pt', [100, 0])],
    ['ADBE Vector Grad Scale', () => new MockProperty('ADBE Vector Grad Scale', [100, 100])],
    ['ADBE Vector Grad Rotation', () => new MockProperty('ADBE Vector Grad Rotation', 0)],
    ['ADBE Vector Grad HiLite Length', () => new MockProperty('ADBE Vector Grad HiLite Length', 0)],
    ['ADBE Vector Grad HiLite Angle', () => new MockProperty('ADBE Vector Grad HiLite Angle', 0)],
    ['ADBE Vector Fill Opacity', () => new MockProperty('ADBE Vector Fill Opacity', 100)],
  ],
  'ADBE Vector Graphic - G-Stroke': [
    ['ADBE Vector Grad Type', () => new MockProperty('ADBE Vector Grad Type', 1)],
    ['ADBE Vector Grad Start Pt', () => new MockProperty('ADBE Vector Grad Start Pt', [0, 0])],
    ['ADBE Vector Grad End Pt', () => new MockProperty('ADBE Vector Grad End Pt', [100, 0])],
    ['ADBE Vector Grad Scale', () => new MockProperty('ADBE Vector Grad Scale', [100, 100])],
    ['ADBE Vector Grad Rotation', () => new MockProperty('ADBE Vector Grad Rotation', 0)],
    ['ADBE Vector Grad HiLite Length', () => new MockProperty('ADBE Vector Grad HiLite Length', 0)],
    ['ADBE Vector Grad HiLite Angle', () => new MockProperty('ADBE Vector Grad HiLite Angle', 0)],
    ['ADBE Vector Stroke Opacity', () => new MockProperty('ADBE Vector Stroke Opacity', 100)],
    ['ADBE Vector Stroke Width', () => new MockProperty('ADBE Vector Stroke Width', 2)],
  ],
  'ADBE Vector Shape - Ellipse': [['ADBE Vector Ellipse Size', () => new MockProperty('ADBE Vector Ellipse Size', [100, 100])]],
  'ADBE Vector Shape - Rect': [['ADBE Vector Rect Size', () => new MockProperty('ADBE Vector Rect Size', [100, 100])]],
  'ADBE Vector Shape - Star': [
    ['ADBE Vector Star Type', () => new MockProperty('ADBE Vector Star Type', 1)],
    ['ADBE Vector Star Points', () => new MockProperty('ADBE Vector Star Points', 5)],
    ['ADBE Vector Star Inner Radius', () => new MockProperty('ADBE Vector Star Inner Radius', 50)],
    ['ADBE Vector Star Outer Radius', () => new MockProperty('ADBE Vector Star Outer Radius', 100)],
  ],
  // Trim Paths / Repeater sub-property matchNames below are the commonly
  // documented AE ones, NOT live-confirmed the way the operator matchNames
  // themselves are (docs/DEVLOG.md 2026-08-09) — they only back the mock so
  // addShapeOperator's params handling (layer.jsx) has something real to
  // exercise in tests. Do not treat as confirmed for a live whitelist.
  'ADBE Vector Filter - Trim': [
    ['ADBE Vector Trim Start', () => new MockProperty('ADBE Vector Trim Start', 0)],
    ['ADBE Vector Trim End', () => new MockProperty('ADBE Vector Trim End', 100)],
    ['ADBE Vector Trim Offset', () => new MockProperty('ADBE Vector Trim Offset', 0)],
  ],
  'ADBE Vector Filter - Repeater': [
    ['ADBE Vector Repeater Copies', () => new MockProperty('ADBE Vector Repeater Copies', 3)],
    ['ADBE Vector Repeater Offset', () => new MockProperty('ADBE Vector Repeater Offset', 0)],
  ],
};

class MockVectorGroup {
  constructor(matchName) {
    this.matchName = matchName;
    this.name = matchName;
    this._items = [];
    this._byMatchName = {};
    this._parent = null;
    const autos = VECTOR_AUTO_CHILDREN[matchName];
    if (autos) for (const [childName, factory] of autos) this._addChild(childName, factory());
  }
  _addChild(matchName, item) {
    this._items.push(item);
    if (!this._byMatchName[matchName]) this._byMatchName[matchName] = item;
    if (item && typeof item === 'object') item._parent = this;
    return item;
  }
  // 1-based, mirrors real PropertyBase.propertyIndex — live-computed from the
  // parent's item order so moveTo() below stays correct without bookkeeping.
  get propertyIndex() {
    return this._parent ? this._parent._items.indexOf(this) + 1 : 1;
  }
  // addProperty() always appends, mirroring real AE. moveTo(index) below is
  // NOT used by any live command anymore — real AE's PropertyGroup.moveTo()
  // throws an uncatchable native error on vector-operator groups (confirmed
  // live, docs/DEVLOG.md 2026-08-09), so addShapeOperator dropped insertAt
  // entirely rather than expose a mock-only feature that lies about
  // production behavior. Kept here only as a generic simulator primitive in
  // case something else needs a working moveTo later — do not wire it back
  // into addShapeOperator without a live-confirmed real mechanism first.
  moveTo(index) {
    if (!this._parent) return;
    const items = this._parent._items;
    const cur = items.indexOf(this);
    if (cur === -1) return;
    items.splice(cur, 1);
    const target = Math.max(0, Math.min(items.length, index - 1));
    items.splice(target, 0, this);
  }
  get numProperties() { return this._items.length; }
  addProperty(matchName) { return this._addChild(matchName, new MockVectorGroup(matchName)); }
  property(ref) {
    if (typeof ref === 'number') return this._items[ref - 1] || null;
    return this._byMatchName[ref] || null;
  }
}

// Minimal effects support so addEffect / listInstalledEffects / findEffectMatchName
// work headlessly. A small known display-name -> matchName map.
const _MOCK_EFFECTS = {
  'Tint': 'ADBE Tint', 'Glow': 'ADBE Glo2', 'Gaussian Blur': 'ADBE Gaussian Blur 2',
  'Fractal Noise': 'ADBE Fractal Noise', 'CC Toner': 'CC Toner', 'Wave Warp': 'ADBE Wave Warp',
  'Turbulent Displace': 'ADBE Turbulent Displace', 'Lumetri Color': 'ADBE Lumetri',
  'Curves': 'ADBE CurvesCustom', 'Fill': 'ADBE Fill',
  // third-party (Plugin Everything), captured live via introspectEffect
  'Deep Glow 2': 'PEDG2', 'Shadow Studio 3': 'PESS3',
  // addShape's rampGradient (layer.jsx) applies this directly by matchName.
  'Gradient Ramp': 'ADBE Ramp',
};
function _lookupEffect(x) {
  if (_MOCK_EFFECTS[x]) return _MOCK_EFFECTS[x];
  for (const k in _MOCK_EFFECTS) if (_MOCK_EFFECTS[k] === x) return x;
  return null;
}
class MockEffect {
  constructor(name, matchName, group) { this.name = name; this.matchName = matchName; this._group = group; this.propertyIndex = group._items.length + 1; this._params = {}; }
  remove() { const i = this._group._items.indexOf(this); if (i >= 0) this._group._items.splice(i, 1); }
  property(ref) { const k = String(ref); if (!this._params[k]) this._params[k] = new MockProperty(k, 0); return this._params[k]; }
  get numProperties() { return 0; }
}
class MockEffectsGroup {
  constructor() { this._items = []; }
  get numProperties() { return this._items.length; }
  canAddProperty(x) { return !!_lookupEffect(x); }
  addProperty(x) { const mn = _lookupEffect(x); if (!mn) throw new Error('cannot add property ' + x); const e = new MockEffect(x, mn, this); this._items.push(e); return e; }
  property(ref) { if (typeof ref === 'number') return this._items[ref - 1] || null; for (const e of this._items) if (e.name === ref || e.matchName === ref) return e; return null; }
}

// ---------------------------------------------------------------------------
// Mock Layer
// ---------------------------------------------------------------------------
class MockLayer {
  constructor(comp, index, opts = {}) {
    this.index = index;
    this.name = opts.name || `Layer ${index}`;
    this.enabled = true;
    this.startTime = 0;
    this.inPoint = 0;
    this.outPoint = comp ? comp.duration : 0;
    this._comp = comp;
    this._type = opts.type || 'av'; // 'av' | 'text' | 'solid'

    // Transform properties
    this._transform = {
      Position: new MockProperty('Position', opts.position || [comp.width / 2, comp.height / 2]),
      Scale: new MockProperty('Scale', [100, 100, 100]),
      Rotation: new MockProperty('Rotation', 0),
      Opacity: new MockProperty('Opacity', 100),
    };

    // Source Text (for text layers)
    this._sourceText = null;
    if (this._type === 'text') {
      this._sourceText = new MockProperty('Source Text', {
        text: opts.text || '',
        fontSize: opts.fontSize || 36,
      });
    }

    // Root vector contents (for shape layers)
    this._rootVectors = null;
    if (this._type === 'shape') {
      this._rootVectors = new MockVectorGroup('ADBE Root Vectors Group');
    }
  }

  // Simulate AE's layer.property(name) accessor. Mirrors real AE: property()
  // only resolves DIRECT children. Transform leaves (Position/Scale/Rotation/
  // Opacity) are NOT direct children — they must be reached via the Transform
  // group, e.g. layer.property("Transform").property("Position"). Returning
  // null for the leaf names here is deliberate, so JSX that takes the wrong
  // path fails in the simulator exactly as it would in After Effects.
  property(name) {
    if (name === 'Transform') {
      return { property: (n) => this._transform[n] || null };
    }
    if (name === 'Source Text' && this._sourceText) {
      return this._sourceText;
    }
    if (name === 'ADBE Effect Parade') {
      if (!this._effects) this._effects = new MockEffectsGroup();
      return this._effects;
    }
    if (name === 'ADBE Root Vectors Group' && this._rootVectors) {
      return this._rootVectors;
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Mock Layers collection
// ---------------------------------------------------------------------------
class MockLayers {
  constructor(comp) {
    this._comp = comp;
    this._items = [];
  }

  get length() { return this._items.length; }

  addSolid(color, name, _width, _height, _pixelAspect) {
    const idx = this._items.length + 1;
    const layer = new MockLayer(this._comp, idx, {
      name: name || 'Solid',
      type: 'solid',
    });
    this._items.unshift(layer); // AE adds layers at top (index 1)
    this._reindex();
    return layer;
  }

  addText(text) {
    const idx = this._items.length + 1;
    const layer = new MockLayer(this._comp, idx, {
      name: text || 'Text',
      type: 'text',
      text: text,
    });
    this._items.unshift(layer);
    this._reindex();
    return layer;
  }

  addShape() {
    const idx = this._items.length + 1;
    const layer = new MockLayer(this._comp, idx, {
      name: `Shape Layer ${idx}`,
      type: 'shape',
    });
    this._items.unshift(layer);
    this._reindex();
    return layer;
  }

  _reindex() {
    for (let i = 0; i < this._items.length; i++) {
      this._items[i].index = i + 1;
    }
  }
}

// ---------------------------------------------------------------------------
// Mock CompItem
// ---------------------------------------------------------------------------
let _nextId = 1;

class MockCompItem {
  constructor(name, width, height, pixelAspect, duration, frameRate) {
    this.id = _nextId++;
    this.name = name;
    this.width = width;
    this.height = height;
    this.pixelAspect = pixelAspect || 1;
    this.duration = duration;
    this.frameRate = frameRate;
    this.layers = new MockLayers(this);
    this.numLayers = 0; // updated dynamically
    this.typeName = 'Composition';
  }

  get numLayers() { return this.layers._items.length; }
  set numLayers(_v) { /* ignore — computed */ }

  layer(indexOrName) {
    if (typeof indexOrName === 'number') {
      return this.layers._items[indexOrName - 1] || null;
    }
    return this.layers._items.find((l) => l.name === indexOrName) || null;
  }

  remove() {
    if (this._project) {
      const i = this._project._items.indexOf(this);
      if (i >= 0) this._project._items.splice(i, 1);
    }
  }
}

// Make instanceof checks work in the JSX sandbox.
// The JSX code uses `item instanceof CompItem`.
globalThis.CompItem = MockCompItem;

// ---------------------------------------------------------------------------
// Mock Render Queue
// ---------------------------------------------------------------------------
class MockRenderQueueItem {
  constructor(comp) {
    this._comp = comp;
    this._outputModules = [new MockOutputModule()];
    this._template = null;
  }
  outputModule(idx) { return this._outputModules[idx - 1]; }
  applyTemplate(name) { this._template = name; }
}

class MockOutputModule {
  constructor() {
    this.file = null;
    this._template = null;
  }
  applyTemplate(name) { this._template = name; }
}

class MockRenderQueue {
  constructor() {
    this.items = new MockRenderQueueItems();
    this._rendering = false;
  }
  render() {
    this._rendering = true;
    // Simulate instant render (synchronous for testing).
    this._rendering = false;
  }
}

class MockRenderQueueItems {
  constructor() { this._items = []; }
  add(comp) {
    const rqi = new MockRenderQueueItem(comp);
    this._items.push(rqi);
    return rqi;
  }
  get length() { return this._items.length; }
}

// ---------------------------------------------------------------------------
// Mock Project
// ---------------------------------------------------------------------------
class MockProject {
  constructor() {
    this._items = [];
    this.activeItem = null;
    this.file = null; // null = "Untitled"
    this.renderQueue = new MockRenderQueue();
  }

  get numItems() { return this._items.length; }

  item(index) {
    return this._items[index - 1] || null;
  }

  get items() {
    const self = this;
    return {
      addComp(name, width, height, pixelAspect, duration, frameRate) {
        const comp = new MockCompItem(name, width, height, pixelAspect, duration, frameRate);
        comp._project = self;
        self._items.push(comp);
        return comp;
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Mock File (for render outputPath and project.file)
// ---------------------------------------------------------------------------
class MockFile {
  constructor(path) {
    this.fsName = path;
    this.name = path.split(/[\\/]/).pop();
  }
}

// ---------------------------------------------------------------------------
// Mock app
// ---------------------------------------------------------------------------
function _mockFonts() {
  const names = ['ArialMT', 'Arial-BoldMT', 'TimesNewRomanPSMT', 'Helvetica', 'Verdana-Bold', 'Georgia', 'CourierNewPSMT', 'Impact'];
  return names.map((n) => ({ toString: () => n }));
}

// Mirrors real AE's app.effects shape ({displayName, matchName, category,
// version, isDeprecated}, docs/ROADMAP.md "listInstalledEffects →
// app.effects") off the same _MOCK_EFFECTS map addEffect/canAddProperty use,
// so listInstalledEffects/findEffectMatchName exercise real code headlessly.
function _mockEffectsList() {
  const out = [];
  for (const name in _MOCK_EFFECTS) {
    out.push({ displayName: name, matchName: _MOCK_EFFECTS[name], category: 'Simulated', version: '1.0', isDeprecated: false });
  }
  return out;
}

class MockApp {
  constructor() {
    this.version = '25.0.0'; // simulated AE version
    this.buildName = '25.0.0 (sim)';
    this.memoryInUse = 512 * 1048576;
    this.fonts = { allFonts: _mockFonts() };
    this.effects = _mockEffectsList();
    this.project = new MockProject();
    this._undoDepth = 0;
  }

  beginUndoGroup(_name) {
    this._undoDepth++;
  }

  endUndoGroup() {
    if (this._undoDepth > 0) this._undoDepth--;
  }

  // Reset state between test runs.
  reset() {
    this.project = new MockProject();
    this._undoDepth = 0;
    _nextId = 1;
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
export function createMockAeDom() {
  const mockApp = new MockApp();
  return {
    app: mockApp,
    File: MockFile,
    CompItem: MockCompItem,
    Shape,
    PropertyValueType,
    reset() { mockApp.reset(); },
  };
}

// introspect.jsx — read-back (ES3). Lets an agent SEE AE state, not just write it.

// A "Source Text" property's .value is a live native TextDocument, not a
// plain value — handing it straight to JSON.stringify crashes OUTSIDE any
// try/catch here, because AE throws reading .boxTextSize on point text
// ("Text document not of Box document type", confirmed live 2026-08-09 on
// aep/Ae_Template_Test.aep). Snapshot only the fields setTextDocument
// actually uses (text.jsx), each independently guarded, and only read
// boxTextSize when boxText is actually true.
function _textDocSnapshot(d) {
  var out = {};
  try { out.text = d.text; } catch (e) {}
  try { out.font = d.font; } catch (e) {}
  try { out.fontSize = d.fontSize; } catch (e) {}
  try { out.tracking = d.tracking; } catch (e) {}
  try { out.leading = d.leading; } catch (e) {}
  try { out.applyFill = d.applyFill; } catch (e) {}
  try { if (d.applyFill) out.fillColor = d.fillColor; } catch (e) {}
  try { out.applyStroke = d.applyStroke; } catch (e) {}
  try { if (d.applyStroke) out.strokeColor = d.strokeColor; } catch (e) {}
  try { out.strokeWidth = d.strokeWidth; } catch (e) {}
  try { out.justification = String(d.justification); } catch (e) {}
  try { out.boxText = d.boxText; } catch (e) {}
  try { if (d.boxText) out.boxTextSize = d.boxTextSize; } catch (e) {}
  return out;
}

// Read a property's value the JSON-safe way (see _textDocSnapshot above).
function _safeValue(prop) {
  var val = prop.value;
  if (prop.matchName === "ADBE Text Document") return _textDocSnapshot(val);
  return val;
}

function _propSnapshot(prop) {
  var snap = { name: prop.name, matchName: prop.matchName };
  try { snap.value = _safeValue(prop); } catch (e) {}
  try { snap.numKeys = prop.numKeys; } catch (e) {}
  try { if (prop.expressionEnabled) snap.expression = prop.expression; } catch (e) {}
  if (snap.numKeys && snap.numKeys > 0) {
    snap.keys = [];
    for (var k = 1; k <= snap.numKeys; k++) {
      try { snap.keys.push({ index: k, time: prop.keyTime(k), value: prop.keyValue(k) }); } catch (e) {}
    }
  }
  return snap;
}

COMMANDS.getProperty = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  var prop = AEB.resolveProperty(layer, p.property);
  return _propSnapshot(prop);
};

// Recursively summarize a property group (bounded depth).
function _groupSummary(group, depth) {
  var out = [];
  if (depth < 0) return out;
  for (var i = 1; i <= group.numProperties; i++) {
    var pr = group.property(i);
    var node = { name: pr.name, matchName: pr.matchName };
    if (pr.numProperties !== undefined && pr.numProperties > 0 && depth > 0) {
      node.children = _groupSummary(pr, depth - 1);
    } else {
      try { node.value = _safeValue(pr); } catch (e) {}
      try { if (pr.expressionEnabled) node.expression = pr.expression; } catch (e) {}
    }
    out.push(node);
  }
  return out;
}

COMMANDS.getLayerDetails = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  var info = AEB.layerInfo(layer);
  info.blendingMode = String(layer.blendingMode);
  try { info.parent = layer.parent ? layer.parent.name : null; } catch (e) {}
  // flags
  info.flags = {};
  try { info.flags.motionBlur = layer.motionBlur; } catch (e) {}
  try { info.flags.threeDLayer = layer.threeDLayer; } catch (e) {}
  try { info.flags.adjustmentLayer = layer.adjustmentLayer; } catch (e) {}
  try { info.flags.guideLayer = layer.guideLayer; } catch (e) {}
  try { info.flags.collapseTransformation = layer.collapseTransformation; } catch (e) {}
  try { info.flags.solo = layer.solo; } catch (e) {}
  try { info.flags.shy = layer.shy; } catch (e) {}
  try { info.flags.locked = layer.locked; } catch (e) {}
  info.threeDLayer = info.flags.threeDLayer;
  // transform snapshot
  var tr = layer.property("Transform");
  info.transform = {};
  var names = ["Anchor Point", "Position", "Scale", "Rotation", "Opacity"];
  for (var n = 0; n < names.length; n++) {
    try { info.transform[names[n]] = tr.property(names[n]).value; } catch (e) {}
  }
  // effects
  info.effects = [];
  var fx = AEB.effectsGroup(layer);
  if (fx) for (var i = 1; i <= fx.numProperties; i++) {
    info.effects.push({ index: i, name: fx.property(i).name, matchName: fx.property(i).matchName });
  }
  if (p.deep) info.tree = _groupSummary(layer, (p.depth !== undefined) ? p.depth : 2);
  return info;
};

COMMANDS.getCompDetails = function (p) {
  var comp = AEB.requireComp(p);
  var layers = [];
  for (var i = 1; i <= comp.numLayers; i++) layers.push(AEB.layerInfo(comp.layer(i)));
  return {
    id: comp.id, name: comp.name, width: comp.width, height: comp.height,
    duration: comp.duration, frameRate: comp.frameRate,
    pixelAspect: comp.pixelAspect, bgColor: comp.bgColor,
    workAreaStart: comp.workAreaStart, workAreaDuration: comp.workAreaDuration,
    numLayers: comp.numLayers, layers: layers
  };
};

COMMANDS.getProjectItems = function () {
  var out = [], proj = app.project;
  for (var i = 1; i <= proj.numItems; i++) {
    var it = proj.item(i);
    var node = { id: it.id, name: it.name, typeName: it.typeName };
    try { node.width = it.width; node.height = it.height; } catch (e) {}
    try { node.duration = it.duration; } catch (e) {}
    out.push(node);
  }
  return out;
};

// Named position -> comp-relative px coordinates, inset by title-safe margins
// (Faz 2 madde 2, docs/ROADMAP.md). Pure math off comp.width/height — no
// scene mutation, so no AEB.undo. safeArea ratios are resolved server-side
// (shared/src/commands.js, from config.json) before this ever runs, so this
// only has to trust the numbers it's given.
COMMANDS.resolveSafePosition = function (p) {
  var comp = AEB.requireComp(p);
  var sa = p.safeArea || { top: 0.08, right: 0.08, bottom: 0.08, left: 0.08 };
  var insetTop = comp.height * sa.top, insetBottom = comp.height * sa.bottom;
  var insetLeft = comp.width * sa.left, insetRight = comp.width * sa.right;
  var left = insetLeft, right = comp.width - insetRight;
  var top = insetTop, bottom = comp.height - insetBottom;
  var xOf = { left: left, center: comp.width / 2, right: right };
  var yOf = { top: top, middle: comp.height / 2, bottom: bottom };
  var pos = String(p.position);
  // NOTE: ExtendScript (ES3) mis-parses chained ternaries (a?b:c?d:e) — use
  // explicit if/else (see AEB.requireLayer's comment, host.jsx). A chained
  // ternary here silently picked the wrong branch live (2026-08-09).
  var vKey;
  if (pos.indexOf("top") === 0) vKey = "top";
  else if (pos.indexOf("bottom") === 0) vKey = "bottom";
  else vKey = "middle";
  var hKey;
  if (pos.indexOf("Left") >= 0) hKey = "left";
  else if (pos.indexOf("Right") >= 0) hKey = "right";
  else hKey = "center";
  AEB.assert(xOf[hKey] !== undefined && yOf[vKey] !== undefined, "unknown position: " + p.position);
  return {
    x: xOf[hKey], y: yOf[vKey],
    safeArea: { left: left, top: top, right: right, bottom: bottom }
  };
};

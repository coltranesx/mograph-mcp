// layer.jsx — layer creation + manipulation (ES3). Uses AEB.* helpers.

// --- creation --------------------------------------------------------------
COMMANDS.addSolid = function (p) {
  var comp = AEB.requireComp(p);
  var name = p.name || "Solid";
  var color = AEB.normColor(p.color);
  var w = p.width || comp.width, h = p.height || comp.height;
  return AEB.undo("mograph-mcp: addSolid", function () {
    var layer = comp.layers.addSolid(color, name, w, h, 1);
    return AEB.layerInfo(layer);
  });
};

COMMANDS.addTextLayer = function (p) {
  var comp = AEB.requireComp(p);
  AEB.assert(p.text, "text is required");
  return AEB.undo("mograph-mcp: addTextLayer", function () {
    var layer = comp.layers.addText(p.text);
    if (p.fontSize || p.fillColor || p.font || p.justification !== undefined) {
      var tp = layer.property("Source Text");
      var td = tp.value;
      if (p.fontSize) td.fontSize = p.fontSize;
      if (p.font) td.font = p.font;
      if (p.fillColor) { td.applyFill = true; td.fillColor = AEB.normColor(p.fillColor); }
      if (p.justification !== undefined) {
        // 0 left, 1 right, 2 center
        var J = [ParagraphJustification.LEFT_JUSTIFY, ParagraphJustification.RIGHT_JUSTIFY, ParagraphJustification.CENTER_JUSTIFY];
        td.justification = J[p.justification] || J[0];
      }
      tp.setValue(td);
    }
    if (p.position) layer.property("Transform").property("Position").setValue(p.position);
    // Set the name LAST: changing a text layer's source text re-links its name
    // to the text, so a manual rename must come after.
    if (p.name) layer.name = p.name;
    return AEB.layerInfo(layer);
  });
};

COMMANDS.addNull = function (p) {
  var comp = AEB.requireComp(p);
  return AEB.undo("mograph-mcp: addNull", function () {
    var layer = comp.layers.addNull(p.duration || comp.duration);
    if (p.name) layer.name = p.name;
    return AEB.layerInfo(layer);
  });
};

COMMANDS.addAdjustmentLayer = function (p) {
  var comp = AEB.requireComp(p);
  return AEB.undo("mograph-mcp: addAdjustmentLayer", function () {
    var solid = comp.layers.addSolid([1, 1, 1], p.name || "Adjustment", comp.width, comp.height, 1);
    solid.adjustmentLayer = true;
    return AEB.layerInfo(solid);
  });
};

COMMANDS.addCamera = function (p) {
  var comp = AEB.requireComp(p);
  var center = p.center || [comp.width / 2, comp.height / 2];
  return AEB.undo("mograph-mcp: addCamera", function () {
    var layer = comp.layers.addCamera(p.name || "Camera", center);
    return AEB.layerInfo(layer);
  });
};

COMMANDS.addLight = function (p) {
  var comp = AEB.requireComp(p);
  var center = p.center || [comp.width / 2, comp.height / 2];
  return AEB.undo("mograph-mcp: addLight", function () {
    var layer = comp.layers.addLight(p.name || "Light", center);
    if (p.lightType !== undefined) {
      var T = [LightType.PARALLEL, LightType.SPOT, LightType.POINT, LightType.AMBIENT];
      layer.lightType = T[p.lightType] || LightType.POINT;
    }
    return AEB.layerInfo(layer);
  });
};

COMMANDS.addShape = function (p) {
  var comp = AEB.requireComp(p);
  return AEB.undo("mograph-mcp: addShape", function () {
    var layer = comp.layers.addShape();
    if (p.name) layer.name = p.name;
    var contents = layer.property("ADBE Root Vectors Group");
    var grp = contents.addProperty("ADBE Vector Group");
    var shapeGroup = grp.property("ADBE Vectors Group");
    var kind = (p.shape || "rectangle").toLowerCase();
    // shared/src/commands.js validates kind against the same enum before this
    // ever reaches the socket — this AEB.assert is defense-in-depth (matches
    // the addShapeOperator pattern), not the primary guard. No silent
    // fallback to rectangle for an unrecognized shape (docs/ROADMAP.md "Faz
    // 1.C" — a typo'd shape used to build a rectangle with no error).
    AEB.assert(kind === "rectangle" || kind === "ellipse" || kind === "polystar",
      'unknown shape "' + p.shape + '" (expected rectangle|ellipse|polystar)');
    if (kind === "ellipse") {
      shapeGroup.addProperty("ADBE Vector Shape - Ellipse");
      var size = p.size || [200, 200];
      try { shapeGroup.property("ADBE Vector Shape - Ellipse").property("ADBE Vector Ellipse Size").setValue(size); } catch (e) {}
    } else if (kind === "polystar") {
      var star = shapeGroup.addProperty("ADBE Vector Shape - Star");
      var isPolygon = (String(p.polyType).toLowerCase() === "polygon");
      star.property("ADBE Vector Star Type").setValue(isPolygon ? 2 : 1);
      if (p.points !== undefined) star.property("ADBE Vector Star Points").setValue(p.points);
      if (p.innerRadius !== undefined) star.property("ADBE Vector Star Inner Radius").setValue(p.innerRadius);
      if (p.outerRadius !== undefined) star.property("ADBE Vector Star Outer Radius").setValue(p.outerRadius);
    } else {
      shapeGroup.addProperty("ADBE Vector Shape - Rect");
      var rectSize = p.size || [200, 200];
      try { shapeGroup.property("ADBE Vector Shape - Rect").property("ADBE Vector Rect Size").setValue(rectSize); } catch (e) {}
    }
    if (p.fillColor) {
      var fill = shapeGroup.addProperty("ADBE Vector Graphic - Fill");
      fill.property("ADBE Vector Fill Color").setValue(AEB.normColor(p.fillColor));
    }
    if (p.strokeColor) {
      var stroke = shapeGroup.addProperty("ADBE Vector Graphic - Stroke");
      stroke.property("ADBE Vector Stroke Color").setValue(AEB.normColor(p.strokeColor));
      if (p.strokeWidth) stroke.property("ADBE Vector Stroke Width").setValue(p.strokeWidth);
    }
    return AEB.layerInfo(layer);
  });
};

// A rect shape layer whose size tracks another layer's rendered bounds live,
// via an expression on ADBE Vector Rect Size — not a one-time computation
// like addShape's static `size`. Was previously only reachable inside
// applySpec's "responsive_box" treatment kind (executor.jsx); exposed
// standalone here (Faz 2 madde 6, docs/ROADMAP.md — decided with the user
// 2026-08-09: the lower-third DOES want a thin accent line, this is what
// backs it, see applyLowerThird's accentLine param). Re-evaluates on every
// frame AE renders, so it stays correct if fitTo's text changes later —
// deliberately dynamic, unlike applyLowerThird's own accent bar which is a
// one-time computed size (consistent with how the rest of that composition
// works: measured once at build time, not expression-driven).
COMMANDS.addResponsiveBox = function (p) {
  var comp = AEB.requireComp(p);
  var fitLayer = AEB.resolveLayer(comp, p.fitTo);
  AEB.assert(fitLayer, "fitTo layer not found");
  return AEB.undo("mograph-mcp: addResponsiveBox", function () {
    var box = comp.layers.addShape();
    if (p.name) box.name = p.name;
    var root = box.property("ADBE Root Vectors Group");
    var g = root.addProperty("ADBE Vector Group").property("ADBE Vectors Group");
    g.addProperty("ADBE Vector Shape - Rect");
    if (p.fillColor) {
      g.addProperty("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color").setValue(AEB.normColor(p.fillColor));
    }
    if (p.strokeColor) {
      var stroke = g.addProperty("ADBE Vector Graphic - Stroke");
      stroke.property("ADBE Vector Stroke Color").setValue(AEB.normColor(p.strokeColor));
      if (p.strokeWidth) stroke.property("ADBE Vector Stroke Width").setValue(p.strokeWidth);
    }
    var sizeProp = g.property("ADBE Vector Shape - Rect").property("ADBE Vector Rect Size");
    var pad = p.padding || [60, 40];
    // Single quotes in the target name would break the expression string —
    // guard rather than produce a silently-wrong expression.
    var fitName = String(fitLayer.name).replace(/'/g, "\\'");
    sizeProp.expression =
      "var s = thisComp.layer('" + fitName + "').sourceRectAtTime(); [s.width+" + pad[0] + ", s.height+" + pad[1] + "];";
    if (p.position) box.property("Transform").property("Position").setValue(p.position);
    return AEB.layerInfo(box);
  });
};

// Shape operators (Trim Paths, Repeater, ...) live inside a shape layer's
// vector-group tree, added via group.addProperty(matchName) — not addEffect().
// Mirrors shared/src/commands.js SHAPE_OPERATORS; keep the two in sync. Kept
// deliberately narrow: addProperty() on a vector group with a matchName AE
// doesn't recognize is not a catchable ExtendScript exception, it has
// produced a modal dialog once and crashed After Effects outright once in
// earlier live testing (docs/DEVLOG.md 2026-08-09) — the controller already
// rejects anything outside this list before the socket opens, this copy
// exists so a direct runJSX call (AE_BRIDGE_ALLOW_DEV) can't bypass that.
var SHAPE_OPERATOR_MATCHNAMES = {
  trim: "ADBE Vector Filter - Trim",
  repeater: "ADBE Vector Filter - Repeater"
};

COMMANDS.addShapeOperator = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  var matchName = SHAPE_OPERATOR_MATCHNAMES[p.operator];
  AEB.assert(matchName, "unknown or unconfirmed operator: " + p.operator);
  return AEB.undo("mograph-mcp: addShapeOperator", function () {
    var group = p.group ? AEB.resolveProperty(layer, p.group) : layer.property("ADBE Root Vectors Group");
    AEB.assert(group, "target vector group not found");
    var added = group.addProperty(matchName);
    if (p.name) added.name = p.name;
    if (p.params) {
      // Mirrors setEffectParam (effect.jsx): resolve then setValue, no
      // try/catch. A bad param key or an out-of-range value should fail the
      // call loudly — silently swallowing it here previously meant a typo'd
      // key (e.g. "Sart" instead of "Start") produced a 200-OK response with
      // the operator added but the param never set, no sign anything was wrong.
      for (var k in p.params) {
        if (p.params.hasOwnProperty(k)) {
          var param = added.property(k);
          AEB.assert(param, "params key \"" + k + "\" is not a property on " + p.operator + " (" + matchName + ")");
          param.setValue(p.params[k]);
        }
      }
    }
    // No insertAt/reorder support: addProperty() always appends to the end
    // of the group, and PropertyGroup.moveTo() — the only scripting API for
    // reordering afterward — throws "ReferenceError: Object is invalid" on
    // this AE version (26.3x87) in a way a JS try/catch cannot intercept (a
    // native-level failure, like an invalid addProperty matchName). Live
    // confirmed twice independently (docs/DEVLOG.md 2026-08-09): once the
    // error simply happened, once it happened *after* the operator had
    // already been added and named — so a caught version of this would
    // still leave a half-applied operator behind while reporting failure.
    // Not worth chasing further without a different reorder mechanism.
    // Given operators always append, the workaround is complete: call
    // addShapeOperator in the order you want the stack to end up in.
    return {
      operatorIndex: added.propertyIndex,
      name: added.name,
      matchName: added.matchName,
      operator: p.operator
    };
  });
};

// Shape layer with a custom bezier path (vertices + tangents). For flames,
// teardrops, blobs, custom logos, etc.
COMMANDS.addPathShape = function (p) {
  var comp = AEB.requireComp(p);
  AEB.assert(p.vertices && p.vertices.length, "vertices[] is required");
  return AEB.undo("mograph-mcp: addPathShape", function () {
    var layer = comp.layers.addShape();
    if (p.name) layer.name = p.name;
    var contents = layer.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group").property("ADBE Vectors Group");
    var pathGroup = contents.addProperty("ADBE Vector Shape - Group");
    var s = new Shape();
    s.vertices = p.vertices;
    if (p.inTangents) s.inTangents = p.inTangents;
    if (p.outTangents) s.outTangents = p.outTangents;
    s.closed = (p.closed !== false);
    pathGroup.property("ADBE Vector Shape").setValue(s);
    if (p.fillColor) {
      contents.addProperty("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color").setValue(AEB.normColor(p.fillColor));
    }
    if (p.strokeColor) {
      var stroke = contents.addProperty("ADBE Vector Graphic - Stroke");
      stroke.property("ADBE Vector Stroke Color").setValue(AEB.normColor(p.strokeColor));
      if (p.strokeWidth) stroke.property("ADBE Vector Stroke Width").setValue(p.strokeWidth);
    }
    if (p.position) layer.property("Transform").property("Position").setValue(p.position);
    return AEB.layerInfo(layer);
  });
};

// Add an existing project footage/comp item into a comp as a layer.
COMMANDS.addFootageLayer = function (p) {
  var comp = AEB.requireComp(p);
  var src = null, proj = app.project;
  for (var i = 1; i <= proj.numItems; i++) {
    var it = proj.item(i);
    if ((p.itemId !== undefined && it.id === p.itemId) || (p.itemName && it.name === p.itemName)) { src = it; break; }
  }
  AEB.assert(src, "Source item not found (itemId/itemName)");
  return AEB.undo("mograph-mcp: addFootageLayer", function () {
    var layer = comp.layers.add(src);
    if (p.name) layer.name = p.name;
    if (p.startTime !== undefined) layer.startTime = p.startTime;
    return AEB.layerInfo(layer);
  });
};

// --- manipulation ----------------------------------------------------------
COMMANDS.setLayerProperty = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  AEB.assert(p.property, "property is required");
  AEB.assert(p.value !== undefined, "value is required");
  return AEB.undo("mograph-mcp: setLayerProperty", function () {
    var key = String(p.property).toLowerCase();
    if (key === "name") layer.name = p.value;
    else if (key === "enabled") layer.enabled = !!p.value;
    else if (key === "starttime") layer.startTime = p.value;
    else if (key === "inpoint") layer.inPoint = p.value;
    else if (key === "outpoint") layer.outPoint = p.value;
    else if (key === "shy") layer.shy = !!p.value;
    else if (key === "solo") layer.solo = !!p.value;
    else if (key === "label") layer.label = p.value;
    else if (key === "threed" || key === "threedlayer") layer.threeDLayer = !!p.value;
    else {
      var prop = AEB.resolveProperty(layer, p.property);
      prop.setValue(p.value);
    }
    return { ok: true };
  });
};

COMMANDS.setParent = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  return AEB.undo("mograph-mcp: setParent", function () {
    if (p.parent === null || p.parentName === null) { layer.parent = null; return { ok: true }; }
    var parentRef = (p.parent !== undefined) ? p.parent : p.parentName;
    layer.parent = AEB.resolveLayer(comp, parentRef);
    return { ok: true };
  });
};

COMMANDS.trimLayer = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  return AEB.undo("mograph-mcp: trimLayer", function () {
    if (p.inPoint !== undefined) layer.inPoint = p.inPoint;
    if (p.outPoint !== undefined) layer.outPoint = p.outPoint;
    if (p.startTime !== undefined) layer.startTime = p.startTime;
    return AEB.layerInfo(layer);
  });
};

COMMANDS.moveLayer = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  return AEB.undo("mograph-mcp: moveLayer", function () {
    var to = p.toIndex;
    AEB.assert(to >= 1 && to <= comp.numLayers, "toIndex out of range");
    if (to === 1) layer.moveToBeginning();
    else if (to >= comp.numLayers) layer.moveToEnd();
    else layer.moveBefore(comp.layer(to));
    return AEB.layerInfo(layer);
  });
};

COMMANDS.duplicateLayer = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  return AEB.undo("mograph-mcp: duplicateLayer", function () {
    var dup = layer.duplicate();
    if (p.name) dup.name = p.name;
    return AEB.layerInfo(dup);
  });
};

COMMANDS.deleteLayer = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  return AEB.undo("mograph-mcp: deleteLayer", function () {
    var name = layer.name;
    layer.remove();
    return { ok: true, removed: name };
  });
};

COMMANDS.getLayers = function (p) {
  var comp = AEB.requireComp(p);
  var out = [];
  for (var i = 1; i <= comp.numLayers; i++) out.push(AEB.layerInfo(comp.layer(i)));
  return out;
};

var _BLEND = {
  normal: "NORMAL", multiply: "MULTIPLY", screen: "SCREEN", overlay: "OVERLAY",
  add: "ADD", lighten: "LIGHTEN", darken: "DARKEN", difference: "DIFFERENCE",
  softlight: "SOFT_LIGHT", hardlight: "HARD_LIGHT", colordodge: "CLASSIC_COLOR_DODGE",
  colorburn: "CLASSIC_COLOR_BURN", hue: "HUE", saturation: "SATURATION",
  color: "COLOR", luminosity: "LUMINOSITY", alpha: "ALPHA_ADD"
};
COMMANDS.setBlendMode = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  AEB.assert(p.mode, "mode is required");
  var key = _BLEND[String(p.mode).toLowerCase()];
  AEB.assert(key && BlendingMode[key] !== undefined, "unknown blend mode: " + p.mode);
  return AEB.undo("mograph-mcp: setBlendMode", function () {
    layer.blendingMode = BlendingMode[key];
    return { ok: true };
  });
};

var _MATTE = {
  none: "NO_TRACK_MATTE", alpha: "ALPHA", alphainverted: "ALPHA_INVERTED",
  luma: "LUMA", lumainverted: "LUMA_INVERTED"
};
COMMANDS.setTrackMatte = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  var key = _MATTE[String(p.type || "alpha").toLowerCase()];
  AEB.assert(key && TrackMatteType[key] !== undefined, "unknown track matte type: " + p.type);
  return AEB.undo("mograph-mcp: setTrackMatte", function () {
    // Modern AE: setTrackMatte(layer, type). Fallback to trackMatteType.
    try {
      if (p.matteLayer !== undefined) layer.setTrackMatte(AEB.resolveLayer(comp, p.matteLayer), TrackMatteType[key]);
      else layer.trackMatteType = TrackMatteType[key];
    } catch (e) { layer.trackMatteType = TrackMatteType[key]; }
    return { ok: true };
  });
};

COMMANDS.setLayerFlag = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  AEB.assert(p.flag, "flag is required");
  var key = String(p.flag).toLowerCase();
  var val = (p.value !== false);
  return AEB.undo("mograph-mcp: setLayerFlag", function () {
    if (key === "motionblur") layer.motionBlur = val;
    else if (key === "adjustment") layer.adjustmentLayer = val;
    else if (key === "guide") layer.guideLayer = val;
    else if (key === "threed" || key === "3d") layer.threeDLayer = val;
    else if (key === "collapse" || key === "collapsetransformation") layer.collapseTransformation = val;
    else if (key === "solo") layer.solo = val;
    else if (key === "shy") layer.shy = val;
    else if (key === "lock") layer.locked = val;
    else if (key === "frameblending") layer.frameBlending = val;
    else throw new Error("unknown flag: " + p.flag);
    return { ok: true };
  });
};

COMMANDS.addLayerMarker = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  AEB.assert(p.time !== undefined, "time is required");
  return AEB.undo("mograph-mcp: addLayerMarker", function () {
    var mv = new MarkerValue(p.comment || "");
    if (p.duration !== undefined) mv.duration = p.duration;
    layer.property("Marker").setValueAtTime(p.time, mv);
    return { ok: true };
  });
};

COMMANDS.setTimeStretch = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  AEB.assert(p.stretch !== undefined, "stretch (percent) is required");
  return AEB.undo("mograph-mcp: setTimeStretch", function () {
    layer.stretch = p.stretch;
    return { ok: true, stretch: layer.stretch };
  });
};

COMMANDS.enableTimeRemap = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  return AEB.undo("mograph-mcp: enableTimeRemap", function () {
    layer.timeRemapEnabled = (p.enabled !== false);
    return { ok: true };
  });
};

COMMANDS.replaceSource = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  var src = null, proj = app.project;
  for (var i = 1; i <= proj.numItems; i++) {
    var it = proj.item(i);
    if ((p.itemId !== undefined && it.id === p.itemId) || (p.itemName && it.name === p.itemName)) { src = it; break; }
  }
  AEB.assert(src, "replacement item not found (itemId/itemName)");
  return AEB.undo("mograph-mcp: replaceSource", function () {
    layer.replaceSource(src, (p.fixExpressions !== false));
    return { ok: true };
  });
};

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

// Sets the shared geometry knobs on a G-Fill/G-Stroke property group (type,
// start/end point, scale, rotation, highlight). Does NOT touch color — see
// _applyGradientGeometry's header comment on addShape below for why.
function _applyGradientGeometry(propGroup, g, opacityMatchName) {
  var isRadial = (String(g.type).toLowerCase() === "radial");
  propGroup.property("ADBE Vector Grad Type").setValue(isRadial ? 2 : 1);
  if (g.startPoint) propGroup.property("ADBE Vector Grad Start Pt").setValue(g.startPoint);
  if (g.endPoint) propGroup.property("ADBE Vector Grad End Pt").setValue(g.endPoint);
  if (g.scale !== undefined) propGroup.property("ADBE Vector Grad Scale").setValue([g.scale, g.scale]);
  if (g.rotation !== undefined) propGroup.property("ADBE Vector Grad Rotation").setValue(g.rotation);
  if (g.hiliteLength !== undefined) propGroup.property("ADBE Vector Grad HiLite Length").setValue(g.hiliteLength);
  if (g.hiliteAngle !== undefined) propGroup.property("ADBE Vector Grad HiLite Angle").setValue(g.hiliteAngle);
  if (g.opacity !== undefined) propGroup.property(opacityMatchName).setValue(g.opacity);
}

var LINE_CAPS = { butt: 1, round: 2, projecting: 3 };
var LINE_JOINS = { miter: 1, round: 2, bevel: 3 };

// Applies stroke style (line cap/join/miter, dashes, taper, wave) to a
// Stroke or G-Stroke property group — both share identical sub-matchNames
// for all of this, confirmed live 2026-08-10, so one function serves both
// addShape's strokeColor and strokeGradient paths.
//
// Dashes: every one of Dash N/Gap N/Offset is HIDDEN by default —
// setValue() on it directly throws "Can not set value... property or a
// parent property is hidden" (confirmed live). addProperty(matchName) on
// that already-existing-but-hidden slot is what unhides it (numProperties
// never changes — it is not a real indexed-group append, despite the API
// shape). No ordering dependency between pairs (Dash 2 works without Dash
// 1 first) but Offset needs its own addProperty() call regardless of how
// many pairs are active.
//
// Taper: Start/End Length (percent) and Start/EndWidthPx (pixels) are a
// linked pair gated by Length Units the same hidden-property way — only
// the unit currently selected is settable. Start/End Width (the width
// taper fraction) and Start/End Ease are NOT gated, always settable.
//
// Wave: Cycles is NOT scriptable at all (confirmed live 2026-08-10, AE
// 26.3x87) — unlike Dashes/miterLimit, there is no unhide path: setValue(),
// setValueAtTime(), .expression=, and indexed property() access all throw
// the same "property or a parent property is hidden" error, and
// addProperty() fails outright with a different error because this group
// is a NAMED_GROUP, not an INDEXED_GROUP like Dashes (so the Dashes trick
// doesn't apply). Same category of AE limitation as gradient stop colors
// (ADBE Vector Grad Colors, see addShape's fillGradient) — deliberately
// left out of the wave param schema rather than exposed as broken.
// Amount/Wavelength/Units/Phase are all plain, always-settable.
function _applyStrokeStyle(strokeGroup, p) {
  if (p.lineCap !== undefined) {
    var cap = LINE_CAPS[String(p.lineCap).toLowerCase()];
    AEB.assert(cap, "lineCap must be one of: butt, round, projecting");
    strokeGroup.property("ADBE Vector Stroke Line Cap").setValue(cap);
  }
  if (p.lineJoin !== undefined) {
    var join = LINE_JOINS[String(p.lineJoin).toLowerCase()];
    AEB.assert(join, "lineJoin must be one of: miter, round, bevel");
    strokeGroup.property("ADBE Vector Stroke Line Join").setValue(join);
  }
  if (p.miterLimit !== undefined) {
    // Miter Limit is itself hidden unless Line Join is "miter" (AE's
    // default, so omitting lineJoin is fine) — confirmed live. Fail with a
    // clear message here rather than let AE's generic "hidden" error surface.
    AEB.assert(p.lineJoin === undefined || String(p.lineJoin).toLowerCase() === "miter",
      "miterLimit only applies when lineJoin is \"miter\" (AE hides it otherwise)");
    strokeGroup.property("ADBE Vector Stroke Miter Limit").setValue(p.miterLimit);
  }
  if (p.dashes && p.dashes.length) {
    AEB.assert(p.dashes.length <= 3, "dashes supports at most 3 dash/gap pairs (AE UI limit)");
    var dashGroup = strokeGroup.property("ADBE Vector Stroke Dashes");
    for (var di = 0; di < p.dashes.length; di++) {
      var pair = p.dashes[di];
      var n = di + 1;
      if (pair.dash !== undefined) dashGroup.addProperty("ADBE Vector Stroke Dash " + n).setValue(pair.dash);
      if (pair.gap !== undefined) dashGroup.addProperty("ADBE Vector Stroke Gap " + n).setValue(pair.gap);
    }
    if (p.dashOffset !== undefined) {
      dashGroup.addProperty("ADBE Vector Stroke Offset").setValue(p.dashOffset);
    }
  }
  if (p.taper) {
    var taperGroup = strokeGroup.property("ADBE Vector Stroke Taper");
    var taperPx = (String(p.taper.lengthUnits).toLowerCase() === "pixels");
    if (p.taper.lengthUnits !== undefined) {
      taperGroup.property("ADBE Vector Taper Length Units").setValue(taperPx ? 2 : 1);
    }
    if (taperPx) {
      if (p.taper.startLengthPx !== undefined) taperGroup.property("ADBE Vector Taper StartWidthPx").setValue(p.taper.startLengthPx);
      if (p.taper.endLengthPx !== undefined) taperGroup.property("ADBE Vector Taper EndWidthPx").setValue(p.taper.endLengthPx);
    } else {
      if (p.taper.startLength !== undefined) taperGroup.property("ADBE Vector Taper Start Length").setValue(p.taper.startLength);
      if (p.taper.endLength !== undefined) taperGroup.property("ADBE Vector Taper End Length").setValue(p.taper.endLength);
    }
    if (p.taper.startWidth !== undefined) taperGroup.property("ADBE Vector Taper Start Width").setValue(p.taper.startWidth);
    if (p.taper.endWidth !== undefined) taperGroup.property("ADBE Vector Taper End Width").setValue(p.taper.endWidth);
    if (p.taper.startEase !== undefined) taperGroup.property("ADBE Vector Taper Start Ease").setValue(p.taper.startEase);
    if (p.taper.endEase !== undefined) taperGroup.property("ADBE Vector Taper End Ease").setValue(p.taper.endEase);
  }
  if (p.wave) {
    // wave.cycles is rejected by validate.js before this runs for normal
    // MCP calls — this is defense-in-depth for a caller that bypasses that
    // (e.g. runJSX). See the comment above this function for why.
    AEB.assert(p.wave.cycles === undefined, "wave.cycles cannot be set (AE does not allow scripting it — omit it)");
    var waveGroup = strokeGroup.property("ADBE Vector Stroke Wave");
    if (p.wave.units !== undefined) {
      waveGroup.property("ADBE Vector Taper Wave Units").setValue(String(p.wave.units).toLowerCase() === "pixels" ? 2 : 1);
    }
    if (p.wave.amount !== undefined) waveGroup.property("ADBE Vector Taper Wave Amount").setValue(p.wave.amount);
    if (p.wave.wavelength !== undefined) waveGroup.property("ADBE Vector Taper Wavelength").setValue(p.wave.wavelength);
    if (p.wave.phase !== undefined) waveGroup.property("ADBE Vector Taper Wave Phase").setValue(p.wave.phase);
  }
}

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
    // fillGradient/strokeGradient add a NATIVE AE gradient (ADBE Vector
    // Graphic - G-Fill/G-Stroke) — geometry only (type, points, scale,
    // rotation, highlight, opacity). Their stop COLORS are not settable:
    // the sub-property that holds them ("ADBE Vector Grad Colors") is
    // PropertyValueType.NO_VALUE — "Can not get or set a value from this
    // property" — confirmed live in AE 26.3x87, 2026-08-10, not a bug in
    // this bridge. A gradient added this way keeps whatever stop colors AE
    // assigns by default; for a gradient with chosen colors use
    // rampGradient below instead (a Gradient Ramp effect, fully scriptable).
    if (p.fillColor) {
      var fill = shapeGroup.addProperty("ADBE Vector Graphic - Fill");
      fill.property("ADBE Vector Fill Color").setValue(AEB.normColor(p.fillColor));
    } else if (p.fillGradient) {
      var gfill = shapeGroup.addProperty("ADBE Vector Graphic - G-Fill");
      _applyGradientGeometry(gfill, p.fillGradient, "ADBE Vector Fill Opacity");
    }
    if (p.strokeColor) {
      var stroke = shapeGroup.addProperty("ADBE Vector Graphic - Stroke");
      stroke.property("ADBE Vector Stroke Color").setValue(AEB.normColor(p.strokeColor));
      if (p.strokeWidth) stroke.property("ADBE Vector Stroke Width").setValue(p.strokeWidth);
      _applyStrokeStyle(stroke, p);
    } else if (p.strokeGradient) {
      var gstroke = shapeGroup.addProperty("ADBE Vector Graphic - G-Stroke");
      _applyGradientGeometry(gstroke, p.strokeGradient, "ADBE Vector Stroke Opacity");
      if (p.strokeWidth) gstroke.property("ADBE Vector Stroke Width").setValue(p.strokeWidth);
      _applyStrokeStyle(gstroke, p);
    } else {
      // lineCap/lineJoin/.../wave are meaningless without a stroke — no
      // silent no-op (shared/src/commands.js rejects this pre-socket; this
      // is defense-in-depth for a caller that bypasses that, e.g. runJSX).
      AEB.assert(
        p.lineCap === undefined && p.lineJoin === undefined && p.miterLimit === undefined &&
        p.dashes === undefined && p.dashOffset === undefined && p.taper === undefined && p.wave === undefined,
        "stroke style params (lineCap/lineJoin/miterLimit/dashes/dashOffset/taper/wave) require strokeColor or strokeGradient"
      );
    }
    // rampGradient: a real 2-color gradient with full color control, via the
    // Gradient Ramp effect (ADBE Ramp) applied on the layer — the working
    // alternative to fillGradient/strokeGradient's color limitation above.
    // Ramp recolors the layer's existing alpha; it needs SOME fill/stroke to
    // have put alpha there first, so if none was requested we add an
    // invisible-in-intent white fill purely as an alpha source (Ramp
    // overwrites its RGB entirely).
    if (p.rampGradient) {
      if (!p.fillColor && !p.fillGradient && !p.strokeColor && !p.strokeGradient) {
        shapeGroup.addProperty("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color").setValue([1, 1, 1]);
      }
      var ramp = AEB.effectsGroup(layer).addProperty("ADBE Ramp");
      ramp.property("ADBE Ramp-0002").setValue(AEB.color4(p.rampGradient.startColor));
      ramp.property("ADBE Ramp-0004").setValue(AEB.color4(p.rampGradient.endColor));
      if (p.rampGradient.startPoint) ramp.property("ADBE Ramp-0001").setValue(p.rampGradient.startPoint);
      if (p.rampGradient.endPoint) ramp.property("ADBE Ramp-0003").setValue(p.rampGradient.endPoint);
      var rampRadial = (String(p.rampGradient.type).toLowerCase() === "radial");
      ramp.property("ADBE Ramp-0005").setValue(rampRadial ? 2 : 1);
      if (p.rampGradient.scatter !== undefined) ramp.property("ADBE Ramp-0006").setValue(p.rampGradient.scatter);
      if (p.rampGradient.blendWithOriginal !== undefined) ramp.property("ADBE Ramp-0007").setValue(p.rampGradient.blendWithOriginal);
    }
    // groupTransform: the shape GROUP's own transform (ADBE Vector Transform
    // Group, a sibling of Contents inside Group 1) — separate from the
    // layer's main Transform. Lets content be offset/scaled/rotated around a
    // pivot independent of the layer's own anchor/position (e.g. a shape
    // that grows from a corner instead of its layer anchor). matchNames seen
    // live in the (22) gradient probe (none looked gated there) — live
    // settability confirmed for real here, see docs/DEVLOG.md 2026-08-10.
    if (p.groupTransform) {
      var gt = p.groupTransform;
      var xform = grp.property("ADBE Vector Transform Group");
      if (gt.anchorPoint !== undefined) xform.property("ADBE Vector Anchor").setValue(gt.anchorPoint);
      if (gt.position !== undefined) xform.property("ADBE Vector Position").setValue(gt.position);
      if (gt.scale !== undefined) xform.property("ADBE Vector Scale").setValue(gt.scale);
      if (gt.skew !== undefined) xform.property("ADBE Vector Skew").setValue(gt.skew);
      if (gt.skewAxis !== undefined) xform.property("ADBE Vector Skew Axis").setValue(gt.skewAxis);
      if (gt.rotation !== undefined) xform.property("ADBE Vector Rotation").setValue(gt.rotation);
      if (gt.opacity !== undefined) xform.property("ADBE Vector Group Opacity").setValue(gt.opacity);
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

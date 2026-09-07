// keyframe.jsx — keyframe + interpolation primitives (ES3). HLD §8.6-8.7.

function _kfDims(prop) {
  var v = prop.value;
  return (v && v.length !== undefined && typeof v !== "string") ? v.length : 1;
}

COMMANDS.setKeyframe = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  AEB.assert(p.time !== undefined, "time is required");
  AEB.assert(p.value !== undefined, "value is required");
  return AEB.undo("mograph-mcp: setKeyframe", function () {
    var prop = AEB.resolveProperty(layer, p.property);
    var value = p.value;
    if (prop.propertyValueType === PropertyValueType.SHAPE) {
      value = AEB.toShape(p.value);
      AEB.assertShapeVertexCounts(prop, [value]);
    }
    prop.setValueAtTime(p.time, value);
    return { ok: true, numKeys: prop.numKeys };
  });
};

// Bulk keyframes in one call (faster). times[] + values[] parallel arrays.
COMMANDS.setKeyframes = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  AEB.assert(p.times && p.times.length, "times[] is required");
  AEB.assert(p.values && p.values.length === p.times.length, "values[] must match times[]");
  return AEB.undo("mograph-mcp: setKeyframes", function () {
    var prop = AEB.resolveProperty(layer, p.property);
    var values = p.values;
    if (prop.propertyValueType === PropertyValueType.SHAPE) {
      var shapes = [];
      for (var si = 0; si < p.values.length; si++) shapes.push(AEB.toShape(p.values[si]));
      AEB.assertShapeVertexCounts(prop, shapes);
      values = shapes;
    }
    prop.setValuesAtTimes(p.times, values);
    // optional easing applied left->right after all keys exist (HLD gotcha)
    if (p.easyEase) {
      for (var k = 1; k <= prop.numKeys; k++) {
        var e = AEB.makeEases(prop, 33.3333, 33.3333, 0, 0);
        prop.setInterpolationTypeAtKey(k, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
        prop.setTemporalEaseAtKey(k, e.inA, e.outA);
      }
    }
    return { ok: true, numKeys: prop.numKeys };
  });
};

COMMANDS.setEase = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  AEB.assert(p.keyIndex >= 1, "keyIndex (1-based) is required");
  var inInf = (p.inInfluence !== undefined) ? p.inInfluence : 33.3333;
  var outInf = (p.outInfluence !== undefined) ? p.outInfluence : 33.3333;
  var inSpeed = p.inSpeed || 0, outSpeed = p.outSpeed || 0;
  return AEB.undo("mograph-mcp: setEase", function () {
    var prop = AEB.resolveProperty(layer, p.property);
    var e = AEB.makeEases(prop, inInf, outInf, inSpeed, outSpeed);
    prop.setInterpolationTypeAtKey(p.keyIndex, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
    prop.setTemporalEaseAtKey(p.keyIndex, e.inA, e.outA);
    return { ok: true };
  });
};

COMMANDS.setInterpolation = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  AEB.assert(p.keyIndex >= 1, "keyIndex (1-based) is required");
  var map = {
    linear: KeyframeInterpolationType.LINEAR,
    bezier: KeyframeInterpolationType.BEZIER,
    hold: KeyframeInterpolationType.HOLD
  };
  var inT = map[String(p.inType || "linear").toLowerCase()] || KeyframeInterpolationType.LINEAR;
  var outT = map[String(p.outType || p.inType || "linear").toLowerCase()] || inT;
  return AEB.undo("mograph-mcp: setInterpolation", function () {
    var prop = AEB.resolveProperty(layer, p.property);
    prop.setInterpolationTypeAtKey(p.keyIndex, inT, outT);
    return { ok: true };
  });
};

COMMANDS.removeKeyframes = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  return AEB.undo("mograph-mcp: removeKeyframes", function () {
    var prop = AEB.resolveProperty(layer, p.property);
    while (prop.numKeys > 0) prop.removeKey(1);
    return { ok: true };
  });
};

// --- keyframe copy/paste (copyKeyframes / copyKeyframesBatch / getEase) ----
// setKeyframe(s)/getProperty above only ever carried time+value — REAL
// temporal ease (property.keyInTemporalEase/keyOutTemporalEase, each an
// array of KeyframeEase{speed,influence} per dimension) and interpolation
// type were never read or written anywhere in this codebase. Reproducing an
// existing animation's easing meant sampling the curve at several times and
// reconstructing an approximation — not a real copy (docs/DEVLOG.md, noted
// twice before this was finally built). These three commands do the real
// thing: read every keyframe's time/value/ease/interpolation off a source
// property and reproduce it exactly on one or more targets.

function _kfEaseSnapshot(arr) {
  var out = [];
  for (var i = 0; i < arr.length; i++) out.push({ speed: arr[i].speed, influence: arr[i].influence });
  return out;
}

function _kfEaseArray(specs) {
  var out = [];
  for (var i = 0; i < specs.length; i++) out.push(new KeyframeEase(specs[i].speed, specs[i].influence));
  return out;
}

// Read every keyframe on `prop` — time, value, real temporal ease, and
// interpolation type. Ease/interpolation are best-effort (older prop types
// or edge cases that don't support them are simply omitted, not fatal).
function _kfSnapshot(prop) {
  var n = prop.numKeys;
  var keys = [];
  for (var k = 1; k <= n; k++) {
    var rec = { time: prop.keyTime(k), value: prop.keyValue(k) };
    try {
      rec.inInterpolationType = prop.keyInInterpolationType(k);
      rec.outInterpolationType = prop.keyOutInterpolationType(k);
    } catch (e) {}
    try {
      rec.inEase = _kfEaseSnapshot(prop.keyInTemporalEase(k));
      rec.outEase = _kfEaseSnapshot(prop.keyOutTemporalEase(k));
    } catch (e) {}
    keys.push(rec);
  }
  return keys;
}

// Rebuild `keys` (as produced by _kfSnapshot) on `prop`. This REPLACES
// whatever keyframes `prop` already had on it — a copy/paste, not a merge —
// so the target's pre-existing keys on this specific property don't survive.
// Everything else on the target layer (other properties, e.g. its own
// Anchor Point/Position) is untouched; this function never sees them.
function _kfApply(prop, keys) {
  while (prop.numKeys > 0) prop.removeKey(1);
  if (!keys.length) return;
  var times = [], values = [];
  for (var i = 0; i < keys.length; i++) { times.push(keys[i].time); values.push(keys[i].value); }
  prop.setValuesAtTimes(times, values);
  for (var k = 1; k <= keys.length; k++) {
    var rec = keys[k - 1];
    if (rec.inInterpolationType !== undefined && rec.outInterpolationType !== undefined) {
      prop.setInterpolationTypeAtKey(k, rec.inInterpolationType, rec.outInterpolationType);
    }
    if (rec.inEase && rec.outEase) {
      prop.setTemporalEaseAtKey(k, _kfEaseArray(rec.inEase), _kfEaseArray(rec.outEase));
    }
  }
}

// Resolve a { compId, layer, property } triple into the live objects. `layer`
// (not layer/layerName/layerIndex split three ways like elsewhere) accepts
// name OR index — same tolerance as everywhere else, just under one field
// name since this command has two independent layer refs (source/target).
function _kfResolve(compId, layerRef, propertyRef) {
  var comp = AEB.requireComp({ compId: compId });
  var layer = AEB.requireLayer(comp, { layer: layerRef });
  var prop = AEB.resolveProperty(layer, propertyRef);
  return { comp: comp, layer: layer, prop: prop };
}

// Read one keyframe's time/value/ease/interpolation directly (no copy
// involved) — useful on its own for inspecting an existing animation.
COMMANDS.getEase = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  var prop = AEB.resolveProperty(layer, p.property);
  AEB.assert(p.keyIndex >= 1, "keyIndex (1-based) is required");
  AEB.assert(p.keyIndex <= prop.numKeys,
    "keyIndex " + p.keyIndex + " out of range (property has " + prop.numKeys + " keys)");
  var out = { index: p.keyIndex, time: prop.keyTime(p.keyIndex), value: prop.keyValue(p.keyIndex) };
  try {
    out.inInterpolationType = String(prop.keyInInterpolationType(p.keyIndex));
    out.outInterpolationType = String(prop.keyOutInterpolationType(p.keyIndex));
  } catch (e) {}
  try {
    out.inEase = _kfEaseSnapshot(prop.keyInTemporalEase(p.keyIndex));
    out.outEase = _kfEaseSnapshot(prop.keyOutTemporalEase(p.keyIndex));
  } catch (e) {}
  return out;
};

// Copy every keyframe (time+value+real ease+interpolation) from one source
// property to ONE target property — a real copy/paste, not a resampled
// approximation. Clears the target's existing keyframes on that property
// first; touches nothing else on the target layer.
COMMANDS.copyKeyframes = function (p) {
  AEB.assert(p.sourceCompId !== undefined && p.sourceCompId !== null, "sourceCompId is required");
  AEB.assert(p.sourceLayer !== undefined && p.sourceLayer !== null, "sourceLayer is required");
  AEB.assert(p.sourceProperty !== undefined && p.sourceProperty !== null, "sourceProperty is required");
  AEB.assert(p.targetCompId !== undefined && p.targetCompId !== null, "targetCompId is required");
  AEB.assert(p.targetLayer !== undefined && p.targetLayer !== null, "targetLayer is required");
  var targetProperty = (p.targetProperty !== undefined && p.targetProperty !== null) ? p.targetProperty : p.sourceProperty;

  var src = _kfResolve(p.sourceCompId, p.sourceLayer, p.sourceProperty);
  var keys = _kfSnapshot(src.prop);
  AEB.assert(keys.length > 0, "source property has no keyframes to copy");

  return AEB.undo("mograph-mcp: copyKeyframes", function () {
    var tgt = _kfResolve(p.targetCompId, p.targetLayer, targetProperty);
    _kfApply(tgt.prop, keys);
    return {
      ok: true, numKeys: keys.length,
      source: { compId: src.comp.id, layer: src.layer.name, property: src.prop.name },
      target: { compId: tgt.comp.id, layer: tgt.layer.name, property: tgt.prop.name }
    };
  });
};

// Same, but fans one source out to many targets in a single call/undo step —
// batched for performance (docs/ROADMAP.md batch philosophy; error-handling
// mirrors advanced.jsx's `batch`: a bad target is collected as { ok:false,
// error } and the rest still run, unless stopOnError is set).
COMMANDS.copyKeyframesBatch = function (p) {
  AEB.assert(p.sourceCompId !== undefined && p.sourceCompId !== null, "sourceCompId is required");
  AEB.assert(p.sourceLayer !== undefined && p.sourceLayer !== null, "sourceLayer is required");
  AEB.assert(p.sourceProperty !== undefined && p.sourceProperty !== null, "sourceProperty is required");
  AEB.assert(p.targets && p.targets.length, "targets[] is required");

  var src = _kfResolve(p.sourceCompId, p.sourceLayer, p.sourceProperty);
  var keys = _kfSnapshot(src.prop);
  AEB.assert(keys.length > 0, "source property has no keyframes to copy");

  return AEB.undo(p.undoName || "mograph-mcp: copyKeyframesBatch", function () {
    var results = [];
    for (var i = 0; i < p.targets.length; i++) {
      var t = p.targets[i] || {};
      try {
        AEB.assert(t.compId !== undefined && t.compId !== null, "targets[" + i + "].compId is required");
        AEB.assert(t.layer !== undefined && t.layer !== null, "targets[" + i + "].layer is required");
        var propRef = (t.property !== undefined && t.property !== null) ? t.property : p.sourceProperty;
        var tgt = _kfResolve(t.compId, t.layer, propRef);
        _kfApply(tgt.prop, keys);
        results.push({ ok: true, compId: tgt.comp.id, layer: tgt.layer.name, property: tgt.prop.name });
      } catch (e) {
        results.push({ ok: false, compId: t.compId, layer: t.layer, error: (e && e.toString) ? e.toString() : "error" });
        if (p.stopOnError) break;
      }
    }
    var okCount = 0;
    for (var j = 0; j < results.length; j++) if (results[j].ok) okCount++;
    return {
      ok: true, numKeys: keys.length,
      source: { compId: src.comp.id, layer: src.layer.name, property: src.prop.name },
      count: results.length, succeeded: okCount, failed: results.length - okCount, targets: results
    };
  });
};

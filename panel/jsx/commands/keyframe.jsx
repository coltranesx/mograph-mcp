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

// --- separateDimensions ----------------------------------------------------
// Toggle "Separate Dimensions" (Property.dimensionsSeparated) on a
// separation-leader property (Position). Once separated, the X/Y(/Z) followers
// ("ADBE Position_0"/"_1"/"_2", reached via property path
// ["ADBE Transform Group","ADBE Position_1"]) are ordinary 1-D, non-spatial
// properties, so every keyframe/ease/expression command works on them through
// the normal AEB.resolveProperty array-path branch — no special casing.
// Why it exists: the spatial Position property cannot overshoot its last key
// along the path (outBack-style eases); a scalar follower can.
COMMANDS.separateDimensions = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  var separated = (p.separated !== false);
  var ref = (p.property === undefined || p.property === null) ? "position" : p.property;
  return AEB.undo("mograph-mcp: separateDimensions", function () {
    var prop = null;
    if (typeof ref === "string" && !AEB.TRANSFORM[ref.toLowerCase()]) {
      // matchName such as "ADBE Position": look under the Transform group first.
      try { prop = layer.property("ADBE Transform Group").property(ref); } catch (e) { prop = null; }
    }
    if (!prop) prop = AEB.resolveProperty(layer, ref);
    var leader = false;
    try { leader = !!prop.isSeparationLeader; } catch (e) {}
    AEB.assert(leader, 'Property "' + prop.name + '" (' + prop.matchName +
      ') is not a separation leader — only Position (and similar) supports separated dimensions');
    prop.dimensionsSeparated = separated;
    AEB.assert(!!prop.dimensionsSeparated === separated,
      "AE did not apply dimensionsSeparated=" + separated + " on " + prop.matchName);
    var followers = [], followerNames = [];
    if (separated) {
      var v = prop.value;
      var n = (v && v.length !== undefined) ? v.length : 2;
      for (var d = 0; d < n; d++) {
        var f = prop.getSeparationFollower(d);
        followers.push(f.matchName);
        followerNames.push(f.name);
      }
    }
    return { ok: true, separated: separated, leader: prop.matchName, followers: followers, followerNames: followerNames };
  });
};

// --- shiftKeyframes --------------------------------------------------------
// Move keyframes in time WITHOUT losing anything. The old recipe
// (removeKeyframes + setKeyframe + setInterpolation + setEase) only ever
// carried time/value/interpolation/temporal-ease, silently dropping spatial
// tangents, roving, continuous/auto-bezier flags, per-dimension ease and
// labels. Here every key's full attribute set is read first, then the moved
// keys are removed and re-added at time+offset with ALL of it re-applied.
// Unmoved keys are never touched. Expressions live on the property, not on
// keys, so they are left as-is.
//
// Safety: the whole plan (every layer/property/key) is built and
// collision-checked BEFORE anything is modified — if any shifted key would
// land on an UNMOVED key's time, the command throws and changes nothing.

// Read every attribute of key k. Each optional API is guarded: older AE
// versions (keyLabel) or property kinds (spatial/roving on 1-D props) that
// do not support it are simply omitted from the record.
function _shReadKey(prop, k, spatial) {
  var rec = { time: prop.keyTime(k), value: prop.keyValue(k) };
  try {
    rec.inType = prop.keyInInterpolationType(k);
    rec.outType = prop.keyOutInterpolationType(k);
  } catch (e1) {}
  try {
    rec.inEase = _kfEaseSnapshot(prop.keyInTemporalEase(k));
    rec.outEase = _kfEaseSnapshot(prop.keyOutTemporalEase(k));
  } catch (e2) {}
  try { rec.tempContinuous = prop.keyTemporalContinuous(k); } catch (e3) {}
  try { rec.tempAutoBezier = prop.keyTemporalAutoBezier(k); } catch (e4) {}
  if (spatial) {
    try {
      rec.inTan = prop.keyInSpatialTangent(k);
      rec.outTan = prop.keyOutSpatialTangent(k);
    } catch (e5) {}
    try { rec.spatContinuous = prop.keySpatialContinuous(k); } catch (e6) {}
    try { rec.spatAutoBezier = prop.keySpatialAutoBezier(k); } catch (e7) {}
    try { rec.roving = prop.keyRoving(k); } catch (e8) {}
  }
  try { rec.label = prop.keyLabel(k); } catch (e9) {}
  return rec;
}

// AE reports influence 0 on some keys (e.g. next to a hold/linear side) but
// setTemporalEaseAtKey rejects anything outside 0.1..100 — confirmed live
// 2026-09-30: the write threw, was swallowed, and the re-added key kept AE's
// default ease (visible curve change). Clamp to the settable range instead.
function _shEaseArray(specs) {
  var out = [];
  for (var i = 0; i < specs.length; i++) {
    var inf = specs[i].influence;
    if (!(inf >= 0.1)) inf = 0.1;
    if (inf > 100) inf = 100;
    out.push(new KeyframeEase(specs[i].speed, inf));
  }
  return out;
}

// Re-apply a record onto key index idx. Interpolation type first so the
// ease lands on the right side types, then ease (which can flip a side to
// bezier), then the type again to undo any such flip, then the
// continuous/auto-bezier flags (auto-bezier recomputes handles, so it must
// come after the explicit values it would otherwise overwrite).
// Roving is applied later, once every key is in place (see _shApplyProp).
// Returns a list of warnings instead of silently swallowing failed writes.
function _shWriteKey(prop, idx, rec, spatial) {
  var warn = [];
  var hasType = rec.inType !== undefined && rec.outType !== undefined;
  if (hasType) prop.setInterpolationTypeAtKey(idx, rec.inType, rec.outType);
  if (rec.inEase && rec.outEase) {
    try { prop.setTemporalEaseAtKey(idx, _shEaseArray(rec.inEase), _shEaseArray(rec.outEase)); }
    catch (e1) { warn.push("ease not restored on key at " + rec.newTime + "s: " + e1.toString()); }
  }
  if (hasType) prop.setInterpolationTypeAtKey(idx, rec.inType, rec.outType);
  if (rec.tempContinuous !== undefined) { try { prop.setTemporalContinuousAtKey(idx, rec.tempContinuous); } catch (e2) {} }
  if (rec.tempAutoBezier !== undefined) { try { prop.setTemporalAutoBezierAtKey(idx, rec.tempAutoBezier); } catch (e3) {} }
  if (spatial) {
    if (rec.inTan && rec.outTan && !rec.spatAutoBezier) {
      try { prop.setSpatialTangentsAtKey(idx, rec.inTan, rec.outTan); } catch (e4) {}
    }
    if (rec.spatContinuous !== undefined) { try { prop.setSpatialContinuousAtKey(idx, rec.spatContinuous); } catch (e5) {} }
    if (rec.spatAutoBezier !== undefined) { try { prop.setSpatialAutoBezierAtKey(idx, rec.spatAutoBezier); } catch (e6) {} }
  }
  if (rec.label !== undefined) { try { prop.setLabelAtKey(idx, rec.label); } catch (e7) {} }
  return warn;
}

function _shIsSpatial(prop) {
  try { return !!prop.isSpatial; } catch (e) { return false; }
}

// Depth-first collect of every keyframed Property under `group` (a layer or
// property group), skipping markers. path = display names from the layer.
function _shWalk(group, path, out) {
  var n = 0;
  try { n = group.numProperties; } catch (e) { return; }
  for (var i = 1; i <= n; i++) {
    var child = null;
    try { child = group.property(i); } catch (e2) { child = null; }
    if (!child) continue;
    var mn = "";
    try { mn = child.matchName; } catch (e3) {}
    if (mn === "ADBE Marker") continue;
    var childPath = path.concat([child.name]);
    var isProp = false;
    try { isProp = (child.propertyType === PropertyType.PROPERTY); } catch (e4) {}
    if (isProp) {
      var nk = 0;
      try { nk = child.numKeys; } catch (e5) { nk = 0; }
      if (nk > 0) out.push({ prop: child, path: childPath, matchName: mn });
    } else {
      _shWalk(child, childPath, out);
    }
  }
}

function _shTimeInRange(t, range, eps) {
  if (!range) return true;
  if (range.from !== undefined && range.from !== null && t < range.from - eps) return false;
  if (range.to !== undefined && range.to !== null && t > range.to + eps) return false;
  return true;
}

// Plan one property: snapshot all keys, decide which move, detect collisions.
function _shPlanProp(entry, p, offset, eps, layerName, conflicts) {
  var prop = entry.prop;
  var spatial = _shIsSpatial(prop);
  var n = prop.numKeys;
  var pick = null;
  if (p.keyIndices) {
    pick = {};
    for (var ii = 0; ii < p.keyIndices.length; ii++) pick[p.keyIndices[ii]] = true;
  }
  var keys = [], moved = [], unmovedTimes = [];
  for (var k = 1; k <= n; k++) {
    var rec = _shReadKey(prop, k, spatial);
    rec.oldIndex = k;
    var move = _shTimeInRange(rec.time, p.timeRange, eps) && (!pick || pick[k] === true);
    rec.move = move;
    keys.push(rec);
    if (move) moved.push(rec); else unmovedTimes.push(rec.time);
  }
  for (var m = 0; m < moved.length; m++) {
    var nt = moved[m].time + offset;
    moved[m].newTime = nt;
    for (var u = 0; u < unmovedTimes.length; u++) {
      if (Math.abs(unmovedTimes[u] - nt) <= eps) {
        conflicts.push(layerName + " > " + entry.path.join(" > ") + ": key " + moved[m].oldIndex +
          " (" + moved[m].time + "s) would land on unmoved key at " + unmovedTimes[u] + "s");
      }
    }
  }
  return { prop: prop, path: entry.path, matchName: entry.matchName, spatial: spatial, keys: keys, moved: moved };
}

// Perform the move for one planned property. Returns the times before/after
// (after = read back from AE, so roving/rounding effects are reported truthfully).
function _shApplyProp(plan, eps) {
  var prop = plan.prop, moved = plan.moved, i, idx, warnings = [];
  // 1) remove moved keys, highest index first so lower indices stay valid
  for (i = moved.length - 1; i >= 0; i--) prop.removeKey(moved[i].oldIndex);
  // 2) re-add at the new time, all attributes restored. Ascending by new time
  //    (removal above guarantees no moved key can collide with another).
  var order = moved.slice(0).sort(function (a, b) { return a.newTime - b.newTime; });
  for (i = 0; i < order.length; i++) {
    var rec = order[i];
    prop.setValueAtTime(rec.newTime, rec.value);
    idx = prop.nearestKeyIndex(rec.newTime);
    AEB.assert(Math.abs(prop.keyTime(idx) - rec.newTime) <= eps,
      "shiftKeyframes: key did not land at " + rec.newTime + "s on " + plan.path.join(" > "));
    warnings = warnings.concat(_shWriteKey(prop, idx, rec, plan.spatial));
  }
  // 3) roving last: it recomputes a key's time from its neighbours, so it can
  //    only be switched on once every key is in place.
  if (plan.spatial) {
    for (i = 0; i < order.length; i++) {
      if (order[i].roving === true) {
        idx = prop.nearestKeyIndex(order[i].newTime);
        try { prop.setRovingAtKey(idx, true); } catch (e) {}
      }
    }
  }
  var after = [];
  for (var k = 1; k <= prop.numKeys; k++) after.push(prop.keyTime(k));
  return { times: after, warnings: warnings };
}

COMMANDS.shiftKeyframes = function (p) {
  var comp = AEB.requireComp(p);
  AEB.assert(typeof p.offset === "number" && isFinite(p.offset), "offset (seconds, number) is required");
  var offset = p.offset;
  var fd = (comp.frameRate > 0) ? 1 / comp.frameRate : 0.04;
  var eps = fd * 0.01;
  if (p.timeRange) {
    AEB.assert(typeof p.timeRange === "object" && (p.timeRange.from !== undefined || p.timeRange.to !== undefined),
      "timeRange must be { from?, to? } in seconds");
  }
  if (p.keyIndices) {
    AEB.assert(p.keyIndices.length !== undefined && p.property !== undefined && p.property !== null,
      "keyIndices[] (1-based) requires an explicit property");
  }

  // --- resolve target layers --------------------------------------------
  var layers = [], seen = {}, i;
  function addLayer(l) { if (!seen[l.index]) { seen[l.index] = true; layers.push(l); } }
  var hasRef = (p.layer !== undefined && p.layer !== null) || (p.layerName !== undefined && p.layerName !== null) ||
    (p.layerIndex !== undefined && p.layerIndex !== null);
  var wide = (p.allLayers === true) || (!hasRef && !p.layers && p.layerType);
  AEB.assert(hasRef || p.layers || wide, "specify layer, layers[], allLayers:true or layerType");
  if (hasRef) addLayer(AEB.requireLayer(comp, p));
  if (p.layers) for (i = 0; i < p.layers.length; i++) addLayer(AEB.resolveLayer(comp, p.layers[i]));
  if (wide) for (i = 1; i <= comp.numLayers; i++) addLayer(comp.layer(i));
  if (p.layerType) {
    var want = String(p.layerType).toLowerCase(), kept = [];
    for (i = 0; i < layers.length; i++) if (AEB.layerType(layers[i]) === want) kept.push(layers[i]);
    layers = kept;
  }
  var explicit = !wide;

  // --- plan (read-only) ---------------------------------------------------
  var plans = [], conflicts = [], skipped = [], propFound = 0;
  for (i = 0; i < layers.length; i++) {
    var layer = layers[i];
    var entries = [];
    if (p.property !== undefined && p.property !== null) {
      var one = null;
      try { one = AEB.resolveProperty(layer, p.property); } catch (e) { one = null; }
      if (one) {
        propFound++;
        var pth = (typeof p.property === "string") ? [p.property] : p.property;
        if (one.numKeys > 0) entries.push({ prop: one, path: pth, matchName: one.matchName });
      } else if (!explicit || layers.length > 1) {
        skipped.push({ layer: layer.name, reason: "property not found" });
        continue;
      }
    } else {
      _shWalk(layer, [], entries);
    }
    if (!entries.length) continue;
    if (layer.locked) {
      AEB.assert(wide, 'Layer "' + layer.name + '" is locked');
      skipped.push({ layer: layer.name, reason: "locked" });
      continue;
    }
    var lp = { layer: layer, props: [] };
    for (var e2 = 0; e2 < entries.length; e2++) {
      var pl = _shPlanProp(entries[e2], p, offset, eps, layer.name, conflicts);
      if (pl.moved.length) lp.props.push(pl);
    }
    if (lp.props.length) plans.push(lp);
  }
  if (p.property !== undefined && p.property !== null) {
    AEB.assert(propFound > 0, "Property not found on any targeted layer: " + (typeof p.property === "string" ? p.property : p.property.join(" > ")));
  }
  AEB.assert(!conflicts.length, "shiftKeyframes refused (nothing changed): " + conflicts.join("; "));

  var frac = Math.abs(offset / fd);
  var offFrame = Math.abs(frac - Math.round(frac)) > 0.01;

  // --- apply ----------------------------------------------------------------
  function run() {
    var outLayers = [], totalMoved = 0, totalWarnings = 0;
    for (var a = 0; a < plans.length; a++) {
      var props = [];
      for (var b = 0; b < plans[a].props.length; b++) {
        var pl2 = plans[a].props[b];
        var oldTimes = [], j;
        for (j = 0; j < pl2.keys.length; j++) oldTimes.push(pl2.keys[j].time);
        var newTimes, warnings = [];
        if (p.dryRun === true) {
          newTimes = [];
          for (j = 0; j < pl2.keys.length; j++) newTimes.push(pl2.keys[j].move ? pl2.keys[j].time + offset : pl2.keys[j].time);
          newTimes.sort(function (x, y) { return x - y; });
        } else {
          try {
            var applied = _shApplyProp(pl2, eps);
            newTimes = applied.times; warnings = applied.warnings;
          } catch (err) {
            throw new Error("shiftKeyframes failed on " + plans[a].layer.name + " > " + pl2.path.join(" > ") +
              " (property may be partially modified; run undo): " + ((err && err.message) ? err.message : String(err)));
          }
        }
        totalMoved += pl2.moved.length;
        props.push({ path: pl2.path, matchName: pl2.matchName, numKeys: pl2.keys.length,
          moved: pl2.moved.length, oldTimes: oldTimes, newTimes: newTimes, warnings: warnings });
        totalWarnings += warnings.length;
      }
      outLayers.push({ index: plans[a].layer.index, name: plans[a].layer.name, properties: props });
    }
    return { ok: true, dryRun: p.dryRun === true, offset: offset, offFrame: offFrame, movedKeys: totalMoved,
      warnings: totalWarnings, layers: outLayers, skipped: skipped };
  }
  if (p.dryRun === true) return run();
  return AEB.undo("mograph-mcp: shiftKeyframes", run);
};

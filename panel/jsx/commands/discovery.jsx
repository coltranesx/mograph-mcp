// discovery.jsx — read-only "what's installed" commands (ES3).
// listFonts is solid (postScriptName is authoritative). listInstalledEffects is
// best-effort (probes a known name set). getEnvironment + findEffectMatchName are
// extra discovery helpers. (listPlugins is panel-side — see panel/src/discovery.js.)

// --- listFonts -------------------------------------------------------------
// AE 2024+ exposes app.fonts. In practice the Font object only reveals its
// postScriptName via toString(); family/style are not readable directly, so we
// derive them (and say so). postScriptName is what setTextDocument targets.
function _famStyle(ps) {
  var fam = ps, style = "Regular";
  var dash = ps.lastIndexOf("-");
  if (dash > 0) { fam = ps.substring(0, dash); style = ps.substring(dash + 1); }
  fam = fam.replace(/MT$/, "").replace(/PS$/, "");
  style = style.replace(/MT$/, "");
  if (!style) style = "Regular";
  // de-camel the family a touch ("TimesNewRoman" -> "Times New Roman")
  fam = fam.replace(/([a-z])([A-Z])/g, "$1 $2");
  return { family: fam, style: style };
}

COMMANDS.listFonts = function (p) {
  p = p || {};
  AEB.assert(typeof app.fonts !== "undefined" && app.fonts, "app.fonts is not available (needs AE 2024+)");
  // app.fonts.allFonts is grouped by family: each element is an array of variant
  // Font objects (toString() == that variant's postScriptName). Flatten it.
  var all = app.fonts.allFonts;
  var filter = p.filter ? String(p.filter).toLowerCase() : null;
  var limit = (p.limit !== undefined) ? p.limit : 1000;
  var fonts = [], seen = {}, total = 0;
  for (var i = 0; i < all.length; i++) {
    var grp = all[i];
    var variants = (grp && typeof grp.length === "number") ? grp : [grp];
    for (var j = 0; j < variants.length; j++) {
      var ps = String(variants[j]); // single postScriptName
      if (!ps || seen[ps]) continue;
      seen[ps] = true;
      total++;
      if (filter && ps.toLowerCase().indexOf(filter) < 0) continue;
      if (fonts.length < limit) {
        var fs = _famStyle(ps);
        fonts.push({ postScriptName: ps, family: fs.family, style: fs.style });
      }
    }
  }
  return {
    count: fonts.length, totalInstalled: total, fonts: fonts,
    note: "postScriptName is authoritative; family/style are derived (AE's Font object does not expose them via scripting)."
  };
};

// --- listInstalledEffects ---------------------------------------------------
// app.effects (= app.internalEffects) is a REAL enumeration API — confirmed
// live 2026-08-09 (AE 26.3x87): every installed effect as
// {displayName, matchName, category, version, isDeprecated}, no probing/
// guessing/hardcoded-list needed (previously this probed a hand-maintained
// ~157-name list on a throwaway layer, finding 149; app.effects finds all
// 446 and picks up any newly installed plugin automatically). See
// docs/ROADMAP.md "listInstalledEffects → app.effects" for the history.
COMMANDS.listInstalledEffects = function (p) {
  p = p || {};
  var all = app.effects;
  AEB.assert(all, "app.effects is not available on this After Effects version");
  var wanted = null;
  if (p.names && p.names.length) {
    wanted = {};
    for (var w = 0; w < p.names.length; w++) wanted[p.names[w]] = true;
  }
  var effects = [];
  for (var i = 0; i < all.length; i++) {
    var e = all[i];
    if (wanted && !wanted[e.displayName]) continue;
    effects.push({
      name: e.displayName, matchName: e.matchName,
      category: e.category, version: e.version, isDeprecated: !!e.isDeprecated
    });
  }
  return {
    count: effects.length, totalInstalled: all.length, effects: effects,
    note: "Real-time enumeration via app.effects — every installed effect, no probing. Pass params.names to filter to specific display names."
  };
};

// Resolve a single effect display name to its matchName (or null) — a direct
// app.effects lookup, no throwaway layer/comp needed.
COMMANDS.findEffectMatchName = function (p) {
  AEB.assert(p && p.name, "name (effect display name) is required");
  var all = app.effects;
  AEB.assert(all, "app.effects is not available on this After Effects version");
  for (var i = 0; i < all.length; i++) {
    if (all[i].displayName === p.name) {
      return { name: p.name, matchName: all[i].matchName, installed: true };
    }
  }
  return { name: p.name, matchName: null, installed: false };
};

// --- introspectEffect ------------------------------------------------------
// Add an effect (by display name OR matchName) to a throwaway layer and dump
// its full parameter tree: each param's name + matchName (what setValue targets)
// + value type + default value. This is how you wire ANY third-party plugin —
// you learn the exact param matchNames without opening AE. Pass { name } or
// { names:[...] }, optional { depth } (default 2).
function _vtName(vt) {
  try {
    var P = PropertyValueType;
    if (vt === P.NO_VALUE) return "GROUP";
    if (vt === P.OneD) return "OneD";
    if (vt === P.TwoD || vt === P.TwoD_SPATIAL) return "TwoD";
    if (vt === P.ThreeD || vt === P.ThreeD_SPATIAL) return "ThreeD";
    if (vt === P.COLOR) return "Color";
    if (vt === P.LAYER_INDEX) return "LayerIndex";
    if (vt === P.MASK_INDEX) return "MaskIndex";
    if (vt === P.SHAPE) return "Shape";
    if (vt === P.TEXT_DOCUMENT) return "Text";
    if (vt === P.CUSTOM_VALUE) return "Custom";
    if (vt === P.MARKER) return "Marker";
  } catch (e) {}
  return String(vt);
}
function _fxParamTree(prop, depth) {
  var out = [];
  if (depth < 0) return out;
  var n = 0; try { n = prop.numProperties || 0; } catch (e) {}
  for (var i = 1; i <= n; i++) {
    var c; try { c = prop.property(i); } catch (e) { continue; }
    var node = { name: c.name, matchName: c.matchName };
    var cn = 0; try { cn = c.numProperties || 0; } catch (e) {}
    if (cn > 0 && depth > 0) {
      node.children = _fxParamTree(c, depth - 1);
    } else {
      try { if (c.propertyValueType !== undefined) node.valueType = _vtName(c.propertyValueType); } catch (e) {}
      try { node.value = c.value; } catch (e) {}
      try { if (c.expressionEnabled) node.expression = c.expression; } catch (e) {}
    }
    out.push(node);
  }
  return out;
}

COMMANDS.introspectEffect = function (p) {
  p = p || {};
  var names = [];
  if (p.names && p.names.length) names = p.names;
  else if (p.name) names = [p.name];
  AEB.assert(names.length, "name (or names[]) is required");
  var depth = (p.depth !== undefined) ? p.depth : 2;
  var comp = app.project.items.addComp("__introspectFX", 64, 64, 1, 0.2, 30);
  var results = [];
  try {
    var solid = comp.layers.addSolid([0, 0, 0], "s", 64, 64, 1);
    var fx = solid.property("ADBE Effect Parade");
    for (var k = 0; k < names.length; k++) {
      var nm = names[k];
      var entry = { requested: nm, installed: false, matchName: null, paramCount: 0, params: [] };
      try {
        if (fx.canAddProperty(nm)) {
          var e = fx.addProperty(nm);
          entry.installed = true;
          entry.matchName = e.matchName;
          entry.name = e.name;
          try { entry.paramCount = e.numProperties; } catch (er) {}
          entry.params = _fxParamTree(e, depth);
          e.remove();
        }
      } catch (er) { entry.error = String(er); }
      results.push(entry);
    }
  } finally { comp.remove(); }
  return { count: results.length, effects: results };
};

// --- getEnvironment --------------------------------------------------------
COMMANDS.getEnvironment = function () {
  var env = { aeVersion: app.version, buildName: app.buildName };
  try { env.extendScript = $.version; } catch (e) {}
  try { env.os = $.os; } catch (e) {}
  try { env.locale = $.locale; } catch (e) {}
  try { env.language = String(app.isoLanguage); } catch (e) {}
  try { env.fontCount = app.fonts.allFonts.length; } catch (e) {}
  try { env.projectPath = app.project.file ? app.project.file.fsName : null; } catch (e) {}
  try { env.numItems = app.project.numItems; } catch (e) {}
  try { env.memoryInUseMB = Math.round(app.memoryInUse / 1048576); } catch (e) {}
  try { env.availableGPUAccelTypes = String(app.availableGPUAccelTypes); } catch (e) {}
  return env;
};

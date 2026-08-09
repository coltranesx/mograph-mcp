// commands.js — the command registry. Mirrors the JSX COMMANDS dispatch table
// so bad calls fail fast on the controller before crossing the socket.
//
// Each entry: { description, dev?, validate(params) -> normalizedParams }.
// validate() throws ValidationError on bad input and returns a normalized
// params object (defaults applied) on success.

import { v, isPlainObject, ValidationError } from './validate.js';
import { loadConfig } from './config.js';

export const COMMANDS = {
  ping: {
    description: 'Liveness check. Returns { pong, ae } (AE version when run in-host).',
    validate() {
      return {};
    },
  },

  getProjectInfo: {
    description: 'Project summary: { name, path, numItems, activeComp }.',
    validate() {
      return {};
    },
  },

  listComps: {
    description: 'List comps: [{ id, name, width, height, duration, frameRate }].',
    validate() {
      return {};
    },
  },

  createComp: {
    description:
      'Create a composition. width/height/duration/frameRate fall back to config.json ' +
      'defaults; { preset } (hd|vertical|square|portrait, see config.json) fills them in ' +
      'first and explicit params still win. Returns { compId, name }.',
    validate(p) {
      const { defaults, presets } = loadConfig();
      const preset = v.optionalString(p, 'preset');
      let base = defaults;
      if (preset !== undefined) {
        if (!presets[preset]) {
          throw new ValidationError(
            `preset must be one of: ${Object.keys(presets).join(', ')} (got "${preset}")`,
          );
        }
        base = { ...defaults, ...presets[preset] };
      }
      return {
        name: v.requiredString(p, 'name'),
        width: v.optionalPositiveInt(p, 'width', base.width),
        height: v.optionalPositiveInt(p, 'height', base.height),
        duration: v.optionalPositiveNumber(p, 'duration', base.duration),
        frameRate: v.optionalPositiveNumber(p, 'frameRate', base.frameRate),
      };
    },
  },

  addSolid: {
    description: 'Add a solid layer to a comp. Returns { layerIndex }.',
    validate(p) {
      return {
        compId: v.requiredInt(p, 'compId'),
        name: v.optionalString(p, 'name', 'Solid'),
        color: v.optionalColor(p, 'color', [0.5, 0.5, 0.5]),
        width: v.optionalPositiveInt(p, 'width'),
        height: v.optionalPositiveInt(p, 'height'),
      };
    },
  },

  addTextLayer: {
    description: 'Add a text layer to a comp. Returns { layerIndex }.',
    validate(p) {
      return {
        compId: v.requiredInt(p, 'compId'),
        text: v.requiredString(p, 'text'),
        fontSize: v.optionalPositiveNumber(p, 'fontSize'),
        position: v.optionalPoint(p, 'position'),
      };
    },
  },

  setLayerProperty: {
    description:
      'Set a layer property (position|scale|rotation|opacity|name|enabled|startTime). Returns { ok }.',
    validate(p) {
      const property = v.requiredString(p, 'property');
      const allowed = [
        'position',
        'scale',
        'rotation',
        'opacity',
        'name',
        'enabled',
        'startTime',
      ];
      if (!allowed.includes(property)) {
        throw new ValidationError(
          `property must be one of: ${allowed.join(', ')} (got "${property}")`,
        );
      }
      return {
        compId: v.requiredInt(p, 'compId'),
        layerIndex: v.requiredPositiveInt(p, 'layerIndex'),
        property,
        value: v.required(p, 'value'),
      };
    },
  },

  render: {
    description:
      'Render a comp to a file. Async: returns { jobId, status } immediately; ' +
      'progress arrives as `progress` events; completion as a `renderComplete` event.',
    validate(p) {
      return {
        compId: v.requiredInt(p, 'compId'),
        outputPath: v.requiredString(p, 'outputPath'),
        settingsTemplate: v.optionalString(p, 'settingsTemplate'),
        outputModuleTemplate: v.optionalString(p, 'outputModuleTemplate'),
        format: v.optionalString(p, 'format'),
        startFrame: (p.startFrame === undefined || p.startFrame === null) ? undefined : p.startFrame,
        endFrame: (p.endFrame === undefined || p.endFrame === null) ? undefined : p.endFrame,
      };
    },
  },

  runJSX: {
    description: 'DEV ONLY. Eval raw ExtendScript. Gated behind controller dev flag.',
    dev: true,
    validate(p) {
      return { script: v.requiredString(p, 'script') };
    },
  },
};

// ===========================================================================
// v2 / HLD command vocabulary. Light validation here (the JSX layer validates
// thoroughly); the registry's job is to gate known command NAMES and catch
// obviously-malformed calls before they cross the socket. Layer references may
// be an index (number) or a name (string) per the HLD "address by name" rule.
// ===========================================================================
function requireFields(p, names) {
  for (const n of names) {
    if (p[n] === undefined || p[n] === null) {
      throw new ValidationError(`${n} is required`);
    }
  }
  return { ...p };
}
const pass = (...required) => ({ validate: (p) => requireFields(p, required) });
const withDesc = (description, required) => ({ description, validate: (p) => requireFields(p, required) });

// Shape operators (Trim Paths, Repeater, ...) live inside a shape layer's
// vector-group tree as PropertyGroup children, added via addProperty(matchName)
// — not addEffect(), and NOT guarded by canAddProperty() the way addEffect is
// (canAddProperty has been observed to give misleading answers on vector
// groups; see docs/DEVLOG.md). Calling addProperty() on a vector group with a
// matchName AE doesn't recognize is not a catchable ExtendScript exception
// here — it has produced a modal dialog once and crashed After Effects
// outright once, in earlier live testing (docs/DEVLOG.md 2026-08-09). So this
// whitelist is deliberately narrower than the full candidate list in
// docs/ROADMAP.md "Faz 1.B": only matchNames actually confirmed live are
// enabled. To add one: confirm it live yourself (disposable comp, expect a
// possible crash, don't do it in a session with unsaved work), then move it
// here — don't add from memory/guesswork.
const SHAPE_OPERATORS = {
  trim: 'ADBE Vector Filter - Trim',
  repeater: 'ADBE Vector Filter - Repeater',
};
// Candidates from docs/ROADMAP.md "Faz 1.B" — named here only so the
// rejection error can say "known candidate, not yet confirmed" instead of
// just "unknown"; NOT callable.
const SHAPE_OPERATORS_PENDING = new Set([
  'offset', 'zigzag', 'roundCorners', 'wigglePath', 'wiggleTransform',
  'puckerBloat', 'twist', 'mergePaths',
]);

Object.assign(COMMANDS, {
  // layers
  addNull: withDesc('Add a null layer. { compId, name?, duration? }', ['compId']),
  addAdjustmentLayer: withDesc('Add an adjustment layer. { compId, name? }', ['compId']),
  addCamera: withDesc('Add a camera. { compId, name?, center? }', ['compId']),
  addLight: withDesc('Add a light. { compId, name?, lightType?, center? }', ['compId']),
  addShape: {
    description:
      'Add a shape layer. { compId, shape? (rectangle|ellipse|polystar, default rectangle), size? ([w,h], rectangle/ellipse only), ' +
      'polyType? (star|polygon, default star, polystar only), points? (int >=3, polystar only), innerRadius?/outerRadius? (polystar only), ' +
      'fillColor?, strokeColor?, strokeWidth?, name? }',
    validate(p) {
      const base = requireFields(p, ['compId']);
      const SHAPES = ['rectangle', 'ellipse', 'polystar'];
      if (p.shape !== undefined) {
        const kind = String(p.shape).toLowerCase();
        // No silent fallback to rectangle for an unrecognized shape (used to
        // happen live in the JSX before this validator existed — a typo'd
        // shape built a rectangle with no error, see docs/ROADMAP.md "Faz 1.C").
        if (!SHAPES.includes(kind)) {
          throw new ValidationError(`shape must be one of: ${SHAPES.join(', ')} (got "${p.shape}")`);
        }
      }
      if (p.polyType !== undefined && !['star', 'polygon'].includes(String(p.polyType).toLowerCase())) {
        throw new ValidationError('polyType must be "star" or "polygon"');
      }
      if (p.points !== undefined && (typeof p.points !== 'number' || !Number.isInteger(p.points) || p.points < 3)) {
        throw new ValidationError('points must be an integer >= 3');
      }
      return base;
    },
  },
  addPathShape: withDesc('Shape layer with a custom bezier path. { compId, vertices[], inTangents?, outTangents?, closed?, fillColor?, strokeColor?, strokeWidth?, position?, name? }', ['compId']),
  addShapeOperator: {
    description:
      `Add a shape operator to a shape layer's vector group. { compId, layer, operator (${Object.keys(SHAPE_OPERATORS).join('|')}), group?, params?, name? }. ` +
      'group is a property path array from the layer (default ["ADBE Root Vectors Group"]). No insertAt/reorder — addProperty() always appends to the ' +
      'end of the group, and the only scripting API for reordering afterward (PropertyGroup.moveTo()) throws an uncatchable native error on live AE ' +
      '(confirmed 26.3x87, docs/DEVLOG.md 2026-08-09), sometimes after already mutating state — not safe to expose. To control final stacking order, ' +
      'call addShapeOperator repeatedly in the order you want operators to end up in. ' +
      'operator is restricted to a whitelist of live-confirmed matchNames, see docs/ROADMAP.md "Faz 1.B" — most documented candidates are NOT yet enabled.',
    validate(p) {
      const base = requireFields(p, ['compId', 'operator']);
      const op = String(p.operator);
      if (!SHAPE_OPERATORS[op]) {
        const hint = SHAPE_OPERATORS_PENDING.has(op)
          ? ` "${op}" is a documented candidate (docs/ROADMAP.md "Faz 1.B") whose matchName has not been confirmed live yet — it is not safe to guess into AE (addProperty with a bad matchName here has crashed AE before), so it is deliberately disabled until confirmed.`
          : '';
        throw new ValidationError(
          `operator must be one of: ${Object.keys(SHAPE_OPERATORS).join(', ')} (got "${p.operator}").${hint}`,
        );
      }
      if (p.params !== undefined && p.params !== null && !isPlainObject(p.params)) {
        throw new ValidationError('params must be an object');
      }
      return base;
    },
  },
  addFootageLayer: withDesc('Add an existing project item into a comp. { compId, itemId|itemName }', ['compId']),
  setParent: withDesc('Parent one layer to another. { compId, layer, parent|parentName(null to unparent) }', ['compId']),
  trimLayer: withDesc('Set layer in/out/start. { compId, layer, inPoint?, outPoint?, startTime? }', ['compId']),
  moveLayer: withDesc('Move a layer to a stack index. { compId, layer, toIndex }', ['compId', 'toIndex']),
  duplicateLayer: withDesc('Duplicate a layer. { compId, layer, name? }', ['compId']),
  deleteLayer: withDesc('Delete a layer. { compId, layer }', ['compId']),
  getLayers: withDesc('List layers in a comp.', ['compId']),

  // keyframes / expressions
  setKeyframe: withDesc('One keyframe. { compId, layer, property, time, value }. On a SHAPE-typed property (e.g. a path, property: ["ADBE Root Vectors Group",...,"ADBE Vector Shape"]), value is { vertices[], inTangents?, outTangents?, closed? } — every keyframe on that property must use the same vertex count or the call fails.', ['compId', 'property', 'time', 'value']),
  setKeyframes: withDesc('Bulk keyframes. { compId, layer, property, times[], values[], easyEase? }. On a SHAPE-typed property, values[] entries are { vertices[], inTangents?, outTangents?, closed? } and must all share the same vertex count (also matching any pre-existing keyframes) — mismatches fail loudly instead of producing broken path interpolation.', ['compId', 'property', 'times', 'values']),
  setEase: withDesc('Temporal ease on a key. { compId, layer, property, keyIndex, inInfluence?, outInfluence? }', ['compId', 'property', 'keyIndex']),
  setInterpolation: withDesc('Interp type on a key (linear|bezier|hold). { compId, layer, property, keyIndex, inType, outType? }', ['compId', 'property', 'keyIndex']),
  removeKeyframes: withDesc('Clear all keyframes on a property.', ['compId', 'property']),
  setExpression: withDesc('Set an expression string. { compId, layer, property, expression }', ['compId', 'property', 'expression']),
  removeExpression: withDesc('Remove an expression.', ['compId', 'property']),
  enableExpression: withDesc('Enable/disable an expression. { ..., enabled }', ['compId', 'property']),

  // effects
  addEffect: withDesc('Add an effect by matchName. { compId, layer, matchName, name?, params? }', ['compId']),
  setEffectParam: withDesc('Set an effect param. { compId, layer, effect, param, value, time? }', ['compId', 'effect', 'param', 'value']),
  listEffects: withDesc('List a layer\'s effects.', ['compId']),
  addExpressionControl: withDesc('Add a Slider/Point/Color/Checkbox/Angle control. { compId, layer, controlType, name?, value? }', ['compId']),

  // footage
  importFootage: withDesc('Import a media file. { path, name?, sequence? }', ['path']),
  compFromFootage: withDesc('Import a file and build a matching comp pinned to t=0. { path, name? }', ['path']),

  // app / menu / project
  executeMenuCommand: withDesc('Run any AE menu command. { commandId | commandName }', []),
  findMenuCommand: withDesc('Look up a menu command id by name. { commandName }', ['commandName']),
  saveProject: withDesc('Save the project. { path? }', []),
  undo: withDesc('Edit > Undo.', []),
  redo: withDesc('Edit > Redo.', []),
  purge: withDesc('Purge caches. { target?: all|undo|snapshot|image }', []),
  setActiveComp: withDesc('Open a comp in the viewer. { compId|compName }', ['compId']),
  getSelection: withDesc('Get the active comp + selected layers.', []),
  setCompTime: withDesc('Move the comp playhead. { compId, time }', ['compId', 'time']),
  getAppInfo: withDesc('App + project facts.', []),

  // executor (HLD)
  applySpec: withDesc('Idempotently realize a segment spec. { compId, segmentId|spec.segment_id, spec, segment? }', ['compId', 'spec']),
  removeLayersByPrefix: withDesc('Remove all layers whose name starts with prefix. { compId, prefix }', ['compId', 'prefix']),
});

// v3 — masks, text, styles, introspection, render queue, comp/layer/project ops,
// and the OS keystroke layer.
Object.assign(COMMANDS, {
  // masks
  addMask: withDesc('Add a mask. { compId, layer, vertices?, closed?, mode?, feather?, opacity?, expansion? }', ['compId']),
  addRectMask: withDesc('Add a rectangular mask. { compId, layer, left?, top?, width?, height?, feather? }', ['compId']),
  setMaskProperty: withDesc('Set a mask property (mode|opacity|feather|expansion|inverted). { compId, layer, maskIndex|maskName, property, value }', ['compId', 'property']),

  // text
  setTextDocument: withDesc('Style a text layer (text/font/size/tracking/fill/stroke/justification/...). { compId, layer, ... }', ['compId']),
  addTextAnimator: withDesc('Add a text animator (Animate panel). { compId, layer, name?, properties:{position,scale,rotation,opacity,tracking,blur}, selector:{basedOn,shape,easeHigh,easeLow,start,end,offset}, animate:{field:offset|start|end, from, to, startFrame, endFrame, ease:easeOut|easyEase}, motionBlur? }', ['compId']),
  applyTextPreset: withDesc('Apply a named text-animation preset. { compId, layer, preset: wordReveal|charScale|bunchRotate|blurFade }', ['compId', 'preset']),
  applyWordReveal: withDesc('Deterministic text-driven per-word reveal. Splits text (\\n = lines) into words, measures each glyph run, centers each line on centerX and the block on centerY, animates each word as its own layer with a cubic-bezier and overlapping cascade. { compId, text, font?, fontSize?, fillColor?, centerX?, centerY?, lineHeight?, rise?, revealFrames?, stagger?, startFrame?, bezier?, motionBlur?, trimIn?, trimOut?, namePrefix? }', ['compId', 'text']),
  applyCharScale: withDesc('Deterministic letter-based char-scale reveal. Splits text into characters (kerning-correct via prefix measurement), each letter its own measured/positioned layer scaling up + rising + fading with an overlapping cascade and a cubic-bezier. { compId, text, font?, fontSize?, fillColor?, centerX?, centerY?, lineHeight?, rise?, scaleFrom?, revealFrames?, stagger?, startFrame?, bezier?, tracking?, motionBlur?, trimIn?, trimOut?, namePrefix? }', ['compId', 'text']),
  applyTextStyle: withDesc('Combinatorial text preset: apply one of 4 styles x 8 eases by NAME. style: wordReveal|charScale|bunchRotate|blurFade; ease: easeInOutCubic|easeOutQuart|easeInOutQuart|easeOutQuint|easeInOutQuint|easeOutExpo|easeInOutExpo|easeInOutCirc (or pass bezier[4]). wordReveal is fully wired (deterministic); the other three are interim. { compId, style, ease|bezier, text, ...style params }', ['compId', 'style']),
  listTextStyles: withDesc('List available text styles + eases + which are ready. {}', []),
  measureText: {
    description:
      'Measure real rendered text bounds via sourceRectAtTime — no scene mutation left behind. Two modes: { text, font?, fontSize?, ' +
      'tracking? } builds a throwaway layer, measures, removes it; { layer|layerIndex|layerName, font?, fontSize?, tracking? } reads an ' +
      'EXISTING text layer live, inheriting its own font/size/tracking unless overridden. Returns { width, height, left, top, capHeight, ' +
      'ascent, descent } (px) — capHeight is a font metric ("H" at this font/size); ascent/descent are content-dependent (from the actual ' +
      'text\'s ink). docs/ROADMAP.md Faz 2 madde 3.',
    validate(p) {
      const base = requireFields(p, ['compId']);
      const hasLayer = (p.layer !== undefined || p.layerIndex !== undefined || p.layerName !== undefined);
      if (!hasLayer && !(typeof p.text === 'string' && p.text.length > 0)) {
        throw new ValidationError('text or layer/layerIndex/layerName is required');
      }
      return base;
    },
  },

  // styles
  addLayerStyle: withDesc('Add a layer style (dropShadow|outerGlow|stroke|...). { compId, layer, style, params? }', ['compId', 'style']),

  // introspection (read-back)
  getProperty: withDesc('Read a property value/expression/keyframes. { compId, layer, property }', ['compId', 'property']),
  getLayerDetails: withDesc('Full layer snapshot (transform/effects/flags, deep? tree). { compId, layer, deep?, depth? }', ['compId']),
  getCompDetails: withDesc('Comp settings + all layers.', ['compId']),
  getProjectItems: withDesc('List all project items.', []),

  resolveSafePosition: {
    description:
      'Resolve a named position to comp-relative pixel coordinates, inset by title-safe margins — no AE mutation, pure math off ' +
      'the comp\'s real width/height. { compId, position (topLeft|topCenter|topRight|middleLeft|center|middleRight|bottomLeft|' +
      'bottomCenter|bottomRight), safeArea? ({top,right,bottom,left}, each a fraction of comp width [left/right] or height ' +
      '[top/bottom]; defaults from config.json, currently 0.08 each side) }. Returns { x, y, safeArea: {left,top,right,bottom} } (px) — ' +
      'x/y are the point for that position WITHIN the safe rect. docs/ROADMAP.md Faz 2 madde 2.',
    validate(p) {
      const base = requireFields(p, ['compId', 'position']);
      const POSITIONS = [
        'topLeft', 'topCenter', 'topRight',
        'middleLeft', 'center', 'middleRight',
        'bottomLeft', 'bottomCenter', 'bottomRight',
      ];
      if (!POSITIONS.includes(p.position)) {
        throw new ValidationError(`position must be one of: ${POSITIONS.join(', ')} (got "${p.position}")`);
      }
      const { safeArea: defaultSafeArea } = loadConfig();
      const raw = p.safeArea;
      if (raw !== undefined && raw !== null && !isPlainObject(raw)) {
        throw new ValidationError('safeArea must be an object { top?, right?, bottom?, left? }');
      }
      const safeArea = {};
      for (const side of ['top', 'right', 'bottom', 'left']) {
        const val = raw ? raw[side] : undefined;
        if (val === undefined || val === null) { safeArea[side] = defaultSafeArea[side]; continue; }
        const num = Number(val);
        if (!Number.isFinite(num) || num < 0 || num >= 0.5) {
          throw new ValidationError(`safeArea.${side} must be a number in [0, 0.5) (got ${JSON.stringify(val)})`);
        }
        safeArea[side] = num;
      }
      return { ...base, safeArea };
    },
  },

  // render queue
  addToRenderQueue: withDesc('Add a comp to the Render Queue. { compId, outputPath?, settingsTemplate?, outputModuleTemplate? }', ['compId']),
  listRenderQueue: withDesc('List Render Queue items + status.', []),
  setOutputModule: withDesc('Set an RQ output module file/template. { rqIndex, outputPath?, template? }', ['rqIndex']),
  clearRenderQueue: withDesc('Remove all Render Queue items.', []),

  // comp
  setCompSettings: withDesc('Update comp settings (name/size/duration/fps/bg/motionBlur/workArea/...). { compId, ... }', ['compId']),
  addCompMarker: withDesc('Add a comp marker. { compId, time, comment?, duration? }', ['compId', 'time']),

  // layer
  setBlendMode: withDesc('Set a layer blend mode. { compId, layer, mode }', ['compId', 'mode']),
  setTrackMatte: withDesc('Set a track matte (alpha|alphaInverted|luma|lumaInverted|none). { compId, layer, type, matteLayer? }', ['compId']),
  setLayerFlag: withDesc('Toggle a layer flag (motionBlur|adjustment|guide|threeD|collapse|solo|shy|lock|frameBlending). { compId, layer, flag, value? }', ['compId', 'flag']),
  addLayerMarker: withDesc('Add a layer marker. { compId, layer, time, comment? }', ['compId', 'time']),
  setTimeStretch: withDesc('Set layer time stretch percent. { compId, layer, stretch }', ['compId', 'stretch']),
  enableTimeRemap: withDesc('Enable/disable time remapping. { compId, layer, enabled? }', ['compId']),
  replaceSource: withDesc('Replace a layer\'s source item. { compId, layer, itemId|itemName }', ['compId']),

  // project
  createFolder: withDesc('Create a project folder. { name }', []),
  moveToFolder: withDesc('Move an item into a folder. { itemId|itemName, folderId|folderName }', []),
  setProxy: withDesc('Set a footage proxy file. { itemId|itemName, path }', ['path']),
  renameItem: withDesc('Rename a project item. { itemId|itemName, name }', ['name']),
  deleteItem: withDesc('Delete a project item. { itemId|itemName }', []),

  // OS keystroke layer (panel-side)
  keystroke: withDesc('Send OS keystrokes to AE. { keys } (SendKeys, e.g. "^s") | { text } | { key, ctrl?, alt?, shift? }', []),

  // discovery (read-only "what's installed")
  listFonts: withDesc('Enumerate installed fonts (postScriptName authoritative; family/style derived). { filter?, limit? }', []),
  listInstalledEffects: withDesc('Best-effort list of installed effects with { name, matchName } (probes a known set). { names? }', []),
  findEffectMatchName: withDesc('Resolve an effect display name to its matchName. { name }', ['name']),
  introspectEffect: withDesc('Add an effect (by display name or matchName) and dump its full parameter tree (name + matchName + valueType + default). The way to wire any third-party plugin. { name | names[], depth? }', []),
  getEnvironment: withDesc('AE version/build, OS, ExtendScript, font count, project + memory info.', []),
  listPlugins: withDesc('Best-effort list of installed plugins (.aex/.plugin) by scanning install dirs. { dirs? }', []),

  // friendly Lumetri grading (adds Lumetri if missing; sets params by name)
  applyLumetri: withDesc('Grade a layer with Lumetri by friendly name. { compId, layer, settings:{ saturation, temperature, tint, exposure, contrast, highlights, shadows, whites, blacks, vibrance, sharpen, vignette, ... }, time? }', ['compId']),
  lumetriParams: withDesc('List the friendly Lumetri param names the bridge supports.', []),

  // orchestration-grade tooling
  batch: withDesc('Run many commands in ONE round-trip + ONE undo group. { commands:[{command,params}], undoName?, stopOnError? }', ['commands']),
  getCompTime: withDesc('Read comp playhead/work-area/frame info. { compId }', ['compId']),
  duplicateComp: withDesc('Duplicate a comp. { compId, name? }', ['compId']),
  alignLayer: withDesc('Align a layer (center|hcenter|vcenter|left|right|top|bottom). { compId, layer, align, margin? }', ['compId']),
  sequenceLayers: withDesc('Offset layers in time. { compId, layers[], step?, start? }', ['compId', 'layers']),
  setWorkArea: withDesc('Set the comp work area. { compId, start, duration }', ['compId']),
  clearComp: withDesc('Remove all layers in a comp. { compId, keepPrefix? }', ['compId']),

  // one-call realistic fire preset (flame noise + displace + colorize + embers + glow)
  fireEffect: withDesc('Add a realistic fire effect to a comp. { compId, center?, size?, width?, height?, embers?, highlight?, midtone?, glowRadius?, glowIntensity?, ambient?, prefix? }', ['compId']),
  smokeEffect: withDesc('Add rising smoke to a comp. { compId, center?, size?, color?, opacity?, prefix? }', ['compId']),
  glitchEffect: withDesc('Apply a digital glitch to a layer. { compId, layer, amount?, size?, shake? }', ['compId']),
  cinematicGrade: withDesc('Apply a cinematic Lumetri grade to a layer. { compId, layer, warm?, contrast?, saturation? }', ['compId']),
  neonGlow: withDesc('Apply a neon glow stack to a layer. { compId, layer, radius? }', ['compId']),

  // third-party plugin wrappers (Plugin Everything) — friendly params -> stable matchNames
  deepGlow: withDesc('Apply/Update Deep Glow 2 (PEDG2) on a layer by friendly name. { compId, layer, radius?, exposure?, threshold?, glowMode?, color?, colorOuter?, tintStrength?, params? }', ['compId']),
  shadowStudio: withDesc('Apply/Update Shadow Studio 3 (PESS3) on a layer by friendly name. { compId, layer, lightDirection?, shadowLength?, lightRadius?, softness?, color?, opacityStart?, opacityEnd?, samples?, params? }', ['compId']),
});

/**
 * Validate a command call. Returns { ok:true, params } or { ok:false, error }.
 * @param {object} opts - { allowDev:boolean } to permit dev-only commands.
 */
export function validateCommand(command, params, opts = {}) {
  const def = COMMANDS[command];
  if (!def) {
    return { ok: false, error: `Unknown command: ${command}` };
  }
  if (def.dev && !opts.allowDev) {
    return { ok: false, error: `Command "${command}" is dev-only and disabled` };
  }
  if (params !== undefined && params !== null && !isPlainObject(params)) {
    return { ok: false, error: 'params must be an object' };
  }
  try {
    const normalized = def.validate(params || {});
    return { ok: true, params: normalized };
  } catch (e) {
    if (e instanceof ValidationError) return { ok: false, error: e.message };
    return { ok: false, error: `validation failed: ${e.message}` };
  }
}

export function commandList({ includeDev = false } = {}) {
  return Object.entries(COMMANDS)
    .filter(([, def]) => includeDev || !def.dev)
    .map(([name, def]) => ({ name, description: def.description, dev: !!def.dev }));
}

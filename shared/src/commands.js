// commands.js — the command registry. Mirrors the JSX COMMANDS dispatch table
// so bad calls fail fast on the controller before crossing the socket.
//
// Each entry: { description, dev?, schema?, validate(params) -> normalizedParams }.
// validate() throws ValidationError on bad input and returns a normalized
// params object (defaults applied) on success.
//
// `schema` (optional): a JSON Schema `properties` map for commands exposed as
// individual `ae_<name>` MCP tools (controller/src/mcpServer.js CORE set).
// Confirmed live 2026-08-09: those tools' inputSchema used to be a blanket
// `{ type:'object', additionalProperties:true }` with no declared property
// types — the MCP client silently mangles ARRAY-valued top-level arguments
// under that schema (color/position/scale/etc. arrive at AE as non-arrays),
// while scalars survive (numeric-looking strings, already tolerated by
// validate.js's numericLike). Declaring the real type here — critically
// `type:'array'` for anything array-shaped — fixed it (see docs/DEVLOG.md,
// corrects the earlier "unfixable, harness-side" conclusion from the same
// day). Only commands in CORE need this; everything else is reachable via
// `ae_command` whose `params` field is already typed as an object.

import { v, isPlainObject, ValidationError } from './validate.js';
import { loadConfig } from './config.js';

// Layer-reference fields (AEB.requireLayer/resolveLayer, panel/jsx/host.jsx):
// a layer is addressed by `layer` (name-or-index, either works), `layerName`
// (string), or `layerIndex` (number) — same three-way contract everywhere.
// Fixed 2026-09-07: commands whose *description* documents `layer` but whose
// `schema` map omits it were silently losing that argument for callers whose
// MCP client builds tool-call arguments strictly off the declared JSON Schema
// `properties` (additionalProperties:true on the object doesn't help there —
// see mcpServer.js's buildTools) instead of via the ae_command escape hatch
// (whose `params` is an opaque, undeclared object and so was never affected).
// Declare these on every layer-targeting CORE tool's schema, not just the ones
// below — see docs/DEVLOG.md 2026-09-07 for the audit list.
const LAYER_REF_SCHEMA = {
  layer: { anyOf: [{ type: 'string' }, { type: 'integer' }] },
  layerName: { type: 'string' },
  layerIndex: { type: 'integer' },
};

// Reusable schema fragments for the property/value pair that shows up across
// keyframe + introspection commands (setKeyframe, setEase, setInterpolation,
// removeKeyframes, getProperty, ...). `property` may be a friendly transform
// name (string) OR an array property-path (e.g. a SHAPE-typed path, see
// AEB.resolveProperty, host.jsx) — anyOf keeps the array branch typed so it
// survives the MCP tool's inputSchema the same way addShape's array fields do
// (see this file's header comment). `value` is genuinely polymorphic
// (number/string/boolean for scalar props, [x,y]/[x,y,z] for spatial ones,
// and a { vertices[], inTangents?, outTangents?, closed? } object for
// SHAPE-typed properties, see AEB.toShape).
// Declared up here (not next to withDesc below) so it's already initialized
// by the time the COMMANDS object literal below references it — a `const`
// declared after that literal would be in its temporal dead zone at the
// point of use and throw at module load.
const PROPERTY_SCHEMA = { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] };
const VALUE_SCHEMA = {
  anyOf: [{ type: 'number' }, { type: 'string' }, { type: 'boolean' }, { type: 'array' }, { type: 'object' }],
};

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
    schema: {
      name: { type: 'string' }, preset: { type: 'string' },
      width: { type: 'integer' }, height: { type: 'integer' },
      duration: { type: 'number' }, frameRate: { type: 'number' },
    },
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
    schema: {
      compId: { type: 'integer' }, name: { type: 'string' },
      color: { type: 'array', items: { type: 'number' } },
      width: { type: 'integer' }, height: { type: 'integer' },
    },
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
    schema: {
      compId: { type: 'integer' }, text: { type: 'string' },
      fontSize: { type: 'number' },
      position: { type: 'array', items: { type: 'number' } },
    },
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
    // No property whitelist here (there used to be one restricted to
    // position|scale|rotation|opacity|name|enabled|startTime, and this
    // required `layerIndex` specifically, silently ignoring the `layer`
    // field every other layer-targeting command accepts) — the JSX side
    // (layer.jsx COMMANDS.setLayerProperty) already resolves far more:
    // anchorPoint/anchor, inPoint, outPoint, shy, solo, label, threeDLayer,
    // plus a generic array property-path fallback via AEB.resolveProperty.
    // Re-deriving that whitelist here just went stale and rejected valid
    // calls; the JSX throws its own clear error for anything it can't
    // resolve, so validation there is sufficient (defense-in-depth intact).
    description:
      'Set a layer property. Friendly names: position|scale|rotation|opacity|anchorPoint|anchor|name|enabled|startTime|inPoint|outPoint|shy|solo|label|threeDLayer — or an array property path (e.g. ["Effects","Tint","Amount to Tint"]) for anything else. { compId, layer, property, value }. Returns { ok }.',
    // value is genuinely polymorphic (number for opacity/rotation, [x,y]/
    // [x,y,z] for position/scale/anchorPoint, string for name/label, bool for
    // enabled/shy/solo/threeDLayer) — anyOf keeps the array branch typed so
    // array-valued calls survive the MCP tool's inputSchema (see file header).
    schema: {
      compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, property: PROPERTY_SCHEMA,
      value: { anyOf: [{ type: 'number' }, { type: 'string' }, { type: 'boolean' }, { type: 'array' }] },
    },
    // requireFields (defined below, but hoisted — it's a function
    // declaration) just checks presence and spreads params through
    // untouched, same as withDesc — needed here because withDesc itself is
    // a `const` and not yet initialized this early in the file (TDZ).
    validate(p) {
      return requireFields(p, ['compId', 'property', 'value']);
    },
  },

  render: {
    description:
      'Render a comp to a file. Async: returns { jobId, status } immediately; ' +
      'progress arrives as `progress` events; completion as a `renderComplete` event.',
    schema: {
      compId: { type: 'integer' }, outputPath: { type: 'string' },
      settingsTemplate: { type: 'string' }, outputModuleTemplate: { type: 'string' },
      format: { type: 'string' }, startFrame: { type: 'number' }, endFrame: { type: 'number' },
    },
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
// schema (optional 3rd arg): JSON Schema `properties` map, used only for
// commands in mcpServer.js's CORE set (see file header) — declares real
// types (crucially `type:'array'`) so the ae_<name> MCP tool's inputSchema
// doesn't silently mangle array-valued params.
const withDesc = (description, required, schema) => ({ description, schema, validate: (p) => requireFields(p, required) });

// (PROPERTY_SCHEMA / VALUE_SCHEMA now declared up near LAYER_REF_SCHEMA,
// before the first COMMANDS object literal — see the comment there.)

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
  addNull: withDesc('Add a null layer. { compId, name?, duration? }', ['compId'],
    { compId: { type: 'integer' }, name: { type: 'string' }, duration: { type: 'number' } }),
  addAdjustmentLayer: withDesc('Add an adjustment layer. { compId, name? }', ['compId'],
    { compId: { type: 'integer' }, name: { type: 'string' } }),
  addCamera: withDesc('Add a camera. { compId, name?, center? }', ['compId'],
    { compId: { type: 'integer' }, name: { type: 'string' }, center: { type: 'array', items: { type: 'number' } } }),
  addLight: withDesc('Add a light. { compId, name?, lightType? (0=parallel,1=spot,2=point,3=ambient), center? }', ['compId'],
    { compId: { type: 'integer' }, name: { type: 'string' }, lightType: { type: 'integer' },
      center: { type: 'array', items: { type: 'number' } } }),
  addShape: {
    description:
      'Add a shape layer. { compId, shape? (rectangle|ellipse|polystar, default rectangle), size? ([w,h], rectangle/ellipse only), ' +
      'polyType? (star|polygon, default star, polystar only), points? (int >=3, polystar only), innerRadius?/outerRadius? (polystar only), ' +
      'fillColor?, strokeColor?, strokeWidth?, name?, ' +
      'fillGradient?/strokeGradient? ({ type? (linear|radial, default linear), startPoint?, endPoint?, scale?, rotation?, hiliteLength?, ' +
      'hiliteAngle?, opacity? }) — a NATIVE AE gradient (geometry only; AE does not allow scripting its stop colors, confirmed live ' +
      '2026-08-10 — ADBE Vector Grad Colors is PropertyValueType.NO_VALUE. Mutually exclusive with fillColor/strokeColor respectively. ' +
      'For a gradient with chosen colors use rampGradient instead), ' +
      'rampGradient? ({ startColor, endColor (both required), startPoint?, endPoint?, type? (linear|radial), scatter?, blendWithOriginal? }) ' +
      '— a Gradient Ramp EFFECT (ADBE Ramp) applied on the layer, fully color-scriptable. Needs some fill/stroke to carry alpha; if none of ' +
      'fillColor/fillGradient/strokeColor/strokeGradient is given, a default white fill is added automatically as an alpha source. ' +
      'Stroke style, requires strokeColor or strokeGradient: lineCap? (butt|round|projecting), lineJoin? (miter|round|bevel), ' +
      'miterLimit? (only when lineJoin is miter, AE default), dashes? ([{dash,gap}, ...] up to 3 pairs), dashOffset?, ' +
      'taper? ({ lengthUnits? (percent|pixels, default percent), startLength?/endLength? (percent mode), startLengthPx?/endLengthPx? ' +
      '(pixels mode), startWidth?/endWidth? (0..1 fraction, always active), startEase?/endEase? (always active) }), ' +
      'wave? ({ units? (percent|pixels), amount?, wavelength?, phase? }) — no cycles: AE does not allow scripting ' +
      'it (confirmed live 2026-08-10, every mutation path throws "hidden property"; same category as gradient ' +
      'stop colors, see fillGradient). ' +
      'groupTransform? ({ anchorPoint?, position?, scale? ([x,y], percent, default [100,100]), skew?, skewAxis?, ' +
      'rotation?, opacity? (0..100) }) — the shape GROUP\'s own transform (separate from the layer transform), ' +
      'lets content pivot/scale/rotate around a point independent of the layer\'s anchor. All fields confirmed ' +
      'live and settable, 2026-08-10. }',
    schema: {
      compId: { type: 'integer' }, shape: { type: 'string' },
      size: { type: 'array', items: { type: 'number' } },
      polyType: { type: 'string' }, points: { type: 'integer' },
      innerRadius: { type: 'number' }, outerRadius: { type: 'number' },
      fillColor: { type: 'array', items: { type: 'number' } },
      strokeColor: { type: 'array', items: { type: 'number' } },
      strokeWidth: { type: 'number' }, name: { type: 'string' },
      fillGradient: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          startPoint: { type: 'array', items: { type: 'number' } },
          endPoint: { type: 'array', items: { type: 'number' } },
          scale: { type: 'number' }, rotation: { type: 'number' },
          hiliteLength: { type: 'number' }, hiliteAngle: { type: 'number' },
          opacity: { type: 'number' },
        },
      },
      strokeGradient: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          startPoint: { type: 'array', items: { type: 'number' } },
          endPoint: { type: 'array', items: { type: 'number' } },
          scale: { type: 'number' }, rotation: { type: 'number' },
          hiliteLength: { type: 'number' }, hiliteAngle: { type: 'number' },
          opacity: { type: 'number' },
        },
      },
      rampGradient: {
        type: 'object',
        properties: {
          startColor: { type: 'array', items: { type: 'number' } },
          endColor: { type: 'array', items: { type: 'number' } },
          startPoint: { type: 'array', items: { type: 'number' } },
          endPoint: { type: 'array', items: { type: 'number' } },
          type: { type: 'string' },
          scatter: { type: 'number' }, blendWithOriginal: { type: 'number' },
        },
      },
      lineCap: { type: 'string' }, lineJoin: { type: 'string' }, miterLimit: { type: 'number' },
      dashes: {
        type: 'array',
        items: {
          type: 'object',
          properties: { dash: { type: 'number' }, gap: { type: 'number' } },
        },
      },
      dashOffset: { type: 'number' },
      taper: {
        type: 'object',
        properties: {
          lengthUnits: { type: 'string' },
          startLength: { type: 'number' }, endLength: { type: 'number' },
          startLengthPx: { type: 'number' }, endLengthPx: { type: 'number' },
          startWidth: { type: 'number' }, endWidth: { type: 'number' },
          startEase: { type: 'number' }, endEase: { type: 'number' },
        },
      },
      wave: {
        type: 'object',
        properties: {
          units: { type: 'string' }, amount: { type: 'number' },
          wavelength: { type: 'number' }, phase: { type: 'number' },
        },
      },
      groupTransform: {
        type: 'object',
        properties: {
          anchorPoint: { type: 'array', items: { type: 'number' } },
          position: { type: 'array', items: { type: 'number' } },
          scale: { type: 'array', items: { type: 'number' } },
          skew: { type: 'number' }, skewAxis: { type: 'number' },
          rotation: { type: 'number' }, opacity: { type: 'number' },
        },
      },
    },
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
      const GRAD_TYPES = ['linear', 'radial'];
      for (const [field, colorField] of [['fillGradient', 'fillColor'], ['strokeGradient', 'strokeColor']]) {
        if (p[field] === undefined) continue;
        // v.optionalObject (not a bare isPlainObject check) — the direct
        // ae_addShape MCP tool delivers this as a JSON string, confirmed
        // live 2026-08-10, see validate.js's comment on optionalObject.
        const g = v.optionalObject(p, field);
        base[field] = g;
        if (p[colorField] !== undefined) {
          throw new ValidationError(`${field} and ${colorField} are mutually exclusive (pick one)`);
        }
        if (g.type !== undefined && !GRAD_TYPES.includes(String(g.type).toLowerCase())) {
          throw new ValidationError(`${field}.type must be "linear" or "radial"`);
        }
      }
      if (p.rampGradient !== undefined) {
        const rg = v.optionalObject(p, 'rampGradient');
        base.rampGradient = rg;
        if (rg.startColor === undefined || rg.endColor === undefined) {
          throw new ValidationError('rampGradient requires startColor and endColor');
        }
        if (rg.type !== undefined && !GRAD_TYPES.includes(String(rg.type).toLowerCase())) {
          throw new ValidationError('rampGradient.type must be "linear" or "radial"');
        }
      }
      // Stroke style params (lineCap/.../wave) only mean something with a
      // stroke — no silent no-op if given without one (mirrors the JSX-side
      // AEB.assert in layer.jsx's addShape, defense in depth).
      const STROKE_STYLE_FIELDS = ['lineCap', 'lineJoin', 'miterLimit', 'dashes', 'dashOffset', 'taper', 'wave'];
      const hasStrokeStyle = STROKE_STYLE_FIELDS.some((f) => p[f] !== undefined);
      if (hasStrokeStyle && p.strokeColor === undefined && p.strokeGradient === undefined) {
        throw new ValidationError(
          'stroke style params (lineCap/lineJoin/miterLimit/dashes/dashOffset/taper/wave) require strokeColor or strokeGradient',
        );
      }
      const LINE_CAPS = ['butt', 'round', 'projecting'];
      const LINE_JOINS = ['miter', 'round', 'bevel'];
      if (p.lineCap !== undefined && !LINE_CAPS.includes(String(p.lineCap).toLowerCase())) {
        throw new ValidationError(`lineCap must be one of: ${LINE_CAPS.join(', ')}`);
      }
      if (p.lineJoin !== undefined && !LINE_JOINS.includes(String(p.lineJoin).toLowerCase())) {
        throw new ValidationError(`lineJoin must be one of: ${LINE_JOINS.join(', ')}`);
      }
      if (p.miterLimit !== undefined && p.lineJoin !== undefined && String(p.lineJoin).toLowerCase() !== 'miter') {
        // AE hides Miter Limit entirely unless Line Join is "miter" — fail
        // clearly here rather than let AE's cryptic "hidden property" error
        // surface from the JSX layer (confirmed live 2026-08-10).
        throw new ValidationError('miterLimit only applies when lineJoin is "miter" (AE hides it otherwise)');
      }
      if (p.dashes !== undefined) {
        const dashes = v.optionalArray(p, 'dashes');
        base.dashes = dashes;
        if (dashes.length > 3) {
          throw new ValidationError('dashes supports at most 3 dash/gap pairs (AE UI limit)');
        }
        for (const pair of dashes) {
          if (!isPlainObject(pair)) throw new ValidationError('each dashes[] entry must be an object { dash?, gap? }');
        }
      }
      const UNITS = ['percent', 'pixels'];
      if (p.taper !== undefined) {
        const taper = v.optionalObject(p, 'taper');
        base.taper = taper;
        if (taper.lengthUnits !== undefined && !UNITS.includes(String(taper.lengthUnits).toLowerCase())) {
          throw new ValidationError('taper.lengthUnits must be "percent" or "pixels"');
        }
      }
      if (p.wave !== undefined) {
        const wave = v.optionalObject(p, 'wave');
        base.wave = wave;
        if (wave.units !== undefined && !UNITS.includes(String(wave.units).toLowerCase())) {
          throw new ValidationError('wave.units must be "percent" or "pixels"');
        }
        if (wave.cycles !== undefined) {
          // AE does not allow scripting Wave's Cycles sub-property at all —
          // confirmed live 2026-08-10, every mutation path (setValue,
          // setValueAtTime, expression=, indexed property()) throws "the
          // property or a parent property is hidden", and addProperty()
          // (the Dashes-style unhide trick) fails outright because this
          // group is a NAMED_GROUP, not an INDEXED_GROUP. Fail clearly here
          // rather than let AE's cryptic error surface from the JSX layer.
          throw new ValidationError('wave.cycles cannot be set (AE does not allow scripting it — omit it)');
        }
      }
      if (p.groupTransform !== undefined) {
        base.groupTransform = v.optionalObject(p, 'groupTransform');
      }
      return base;
    },
  },
  addPathShape: withDesc('Shape layer with a custom bezier path. { compId, vertices[], inTangents?, outTangents?, closed?, fillColor?, strokeColor?, strokeWidth?, position?, name? }', ['compId'],
    { compId: { type: 'integer' }, vertices: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
      inTangents: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
      outTangents: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
      closed: { type: 'boolean' }, fillColor: { type: 'array', items: { type: 'number' } },
      strokeColor: { type: 'array', items: { type: 'number' } }, strokeWidth: { type: 'number' },
      position: { type: 'array', items: { type: 'number' } }, name: { type: 'string' } }),
  addPathToLayer: withDesc(
    'Append a NEW sibling vector group (Path + optional Fill/Stroke) into an EXISTING shape layer\'s Contents — ' +
      'unlike addPathShape, which always creates a brand-new shape layer, this targets a layer that already has ' +
      'shape content and adds a sibling "ADBE Vector Group", matching what the AE UI does when you draw with the ' +
      'Pen tool while a shape layer is already selected in the Timeline (see selectLayer). ' +
      '{ compId, layer, vertices[], inTangents?, outTangents?, closed?, fillColor?, strokeColor?, strokeWidth?, group?, groupName? }. ' +
      'group is a property-path array from the layer (default ["ADBE Root Vectors Group"], the layer\'s own Contents — ' +
      'same convention as addShapeOperator\'s `group`; pass a deeper path to nest inside an existing group instead of ' +
      'appending at the top level). groupName sets the new group\'s name; omit it to keep AE\'s own auto-name (e.g. "Group 2").',
    ['compId'],
    { compId: { type: 'integer' }, ...LAYER_REF_SCHEMA,
      vertices: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
      inTangents: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
      outTangents: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
      closed: { type: 'boolean' }, fillColor: { type: 'array', items: { type: 'number' } },
      strokeColor: { type: 'array', items: { type: 'number' } }, strokeWidth: { type: 'number' },
      group: PROPERTY_SCHEMA, groupName: { type: 'string' } }),
  addResponsiveBox: withDesc('A rect shape layer whose size tracks another layer\'s rendered bounds LIVE via an expression (re-evaluates every frame, e.g. if fitTo\'s text changes later) — not a one-time size like addShape. { compId, fitTo (layer|layerIndex|layerName, required), padding? ([w,h], default [60,40]), fillColor?, strokeColor?, strokeWidth?, position?, name? }', ['compId', 'fitTo'],
    { compId: { type: 'integer' }, fitTo: { anyOf: [{ type: 'string' }, { type: 'number' }] },
      padding: { type: 'array', items: { type: 'number' } }, fillColor: { type: 'array', items: { type: 'number' } },
      strokeColor: { type: 'array', items: { type: 'number' } }, strokeWidth: { type: 'number' },
      position: { type: 'array', items: { type: 'number' } }, name: { type: 'string' } }),
  addShapeOperator: {
    description:
      `Add a shape operator to a shape layer's vector group. { compId, layer, operator (${Object.keys(SHAPE_OPERATORS).join('|')}), group?, params?, name? }. ` +
      'group is a property path array from the layer (default ["ADBE Root Vectors Group"]). No insertAt/reorder — addProperty() always appends to the ' +
      'end of the group, and the only scripting API for reordering afterward (PropertyGroup.moveTo()) throws an uncatchable native error on live AE ' +
      '(confirmed 26.3x87, docs/DEVLOG.md 2026-08-09), sometimes after already mutating state — not safe to expose. To control final stacking order, ' +
      'call addShapeOperator repeatedly in the order you want operators to end up in. ' +
      'operator is restricted to a whitelist of live-confirmed matchNames, see docs/ROADMAP.md "Faz 1.B" — most documented candidates are NOT yet enabled.',
    // schema: now exposed as a top-level ae_addShapeOperator tool (Tier 2,
    // docs/ROADMAP.md "MCP tool şema tamamlama") — group is a property-path
    // array (see PROPERTY_SCHEMA's comment on setKeyframe), params an object.
    schema: {
      compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, operator: { type: 'string' },
      group: PROPERTY_SCHEMA,
      params: { type: 'object' }, name: { type: 'string' },
    },
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
      if (p.params !== undefined && p.params !== null) {
        // v.optionalObject (not a bare isPlainObject check) — now that this
        // is a typed top-level ae_addShapeOperator tool, `params` can arrive
        // JSON-stringified the same way addShape's fillGradient/rampGradient
        // do (confirmed live 2026-08-10, see validate.js's optionalObject
        // comment) — a bare isPlainObject check would reject a well-formed
        // call from that client instead of tolerating it.
        base.params = v.optionalObject(p, 'params');
      }
      return base;
    },
  },
  addFootageLayer: withDesc('Add an existing project item into a comp. { compId, itemId|itemName }', ['compId'],
    { compId: { type: 'integer' }, itemName: { type: 'string' } }),
  setParent: withDesc('Parent one layer to another. { compId, layer, parent|parentName(null to unparent) }', ['compId'],
    { compId: { type: 'integer' }, ...LAYER_REF_SCHEMA,
      parent: { anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'null' }] },
      parentName: { anyOf: [{ type: 'string' }, { type: 'null' }] } }),
  trimLayer: withDesc('Set layer in/out/start. { compId, layer, inPoint?, outPoint?, startTime? }', ['compId'],
    { compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, inPoint: { type: 'number' }, outPoint: { type: 'number' }, startTime: { type: 'number' } }),
  moveLayer: withDesc('Move a layer to a stack index. { compId, layer, toIndex }', ['compId', 'toIndex'],
    { compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, toIndex: { type: 'integer' } }),
  duplicateLayer: withDesc('Duplicate a layer. { compId, layer, name? }', ['compId'],
    { compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, name: { type: 'string' } }),
  deleteLayer: withDesc('Delete a layer. { compId, layer }', ['compId'], { compId: { type: 'integer' }, ...LAYER_REF_SCHEMA }),
  getLayers: withDesc('List layers in a comp.', ['compId'], { compId: { type: 'integer' } }),

  // keyframes / expressions
  setKeyframe: withDesc('One keyframe. { compId, layer, property, time, value }. On a SHAPE-typed property (e.g. a path, property: ["ADBE Root Vectors Group",...,"ADBE Vector Shape"]), value is { vertices[], inTangents?, outTangents?, closed? } — every keyframe on that property must use the same vertex count or the call fails.', ['compId', 'property', 'time', 'value'],
    { compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, property: PROPERTY_SCHEMA, time: { type: 'number' }, value: VALUE_SCHEMA }),
  setKeyframes: withDesc('Bulk keyframes. { compId, layer, property, times[], values[], easyEase? }. On a SHAPE-typed property, values[] entries are { vertices[], inTangents?, outTangents?, closed? } and must all share the same vertex count (also matching any pre-existing keyframes) — mismatches fail loudly instead of producing broken path interpolation.', ['compId', 'property', 'times', 'values'],
    { compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, property: PROPERTY_SCHEMA, times: { type: 'array', items: { type: 'number' } }, values: { type: 'array' }, easyEase: { type: 'boolean' } }),
  setEase: withDesc('Temporal ease on a key. { compId, layer, property, keyIndex, inInfluence?, outInfluence? }', ['compId', 'property', 'keyIndex'],
    { compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, property: PROPERTY_SCHEMA, keyIndex: { type: 'integer' },
      inInfluence: { type: 'number' }, outInfluence: { type: 'number' },
      inSpeed: { type: 'number' }, outSpeed: { type: 'number' } }),
  setInterpolation: withDesc('Interp type on a key (linear|bezier|hold). { compId, layer, property, keyIndex, inType, outType? }', ['compId', 'property', 'keyIndex'],
    { compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, property: PROPERTY_SCHEMA, keyIndex: { type: 'integer' },
      inType: { type: 'string' }, outType: { type: 'string' } }),
  removeKeyframes: withDesc('Clear all keyframes on a property.', ['compId', 'property'],
    { compId: { type: 'integer' }, property: PROPERTY_SCHEMA }),
  getEase: withDesc('Read one keyframe\'s time/value/real temporal ease (speed+influence per dimension, from keyInTemporalEase/keyOutTemporalEase)/interpolation type — not an approximation from sampling the curve. { compId, layer, property, keyIndex (1-based) }', ['compId', 'property', 'keyIndex'],
    { compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, property: PROPERTY_SCHEMA, keyIndex: { type: 'integer' } }),
  copyKeyframes: withDesc(
    'Copy ALL keyframes (time+value+real temporal ease+interpolation type — an exact copy, not a resampled approximation) from one property to ONE target property. Clears the target\'s existing keyframes on that property first; does not touch anything else on the target layer. ' +
    '{ sourceCompId, sourceLayer, sourceProperty, targetCompId, targetLayer, targetProperty? (defaults to sourceProperty) }',
    ['sourceCompId', 'sourceLayer', 'sourceProperty', 'targetCompId', 'targetLayer'],
    {
      sourceCompId: { type: 'integer' }, sourceLayer: { anyOf: [{ type: 'string' }, { type: 'integer' }] },
      sourceProperty: PROPERTY_SCHEMA,
      targetCompId: { type: 'integer' }, targetLayer: { anyOf: [{ type: 'string' }, { type: 'integer' }] },
      targetProperty: PROPERTY_SCHEMA,
    }),
  copyKeyframesBatch: withDesc(
    'Same as copyKeyframes but fans one source out to many targets in a single call/undo step (batched for performance). ' +
    '{ sourceCompId, sourceLayer, sourceProperty, targets: [{ compId, layer, property? (defaults to sourceProperty) }, ...], stopOnError? }. ' +
    'A bad target is collected as { ok:false, error } in the returned targets[] and the rest still run, unless stopOnError is true.',
    ['sourceCompId', 'sourceLayer', 'sourceProperty', 'targets'],
    {
      sourceCompId: { type: 'integer' }, sourceLayer: { anyOf: [{ type: 'string' }, { type: 'integer' }] },
      sourceProperty: PROPERTY_SCHEMA,
      targets: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            compId: { type: 'integer' },
            layer: { anyOf: [{ type: 'string' }, { type: 'integer' }] },
            property: PROPERTY_SCHEMA,
          },
        },
      },
      stopOnError: { type: 'boolean' },
      undoName: { type: 'string' },
    }),
  separateDimensions: withDesc('Toggle Separate Dimensions on Position (or another separation-leader property). { compId, layer, property? (default "position"; friendly name, matchName like "ADBE Position", or property path array), separated? (default true) }. Returns { ok, separated, leader, followers: [matchNames, e.g. "ADBE Position_0","ADBE Position_1"], followerNames }. Followers are 1-D non-spatial properties, addressable as property ["ADBE Transform Group","ADBE Position_1"] in setKeyframes/setEase/getProperty/etc. (e.g. scalar Y Position can overshoot with an outBack-style ease, which the spatial Position cannot). Errors if the property is not a separation leader.', ['compId'],
    { compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, property: PROPERTY_SCHEMA, separated: { type: 'boolean' } }),
  setExpression: withDesc('Set an expression string. { compId, layer, property, expression }', ['compId', 'property', 'expression'],
    { compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, property: PROPERTY_SCHEMA, expression: { type: 'string' } }),
  removeExpression: withDesc('Remove an expression. { compId, layer, property }', ['compId', 'property'],
    { compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, property: PROPERTY_SCHEMA }),
  enableExpression: withDesc('Enable/disable an expression. { compId, layer, property, enabled? (default true) }', ['compId', 'property'],
    { compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, property: PROPERTY_SCHEMA, enabled: { type: 'boolean' } }),

  // effects
  addEffect: withDesc('Add an effect by matchName. { compId, layer, matchName, name?, params? }', ['compId'],
    { compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, matchName: { type: 'string' }, name: { type: 'string' }, params: { type: 'object' } }),
  setEffectParam: withDesc('Set an effect param. { compId, layer, effect, param, value, time? }', ['compId', 'effect', 'param', 'value'],
    { compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, param: { type: 'string' }, time: { type: 'number' },
      value: { anyOf: [{ type: 'number' }, { type: 'string' }, { type: 'boolean' }, { type: 'array' }] } }),
  listEffects: withDesc('List a layer\'s effects. { compId, layer }', ['compId'], { compId: { type: 'integer' }, ...LAYER_REF_SCHEMA }),
  addExpressionControl: withDesc('Add a Slider/Point/Color/Checkbox/Angle/Layer/Point3D control. { compId, layer, controlType (slider|point|color|checkbox|angle|layer|point3d, default slider), name?, value? }', ['compId'],
    { compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, controlType: { type: 'string' }, name: { type: 'string' }, value: VALUE_SCHEMA }),

  // footage
  importFootage: withDesc('Import a media file. { path, name?, sequence? }', ['path'],
    { path: { type: 'string' }, name: { type: 'string' }, sequence: { type: 'boolean' } }),
  importLayeredComp: withDesc('Import a layered AI/PSD file as a Composition with every source layer kept separate - the native Import dialog\'s "Composition + Merged Layers + Document Size", without opening it. Creates a "<name> Layers" folder of per-layer footage plus a matching composition named after the file. Comp duration/frameRate are AE defaults, not derived from the file - follow up with setCompSettings to pin them. { path, name? }', ['path'],
    { path: { type: 'string' }, name: { type: 'string' } }),
  compFromFootage: withDesc('Import a file and build a matching comp pinned to t=0. Comp size/duration/frameRate come from the footage when it has them; { width?, height?, duration?, frameRate? } are fallbacks for footage that lacks one (e.g. a still image has no duration/frameRate). { path, name?, baseLayerName?, width?, height?, duration?, frameRate? }', ['path'],
    { path: { type: 'string' }, name: { type: 'string' }, baseLayerName: { type: 'string' },
      width: { type: 'integer' }, height: { type: 'integer' }, duration: { type: 'number' }, frameRate: { type: 'number' } }),

  // app / menu / project
  executeMenuCommand: withDesc('Run any AE menu command. { commandId | commandName }. CAUTION: some menu commands open a modal dialog (e.g. "Composition Settings...", "Save As...") which freezes the bridge until a human dismisses it in the AE UI - prefer a dedicated command (setCompSettings, saveProject, ...) when one exists.', [],
    { commandId: { type: 'integer' }, commandName: { type: 'string' } }),
  findMenuCommand: withDesc('Look up a menu command id by name. { commandName }', ['commandName'],
    { commandName: { type: 'string' } }),
  saveProject: withDesc('Save the project. { path? }', [], { path: { type: 'string' } }),
  openProject: withDesc('Open a project file, replacing whatever is currently open. Never triggers AE\'s save-changes dialog: the current project is saved (or discarded) BEFORE the native open call. { path, save? (default true - save current project first if it has a file; throws if it has unsaved content and no file) }', ['path'],
    { path: { type: 'string' }, save: { type: 'boolean' } }),
  closeProject: withDesc('Close the current project (back to a blank Untitled project). Never triggers a dialog. { save? (default true - save first via its own file; throws if never saved) }', [],
    { save: { type: 'boolean' } }),
  quitApp: withDesc('Quit After Effects. Never triggers the save-changes dialog (saves first by default). The panel connection drops as part of quitting - the controller resolves the call as a DISCONNECTED error, which for this command means success, not failure. { save? (default true) }', [],
    { save: { type: 'boolean' } }),
  undo: withDesc('Edit > Undo.', []),
  redo: withDesc('Edit > Redo.', []),
  purge: withDesc('Purge caches. { target?: all|undo|snapshot|image }', [],
    { target: { type: 'string' } }),
  // compName is accepted by AEB.requireComp (host.jsx) but this registry-level
  // validate only enforces compId, same as every other compId-bearing command
  // here (getCompDetails, getCompTime, alignLayer, ...) — see this file's
  // header: the registry gates obviously-malformed calls, the JSX layer is
  // the thorough one. A compName-only call reaches AE fine via ae_command;
  // it just won't pass this registry's requireFields.
  setActiveComp: withDesc('Open a comp in the viewer. { compId|compName }', ['compId'],
    { compId: { type: 'integer' }, compName: { type: 'string' } }),
  getSelection: withDesc('Get the active comp + selected layers.', []),
  setCompTime: withDesc('Move the comp playhead. { compId, time }', ['compId', 'time'],
    { compId: { type: 'integer' }, time: { type: 'number' } }),
  getAppInfo: withDesc('App + project facts.', []),

  // executor (HLD)
  applySpec: withDesc('Idempotently realize a segment spec. { compId, segmentId|spec.segment_id, spec, segment? }', ['compId', 'spec'],
    { compId: { type: 'integer' }, spec: { type: 'object' }, segment: { type: 'object' } }),
  removeLayersByPrefix: withDesc('Remove all layers whose name starts with prefix. { compId, prefix }', ['compId', 'prefix'],
    { compId: { type: 'integer' }, prefix: { type: 'string' } }),
  setAllStrokeLineCaps: {
    description:
      'Set "Line Cap" (butt|round|projecting) on EVERY stroke (ADBE Vector Graphic - Stroke and G-Stroke) found ' +
      'anywhere in a shape layer\'s vector content tree — recursively, through nested Groups/Repeaters at any depth. ' +
      'Built for layers whose exact stroke property path is not known/fixed in advance (e.g. pasted/imported SVG ' +
      'letter paths, each nested a different number of "Group N" levels deep) — avoids one getLayerDetails+' +
      'setLayerProperty round-trip per stroke. Target layer selection, most specific first: layers[] (array of ' +
      'layer/layerName/layerIndex refs) > a single layer/layerName/layerIndex > nameContains (substring match ' +
      'against layer name, case-sensitive) > default: every layer in the comp. Layers with no vector content ' +
      '(text/av/camera/light/null/adjustment) are skipped silently — safe to call over a mixed layer set. ' +
      '{ compId, lineCap (butt|round|projecting), layer?, layerName?, layerIndex?, layers?, nameContains? }. ' +
      'Returns { ok, lineCap, strokesUpdated, layers:[{layer,strokesUpdated}] }.',
    schema: {
      compId: { type: 'integer' }, lineCap: { type: 'string' },
      ...LAYER_REF_SCHEMA,
      layers: { type: 'array', items: { anyOf: [{ type: 'string' }, { type: 'integer' }] } },
      nameContains: { type: 'string' },
    },
    validate(p) {
      const base = requireFields(p, ['compId', 'lineCap']);
      const LINE_CAPS = ['butt', 'round', 'projecting'];
      if (!LINE_CAPS.includes(String(p.lineCap).toLowerCase())) {
        throw new ValidationError(`lineCap must be one of: ${LINE_CAPS.join(', ')}`);
      }
      if (p.layers !== undefined) {
        base.layers = v.optionalArray(p, 'layers');
      }
      return base;
    },
  },
});

// v3 — masks, text, styles, introspection, render queue, comp/layer/project ops,
// and the OS keystroke layer.
Object.assign(COMMANDS, {
  // masks
  addMask: withDesc('Add a mask. { compId, layer, vertices?, closed?, mode?, feather?, opacity?, expansion? }', ['compId'],
    { compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, name: { type: 'string' }, mode: { type: 'string' },
      vertices: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
      inTangents: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
      outTangents: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
      closed: { type: 'boolean' }, opacity: { type: 'number' },
      feather: { anyOf: [{ type: 'number' }, { type: 'array', items: { type: 'number' } }] },
      expansion: { type: 'number' }, inverted: { type: 'boolean' } }),
  addRectMask: withDesc('Add a rectangular mask. { compId, layer, left?, top?, width?, height?, feather? }', ['compId'],
    { compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, name: { type: 'string' }, left: { type: 'number' }, top: { type: 'number' },
      width: { type: 'number' }, height: { type: 'number' }, feather: { type: 'number' } }),
  setMaskProperty: withDesc('Set a mask property (mode|opacity|feather|expansion|inverted). { compId, layer, maskIndex|maskName, property, value }', ['compId', 'property'],
    { compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, maskIndex: { type: 'integer' }, maskName: { type: 'string' },
      property: { type: 'string' }, value: VALUE_SCHEMA }),

  // text
  setTextDocument: withDesc('Style a text layer (text/font/size/tracking/fill/stroke/justification/...). { compId, layer, ... }', ['compId'],
    { compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, text: { type: 'string' }, font: { type: 'string' },
      fontSize: { type: 'number' }, tracking: { type: 'number' }, leading: { type: 'number' },
      applyFill: { type: 'boolean' }, fillColor: { type: 'array', items: { type: 'number' } },
      applyStroke: { type: 'boolean' }, strokeColor: { type: 'array', items: { type: 'number' } },
      strokeWidth: { type: 'number' }, fauxBold: { type: 'boolean' }, fauxItalic: { type: 'boolean' },
      allCaps: { type: 'boolean' }, justification: { type: 'integer' } }),
  addTextAnimator: {
    description: 'Add a text animator (Animate panel). { compId, layer, name?, properties:{position,scale,rotation,opacity,tracking,blur}, selector:{basedOn,shape,easeHigh,easeLow,start,end,offset}, animate:{field:offset|start|end, from, to, startFrame, endFrame, ease:easeOut|easyEase, bezier?[4], outStartFrame?, outEndFrame?} (or an array of these), motionBlur? }',
    schema: {
      compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, name: { type: 'string' },
      properties: {
        type: 'object',
        properties: {
          position: { anyOf: [{ type: 'number' }, { type: 'array', items: { type: 'number' } }] },
          scale: { anyOf: [{ type: 'number' }, { type: 'array', items: { type: 'number' } }] },
          rotation: { type: 'number' }, opacity: { type: 'number' }, tracking: { type: 'number' },
          blur: { anyOf: [{ type: 'number' }, { type: 'array', items: { type: 'number' } }] },
        },
      },
      selector: {
        type: 'object',
        properties: {
          basedOn: { type: 'string' }, shape: { type: 'string' },
          easeHigh: { type: 'number' }, easeLow: { type: 'number' },
          start: { type: 'number' }, end: { type: 'number' }, offset: { type: 'number' },
        },
      },
      animate: {
        anyOf: [
          { type: 'object' },
          { type: 'array', items: { type: 'object' } },
        ],
      },
      motionBlur: { type: 'boolean' },
    },
    validate(p) {
      return requireFields(p, ['compId']);
    },
  },
  applyTextPreset: withDesc('Apply a named text-animation preset. { compId, layer, preset: wordReveal|charScale|bunchRotate|blurFade }', ['compId', 'preset'],
    { compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, preset: { type: 'string' } }),
  applyWordReveal: withDesc('Deterministic text-driven per-word reveal. Splits text (\\n = lines) into words, measures each glyph run, centers each line on centerX and the block on centerY, animates each word as its own layer with a cubic-bezier and overlapping cascade. { compId, text, font?, fontSize?, fillColor?, centerX?, centerY?, lineHeight?, rise?, revealFrames?, stagger?, startFrame?, bezier?, motionBlur?, tracking?, trimIn?, trimOut?, namePrefix?, outFrame? (exit sweep, off unless given), outRevealFrames?, outStagger? }', ['compId', 'text'],
    { compId: { type: 'integer' }, text: { type: 'string' }, font: { type: 'string' },
      fontSize: { type: 'number' }, fillColor: { type: 'array', items: { type: 'number' } },
      centerX: { type: 'number' }, centerY: { type: 'number' }, lineHeight: { type: 'number' },
      rise: { type: 'number' }, revealFrames: { type: 'number' }, stagger: { type: 'number' },
      startFrame: { type: 'number' }, bezier: { type: 'array', items: { type: 'number' } },
      motionBlur: { type: 'boolean' }, tracking: { type: 'number' },
      trimIn: { type: 'number' }, trimOut: { type: 'number' }, namePrefix: { type: 'string' },
      outFrame: { type: 'number' }, outRevealFrames: { type: 'number' }, outStagger: { type: 'number' } }),
  applyCharScale: withDesc('Deterministic letter-based char-scale reveal. Splits text into characters (kerning-correct via prefix measurement), each letter its own measured/positioned layer scaling up + rising + fading with an overlapping cascade and a cubic-bezier. { compId, text, font?, fontSize?, fillColor?, centerX?, centerY?, lineHeight?, rise?, scaleFrom?, revealFrames?, stagger?, startFrame?, bezier?, tracking?, motionBlur?, trimIn?, trimOut?, namePrefix? }', ['compId', 'text'],
    { compId: { type: 'integer' }, text: { type: 'string' }, font: { type: 'string' },
      fontSize: { type: 'number' }, fillColor: { type: 'array', items: { type: 'number' } },
      centerX: { type: 'number' }, centerY: { type: 'number' }, lineHeight: { type: 'number' },
      rise: { type: 'number' }, scaleFrom: { type: 'number' }, revealFrames: { type: 'number' },
      stagger: { type: 'number' }, startFrame: { type: 'number' }, bezier: { type: 'array', items: { type: 'number' } },
      tracking: { type: 'number' }, motionBlur: { type: 'boolean' },
      trimIn: { type: 'number' }, trimOut: { type: 'number' }, namePrefix: { type: 'string' } }),
  applyTextStyle: withDesc('Combinatorial text preset: apply one of 4 styles x 8 eases by NAME. style: wordReveal|charScale|bunchRotate|blurFade; ease: easeInOutCubic|easeOutQuart|easeInOutQuart|easeOutQuint|easeInOutQuint|easeOutExpo|easeInOutExpo|easeInOutCirc (or pass bezier[4]). wordReveal is fully wired (deterministic); the other three are interim. { compId, style, ease|bezier, text, ...style params }', ['compId', 'style'],
    { compId: { type: 'integer' }, style: { type: 'string' }, ease: { type: 'string' },
      bezier: { type: 'array', items: { type: 'number' } }, text: { type: 'string' },
      fillColor: { type: 'array', items: { type: 'number' } } }),
  listTextStyles: withDesc('List available text styles + eases + which are ready. {}', []),
  applyLowerThird: {
    description:
      'Compose a lower-third: title + optional subtitle, edge-anchored via resolveSafePosition, parented to a controller null (' +
      '{namePrefix}_controller/_title/_subtitle[/_accent]), single in/out. { compId, title, subtitle?, style? (charScale|bunchRotate|' +
      'blurFade, default charScale — wordReveal not supported, it builds its own centered layout), ease?, position? (resolveSafePosition\'s ' +
      '9-name grid, default bottomLeft), font?, titleFontSize?, subtitleFontSize?, titleColor?, subtitleColor?, gap?, safeArea?, inFrame?, ' +
      'outFrame? (default inFrame + 5s), subtitleDelay? (frames after inFrame, default 6), namePrefix? (default "LT"), accentLine? (true, ' +
      'or { width?, color?, gap? } — a thin bar spanning the block, opposite the text on the anchored side, fixed size computed once, not ' +
      'expression-driven; for that, use addResponsiveBox directly) }. Returns { controller, layers[], inFrame, outFrame }. ' +
      'docs/ROADMAP.md Faz 2 madde 5/6.',
    // schema: now exposed as a top-level ae_applyLowerThird tool (Tier 2,
    // docs/ROADMAP.md "MCP tool şema tamamlama").
    schema: {
      compId: { type: 'integer' }, title: { type: 'string' }, subtitle: { type: 'string' },
      style: { type: 'string' }, ease: { type: 'string' }, position: { type: 'string' },
      font: { type: 'string' }, titleFontSize: { type: 'number' }, subtitleFontSize: { type: 'number' },
      titleColor: { type: 'array', items: { type: 'number' } },
      subtitleColor: { type: 'array', items: { type: 'number' } },
      gap: { type: 'number' },
      safeArea: {
        type: 'object',
        properties: {
          top: { type: 'number' }, right: { type: 'number' },
          bottom: { type: 'number' }, left: { type: 'number' },
        },
      },
      inFrame: { type: 'number' }, outFrame: { type: 'number' }, subtitleDelay: { type: 'number' },
      namePrefix: { type: 'string' },
      accentLine: {
        anyOf: [
          { type: 'boolean' },
          { type: 'object', properties: { width: { type: 'number' }, color: { type: 'array', items: { type: 'number' } }, gap: { type: 'number' } } },
        ],
      },
    },
    validate(p) {
      const base = requireFields(p, ['compId', 'title']);
      if (typeof p.title !== 'string' || p.title.length === 0) {
        throw new ValidationError('title must be a non-empty string');
      }
      if (p.subtitle !== undefined && p.subtitle !== null && typeof p.subtitle !== 'string') {
        throw new ValidationError('subtitle must be a string');
      }
      if (p.accentLine !== undefined && p.accentLine !== null && p.accentLine !== true && p.accentLine !== false) {
        // v.optionalObject (not a bare isPlainObject check) — now that this
        // is a typed top-level tool, accentLine's object branch can arrive
        // JSON-stringified the same way addShape's fillGradient/
        // addShapeOperator's params do (confirmed live 2026-08-10, see
        // validate.js's optionalObject comment) — tolerate it instead of
        // rejecting a well-formed call.
        base.accentLine = v.optionalObject(p, 'accentLine');
      }
      if (p.style !== undefined) {
        const style = String(p.style).toLowerCase().replace(/[^a-z]/g, '');
        if (style === 'wordreveal') {
          throw new ValidationError(
            'style "wordReveal" builds its own multi-word centered layout and is not compatible with applyLowerThird\'s ' +
            'manually edge-anchored layers; use charScale, bunchRotate, or blurFade.',
          );
        }
        if (!['charscale', 'bunchrotate', 'blurfade'].includes(style)) {
          throw new ValidationError(`style must be one of: charScale, bunchRotate, blurFade (got "${p.style}")`);
        }
      }
      if (p.position !== undefined) {
        const POSITIONS = [
          'topLeft', 'topCenter', 'topRight',
          'middleLeft', 'center', 'middleRight',
          'bottomLeft', 'bottomCenter', 'bottomRight',
        ];
        if (!POSITIONS.includes(p.position)) {
          throw new ValidationError(`position must be one of: ${POSITIONS.join(', ')} (got "${p.position}")`);
        }
      }
      return base;
    },
  },
  measureText: {
    description:
      'Measure real rendered text bounds via sourceRectAtTime — no scene mutation left behind. Two modes: { text, font?, fontSize?, ' +
      'tracking? } builds a throwaway layer, measures, removes it; { layer|layerIndex|layerName, font?, fontSize?, tracking? } reads an ' +
      'EXISTING text layer live, inheriting its own font/size/tracking unless overridden. Returns { width, height, left, top, capHeight, ' +
      'ascent, descent } (px) — capHeight is a font metric ("H" at this font/size); ascent/descent are content-dependent (from the actual ' +
      'text\'s ink). docs/ROADMAP.md Faz 2 madde 3.',
    schema: {
      compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, text: { type: 'string' }, font: { type: 'string' },
      fontSize: { type: 'number' }, tracking: { type: 'number' },
    },
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
  addLayerStyle: {
    description:
      'Enable one of a layer\'s built-in Layer Style groups (every layer already has all 9 as disabled children of ' +
      '"ADBE Layer Styles" — "adding" a style just flips that group\'s .enabled) and optionally set its sub-properties by name. ' +
      '{ compId, layer, style (dropShadow|innerShadow|outerGlow|innerGlow|bevelEmboss|satin|colorOverlay|gradientOverlay|' +
      'patternOverlay|stroke), params? (sub-property name -> value map, e.g. { "Opacity": 75, "Color": [1,0,0] } — unknown keys ' +
      'are silently skipped, matching AE\'s addProperty tolerance) }',
    schema: {
      compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, style: { type: 'string' }, params: { type: 'object' },
    },
    validate(p) {
      const base = requireFields(p, ['compId', 'style']);
      const STYLES = [
        'dropShadow', 'innerShadow', 'outerGlow', 'innerGlow', 'bevelEmboss',
        'satin', 'colorOverlay', 'gradientOverlay', 'patternOverlay', 'stroke',
      ];
      const key = String(p.style).toLowerCase();
      if (!STYLES.some((s) => s.toLowerCase() === key)) {
        throw new ValidationError(`style must be one of: ${STYLES.join(', ')} (got "${p.style}")`);
      }
      if (p.params !== undefined && p.params !== null) {
        // v.optionalObject (not a bare isPlainObject check) — same
        // JSON-stringified-object risk as addShapeOperator's params /
        // applyLowerThird's accentLine (see validate.js's optionalObject
        // comment) now that this is a typed top-level tool.
        base.params = v.optionalObject(p, 'params');
      }
      return base;
    },
  },

  // introspection (read-back)
  getProperty: withDesc('Read a property value/expression/keyframes. { compId, layer, property }', ['compId', 'property'],
    { compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, property: PROPERTY_SCHEMA }),
  getLayerDetails: withDesc('Full layer snapshot (transform/effects/flags, deep? tree). { compId, layer, deep?, depth? }', ['compId'],
    { compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, deep: { type: 'boolean' }, depth: { type: 'integer' } }),
  listShapeContents: withDesc(
    'List the immediate children of a shape layer\'s vector PropertyGroup — for discovering AE-auto-assigned names ' +
      '(e.g. "Group 1"/"Stroke 1" from Layer > "Create Shapes from Vector Layer", see selectLayer) that can\'t be predicted, ' +
      'before you can build a property path for getProperty/setLayerProperty/setKeyframes. Each child reports ' +
      '{ index, name, matchName, isGroup } plus, for leaf properties, { value, expression? } — re-call with group set to a ' +
      'child\'s path (append its name or matchName) to walk one level deeper, same convention as addShapeOperator\'s `group`. ' +
      '{ compId, layer, group? } — group is a property-path array from the layer (default ["ADBE Root Vectors Group"]).',
    ['compId'],
    { compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, group: PROPERTY_SCHEMA }),
  getCompDetails: withDesc('Comp settings + all layers.', ['compId'], { compId: { type: 'integer' } }),
  getProjectItems: withDesc('List all project items.', []),

  resolveSafePosition: {
    description:
      'Resolve a named position to comp-relative pixel coordinates, inset by title-safe margins — no AE mutation, pure math off ' +
      'the comp\'s real width/height. { compId, position (topLeft|topCenter|topRight|middleLeft|center|middleRight|bottomLeft|' +
      'bottomCenter|bottomRight), safeArea? ({top,right,bottom,left}, each a fraction of comp width [left/right] or height ' +
      '[top/bottom]; defaults from config.json, currently 0.08 each side) }. Returns { x, y, safeArea: {left,top,right,bottom} } (px) — ' +
      'x/y are the point for that position WITHIN the safe rect. docs/ROADMAP.md Faz 2 madde 2.',
    schema: {
      compId: { type: 'integer' }, position: { type: 'string' },
      safeArea: {
        type: 'object',
        properties: {
          top: { type: 'number' }, right: { type: 'number' },
          bottom: { type: 'number' }, left: { type: 'number' },
        },
      },
    },
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
  addToRenderQueue: withDesc('Add a comp to the Render Queue. { compId, outputPath?, settingsTemplate?, outputModuleTemplate? }', ['compId'],
    { compId: { type: 'integer' }, outputPath: { type: 'string' }, settingsTemplate: { type: 'string' }, outputModuleTemplate: { type: 'string' } }),
  listRenderQueue: withDesc('List Render Queue items + status.', []),
  setOutputModule: withDesc('Set an RQ output module file/template. { rqIndex, omIndex? (default 1), outputPath?, template? }', ['rqIndex'],
    { rqIndex: { type: 'integer' }, omIndex: { type: 'integer' }, outputPath: { type: 'string' }, template: { type: 'string' } }),
  clearRenderQueue: withDesc('Remove all Render Queue items.', []),

  // comp
  setCompSettings: withDesc('Update comp settings (name/size/duration/fps/bg/motionBlur/workArea/...). { compId, ... }', ['compId'],
    { compId: { type: 'integer' }, name: { type: 'string' }, width: { type: 'integer' }, height: { type: 'integer' },
      pixelAspect: { type: 'number' }, duration: { type: 'number' }, frameRate: { type: 'number' },
      bgColor: { type: 'array', items: { type: 'number' } }, motionBlur: { type: 'boolean' },
      workAreaStart: { type: 'number' }, workAreaDuration: { type: 'number' },
      resolutionFactor: { type: 'array', items: { type: 'number' } } }),
  addCompMarker: withDesc('Add a comp marker. { compId, time, comment?, duration?, chapter?, label? (0-16, AE label color index) }', ['compId', 'time'],
    { compId: { type: 'integer' }, time: { type: 'number' }, comment: { type: 'string' }, duration: { type: 'number' },
      chapter: { type: 'string' }, label: { type: 'integer' } }),

  // layer
  setBlendMode: withDesc('Set a layer blend mode. { compId, layer, mode }', ['compId', 'mode'],
    { compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, mode: { type: 'string' } }),
  setTrackMatte: withDesc('Set a track matte (alpha|alphaInverted|luma|lumaInverted|none). { compId, layer, type, matteLayer? }', ['compId'],
    { compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, type: { type: 'string' }, matteLayer: { anyOf: [{ type: 'string' }, { type: 'number' }] } }),
  setLayerFlag: withDesc('Toggle a layer flag (motionBlur|adjustment|guide|threeD|collapse|solo|shy|lock|frameBlending). { compId, layer, flag, value? }', ['compId', 'flag'],
    { compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, flag: { type: 'string' }, value: { type: 'boolean' } }),
  selectLayer: withDesc('Set a layer\'s Timeline selection state (Layer.selected — a top-level boolean, not a keyframeable property). Needed before menu commands that act on "the selected layer" (e.g. executeMenuCommand with "Create Shapes from Vector Layer"). { compId, layer, clearOthers? (default true, deselects every other layer in the comp first) }', ['compId'],
    { compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, clearOthers: { type: 'boolean' } }),
  addLayerMarker: withDesc('Add a layer marker. { compId, layer, time, comment?, duration? }', ['compId', 'time'],
    { compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, time: { type: 'number' }, comment: { type: 'string' }, duration: { type: 'number' } }),
  setTimeStretch: withDesc('Set layer time stretch percent. { compId, layer, stretch }', ['compId', 'stretch'],
    { compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, stretch: { type: 'number' } }),
  enableTimeRemap: withDesc('Enable/disable time remapping. { compId, layer, enabled? (default true) }', ['compId'],
    { compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, enabled: { type: 'boolean' } }),
  replaceSource: withDesc('Replace a layer\'s source item. { compId, layer, itemId|itemName, fixExpressions? (default true) }', ['compId'],
    { compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, itemId: { type: 'integer' }, itemName: { type: 'string' }, fixExpressions: { type: 'boolean' } }),

  // project
  createFolder: withDesc('Create a project folder. { name? (default "Folder") }', [],
    { name: { type: 'string' } }),
  moveToFolder: withDesc('Move an item into a folder. { itemId|itemName, folderId|folderName }', [],
    { itemId: { type: 'integer' }, itemName: { type: 'string' }, folderId: { type: 'integer' }, folderName: { type: 'string' } }),
  setProxy: withDesc('Set a footage proxy file. { itemId|itemName, path }', ['path'],
    { itemId: { type: 'integer' }, itemName: { type: 'string' }, path: { type: 'string' } }),
  renameItem: withDesc('Rename a project item. { itemId|itemName, name }', ['name'],
    { itemId: { type: 'integer' }, itemName: { type: 'string' }, name: { type: 'string' } }),
  deleteItem: withDesc('Delete a project item. { itemId|itemName }. WARNING if the item is a folder: AE removes its contents ' +
    'recursively along with it (confirmed live 2026-08-11) — there is no "move children out first" step.', [],
    { itemId: { type: 'integer' }, itemName: { type: 'string' } }),

  // OS keystroke layer (panel-side). CAUTION: this leaves AE's own object
  // model — it's a synthetic OS-level key event delivered to whatever window
  // has focus when it fires. If AE isn't frontmost at that instant (a dialog,
  // notification, or the user's own click stole focus), the keys go to a
  // different application instead, and the effect isn't undoable via AE's
  // undo stack. Prefer executeMenuCommand/setLayerProperty/etc. when an
  // AE-scoped command exists; reach for this only for raw key combos that
  // have no AE scripting API or menu entry.
  keystroke: withDesc('Send OS keystrokes to AE. { keys } (SendKeys, e.g. "^s") | { text } | { key, ctrl?, alt?, shift?, cmd? (macOS Command key — AE\'s own mac shortcuts are almost all Cmd-based) }. CAUTION: this is a synthetic OS-level key event, not an AE API call — it goes to whichever window has focus when it fires (AE is activated first, but a stolen focus mid-flight sends it elsewhere) and its effect is not covered by AE\'s undo.', [],
    { keys: { type: 'string' }, text: { type: 'string' }, key: { type: 'string' },
      ctrl: { type: 'boolean' }, alt: { type: 'boolean' }, shift: { type: 'boolean' }, cmd: { type: 'boolean' } }),

  // discovery (read-only "what's installed")
  listFonts: withDesc('Enumerate installed fonts (postScriptName authoritative; family/style derived). { filter?, limit? }', [],
    { filter: { type: 'string' }, limit: { type: 'integer' } }),
  listInstalledEffects: withDesc('List every installed effect via app.effects (real enumeration, not a probe) — { name, matchName, category, version, isDeprecated }. { names? } filters to specific display names.', [],
    { names: { type: 'array', items: { type: 'string' } } }),
  findEffectMatchName: withDesc('Resolve an effect display name to its matchName. { name }', ['name'], { name: { type: 'string' } }),
  introspectEffect: withDesc('Add an effect (by display name or matchName) and dump its full parameter tree (name + matchName + valueType + default). The way to wire any third-party plugin. { name | names[], depth? }', [],
    { name: { type: 'string' }, names: { type: 'array', items: { type: 'string' } }, depth: { type: 'integer' } }),
  getEnvironment: withDesc('AE version/build, OS, ExtendScript, font count, project + memory info.', []),
  listPlugins: withDesc('Best-effort list of installed plugins (.aex/.plugin) by scanning install dirs. { dirs? }', [],
    { dirs: { type: 'array', items: { type: 'string' } } }),

  // friendly Lumetri grading (adds Lumetri if missing; sets params by name)
  applyLumetri: withDesc('Grade a layer with Lumetri by friendly name. { compId, layer, settings:{ saturation, temperature, tint, exposure, contrast, highlights, shadows, whites, blacks, vibrance, sharpen, vignette, ... }, time? }. NOTE: vignette\'s native range is -5..5, not -100..100 — out-of-range values land in the response\'s `skipped` list with the AE error, not a silent no-op.', ['compId'],
    { compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, settings: { type: 'object' }, time: { type: 'number' } }),
  lumetriParams: withDesc('List the friendly Lumetri param names the bridge supports.', []),

  // orchestration-grade tooling
  batch: withDesc('Run many commands in ONE round-trip + ONE undo group. { commands:[{command,params}], undoName?, stopOnError? }. quitApp/closeProject/openProject/saveProject are refused as inner commands (returned as ok:false, not executed) — they end the process or replace/persist the whole project mid-transaction; call them as their own top-level command after batch completes.', ['commands'],
    { commands: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, params: { type: 'object' } }, required: ['command'] } },
      undoName: { type: 'string' }, stopOnError: { type: 'boolean' } }),
  getCompTime: withDesc('Read comp playhead/work-area/frame info. { compId }', ['compId'],
    { compId: { type: 'integer' } }),
  duplicateComp: withDesc('Duplicate a comp. { compId, name? }', ['compId'],
    { compId: { type: 'integer' }, name: { type: 'string' } }),
  alignLayer: withDesc('Align a layer (center|hcenter|vcenter|left|right|top|bottom). { compId, layer, align, margin? }', ['compId'],
    { compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, align: { type: 'string' }, margin: { type: 'number' } }),
  alignAnchor: {
    description:
      'Sit a layer\'s own anchor point on an edge/corner/center of its own rendered content (via sourceRectAtTime) — for directional ' +
      'wipes / a bar that grows from one edge. { compId, layer, h? (left|center|right, default center), v? (top|middle|bottom, default ' +
      'middle), time?, keepPosition? (default true — compensates Position by the scaled delta so the layer doesn\'t visibly move; does ' +
      'NOT account for rotation) }. Returns { anchorPoint, position, h, v }. docs/ROADMAP.md Faz 2 madde 4.',
    schema: {
      compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, h: { type: 'string' }, v: { type: 'string' },
      time: { type: 'number' }, keepPosition: { type: 'boolean' },
    },
    validate(p) {
      const base = requireFields(p, ['compId']);
      if (p.h !== undefined && !['left', 'center', 'right'].includes(p.h)) {
        throw new ValidationError(`h must be one of: left, center, right (got "${p.h}")`);
      }
      if (p.v !== undefined && !['top', 'middle', 'bottom'].includes(p.v)) {
        throw new ValidationError(`v must be one of: top, middle, bottom (got "${p.v}")`);
      }
      return base;
    },
  },
  sequenceLayers: withDesc('Offset layers in time — each of layers[] gets startTime = start + index*step. { compId, layers[] (each a layer name or index), step? (seconds, default 1), start? (seconds, default 0) }', ['compId', 'layers'],
    { compId: { type: 'integer' }, layers: { type: 'array', items: { anyOf: [{ type: 'string' }, { type: 'number' }] } },
      step: { type: 'number' }, start: { type: 'number' } }),
  setWorkArea: withDesc('Set the comp work area. { compId, start, duration }', ['compId'],
    { compId: { type: 'integer' }, start: { type: 'number' }, duration: { type: 'number' } }),
  clearComp: withDesc('Remove all layers in a comp. { compId, keepPrefix? }', ['compId'],
    { compId: { type: 'integer' }, keepPrefix: { type: 'string' } }),

  // one-call realistic fire preset (flame noise + displace + colorize + embers + glow)
  fireEffect: withDesc('Add a realistic fire effect to a comp. { compId, center?, size?, width?, height?, embers?, highlight?, midtone?, glowRadius?, glowIntensity?, ambient?, prefix?, compMotionBlur? (default true) }', ['compId'],
    { compId: { type: 'integer' }, center: { type: 'array', items: { type: 'number' } }, size: { type: 'number' },
      width: { type: 'number' }, height: { type: 'number' }, embers: { type: 'boolean' },
      highlight: { type: 'array', items: { type: 'number' } }, midtone: { type: 'array', items: { type: 'number' } },
      glowRadius: { type: 'number' }, glowIntensity: { type: 'number' }, ambient: { type: 'number' },
      prefix: { type: 'string' }, compMotionBlur: { type: 'boolean' } }),
  smokeEffect: withDesc('Add rising smoke to a comp. { compId, center?, size?, width?, height?, color?, opacity?, prefix? }', ['compId'],
    { compId: { type: 'integer' }, center: { type: 'array', items: { type: 'number' } }, size: { type: 'number' },
      width: { type: 'number' }, height: { type: 'number' }, color: { type: 'array', items: { type: 'number' } },
      opacity: { type: 'number' }, prefix: { type: 'string' } }),
  glitchEffect: withDesc('Apply a digital glitch to a layer. { compId, layer, amount?, size?, shake? }', ['compId'],
    { compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, amount: { type: 'number' }, size: { type: 'number' }, shake: { type: 'number' } }),
  cinematicGrade: withDesc('Apply a cinematic Lumetri grade to a layer. { compId, layer, warm?, contrast?, saturation? }', ['compId'],
    { compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, warm: { type: 'boolean' }, contrast: { type: 'number' }, saturation: { type: 'number' } }),
  neonGlow: withDesc('Apply a neon glow stack to a layer. { compId, layer, radius? }', ['compId'],
    { compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, radius: { type: 'number' } }),

  // third-party plugin wrappers (Plugin Everything) — friendly params -> stable matchNames
  deepGlow: withDesc('Apply/Update Deep Glow 2 (PEDG2) on a layer by friendly name. { compId, layer, radius?, exposure?, threshold?, glowMode?, color?, colorOuter?, tintStrength?, params? }', ['compId'],
    { compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, radius: { type: 'number' }, exposure: { type: 'number' }, threshold: { type: 'number' },
      glowMode: { type: 'number' },
      color: { type: 'array', items: { type: 'number' } }, colorOuter: { type: 'array', items: { type: 'number' } },
      tintStrength: { type: 'number' }, params: { type: 'object' } }),
  shadowStudio: withDesc('Apply/Update Shadow Studio 3 (PESS3) on a layer by friendly name. { compId, layer, lightDirection?, shadowLength?, lightRadius?, softness?, color?, opacityStart?, opacityEnd?, samples?, params? }', ['compId'],
    { compId: { type: 'integer' }, ...LAYER_REF_SCHEMA, lightDirection: { type: 'number' }, shadowLength: { type: 'number' },
      lightRadius: { type: 'number' }, softness: { type: 'number' },
      color: { type: 'array', items: { type: 'number' } },
      opacityStart: { type: 'number' }, opacityEnd: { type: 'number' }, samples: { type: 'number' }, params: { type: 'object' } }),
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
    .map(([name, def]) => ({ name, description: def.description, dev: !!def.dev, schema: def.schema || null }));
}

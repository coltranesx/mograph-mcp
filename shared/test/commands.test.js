// commands.test.js — tests for the shared command registry + validation.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMANDS,
  validateCommand,
  commandList,
} from '@mograph-mcp/shared/commands';

describe('COMMANDS registry', () => {
  it('has all expected commands', () => {
    const expected = [
      'ping', 'getProjectInfo', 'listComps', 'createComp',
      'addSolid', 'addTextLayer', 'setLayerProperty', 'render', 'runJSX',
    ];
    for (const name of expected) {
      assert.ok(COMMANDS[name], `Missing command: ${name}`);
      assert.ok(typeof COMMANDS[name].validate === 'function', `${name}.validate is not a function`);
      assert.ok(typeof COMMANDS[name].description === 'string', `${name}.description is not a string`);
    }
  });

  it('marks runJSX as dev', () => {
    assert.equal(COMMANDS.runJSX.dev, true);
  });
});

describe('validateCommand', () => {
  it('rejects unknown commands', () => {
    const r = validateCommand('nonexistent', {});
    assert.equal(r.ok, false);
    assert.match(r.error, /Unknown/);
  });

  it('validates ping with no params', () => {
    const r = validateCommand('ping', {});
    assert.equal(r.ok, true);
  });

  it('validates createComp with all params', () => {
    const r = validateCommand('createComp', {
      name: 'Test', width: 1920, height: 1080, duration: 10, frameRate: 30,
    });
    assert.equal(r.ok, true);
    assert.equal(r.params.name, 'Test');
    assert.equal(r.params.width, 1920);
  });

  it('applies config.json defaults to createComp (25fps, not AE\'s 30)', () => {
    const r = validateCommand('createComp', { name: 'Test' });
    assert.equal(r.ok, true);
    assert.equal(r.params.width, 1920);
    assert.equal(r.params.height, 1080);
    assert.equal(r.params.duration, 10);
    assert.equal(r.params.frameRate, 25);
  });

  it('rejects createComp without name', () => {
    const r = validateCommand('createComp', {});
    assert.equal(r.ok, false);
    assert.match(r.error, /name/);
  });

  it('fills createComp from a named preset', () => {
    const r = validateCommand('createComp', { name: 'Test', preset: 'vertical' });
    assert.equal(r.ok, true);
    assert.equal(r.params.width, 1080);
    assert.equal(r.params.height, 1920);
    assert.equal(r.params.frameRate, 25);
  });

  it('lets explicit params override a preset', () => {
    const r = validateCommand('createComp', {
      name: 'Test', preset: 'square', height: 1350,
    });
    assert.equal(r.ok, true);
    assert.equal(r.params.width, 1080);
    assert.equal(r.params.height, 1350);
  });

  it('rejects an unknown createComp preset', () => {
    const r = validateCommand('createComp', { name: 'Test', preset: 'nope' });
    assert.equal(r.ok, false);
    assert.match(r.error, /preset/);
  });

  it('rejects addSolid without compId', () => {
    const r = validateCommand('addSolid', {});
    assert.equal(r.ok, false);
    assert.match(r.error, /compId/);
  });

  it('validates addSolid with valid color', () => {
    const r = validateCommand('addSolid', { compId: 1, color: [1, 0, 0] });
    assert.equal(r.ok, true);
    assert.deepEqual(r.params.color, [1, 0, 0]);
  });

  it('rejects addSolid with out-of-range color', () => {
    const r = validateCommand('addSolid', { compId: 1, color: [2, 0, 0] });
    assert.equal(r.ok, false);
    assert.match(r.error, /0\.\.1/);
  });

  it('validates setLayerProperty with allowed property', () => {
    const r = validateCommand('setLayerProperty', {
      compId: 1, layerIndex: 1, property: 'opacity', value: 50,
    });
    assert.equal(r.ok, true);
  });

  it('rejects setLayerProperty with invalid property name', () => {
    const r = validateCommand('setLayerProperty', {
      compId: 1, layerIndex: 1, property: 'color', value: [1, 0, 0],
    });
    assert.equal(r.ok, false);
    assert.match(r.error, /must be one of/);
  });

  it('rejects render without outputPath', () => {
    const r = validateCommand('render', { compId: 1 });
    assert.equal(r.ok, false);
    assert.match(r.error, /outputPath/);
  });

  it('blocks dev commands when allowDev is false', () => {
    const r = validateCommand('runJSX', { script: 'app.version' }, { allowDev: false });
    assert.equal(r.ok, false);
    assert.match(r.error, /dev-only/);
  });

  it('allows dev commands when allowDev is true', () => {
    const r = validateCommand('runJSX', { script: 'app.version' }, { allowDev: true });
    assert.equal(r.ok, true);
  });

  it('rejects non-object params', () => {
    const r = validateCommand('ping', 'not an object');
    assert.equal(r.ok, false);
    assert.match(r.error, /params must be an object/);
  });

  it('validates addTextLayer position', () => {
    const r = validateCommand('addTextLayer', {
      compId: 1, text: 'Hello', position: [960, 540],
    });
    assert.equal(r.ok, true);
    assert.deepEqual(r.params.position, [960, 540]);
  });

  it('rejects addTextLayer with bad position', () => {
    const r = validateCommand('addTextLayer', {
      compId: 1, text: 'Hello', position: [960],
    });
    assert.equal(r.ok, false);
    assert.match(r.error, /position/);
  });

  describe('addShape (pre-socket shape/polystar validation)', () => {
    it('accepts rectangle, ellipse, polystar', () => {
      for (const shape of ['rectangle', 'ellipse', 'polystar']) {
        const r = validateCommand('addShape', { compId: 1, shape });
        assert.equal(r.ok, true, `${shape}: ${r.error}`);
      }
    });

    it('defaults are fine without a shape at all', () => {
      const r = validateCommand('addShape', { compId: 1 });
      assert.equal(r.ok, true);
    });

    // No silent fallback to rectangle for a typo'd/unknown shape
    // (docs/ROADMAP.md "Faz 1.C").
    it('rejects an unknown shape', () => {
      const r = validateCommand('addShape', { compId: 1, shape: 'hexagon' });
      assert.equal(r.ok, false);
      assert.match(r.error, /shape must be one of: rectangle, ellipse, polystar/);
    });

    it('rejects an invalid polyType', () => {
      const r = validateCommand('addShape', { compId: 1, shape: 'polystar', polyType: 'triangle' });
      assert.equal(r.ok, false);
      assert.match(r.error, /polyType/);
    });

    it('rejects a non-integer or too-small points value', () => {
      for (const points of [2, 3.5, '5']) {
        const r = validateCommand('addShape', { compId: 1, shape: 'polystar', points });
        assert.equal(r.ok, false, `points=${JSON.stringify(points)} should be rejected`);
        assert.match(r.error, /points/);
      }
    });

    it('accepts a valid polystar payload end to end', () => {
      const r = validateCommand('addShape', {
        compId: 1, shape: 'polystar', polyType: 'polygon', points: 6, innerRadius: 40, outerRadius: 90,
      });
      assert.equal(r.ok, true);
    });
  });

  describe('alignAnchor (pre-socket)', () => {
    it('accepts h/v combinations and the defaultless call', () => {
      const r0 = validateCommand('alignAnchor', { compId: 1, layer: 1 });
      assert.equal(r0.ok, true);
      for (const h of ['left', 'center', 'right']) {
        for (const v of ['top', 'middle', 'bottom']) {
          const r = validateCommand('alignAnchor', { compId: 1, layer: 1, h, v });
          assert.equal(r.ok, true, `${h}/${v}: ${r.error}`);
        }
      }
    });

    it('rejects an invalid h', () => {
      const r = validateCommand('alignAnchor', { compId: 1, layer: 1, h: 'middle' });
      assert.equal(r.ok, false);
      assert.match(r.error, /h must be one of/);
    });

    it('rejects an invalid v', () => {
      const r = validateCommand('alignAnchor', { compId: 1, layer: 1, v: 'left' });
      assert.equal(r.ok, false);
      assert.match(r.error, /v must be one of/);
    });
  });

  describe('measureText (pre-socket)', () => {
    it('accepts a text-only call', () => {
      const r = validateCommand('measureText', { compId: 1, text: 'Hello' });
      assert.equal(r.ok, true);
    });

    it('accepts a layer-only call (no text)', () => {
      const r = validateCommand('measureText', { compId: 1, layer: 1 });
      assert.equal(r.ok, true);
      const r2 = validateCommand('measureText', { compId: 1, layerName: 'Title' });
      assert.equal(r2.ok, true);
    });

    it('rejects a call with neither text nor a layer reference', () => {
      const r = validateCommand('measureText', { compId: 1 });
      assert.equal(r.ok, false);
      assert.match(r.error, /text or layer/);
    });

    it('rejects an empty text string when no layer is given', () => {
      const r = validateCommand('measureText', { compId: 1, text: '' });
      assert.equal(r.ok, false);
      assert.match(r.error, /text or layer/);
    });
  });

  describe('resolveSafePosition (pre-socket)', () => {
    it('accepts all 9 named positions', () => {
      const positions = [
        'topLeft', 'topCenter', 'topRight',
        'middleLeft', 'center', 'middleRight',
        'bottomLeft', 'bottomCenter', 'bottomRight',
      ];
      for (const position of positions) {
        const r = validateCommand('resolveSafePosition', { compId: 1, position });
        assert.equal(r.ok, true, `${position}: ${r.error}`);
      }
    });

    it('injects config.json defaults (0.08 each side) when safeArea is omitted', () => {
      const r = validateCommand('resolveSafePosition', { compId: 1, position: 'bottomLeft' });
      assert.equal(r.ok, true);
      assert.deepEqual(r.params.safeArea, { top: 0.08, right: 0.08, bottom: 0.08, left: 0.08 });
    });

    it('lets a caller override only some sides, keeping config defaults for the rest', () => {
      const r = validateCommand('resolveSafePosition', {
        compId: 1, position: 'bottomLeft', safeArea: { bottom: 0.15 },
      });
      assert.equal(r.ok, true);
      assert.deepEqual(r.params.safeArea, { top: 0.08, right: 0.08, bottom: 0.15, left: 0.08 });
    });

    it('rejects an unknown position', () => {
      const r = validateCommand('resolveSafePosition', { compId: 1, position: 'dead center' });
      assert.equal(r.ok, false);
      assert.match(r.error, /position must be one of/);
    });

    it('rejects an out-of-range safeArea side', () => {
      const r = validateCommand('resolveSafePosition', {
        compId: 1, position: 'center', safeArea: { top: 0.6 },
      });
      assert.equal(r.ok, false);
      assert.match(r.error, /safeArea\.top/);
    });

    it('rejects a non-object safeArea', () => {
      const r = validateCommand('resolveSafePosition', { compId: 1, position: 'center', safeArea: 'big' });
      assert.equal(r.ok, false);
      assert.match(r.error, /safeArea/);
    });
  });

  describe('addShapeOperator (pre-socket matchName whitelist)', () => {
    it('accepts the live-confirmed operators (trim, repeater)', () => {
      for (const operator of ['trim', 'repeater']) {
        const r = validateCommand('addShapeOperator', { compId: 1, layer: 1, operator });
        assert.equal(r.ok, true, `${operator}: ${r.error}`);
        assert.equal(r.params.operator, operator);
      }
    });

    it('rejects a documented-but-unconfirmed candidate operator', () => {
      const r = validateCommand('addShapeOperator', { compId: 1, layer: 1, operator: 'zigzag' });
      assert.equal(r.ok, false);
      assert.match(r.error, /not been confirmed live/);
    });

    it('rejects a made-up operator with no ROADMAP hint', () => {
      const r = validateCommand('addShapeOperator', { compId: 1, layer: 1, operator: 'bogus' });
      assert.equal(r.ok, false);
      assert.match(r.error, /operator must be one of: trim, repeater/);
      assert.doesNotMatch(r.error, /not been confirmed live/);
    });

    it('rejects without compId/operator', () => {
      const r = validateCommand('addShapeOperator', { compId: 1 });
      assert.equal(r.ok, false);
      assert.match(r.error, /operator/);
    });

    it('accepts a valid params object (no insertAt/reorder support — see docs/DEVLOG.md 2026-08-09)', () => {
      const r = validateCommand('addShapeOperator', {
        compId: 1, layer: 1, operator: 'repeater',
        params: { 'ADBE Vector Repeater Copies': 5 },
      });
      assert.equal(r.ok, true);
      assert.deepEqual(r.params.params, { 'ADBE Vector Repeater Copies': 5 });
    });

    it('rejects a non-object params', () => {
      const r = validateCommand('addShapeOperator', {
        compId: 1, layer: 1, operator: 'trim', params: 'nope',
      });
      assert.equal(r.ok, false);
      assert.match(r.error, /params/);
    });
  });
});

describe('commandList', () => {
  it('excludes dev commands by default', () => {
    const list = commandList();
    const names = list.map((c) => c.name);
    assert.ok(!names.includes('runJSX'));
    assert.ok(names.includes('ping'));
  });

  it('includes dev commands when requested', () => {
    const list = commandList({ includeDev: true });
    const names = list.map((c) => c.name);
    assert.ok(names.includes('runJSX'));
  });

  it('returns objects with name, description, dev', () => {
    const list = commandList({ includeDev: true });
    for (const cmd of list) {
      assert.ok(typeof cmd.name === 'string');
      assert.ok(typeof cmd.description === 'string');
      assert.ok(typeof cmd.dev === 'boolean');
    }
  });
});

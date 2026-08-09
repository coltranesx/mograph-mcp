// validate.test.js — the v.* param validators, in particular the
// numeric-string tolerance (docs/DEVLOG.md 2026-08-09): schemaless MCP tool
// invocations deliver numeric params as strings ("16" instead of 16), and
// these validators used to strictly require typeof === 'number', rejecting
// a perfectly well-formed call before it ever reached AE.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { v, ValidationError } from '../src/validate.js';

describe('v.* numeric-string tolerance', () => {
  describe('requiredInt', () => {
    it('accepts a real number', () => {
      assert.equal(v.requiredInt({ x: 16 }, 'x'), 16);
    });
    it('accepts an integer-looking string', () => {
      assert.equal(v.requiredInt({ x: '16' }, 'x'), 16);
    });
    it('rejects a decimal string', () => {
      assert.throws(() => v.requiredInt({ x: '16.5' }, 'x'), ValidationError);
    });
    it('rejects garbage', () => {
      assert.throws(() => v.requiredInt({ x: 'abc' }, 'x'), ValidationError);
    });
    it('rejects missing', () => {
      assert.throws(() => v.requiredInt({}, 'x'), ValidationError);
    });
  });

  describe('optionalPositiveInt', () => {
    it('accepts a numeric string', () => {
      assert.equal(v.optionalPositiveInt({ x: '5' }, 'x'), 5);
    });
    it('returns the default when absent', () => {
      assert.equal(v.optionalPositiveInt({}, 'x', 42), 42);
    });
    it('rejects zero/negative numeric strings', () => {
      assert.throws(() => v.optionalPositiveInt({ x: '0' }, 'x'), ValidationError);
      assert.throws(() => v.optionalPositiveInt({ x: '-3' }, 'x'), ValidationError);
    });
  });

  describe('requiredPositiveInt', () => {
    it('accepts a numeric string', () => {
      assert.equal(v.requiredPositiveInt({ x: '7' }, 'x'), 7);
    });
  });

  describe('optionalPositiveNumber', () => {
    it('accepts a decimal numeric string', () => {
      assert.equal(v.optionalPositiveNumber({ x: '25.5' }, 'x'), 25.5);
    });
    it('returns the default when absent', () => {
      assert.equal(v.optionalPositiveNumber({}, 'x', 25), 25);
    });
  });

  describe('optionalColor (array elements as numeric strings)', () => {
    it('accepts an array of numeric strings', () => {
      assert.deepEqual(v.optionalColor({ x: ['0.2', '0.5', '0.9'] }, 'x'), [0.2, 0.5, 0.9]);
    });
    it('still rejects an out-of-range channel', () => {
      assert.throws(() => v.optionalColor({ x: ['1.5', '0', '0'] }, 'x'), ValidationError);
    });
    it('still rejects a non-numeric channel', () => {
      assert.throws(() => v.optionalColor({ x: ['red', '0', '0'] }, 'x'), ValidationError);
    });
  });

  describe('optionalPoint (array elements as numeric strings)', () => {
    it('accepts an array of numeric strings', () => {
      assert.deepEqual(v.optionalPoint({ x: ['960', '540'] }, 'x'), [960, 540]);
    });
    it('still rejects a non-numeric component', () => {
      assert.throws(() => v.optionalPoint({ x: ['960', 'center'] }, 'x'), ValidationError);
    });
  });
});

// eslint.config.js — lint scope for mograph-mcp.
//
// Only lints the code we actually author as modern Node/browser JS:
// controller/, shared/, simulator/, bin/, tools/, examples/, panel/src
// (minus the vendored Adobe CSInterface.js).
//
// panel/jsx/** is deliberately excluded — that's ExtendScript (ES3), not
// modern JS; running a modern ruleset over it would flag idiomatic
// ExtendScript as broken. See docs memory: ES3 chained-ternary trap is a
// real bug class there but ESLint's JS rules don't model AE's engine.
import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'panel/jsx/**',
      'panel/src/csInterface.js', // vendored Adobe SDK file, not ours to lint
      'aep/**',
      'assets/**',
      'packaging/**',
      'docs/**',
      'presets/**',
      'coverage/**',
    ],
  },
  js.configs.recommended,
  {
    // Node ESM: controller/simulator/shared source + tests, CLI tools, the
    // panel's own build scripts (they run under Node, not in the CEP panel).
    files: [
      'controller/src/**/*.js',
      'controller/test/**/*.js',
      'shared/**/*.js',
      'simulator/**/*.js',
      'bin/**/*.js',
      'tools/**/*.mjs',
      'tools/service.mjs',
      'examples/**/*.mjs',
      'panel/build/**/*.js',
      'panel/build/**/*.mjs',
    ],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // controller/ui — plain browser page served by the controller (no CEP,
    // no Node integration). Talks to the controller over WebSocket/fetch.
    files: ['controller/ui/**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'script',
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // CEP panel — browser-side, ES5-leaning IIFE style, not a module graph.
    // CEP panels run in a Chromium host with Node integration enabled, so
    // `require`/`process`/`cep_node` are legitimate globals here alongside
    // the DOM. `bridge` is window.bridge, set by bridge.js and consumed by
    // main.js/render.js — real cross-file globals, not typos.
    files: ['panel/src/**/*.js', 'tools/env.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.node,
        CSInterface: 'readonly',
        cep_node: 'readonly',
        bridge: 'readonly',
      },
    },
    rules: {
      // Older CEP Chromium builds can't be assumed to support optional catch
      // binding (`catch {}`), so genuinely-unused catch params here keep an
      // `_`-prefixed name instead of dropping the binding.
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    },
  },
];

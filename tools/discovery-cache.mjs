// discovery-cache.mjs — snapshot "what's installed" into docs/reference/*.json.
//
// Why: listInstalledEffects/listFonts/introspectEffect are live AE round-trips
// (seconds each); an agent planning a comp shouldn't have to re-probe AE every
// session just to know what's available. This script dumps a point-in-time
// cache the agent can read as a plain file instead. Re-run it whenever
// plugins/fonts change, or the cache goes stale.
//
// Usage: node tools/discovery-cache.mjs [--effects=Name1,Name2,...]
// Requires the controller reachable (npm run service:status) with the AE
// panel connected.

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../shared/src/config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT_DIR = resolve(ROOT, 'docs', 'reference');

// "Sık kullanılan efektler" — already wired into panel/jsx/commands/*.jsx
// (grep for ADBE/PEDG2/PESS3 matchNames) plus the handful of built-ins every
// typography/lower-third/grade job reaches for next (see docs/ROADMAP.md).
const DEFAULT_EFFECTS = [
  'Lumetri Color',
  'Glow',
  'CC Toner',
  'Turbulent Displace',
  'Fractal Noise',
  'Deep Glow 2',
  'Shadow Studio 3',
  'Drop Shadow',
  'Gaussian Blur',
  'Curves',
];

const cfg = loadConfig();
const base = `http://${cfg.host}:${cfg.port}`;

async function call(command, params = {}) {
  const res = await fetch(`${base}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, params }),
  });
  const body = await res.json();
  if (!body.ok) {
    throw new Error(`${command} failed: ${body.error || JSON.stringify(body)}`);
  }
  return body.result;
}

function writeJson(name, data) {
  mkdirSync(OUT_DIR, { recursive: true });
  const path = resolve(OUT_DIR, name);
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
  console.log(`wrote ${path}`);
}

async function main() {
  const arg = process.argv.find((a) => a.startsWith('--effects='));
  const effectNames = arg ? arg.slice('--effects='.length).split(',') : DEFAULT_EFFECTS;

  console.log(`Controller: ${base}`);
  const status = await call('getEnvironment');
  const generatedAt = new Date().toISOString();
  console.log(`AE: ${status.aeVersion || status.version || JSON.stringify(status)}`);

  const effects = await call('listInstalledEffects');
  writeJson('effects.json', { generatedAt, ae: status, ...effects });

  const fonts = await call('listFonts');
  writeJson('fonts.json', { generatedAt, ae: status, ...fonts });

  const detail = {};
  for (const name of effectNames) {
    try {
      detail[name] = await call('introspectEffect', { name });
      console.log(`  introspected: ${name}`);
    } catch (e) {
      detail[name] = { error: e.message };
      console.warn(`  FAILED: ${name} — ${e.message}`);
    }
  }
  writeJson('effects-detail.json', { generatedAt, ae: status, effects: detail });

  console.log('Done.');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

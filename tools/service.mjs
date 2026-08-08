// service.mjs — install/uninstall/status the controller as a macOS LaunchAgent.
//
// Why: the controller (controller/src/server.js) used to only run as a manual
// `npm run controller` shell process — it died whenever the terminal/session
// closed, and every new AE session started with "failed to connect" until
// someone remembered to restart it (see docs/DEVLOG.md 2026-08-08 (2)).
// A per-user LaunchAgent keeps it running across logins/reboots without a
// login item or a babysitting terminal.
//
// Usage: node tools/service.mjs install|uninstall|status|restart

import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, userInfo } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const LABEL = 'com.coltranesx.mograph-mcp.controller';
const PLIST_PATH = resolve(homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
const LOG_DIR = resolve(homedir(), 'Library', 'Logs', 'mograph-mcp');
const OUT_LOG = resolve(LOG_DIR, 'controller.out.log');
const ERR_LOG = resolve(LOG_DIR, 'controller.err.log');
const SERVER_JS = resolve(ROOT, 'controller', 'src', 'server.js');

// launchd GUI agents get a minimal PATH (no /opt/homebrew/bin) — the controller
// shells out to ffmpeg (controller/src/media.js) to transcode renders, so give
// it a real one instead of special-casing ffmpeg's path in config.json.
const PATH = '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin';

const uid = userInfo().uid;
const domainTarget = `gui/${uid}`;
const serviceTarget = `${domainTarget}/${LABEL}`;

function plistXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${SERVER_JS}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${ROOT}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${PATH}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${OUT_LOG}</string>
  <key>StandardErrorPath</key>
  <string>${ERR_LOG}</string>
</dict>
</plist>
`;
}

function launchctl(args) {
  return execFileSync('launchctl', args, { encoding: 'utf8' });
}

function tryLaunchctl(args) {
  try {
    return launchctl(args);
  } catch (e) {
    return e.stdout || e.message;
  }
}

function install() {
  mkdirSync(LOG_DIR, { recursive: true });
  writeFileSync(PLIST_PATH, plistXml());
  console.log(`Wrote ${PLIST_PATH}`);

  // bootout is a no-op (exits non-zero) if it wasn't loaded — fine either way.
  tryLaunchctl(['bootout', serviceTarget]);
  launchctl(['bootstrap', domainTarget, PLIST_PATH]);
  launchctl(['enable', serviceTarget]);
  console.log(`Loaded ${LABEL} — logs: ${OUT_LOG}`);
  status();
}

function uninstall() {
  tryLaunchctl(['bootout', serviceTarget]);
  if (existsSync(PLIST_PATH)) rmSync(PLIST_PATH);
  console.log(`Unloaded and removed ${PLIST_PATH}`);
}

function status() {
  try {
    console.log(launchctl(['print', serviceTarget]));
  } catch {
    console.log(`${LABEL} is not loaded.`);
  }
}

function restart() {
  tryLaunchctl(['kickstart', '-k', serviceTarget]);
  status();
}

const cmd = process.argv[2];
switch (cmd) {
  case 'install': install(); break;
  case 'uninstall': uninstall(); break;
  case 'status': status(); break;
  case 'restart': restart(); break;
  default:
    console.error('Usage: node tools/service.mjs install|uninstall|status|restart');
    process.exit(1);
}

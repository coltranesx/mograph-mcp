// service.mjs — install/uninstall/status the controller as a macOS LaunchAgent.
//
// Why: the controller (controller/src/server.js) used to only run as a manual
// `npm run controller` shell process — it died whenever the terminal/session
// closed, and every new AE session started with "failed to connect" until
// someone remembered to restart it (see docs/DEVLOG.md 2026-08-08 (2)).
// A per-user LaunchAgent keeps it running across logins/reboots without a
// login item or a babysitting terminal.
//
// The LaunchAgent used to point straight at the bare Homebrew `node` binary.
// That's functionally fine, but macOS's Background Task Management list
// (System Settings > General > Login Items & Extensions) then shows a raw
// "node" entry with a generic exec icon and "Item from unidentified
// developer" — it has no bundle metadata to read a name/icon from, and
// Homebrew's node is only ad-hoc signed. Wrapping the launch target in a
// .app bundle (Info.plist + icon) is meant to give it a proper name and
// icon in that list.
//
// Two things turned out to be required for BTM to actually read the
// bundle's name/icon instead of falling back to a generic "exec" icon and
// the raw CFBundleExecutable string as the name (verified live,
// 2026-08-10): the executable has to be a real Mach-O binary, not a shell
// script — a script apparently doesn't read as "this process belongs to an
// app bundle" to BTM — and the bundle has to carry at least an ad-hoc
// signature (`code object is not signed at all` was rejected outright).
// Neither requires an Apple Developer ID ($99/yr): `clang` compiles a
// trivial exec-wrapper into a real binary, and `codesign --sign -` ad-hoc
// signs it locally. This does NOT remove the "unidentified developer" text
// — that specific string does need a real Developer ID, which wasn't
// wanted here (private single-user tool, nobody else ever sees this list).
//
// Usage: node tools/service.mjs install|uninstall|status|restart

import { existsSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
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

// Wrapper .app so Login Items & Extensions shows a real name/icon instead of
// a bare "node" exec entry. Generated fresh on every install — not a build
// artifact worth versioning, just the icon source (tools/mograph-controller-icon.icns) is.
const APP_NAME = 'Mograph Controller';
// Login Items & Extensions displays the .app bundle's filename, not
// CFBundleName — the folder name has to carry the space too.
const APP_DIR = resolve(homedir(), 'Library', 'Application Support', 'mograph-mcp', `${APP_NAME}.app`);
const APP_MACOS_DIR = resolve(APP_DIR, 'Contents', 'MacOS');
const APP_RESOURCES_DIR = resolve(APP_DIR, 'Contents', 'Resources');
const APP_EXECUTABLE = resolve(APP_MACOS_DIR, 'MographController');
const APP_ICON_SRC = resolve(__dirname, 'mograph-controller-icon.icns');

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
    <string>${APP_EXECUTABLE}</string>
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

function appInfoPlistXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>${APP_NAME}</string>
  <key>CFBundleDisplayName</key>
  <string>${APP_NAME}</string>
  <key>CFBundleIdentifier</key>
  <string>${LABEL}</string>
  <key>CFBundleVersion</key>
  <string>1.0</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleExecutable</key>
  <string>MographController</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>LSUIElement</key>
  <true/>
  <key>LSBackgroundOnly</key>
  <true/>
</dict>
</plist>
`;
}

// A plain string-substituted exec() call — paths are absolute local paths
// on this machine, never attacker-controlled input, so this isn't a shell
// injection concern; it just needs valid C string literals.
function appLauncherSource() {
  return `// Generated by tools/service.mjs — do not edit directly, edit that instead.
// Must be a real Mach-O binary (not a shell script) — see the notes at the
// top of tools/service.mjs for why.
#include <unistd.h>
int main(int argc, char **argv) {
  execl("${process.execPath}", "${process.execPath}", "${SERVER_JS}", (char *)NULL);
  return 1; // only reached if execl failed
}
`;
}

// Bundle is ad-hoc signed (no Developer ID) — enough for Background Task
// Management to read its name/icon, not for Gatekeeper trust.
function buildApp() {
  mkdirSync(APP_MACOS_DIR, { recursive: true });
  mkdirSync(APP_RESOURCES_DIR, { recursive: true });
  writeFileSync(resolve(APP_DIR, 'Contents', 'Info.plist'), appInfoPlistXml());
  execFileSync('clang', ['-O2', '-x', 'c', '-', '-o', APP_EXECUTABLE], { input: appLauncherSource() });
  copyFileSync(APP_ICON_SRC, resolve(APP_RESOURCES_DIR, 'AppIcon.icns'));
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', APP_DIR], { stdio: ['ignore', 'pipe', 'pipe'] });
  console.log(`Wrote ${APP_DIR}`);

  // Force LaunchServices to (re)index the bundle immediately — otherwise the
  // name/icon in Login Items & Extensions can stay stale until next login.
  const lsregister = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';
  tryExecFile(lsregister, ['-f', APP_DIR]);
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

function tryExecFile(cmd, args) {
  try {
    return execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  } catch (e) {
    return e.stdout || e.message;
  }
}

function bootstrapWithRetry(attempts = 5, delayMs = 400) {
  for (let i = 1; i <= attempts; i++) {
    try {
      execFileSync('launchctl', ['bootstrap', domainTarget, PLIST_PATH], { stdio: ['ignore', 'pipe', 'pipe'] });
      return;
    } catch (e) {
      if (i === attempts) throw e;
      execFileSync('sleep', [String(delayMs / 1000)]);
    }
  }
}

function install() {
  mkdirSync(LOG_DIR, { recursive: true });
  buildApp();
  writeFileSync(PLIST_PATH, plistXml());
  console.log(`Wrote ${PLIST_PATH}`);

  // bootout is a no-op (exits non-zero) if it wasn't loaded — fine either way.
  // launchd sometimes hasn't fully released the old instance yet (SIGTERM is
  // graceful, not instant) and an immediate bootstrap fails with a transient
  // "Input/output error: 5" — retry with a short backoff instead of dying.
  tryLaunchctl(['bootout', serviceTarget]);
  bootstrapWithRetry();
  launchctl(['enable', serviceTarget]);
  console.log(`Loaded ${LABEL} — logs: ${OUT_LOG}`);
  status();
}

function uninstall() {
  tryLaunchctl(['bootout', serviceTarget]);
  if (existsSync(PLIST_PATH)) rmSync(PLIST_PATH);
  if (existsSync(APP_DIR)) rmSync(APP_DIR, { recursive: true });
  console.log(`Unloaded and removed ${PLIST_PATH} and ${APP_DIR}`);
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

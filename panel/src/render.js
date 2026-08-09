// render.js — non-blocking render for the CEP panel (runs panel-side in AE).
//
// Why panel-side: rendering must happen where AE and the project file live. In
// cloud, the controller is remote — only the AE machine can render. So the panel
// spawns aerender.exe (NOT the controller). And aerender is used instead of the
// scripting Render Queue because rqItem.render() is modal and freezes AE + the
// evalScript bridge for the whole render. aerender is headless and streams
// progress to stdout, which we parse into `progress` events.
//
// Contract: respond to the render command immediately with { jobId, status:
// 'rendering' }, emit `progress` events while rendering, then a `renderComplete`
// event with the final outcome. The bridge never blocks.

(function () {
  'use strict';

  var cs = new CSInterface();

  // require() inside CEP: with --mixed-context the global require works; fall
  // back to window.cep_node.require when not in mixed-context.
  function nodeRequire(mod) {
    if (typeof require === 'function') return require(mod);
    if (typeof window !== 'undefined' && window.cep_node && window.cep_node.require) {
      return window.cep_node.require(mod);
    }
    throw new Error('Node require is unavailable — is --enable-nodejs set in the manifest?');
  }

  // Locate aerender, with an env override for non-standard installs.
  // Windows: next to AfterFX.exe (Support Files). macOS: at the app root
  // (/Applications/Adobe After Effects <year>/aerender).
  function getAerenderPath() {
    var path = nodeRequire('path');
    var env = (typeof process !== 'undefined' && process.env) ? process.env : {};
    if (env.AE_BRIDGE_AERENDER) return env.AE_BRIDGE_AERENDER;
    var hostExe = cs.getSystemPath('hostApplication');
    var isMac = (typeof process !== 'undefined' && process.platform === 'darwin');
    if (isMac) {
      // hostExe looks like:
      //   /Applications/Adobe After Effects 2026/Adobe After Effects 2026.app/Contents/MacOS/After Effects
      // aerender is a SIBLING of the top-level "Adobe After Effects <year>"
      // folder, not inside the .app bundle. The old greedy regex
      // (.*Adobe After Effects[^\/]*)\/ matched through to the .app folder
      // instead (both segments contain "Adobe After Effects", greedy .*
      // prefers the last match) — confirmed live 2026-08-09: it built
      // ".../Adobe After Effects 2026.app/aerender" (doesn't exist), and
      // cp.spawn() on a nonexistent path silently closed with code -2 in
      // this CEP Node context (no stdout/stderr, no 'error' event) instead
      // of failing loudly, which made every render fail with an opaque
      // "aerender exited -2" no matter what the comp/project looked like.
      var parts = hostExe.split('/');
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].indexOf('Adobe After Effects') === 0 && parts[i].indexOf('.app') === -1) {
          return parts.slice(0, i + 1).join('/') + '/aerender';
        }
      }
      return path.dirname(hostExe) + '/aerender'; // fallback if the folder naming ever changes
    }
    return path.join(path.dirname(hostExe), 'aerender.exe');
  }

  // aerender prints frame progress like: "PROGRESS:  0:00:00:00 (12): 5 Seconds".
  // The "(N)" group is the frame index. Percent is computed over the RENDERED
  // range (scoped start..end) so a scoped render reaches 100%, not just the
  // fraction of the whole comp.
  function parsePercent(line, scopeStart, scopeEnd) {
    var m = /\((\d+)\)/.exec(line);
    if (m && scopeEnd > scopeStart) {
      var frame = parseInt(m[1], 10);
      return Math.max(0, Math.min(100, Math.round(((frame - scopeStart) / (scopeEnd - scopeStart)) * 100)));
    }
    return null;
  }

  function render(env, sendEnvelope, sendEvent, log) {
    bridge.callHost('__prepareRender', env.params).then(function (prep) {
      if (!prep.ok) {
        sendEnvelope({ id: env.id, type: 'result', ok: false, error: prep.error });
        return;
      }
      var info = prep.result;

      if (!info.projectSaved) {
        sendEnvelope({
          id: env.id,
          type: 'result',
          ok: false,
          error: 'Project must be saved before rendering (aerender needs a file on disk)',
          code: 'PROJECT_UNSAVED',
        });
        return;
      }

      var jobId = 'render_' + info.compId + '_' + (new Date()).getTime();

      // Respond immediately — non-blocking contract.
      sendEnvelope({
        id: env.id,
        type: 'result',
        ok: true,
        result: { jobId: jobId, status: 'rendering', outputPath: info.outputPath },
      });

      var cp, aerender;
      try {
        cp = nodeRequire('child_process');
        aerender = getAerenderPath();
      } catch (e) {
        sendEvent('renderComplete', { jobId: jobId, ok: false, error: e.message });
        return;
      }

      var args = [
        '-project', info.projectPath,
        '-comp', info.compName,
        '-output', info.outputPath,
      ];
      if (info.settingsTemplate) args.push('-RStemplate', info.settingsTemplate);
      if (info.outputModuleTemplate) args.push('-OMtemplate', info.outputModuleTemplate);
      // Scoped render: only the requested frame range (HLD priority #1 lever).
      if (info.startFrame !== null && info.startFrame !== undefined) args.push('-s', String(info.startFrame));
      if (info.endFrame !== null && info.endFrame !== undefined) args.push('-e', String(info.endFrame));

      log('dim', 'aerender ' + aerender + ' ' + args.join(' '));

      var child;
      try {
        child = cp.spawn(aerender, args);
      } catch (e) {
        sendEvent('renderComplete', { jobId: jobId, ok: false, error: 'spawn failed: ' + e.message });
        return;
      }

      var scopeStart = (info.startFrame !== null && info.startFrame !== undefined) ? info.startFrame : 0;
      var scopeEnd = (info.endFrame !== null && info.endFrame !== undefined) ? info.endFrame : info.totalFrames;
      var lastPercent = -1;
      // A non-zero exit code alone (e.g. "aerender exited -2") is undiagnosable
      // — aerender's actual reason is in its stdout/stderr text, which used to
      // be discarded (stderr went out as unattributed 'log' events nobody
      // stored; stdout wasn't kept at all). Keep the last few KB of combined
      // output and attach it to renderComplete on failure so the error is
      // actionable without re-running aerender by hand to see what it said.
      var outputTail = '';
      function keepTail(text) {
        outputTail += text;
        if (outputTail.length > 4000) outputTail = outputTail.slice(-4000);
      }
      function onChunk(buf) {
        var text = buf.toString();
        keepTail(text);
        var lines = text.split(/\r?\n/);
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i];
          if (!line) continue;
          var pct = parsePercent(line, scopeStart, scopeEnd);
          if (pct !== null && pct !== lastPercent) {
            lastPercent = pct;
            sendEvent('progress', { jobId: jobId, percent: pct, message: line });
          }
        }
      }
      if (child.stdout) child.stdout.on('data', onChunk);
      if (child.stderr) child.stderr.on('data', function (b) {
        var text = b.toString();
        keepTail(text);
        sendEvent('log', { jobId: jobId, level: 'warn', message: 'aerender: ' + text });
      });

      child.on('error', function (e) {
        sendEvent('renderComplete', { jobId: jobId, ok: false, error: e.message, tail: outputTail });
      });
      child.on('close', function (code) {
        sendEvent('renderComplete', {
          jobId: jobId,
          ok: code === 0,
          code: code,
          outputPath: info.outputPath,
          tail: (code === 0) ? undefined : outputTail,
        });
      });
    });
  }

  window.renderHandler = { render: render, getAerenderPath: getAerenderPath };
})();

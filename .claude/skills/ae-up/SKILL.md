---
name: ae-up
description: Use this skill when starting work on mograph-mcp and needing to confirm the After Effects bridge is actually usable — "is AE up", "check the bridge", "connect to AE", "is the controller running", or before any AE automation task if connection state is unknown. Checks the controller service, starts it if down, and verifies the round trip to AE with a live command — not just a port check.
---

# ae-up — controller running → panel connected → round trip verified

Three independent things can be down; check them in order and don't assume
one implies the other. Report which layer failed, not just "not connected".

## 1. Is the controller service up?

```bash
curl -s -m 3 http://127.0.0.1:8787/api/status
```

- **Connection refused / timeout** → the controller process itself isn't
  running. Bring it up as the LaunchAgent (the persistent service — see
  `docs/DEVLOG.md` 2026-08-08 for why it's a LaunchAgent and not a manual
  `npm run controller`):
  ```bash
  npm run service:status     # loaded but crashed? check the log paths it prints
  npm run service:install    # (re)installs + starts it; safe to re-run
  ```
  Then re-run the `curl` above. If it still refuses, read
  `~/Library/Logs/mograph-mcp/controller.err.log` for the actual error
  (port already taken by a stray manual process is the usual cause — check
  `lsof -i :8787 -sTCP:LISTEN` and kill anything that isn't the LaunchAgent).
- **Responds with JSON** → controller is up, move to step 2. The response
  already carries the answer to step 2 as `status.connected`.

## 2. Is the AE panel connected to it?

Read `status.connected` from the step 1 response (or call the
`mograph-mcp` MCP's `ae_status` tool if it's attached in this session —
same data).

- `false` → the controller is up but no panel has dialed in. Either AE
  isn't running, or the panel isn't open, or it crashed. Tell the user:
  1. Launch After Effects.
  2. Window > Extensions > mograph-mcp — this opens the panel, which dials
     the controller automatically. If the panel is already open but shows
     disconnected, close and reopen it (Window > Extensions menu again).
  Then re-check `status.connected`. The panel reconnects on its own within
  a few seconds of the controller becoming reachable (see
  `config.json`'s `reconnect` block) — don't assume a fixed dead state,
  give it a moment before re-checking.
- `true` → move to step 3. Don't stop here — a stale `connected:true` from
  a half-dead panel is exactly what step 3 catches.

## 3. Verify the round trip

Don't trust the status flag alone — prove AE is actually executing
commands right now:

- If the `mograph-mcp` MCP is attached this session: call `ae_ping` (or
  `ae_command` with `{"command":"ping"}`).
- Otherwise: `curl -s -X POST http://127.0.0.1:8787/command -H 'Content-Type: application/json' -d '{"command":"ping","params":{}}'`

A working round trip returns `{"ok":true,"result":{"pong":true,"ae":"<version>"}}`
(or similar — the AE version string confirms it actually reached the host,
not just that the socket is open). Report the AE version back to the user
as the final confirmation.

## Done state

Report exactly one of:
- ✅ up end-to-end, AE `<version>`, project `<name>`.
- ⚠️ controller up, panel not connected — told user to open AE/the panel.
- ❌ controller itself down and `service:install` didn't fix it — paste the
  `controller.err.log` tail so the user can see why.

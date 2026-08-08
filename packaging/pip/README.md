# mograph-mcp (Python launcher)

Puppeteer for After Effects. Use AE with Claude Code to make production-ready videos.

mograph-mcp is a Node.js tool. This package is a thin launcher that forwards to the npm-published `mograph-mcp` CLI through `npx`, so `pip install mograph-mcp` gives you the `mograph-mcp` command without a separate npm install.

```bash
pip install mograph-mcp

mograph-mcp controller   # start the controller (WebSocket + REST + web UI)
mograph-mcp mcp          # start the stdio MCP server for Claude Code / Desktop
mograph-mcp sim          # start the headless After Effects simulator
```

Requires Node.js 18+ on your PATH. Driving a real After Effects also needs the CEP panel, deployed from the repo with `npm run deploy:panel`.

Full docs: https://github.com/coltranesx/mograph-mcp

# Joern MCP Server

A **[Model Context Protocol (MCP)](https://modelcontextprotocol.io/)** server that exposes **Joern** (Code Property Graph / CPG) workflows to AI assistants and IDEs such as **Cursor**. It does not embed Joern—it **orchestrates** it via **`joern --server`** (`POST /query-sync`) and/or **CLI subprocesses** (`joern`, `joern-scan`, `joern-parse`, …).

---

## Features

- **Import & CPG** — `joern_import_code` / `joern_importcode` (`importCode.<language>`, optional `run.ossdataflow`)
- **Queries & scripts** — find calls, methods, dataflow, custom Scala (`joern_run_script`), graph dumps, etc.
- **HTTP-first** — With **`JOERN_SERVER_URL`**, script tools send CPGQL **in memory** to **`/query-sync`** (no `joern --script` subprocess per call)
- **Spawn fallback** — Without a server URL, uses **`joern [cpg] --script`** and Joern CLI tools
- **Strict HTTP mode** — **`JOERN_MCP_HTTP_ONLY=1`** blocks spawn for scripts; CLI-only tools error (see [BACKEND.md](./BACKEND.md))
- **Direct HTTP tools** — `joern_http_check`, `joern_http_query` (curl-equivalent to `/query-sync`)
- **Verbose debugging** — **`JOERN_MCP_DEBUG=1`** logs routing, HTTP timing, and spawn argv on **stderr** only

Full tool list: **[TOOLS.txt](./TOOLS.txt)**

---

## Requirements

| Requirement | Notes |
|-------------|--------|
| **Node.js** | `>= 18` |
| **Joern** | Installed; **`JOERN_HOME`** should point at the install (contains `joern-cli/`) for spawn paths |
| **(Recommended)** **`joern --server`** | Long-lived JVM + loaded CPG for fast, repeated MCP queries |

---

## Quick start

```bash
cd joern-mcp-server
npm install
npm run build
```

Run manually (stdio MCP — used by Cursor as a child process):

```bash
node dist/index.js
```

Or:

```bash
npm start
```

---

## Cursor / MCP configuration

1. Copy **[mcp.json.example](./mcp.json.example)** into your Cursor MCP config (e.g. `~/.cursor/mcp.json`).
2. Set **`args`** to the **absolute** path of **`dist/index.js`** on your machine.
3. Set **`JOERN_HOME`** and (recommended) **`JOERN_SERVER_URL`** to your **`joern --server`** base URL (no trailing slash).

Step-by-step checklist: **[MCP-CURSOR.md](./MCP-CURSOR.md)**

### Example `mcp.json` fragment

```json
"joern": {
  "command": "node",
  "args": ["/absolute/path/to/joern-mcp-server/dist/index.js"],
  "env": {
    "JOERN_HOME": "/opt/joern",
    "JOERN_SERVER_URL": "http://127.0.0.1:8080",
    "JOERN_MCP_HTTP_ONLY": "1",
    "JOERN_MCP_DEBUG": "1"
  }
}
```

Reload MCP in Cursor after changes (or restart the editor).

---

## Running Joern for HTTP mode

Start a server on the same host as MCP if you use import + HTTP (shared paths and `$TMP/joern-mcp`):

```bash
joern --server --server-host 127.0.0.1 --server-port 8080
```

Optional: pass a **`cpg.bin`** as the last argument if you already have a graph. Otherwise use **`joern_import_code`** from MCP to build the CPG over **`/query-sync`**.

---

## How it works (short)

1. **MCP client** starts this Node process with **stdio** JSON-RPC (**stdout** must stay protocol-clean).
2. **Tools** are registered from `src/tools/*`.
3. **Script-style tools** generate Scala (`@main def main() = { … }`), then:
   - **HTTP:** unwrap the body → **`POST { "query": "…" }`** to **`JOERN_SERVER_URL/query-sync`**
   - **Spawn:** write a temp **`.sc`** → **`joern … --script`**
4. **CLI tools** (`joern_scan`, `joern_parse`, …) always **spawn** separate binaries (no Joern HTTP API for them).

Detailed behavior, FAQ, and env table: **[BACKEND.md](./BACKEND.md)**

---

## Environment variables

| Variable | Purpose |
|----------|---------|
| **`JOERN_SERVER_URL`** | Base URL for **`/query-sync`** (e.g. `http://127.0.0.1:8080`) |
| **`JOERN_HOME`** | Joern install root for spawned CLIs |
| **`JOERN_MCP_HTTP_ONLY`** | `1` / `true` / `yes` — scripts only via HTTP; CLI wrappers error |
| **`JOERN_MCP_FORCE_SPAWN`** | Force **`joern --script`** even if URL is set |
| **`JOERN_SERVER_USER`** / **`JOERN_SERVER_PASSWORD`** | Basic auth for HTTP (see BACKEND for aliases) |
| **`JOERN_SERVER_TIMEOUT_MS`** | **`/query-sync`** timeout (default `300000`) |
| **`JOERN_MCP_DEBUG`** | Verbose **stderr** diagnostics |
| **`JOERN_MCP_DEBUG_QUERY_MAX`** | Max chars of query in debug previews (default `2000`) |

More detail: **[BACKEND.md](./BACKEND.md)**

---

## Documentation index

| Doc | Content |
|-----|---------|
| [BACKEND.md](./BACKEND.md) | HTTP vs spawn, env vars, module layout |
| [MCP-CURSOR.md](./MCP-CURSOR.md) | Cursor setup, HTTP-only workflow |
| [TOOLS.txt](./TOOLS.txt) | All MCP tools and parameters |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | `ClosedResourceError`, timeouts, checks |
| [PLOT-HTTP.md](./PLOT-HTTP.md) | Plots / DOT over HTTP |
| [mcp.json.example](./mcp.json.example) | Sample Cursor config |

---

## Project layout

```
joern-mcp-server/
├── dist/                 # tsc output (run from here)
├── src/
│   ├── index.ts          # MCP stdio entry
│   ├── create-server.ts  # McpServer + tool registration
│   ├── tools/            # One registrar per MCP tool
│   ├── joern/            # executor, http, spawn, debug, unwrap-main
│   ├── scripts.ts        # Generated Joern Scala strings
│   └── config/           # MCP_OUT paths
├── package.json
└── README.md
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript → `dist/` |
| `npm start` | Run `node dist/index.js` |
| `npm run dev` | `tsc --watch` |

After **any** source change: **`npm run build`**, then reload MCP in the client.

---

## Troubleshooting

- **`ClosedResourceError` / MCP disconnects** — See **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)**; try **`joern_http_check`** and run **`node dist/index.js`** alone to see stderr.
- **Empty or weird plot output over HTTP** — See **[PLOT-HTTP.md](./PLOT-HTTP.md)**.

---

## License

Apache-2.0 (see [package.json](./package.json)).

---

## Contributing / support

Issues and PRs welcome in the hosting repository. For Joern itself, see the [Joern](https://joern.io/) project documentation.

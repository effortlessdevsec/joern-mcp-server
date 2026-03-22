# Joern MCP Server — execution backends

**Import / CPG creation:** `joern_import_code` and **`joern_importcode`** (same handler) run Joern **`importCode.<language>(inputPath)`**; optional **`runOssDataflow`** (default true).

**Direct HTTP (`/query-sync`):** **`joern_http_check`** and **`joern_http_query`** POST a raw `query` string (same as `curl -d '{"query":"..."}'`). They require **`JOERN_SERVER_URL`** and **ignore `JOERN_MCP_FORCE_SPAWN`** so you can probe the server while script tools use spawn. **`plotDot*`** often returns **empty stdout** (SVG via Graphviz on the server). For DOT text in stdout over HTTP, see **`PLOT-HTTP.md`** (e.g. `cpg.method.take(1).dotDdg.foreach(println)`).

**Joern CLI wrappers (spawn only, under `$JOERN_HOME/joern-cli/` or PATH):** `joern_scan` (+ `--names` / `--tags` / `--depth` / `--store`), `joern_scan_list_queries`, `joern_scan_list_languages`, `joern_parse`, `joern_export`, `joern_slice`. These never use `JOERN_SERVER_URL`.

### How script tools run (recommended: HTTP)

| Condition | Behavior |
|-----------|----------|
| **`JOERN_SERVER_URL` is set** | **Primary path:** scripts run via **`POST /query-sync`** on `joern --server` (warm JVM + loaded CPG). |
| **`JOERN_SERVER_URL` unset** | **Fallback:** spawn **`joern [cpgPath] --script <file.sc>`** each time (cold JVM; `cpgPath` and `--param` fully honored). |
| **`JOERN_MCP_FORCE_SPAWN=1`** | Force spawn for scripts even if `JOERN_SERVER_URL` is set (e.g. you need **`joern_run_script` `params`** over HTTP). |
| **`JOERN_MCP_HTTP_ONLY=1`** | Script tools **refuse spawn**; require `JOERN_SERVER_URL` (and do not set `JOERN_MCP_FORCE_SPAWN`). **CLI tools** (`joern_scan`, `joern_parse`, …) return an error (no Joern HTTP API for them). |

## FAQ: “I set `JOERN_SERVER_URL` — why do I still see ‘script’ in the code?”

The server **does use HTTP** for those tools. We **generate Scala** (`@main def main() = { … }`), unwrap it, and:

- **HTTP mode:** send the body **in memory** as **`POST …/query-sync`** `{ "query": "…" }` — **no** temp file, **no** `joern --script` process.
- **Spawn mode:** write a **temporary `.sc`** and run **`joern [cpg] --script /tmp/….sc`**.

So “script” = **Scala source text**. With your URL set (and no `JOERN_MCP_FORCE_SPAWN`), execution is **HTTP only** for script-backed tools.

## 1. HTTP — `joern --server` (use this when you can)

- **Enable:** set `JOERN_SERVER_URL` (e.g. `http://127.0.0.1:8080`).
- **Behavior:** read the generated `.sc` file, unwrap `@main def main() = { ... }`, `POST /query-sync` with `{ "query": "..." }`.
- **Pros:** Warm JVM and graph; ideal for many queries against the **same** CPG.
- **Cons:** You must run and secure Joern separately; tool `cpgPath` is informational only (server uses whatever it loaded at startup).

## 2. Spawn — fallback when no server URL

- **Behavior:** `joern [cpgPath] --script <file.sc>` per tool invocation.
- **Pros:** No separate server; `cpgPath` and `--param` work per call.
- **Cons:** JVM + CPG load cost on every call.

### Start Joern for MCP HTTP mode

```bash
joern --server --server-host 127.0.0.1 --server-port 8080 \
  --runBefore "run.ossdataflow" \
  /absolute/path/to/cpg.bin
```

Optional Basic auth (must match env below):

```bash
joern --server --server-auth-username admin --server-auth-password secret \
  /path/to/cpg.bin
```

### Environment variables

| Variable | Description |
|----------|-------------|
| `JOERN_SERVER_URL` | **Set this** for HTTP: base URL (no trailing slash). If unset, script tools use **spawn** fallback. |
| `JOERN_SERVER_USER` + `JOERN_SERVER_PASSWORD` | Basic auth (or `JOERN_SERVER_BASIC_*`). |
| `JOERN_SERVER_TIMEOUT_MS` | Milliseconds for `/query-sync` (default 300000). |
| `JOERN_MCP_FORCE_SPAWN` | If `1` / `true` / `yes`, script tools **always spawn** (ignores `JOERN_SERVER_URL`). |
| `JOERN_MCP_HTTP_ONLY` | If `1` / `true` / `yes`, script tools use **only** `/query-sync` (require URL); CLI Joern tools error. |
| `JOERN_MCP_DEBUG` | If `1` / `true` / `yes`: verbose **stderr** diagnostics — startup env summary (no password values), every **`[executor]`** script routing decision, **`[http]`** `/query-sync` request/response previews + timing, **`[spawn]`** CLI argv + exit codes. Never logs stdout (MCP protocol). |
| `JOERN_MCP_DEBUG_QUERY_MAX` | Max characters of query/script included in debug previews (default `2000`). |
| `JOERN_HOME` | Joern install dir: used for **spawn** (`joern`, `joern-scan`, …) and should match your CLI install. |

### What always uses spawn (no HTTP in Joern for these)

- **`joern_scan`**, **`joern_scan_list_*`**, **`joern_parse`**, **`joern_export`**, **`joern_slice`** — separate `joern-cli` binaries, not `/query-sync`.

### Module layout (source)

| Path | Role |
|------|------|
| `src/index.ts` | Process entry: MCP stdio + debug log |
| `src/create-server.ts` | `createJoernMcpServer()` — wires `McpServer` + all tools |
| `src/tools/index.ts` | `registerAllJoernTools()` — one registrar per MCP tool |
| `src/tools/run-script.ts` … `scan.ts` | Individual tool modules (`registerXxxTool`) |
| `src/config/paths.ts` | `MCP_OUT`, `ensureMcpOutDir()` |
| `src/flow-graph/merge-dot.ts` | Merged flow DOT builder (`joern_full_flow_graph`) |
| `src/scripts.ts` | Generated Joern Scala strings (unchanged) |
| `src/joern/types.ts` | `JoernRunResult` |
| `src/joern/spawn.ts` | `joern --script`, `joern-scan`, `writeTempScript` |
| `src/joern/http.ts` | `POST /query-sync`, unwrap `@main` |
| `src/joern/unwrap-main.ts` | Strip `@main` wrapper for HTTP |
| `src/joern/executor.ts` | Chooses backend; exports `runJoernScriptFromSource`, `runJoernScript`, `runJoernScan`, `writeTempScript` (spawn-only helper) |

### Cursor `mcp.json`

- **`mcp.json.example`** — valid multi-server template (MongoDB + Joern); copy to `~/.cursor/mcp.json`.
- **`MCP-CURSOR.md`** — checklist, auth/timeouts, reload notes.

Joern-only snippet (spawn + HTTP to a running `joern --server`):

```json
{
  "mcpServers": {
    "joern": {
      "command": "node",
      "args": ["/path/to/joern-mcp-server/dist/index.js"],
      "env": {
        "JOERN_HOME": "/path/to/joern-install",
        "JOERN_SERVER_URL": "http://127.0.0.1:8080"
      }
    }
  }
}
```

Unset `JOERN_SERVER_URL` to use **spawn-only** for scripts. For Basic auth, add `JOERN_SERVER_USER` / `JOERN_SERVER_PASSWORD`.

Full HTTP API: `docs/JOERN-HTTP-SERVER-GUIDE.md` in the Joern repository.

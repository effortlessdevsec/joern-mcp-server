# Cursor `mcp.json` setup

Copy **`mcp.json.example`** to your Cursor config as **`~/.cursor/mcp.json`**, then adjust paths and secrets.

## Checklist

1. **`npm run build`** in `joern-mcp-server` so `dist/index.js` exists.
2. **`args`** must be the **absolute** path to `joern-mcp-server/dist/index.js`.
3. **`JOERN_HOME`** must point at your Joern install (contains `joern` / `joern-scan`).
4. **`JOERN_SERVER_URL`** (see `mcp.json.example`): e.g. `http://127.0.0.1:8080` — **recommended:** script-based MCP tools use **`joern --server`** via **`/query-sync`**. **Omit this variable** only if you want **spawn-only** scripts (`joern --script` each call).
5. **Optional:** `JOERN_SERVER_USER` / `JOERN_SERVER_PASSWORD` if the server uses Basic auth; **`JOERN_MCP_DEBUG=1`** for **full stderr tracing** (startup env, executor routing, each `/query-sync` request/response preview + timing, spawn CLI argv). **`JOERN_MCP_DEBUG_QUERY_MAX`** (default 2000) caps query length in logs. `JOERN_MCP_FORCE_SPAWN=1` forces spawn even when `JOERN_SERVER_URL` is set (incompatible with `JOERN_MCP_HTTP_ONLY`).
6. **`JOERN_MCP_HTTP_ONLY=1`:** script tools use **only** `POST /query-sync` (must set `JOERN_SERVER_URL`; do not set `JOERN_MCP_FORCE_SPAWN`). CLI tools (`joern_scan`, `joern_parse`, …) **error** — see **`BACKEND.md`**. Example in **`mcp.json.example`**.
7. **`joern_http_check`** / **`joern_http_query`** always call **`/query-sync`** when `JOERN_SERVER_URL` is set (they ignore `JOERN_MCP_FORCE_SPAWN`), same idea as `curl` to the server.

## Joern + long-lived server example

```json
"joern": {
  "command": "node",
  "args": ["/absolute/path/to/joern-mcp-server/dist/index.js"],
  "env": {
    "JOERN_HOME": "/opt/joern",
    "JOERN_SERVER_URL": "http://127.0.0.1:8080",
    "JOERN_MCP_DEBUG": "1"
  }
}
```

Add **`"JOERN_MCP_HTTP_ONLY": "1"`** inside `env` when you want script tools to **never** spawn `joern --script` (must keep **`JOERN_SERVER_URL`** set). Full sample: **`mcp.json.example`**.

Reload MCP in Cursor after edits (or restart Cursor).

## `JOERN_MCP_HTTP_ONLY` + create a CPG (example: `app.js`)

Goal: **build the CPG only through Joern `--server`** + MCP (`POST /query-sync`), no `joern-parse` / `joern --script` from MCP.

1. **Terminal:** start Joern on the **same machine** as Cursor (Joern must read `inputPath` and write `$TMP/joern-mcp` for import metadata).

   ```bash
   joern --server --server-host 127.0.0.1 --server-port 8080
   ```

2. **`~/.cursor/mcp.json`** — match **`mcp.json.example`**: **`JOERN_SERVER_URL`**, **`JOERN_MCP_HTTP_ONLY`:** `"1"`, **`JOERN_HOME`**, correct **`args`** to `dist/index.js`. Reload MCP.

3. **Create the CPG** — MCP tool **`joern_import_code`** (or **`joern_importcode`**) runs `importCode.jssrc` + `run.ossdataflow` on the server:

   | Argument | Value |
   |----------|--------|
   | `inputPath` | `/Users/effortlessdevsec/personal_blog/code_review_basic/app.js` |
   | `language` | `jssrc` |
   | `runOssDataflow` | `true` (default) |

   Response JSON includes `projectPath` (and stdout/stderr). The **live CPG** is in the Joern server JVM after this succeeds.

4. **Query** — `joern_find_calls`, `joern_methods`, `joern_http_query`, etc. **`cpgPath`** on tools is informational over HTTP; the server uses the graph from step 3.

5. **Avoid** — `joern_parse`, `joern_scan`, … (they fail with **`JOERN_MCP_HTTP_ONLY=1`**).

## HTTP-only MCP for one JavaScript file (summary)

Same as above: **`joern --server`** + **`JOERN_SERVER_URL`** + optional **`JOERN_MCP_HTTP_ONLY=1`**. **`joern_import_code`** creates the CPG over **`/query-sync`**; do not set **`JOERN_MCP_FORCE_SPAWN`** when using HTTP-only.

## `ClosedResourceError` / internal agent error

See **`TROUBLESHOOTING.md`** — usually MCP stdio closed (crashed Node, wrong `dist` path, timeout, or Joern HTTP down). Try **`joern_http_check`** and run **`node …/dist/index.js`** manually.

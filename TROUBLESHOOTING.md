# Joern MCP server — troubleshooting

## `ClosedResourceError` / “An internal error occurred” (Cursor)

That usually means the **MCP stdio connection closed** while the agent was still using it. Common causes:

### 1. The `joern-mcp-server` process exited

- **Rebuild:** `cd joern-mcp-server && npm run build`
- **Path:** `mcp.json` must point at **`dist/index.js`** (not `src/`).
- **Run by hand** (should sit and wait on stdin — do not exit immediately):

  ```bash
  node /path/to/joern-mcp-server/dist/index.js
  ```

  If it prints an error and exits, fix that first.

### 2. Another MCP server or agent bug

- Temporarily use **only** the `joern` entry in `mcp.json` (comment out MongoDB, etc.) and reload MCP.
- **Restart Cursor** after any `mcp.json` change.

### 3. Long-running tools / timeouts

Heavy calls (import, scan, huge graphs) can hit **client timeouts**. Try a light tool first: **`joern_http_check`** (needs `JOERN_SERVER_URL`) or **`joern_list_methods`** on a small CPG.

### 4. Joern HTTP mode but server down

If `JOERN_SERVER_URL` is set and **`joern --server` is not running**, script tools may hang or fail until the HTTP client times out (`JOERN_SERVER_TIMEOUT_MS`, default 5 min).  
Check:

```bash
curl -sS -X POST "http://127.0.0.1:8080/query-sync" \
  -H "Content-Type: application/json" \
  -d '{"query":"cpg.graph.nodeCount"}'
```

### 5. Debug logging (stderr only)

In `mcp.json` → `joern` → `env`:

```json
"JOERN_MCP_DEBUG": "1"
```

Logs go to **stderr** (never stdout — stdout breaks MCP).

### 6. Node version

Use **Node 18+** (`node -v`).

### 7. Catch-all Node option (optional)

If you suspect silent promise failures:

```json
"env": {
  "NODE_OPTIONS": "--trace-uncaught"
}
```

(Combine with your existing `env` keys in one object.)

---

## Wrong or empty tool results

- **HTTP mode:** `cpgPath` does not reload a graph per request; the server uses whatever it loaded at startup.
- **`joern_run_script` + HTTP:** `--param` is not forwarded; use spawn or embed values in the script.

See `BACKEND.md` and `TOOLS.txt`.

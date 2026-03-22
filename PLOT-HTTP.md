# Plots & graphs over Joern HTTP (`joern --server` / `/query-sync`)

Requires **`JOERN_SERVER_URL`** and a server with a **loaded CPG**.

## 1. `plotDot*` (Graphviz + viewer)

Same as:

```bash
curl -sS -X POST "http://127.0.0.1:8080/query-sync" \
  -H "Content-Type: application/json" \
  -d '{"query":"cpg.method.plotDotDdg"}'
```

Or MCP: **`joern_http_query`** with `query`: `cpg.method.plotDotDdg` (also `plotDotPdg`, `plotDotCpg14`).

**Expect:** `success: true` and often **`stdout` empty**. Joern runs **`dot -Tsvg`** and tries to open a viewer; output is **not** echoed to the JSON `stdout` field. SVGs land on the **machine running `joern --server`** (temp/working dir), not in MCP.

## 2. Prefer: **DOT text in `stdout`** (works great with HTTP / MCP)

Use **`.dotDdg` / `.dotPdg` / `.dotCpg14`** on methods (no `plotDot*`):

**One method (first match):**

```json
{"query": "cpg.method.take(1).dotDdg.foreach(println)"}
```

**Filter by name (regex):**

```json
{"query": "cpg.method.name(\".*lambda.*\").take(3).dotDdg.foreach(println)"}
```

**PDG:**

```json
{"query": "cpg.method.take(1).dotPdg.foreach(println)"}
```

MCP: **`joern_http_query`** with the same string as `query`.

Then save stdout to a `.dot` file locally and run:

`dot -Tsvg out.dot -o out.svg`

## 3. AST / CFG / CDG (no DDG on `Method` — use `dotAst` etc.)

On **AST nodes** / **methods** (see Joern docs), e.g.:

```json
{"query": "cpg.method.take(1).dotAst.foreach(println)"}
```

```json
{"query": "cpg.method.take(1).dotCfg.foreach(println)"}
```

## 4. File-based export (no HTTP plot)

From MCP (spawn CLI, not `/query-sync`): **`joern_export`** with `--repr` `ddg`, `pdg`, `ast`, `cfg`, etc.

---

**Summary:** For **HTTP**, use **`joern_http_query`** + **`.dotDdg` / `.dotPdg`** + `foreach(println)` to get **real content in stdout**. Use **`plotDot*`** only if you care about **server-side SVG** and empty MCP stdout is OK.

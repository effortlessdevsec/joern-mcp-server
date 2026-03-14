# Joern Advanced MCP Server

MCP (Model Context Protocol) server that exposes **Joern** code analysis as tools: import code, query dataflows, list methods, dump AST/CFG/PDG, and run scans.

## Language support

- **Any language CPG:** `joern_query_flows`, `joern_list_methods`, and `joern_dump_graphs` work with **any** `cpg.bin` Joern can load (Java, Kotlin, C, C++, Python, Go, JavaScript, etc.). Use language-appropriate source/sink names (e.g. Java: `getIntent`/`loadUrl`; C: `system`/`strcpy`; Python: `eval`/`exec`).
- **Import:** `joern_import_code` supports: `java`, `kotlin`, `jvm`, `c`, `cpp`, `python`, `golang`, `jssrc`, `php`, `ruby`, `csharp`, `csharpsrc`, `swiftsrc`, `llvm`, `ghidra`.
- **Scan:** `joern_scan` auto-detects language and runs built-in queries on the source path.

## Requirements

- **Node.js** >= 18
- **Joern** on `PATH`, or set `JOERN_HOME` to your Joern install (e.g. `~/bin/joern` or `/opt/joern`)
- **Graphviz** (`dot`) on `PATH` for `joern_full_flow_graph` SVG output (optional; DOT still written without it)

## Install

```bash
cd joern-mcp-server
npm install
npm run build
```

## Use with Cursor

Add to Cursor MCP settings (e.g. **Cursor Settings → MCP** or `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "joern": {
      "command": "node",
      "args": ["/Users/effortlessdevsec/temp11/joern/joern-mcp-server/dist/index.js"],
      "env": {
        "JOERN_HOME": "/opt/joern"
      }
    }
  }
}
```

- **args**: Use the absolute path to `joern-mcp-server/dist/index.js` (above matches this repo).
- **JOERN_HOME**: `/opt/joern` where `joern` and `joern-scan` live. Omit `env` if `joern` is on your `PATH`.
- **Reload after code changes:** After adding or changing tools, run `npm run build`, then **reload MCP** in Cursor (or restart Cursor) so the client sees the updated tool list.

## Tools

| Tool | Description |
|------|-------------|
| **joern_run_script** | Run any Joern Scala script (full API). Use when no dedicated tool fits. |
| **joern_find_calls** | Find call nodes: filter by **methodFullName regex** (e.g. `.*Log\\.(d|e|i|v|w).*`), **call name regex**, and/or **whereArgumentIndex** + **whereArgumentCodeRegex** (e.g. arg 1 matches `.*pass.*|.*token.*`). Returns code, lineNumber, filename, methodFullName. |
| **joern_list_call_names** | List distinct call names; optional **methodFullNameRegex** filter. |
| **joern_methods** | List methods (name, fullName, filename); optional **nameRegex**, **fullNameRegex**. |
| **joern_query_flows** | Data flows source→sink. Supports **sourceMethodFullNameRegex** / **sinkMethodFullNameRegex** (e.g. sink `.*android\\.util\\.Log\\..*` + **sinkArgIndex: 1**). Plus source/sink call names, arg indices, methodRegex, fileRegex. |
| **joern_import_code** | Import source/binary and build CPG. Languages: java, kotlin, jvm, c, cpp, python, golang, jssrc, php, ruby, csharp, csharpsrc, swiftsrc, llvm, ghidra. |
| **joern_list_methods** | List all method names in the CPG. |
| **joern_dump_graphs** | Dump AST/CFG/PDG as `.dot` for methods in flows (any language CPG). |
| **joern_full_flow_graph** | One merged DOT + SVG for all source→sink flows. Requires graphviz for SVG. |
| **joern_scan** | Run joern-scan on a path; auto-detects language and runs built-in queries. |

## Workflow

1. **Custom script (recommended):** Use **joern_run_script** with `cpgPath` and a full Scala script. You get the full Joern API—no need for a dedicated tool per use case. Example (insecure logging: where pass/token/secret is logged and from where it flows):
   ```scala
   @main def main() = {
     import io.joern.dataflowengineoss.language._
     run.ossdataflow
     val logCalls = cpg.call
       .methodFullName(".*android\\.util\\.Log\\.(d|e|i|v|w).*")
       .where(_.argument(1).code("(?i).*pass.*|.*token.*|.*secret.*"))
     val sinkArg = logCalls.argument(1)
     val flows = sinkArg.reachableByFlows(cpg.call.name("getString|getIntent|getUserToken|getPassword")).l
     flows.foreach(f => println(f.elements.map(_.code).mkString(" -> ")))
   }
   ```
   Pass as `script` (string) and `cpgPath`; output is in stdout.
2. **Import code:** Call `joern_import_code` with `inputPath` (e.g. decompiled app folder). Note the returned `projectPath`; the CPG is at `projectPath/cpg.bin` (or similar).
3. **Query flows:** Use **joern_query_flows** (with optional **sinkMethodFullNameRegex** + **sinkArgIndex** for e.g. Log’s 2nd arg), or **joern_find_calls** (methodFullName + whereArgumentCodeRegex) then **joern_query_flows** from sensitive sources to those calls.
4. **Dump graphs:** Call `joern_dump_graphs` with same `cpgPath`, source/sink patterns, and optional `outputDir` / `graphTypes` (`ast`, `cfg`, `pdg`). Convert `.dot` to SVG: `dot -Tsvg file.dot -o file.svg`.

## License

Apache-2.0 (same as Joern)

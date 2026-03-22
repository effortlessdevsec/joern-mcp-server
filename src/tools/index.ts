/**
 * Registers all Joern MCP tools on the server.
 * Backend: `runJoernScriptFromSource` → HTTP (`JOERN_SERVER_URL`) = in-memory POST `/query-sync`; else temp `.sc` + spawn. `JOERN_MCP_HTTP_ONLY` / `JOERN_MCP_FORCE_SPAWN` — see BACKEND.md. CLIs → spawn (or error if HTTP_ONLY).
 * Import: `joern_import_code` / `joern_importcode` (importCode). CLI (spawn-only): `joern_scan*`, `joern_parse`, `joern_export`, `joern_slice`.
 * Direct HTTP: `joern_http_check`, `joern_http_query` → POST /query-sync (needs URL; ignores FORCE_SPAWN).
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerRunScriptTool } from "./run-script.js";
import { registerFindCallsTool } from "./find-calls.js";
import { registerListCallNamesTool } from "./list-call-names.js";
import { registerMethodsTool } from "./methods.js";
import { registerImportCodeTools } from "./import-code.js";
import { registerQueryFlowsTool } from "./query-flows.js";
import { registerListMethodsTool } from "./list-methods.js";
import { registerDumpGraphsTool } from "./dump-graphs.js";
import { registerFullFlowGraphTool } from "./full-flow-graph.js";
import { registerScanTool } from "./scan.js";
import { registerScanCatalogTools } from "./scan-catalog.js";
import { registerParseCpgTool } from "./parse-cpg.js";
import { registerExportCpgTool } from "./export-cpg.js";
import { registerSliceTool } from "./slice.js";
import { registerHttpQueryTools } from "./http-query.js";

export function registerAllJoernTools(server: McpServer): void {
  registerHttpQueryTools(server);
  registerRunScriptTool(server);
  registerFindCallsTool(server);
  registerListCallNamesTool(server);
  registerMethodsTool(server);
  registerImportCodeTools(server);
  registerQueryFlowsTool(server);
  registerListMethodsTool(server);
  registerDumpGraphsTool(server);
  registerFullFlowGraphTool(server);
  registerScanTool(server);
  registerScanCatalogTools(server);
  registerParseCpgTool(server);
  registerExportCpgTool(server);
  registerSliceTool(server);
}

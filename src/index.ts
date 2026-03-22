#!/usr/bin/env node
/**
 * Joern Advanced MCP Server — thin entrypoint.
 *
 * - Tools: `src/tools/*` (one module per tool / concern)
 * - Joern backends: `src/joern/*` (HTTP when JOERN_SERVER_URL; else spawn — see BACKEND.md)
 * - Config: `src/config/paths.ts`
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createJoernMcpServer } from "./create-server.js";
import { ensureMcpOutDir } from "./config/paths.js";
import { getBackendLabel, isHttpBackend } from "./joern/executor.js";
import { isMcpDebug, mcpDebug } from "./joern/debug.js";
import { MCP_OUT } from "./config/paths.js";

ensureMcpOutDir();

/** MCP uses stdout for JSON-RPC — never console.log. stderr-only diagnostics. */
function installFatalDiagnostics(): void {
  process.on("uncaughtException", (err) => {
    console.error("[joern-mcp-server] uncaughtException:", err);
    process.exit(1);
  });
  process.on("unhandledRejection", (reason) => {
    console.error("[joern-mcp-server] unhandledRejection:", reason);
  });
}

installFatalDiagnostics();

async function main(): Promise<void> {
  if (isMcpDebug()) {
    const cli = "CLI tools (joern-scan, joern-parse, joern-export, joern-slice) always spawn (or error if JOERN_MCP_HTTP_ONLY).";
    const httpDetail = isHttpBackend()
      ? " Script tools POST /query-sync in-memory (no temp file for HTTP). Spawn path uses a temp .sc + `joern --script`."
      : " Set JOERN_SERVER_URL so script tools use POST /query-sync instead of `joern --script`.";
    console.error(`[joern-mcp-server] ${getBackendLabel()}.${httpDetail} ${cli}`);
    mcpDebug("startup", "environment (passwords not shown)", {
      JOERN_SERVER_URL: process.env.JOERN_SERVER_URL?.trim() || "(unset)",
      JOERN_HOME: process.env.JOERN_HOME || "(unset)",
      JOERN_MCP_HTTP_ONLY: process.env.JOERN_MCP_HTTP_ONLY || "(unset)",
      JOERN_MCP_FORCE_SPAWN: process.env.JOERN_MCP_FORCE_SPAWN || "(unset)",
      JOERN_SERVER_TIMEOUT_MS: process.env.JOERN_SERVER_TIMEOUT_MS || "(default 300000)",
      JOERN_MCP_DEBUG_QUERY_MAX: process.env.JOERN_MCP_DEBUG_QUERY_MAX || "(default 2000)",
      JOERN_SERVER_USER: process.env.JOERN_SERVER_USER
        ? "(set)"
        : process.env.JOERN_SERVER_BASIC_USER
          ? "(JOERN_SERVER_BASIC_USER set)"
          : "(unset)",
      JOERN_SERVER_PASSWORD: process.env.JOERN_SERVER_PASSWORD ? "(set)" : "(unset)",
      MCP_OUT,
    });
    console.error(
      "[joern-mcp-debug] Per-request logs: [executor] script routing, [http] POST /query-sync + response, [spawn] CLI argv + exit. All on stderr."
    );
  }
  const mcpServer = createJoernMcpServer();
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

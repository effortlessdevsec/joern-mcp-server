import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runQuerySyncHttp } from "../joern/http.js";

/** True if JOERN_SERVER_URL is non-empty (ignores JOERN_MCP_FORCE_SPAWN). */
function serverUrlConfigured(): boolean {
  const u = process.env.JOERN_SERVER_URL?.trim();
  return Boolean(u && u.length > 0);
}

/** Default probe: produces non-empty stdout when the server has a loaded CPG. */
const DEFAULT_HTTP_CHECK_QUERY = "cpg.graph.nodeCount";

/**
 * Direct POST /query-sync (curl-equivalent). Ignores JOERN_MCP_FORCE_SPAWN so you can
 * probe the server even when script tools are forced to spawn.
 */
export function registerHttpQueryTools(server: McpServer): void {
  server.registerTool(
    "joern_http_check",
    {
      description:
        "Verify `joern --server` HTTP API: POST /query-sync with a safe probe (default: cpg.graph.nodeCount). Requires JOERN_SERVER_URL. Same idea as curl; returns stdout + query-sync uuid footer on success.",
      inputSchema: {
        query: z
          .string()
          .optional()
          .describe(
            `Optional CPGQL snippet; default "${DEFAULT_HTTP_CHECK_QUERY}". Prefer an expression that shows up in stdout when the graph is loaded.`
          ),
      },
    },
    async (args: { query?: string }) => {
      if (!serverUrlConfigured()) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Set JOERN_SERVER_URL (e.g. http://127.0.0.1:8080) in MCP env to use joern_http_check.",
            },
          ],
          isError: true,
        };
      }
      const q = args.query?.trim() || DEFAULT_HTTP_CHECK_QUERY;
      const result = await runQuerySyncHttp(q, { appendSyncFooter: true });
      const text =
        result.exitCode === 0
          ? (result.stdout || "(empty stdout — query returned no REPL output)") +
            (result.stderr ? `\n--- stderr ---\n${result.stderr}` : "")
          : `HTTP query-sync failed (exit ${result.exitCode})\n--- stderr ---\n${result.stderr}\n--- stdout ---\n${result.stdout}`;
      return {
        content: [{ type: "text" as const, text }],
        ...(result.exitCode !== 0 ? { isError: true } : {}),
      };
    }
  );

  server.registerTool(
    "joern_http_query",
    {
      description:
        "Run arbitrary CPGQL on joern --server via POST /query-sync (curl-equivalent). Requires JOERN_SERVER_URL. NOTE: plotDotDdg, plotDotPdg, plotDotAst, plotDotCfg, plotDotCpg14 often return empty stdout while Joern runs Graphviz (dot -Tsvg) and opens a viewer — {\"success\":true,\"stdout\":\"\"} is expected. For file-based graphs use joern_export or dot* traversals in joern_run_script.",
      inputSchema: {
        query: z
          .string()
          .describe(
            "Raw query string, e.g. cpg.method.name.l or cpg.method.plotDotDdg"
          ),
      },
    },
    async (args: { query: string }) => {
      if (!serverUrlConfigured()) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Set JOERN_SERVER_URL in MCP env. joern_http_query only talks to joern --server, not spawn.",
            },
          ],
          isError: true,
        };
      }
      const q = args.query.trim();
      if (!q) {
        return {
          content: [{ type: "text" as const, text: "query must be non-empty." }],
          isError: true,
        };
      }
      const result = await runQuerySyncHttp(q, { appendSyncFooter: true });
      let text =
        result.exitCode === 0
          ? (result.stdout || "(empty stdout)") +
            (result.stderr ? `\n--- stderr ---\n${result.stderr}` : "")
          : `query-sync failed (exit ${result.exitCode})\n--- stderr ---\n${result.stderr}\n--- stdout ---\n${result.stdout}`;

      if (result.exitCode === 0 && /\bplotDot/i.test(q)) {
        text +=
          "\n[joern-mcp] plotDot* often returns empty stdout; Joern invokes Graphviz and may open a viewer. Use joern_export (repr ddg/pdg/ast/cfg) or .dotDdg/.dotPdg on traversals for MCP-visible .dot output.\n";
      }

      return {
        content: [{ type: "text" as const, text }],
        ...(result.exitCode !== 0 ? { isError: true } : {}),
      };
    }
  );
}

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  runJoernScanListLanguages,
  runJoernScanListQueryNames,
} from "../joern/executor.js";

/** `joern-scan --list-query-names` — no HTTP, spawn only. */
export function registerScanCatalogTools(server: McpServer): void {
  server.registerTool(
    "joern_scan_list_queries",
    {
      description:
        "List all joern-scan query names from the installed query database (same as `joern-scan --list-query-names`). Use names with joern_scan --names.",
      inputSchema: {
        _: z
          .string()
          .optional()
          .describe("No parameters required; leave empty."),
      },
    },
    async () => {
      const result = await runJoernScanListQueryNames();
      const text =
        result.exitCode === 0
          ? result.stdout + (result.stderr ? "\n" + result.stderr : "")
          : `Failed (exit ${result.exitCode}):\n${result.stderr}\n${result.stdout}`;
      return {
        content: [{ type: "text" as const, text }],
        ...(result.exitCode !== 0 ? { isError: true } : {}),
      };
    }
  );

  server.registerTool(
    "joern_scan_list_languages",
    {
      description:
        "List languages supported by joern-scan (same as `joern-scan --list-languages`).",
      inputSchema: {
        _: z
          .string()
          .optional()
          .describe("No parameters required; leave empty."),
      },
    },
    async () => {
      const result = await runJoernScanListLanguages();
      const text =
        result.exitCode === 0
          ? result.stdout + (result.stderr ? "\n" + result.stderr : "")
          : `Failed (exit ${result.exitCode}):\n${result.stderr}\n${result.stdout}`;
      return {
        content: [{ type: "text" as const, text }],
        ...(result.exitCode !== 0 ? { isError: true } : {}),
      };
    }
  );
}

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runJoernScan } from "../joern/executor.js";

/** Always uses `joern-scan` CLI (spawn), never Joern HTTP server. */
export function registerScanTool(server: McpServer): void {
  server.registerTool(
    "joern_scan",
    {
      description:
        "Run joern-scan on a source directory (Joern CLI). Auto-detects language and runs query-db rules. Matches: joern-scan [--names][--tags][--depth][--store][--language][--overwrite] <src>.",
      inputSchema: {
        inputPath: z.string().describe("Path to source code directory"),
        language: z.string().optional().describe("Force language: e.g. java, jssrc, kotlin, jvm"),
        overwrite: z.boolean().optional().describe("Overwrite existing CPG"),
        store: z.boolean().optional().describe("Store graph changes made by scanner (--store)"),
        names: z
          .string()
          .optional()
          .describe("Comma-separated query names to run only (--names)"),
        tags: z
          .string()
          .optional()
          .describe("Comma-separated query tags (--tags)"),
        maxCallDepth: z
          .number()
          .int()
          .optional()
          .describe("Interprocedural call depth (--depth), default in Joern is 2"),
      },
    },
    async (args: {
      inputPath: string;
      language?: string;
      overwrite?: boolean;
      store?: boolean;
      names?: string;
      tags?: string;
      maxCallDepth?: number;
    }) => {
      const { inputPath, language, overwrite, store, names, tags, maxCallDepth } = args;
      const result = await runJoernScan(inputPath, {
        language,
        overwrite,
        store,
        names,
        tags,
        maxCallDepth,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: result.exitCode === 0 ? result.stdout : `Scan failed:\n${result.stderr}\n${result.stdout}`,
          },
        ],
        ...(result.exitCode !== 0 ? { isError: true } : {}),
      };
    }
  );
}

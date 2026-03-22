import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import path from "path";
import { runJoernParse } from "../joern/executor.js";
import { MCP_OUT } from "../config/paths.js";

/**
 * `joern-parse` CLI — generate cpg.bin from sources without the Joern REPL.
 * Spawn only; not routed via JOERN_SERVER_URL.
 */
export function registerParseCpgTool(server: McpServer): void {
  server.registerTool(
    "joern_parse",
    {
      description:
        "Run joern-parse: build a CPG file from a source tree (Joern CLI). Output defaults to MCP_OUT/parsed-<ts>.bin. Use listLanguages=true to run --list-languages (no inputPath).",
      inputSchema: {
        inputPath: z
          .string()
          .optional()
          .describe("Source file or directory (required unless listLanguages=true)"),
        outputCpgPath: z
          .string()
          .optional()
          .describe("Output CPG path (-o). Default: under joern-mcp MCP_OUT"),
        language: z.string().optional().describe("Force --language (e.g. jssrc, java)"),
        listLanguages: z
          .boolean()
          .optional()
          .describe("If true, run joern-parse --list-languages only"),
        noOverlays: z
          .boolean()
          .optional()
          .describe("If true, pass --nooverlays (skip default overlays)"),
      },
    },
    async (args: {
      inputPath?: string;
      outputCpgPath?: string;
      language?: string;
      listLanguages?: boolean;
      noOverlays?: boolean;
    }) => {
      if (args.listLanguages) {
        const result = await runJoernParse(["--list-languages"]);
        const text =
          result.exitCode === 0
            ? result.stdout + (result.stderr ? "\n" + result.stderr : "")
            : `Failed (exit ${result.exitCode}):\n${result.stderr}\n${result.stdout}`;
        return {
          content: [{ type: "text" as const, text }],
          ...(result.exitCode !== 0 ? { isError: true } : {}),
        };
      }
      const inputPath = args.inputPath?.trim();
      if (!inputPath) {
        return {
          content: [
            {
              type: "text" as const,
              text: "inputPath is required unless listLanguages is true.",
            },
          ],
          isError: true,
        };
      }
      const out =
        args.outputCpgPath?.trim() ||
        path.join(MCP_OUT, `parsed-${Date.now()}.bin`);
      const cliArgs: string[] = [inputPath, "-o", out];
      if (args.language) cliArgs.push("--language", args.language);
      if (args.noOverlays) cliArgs.push("--nooverlays");

      const result = await runJoernParse(cliArgs);
      const text =
        result.exitCode === 0
          ? JSON.stringify(
              {
                outputCpgPath: out,
                stdout: result.stdout,
                stderr: result.stderr,
              },
              null,
              2
            )
          : `joern-parse failed (exit ${result.exitCode}):\n${result.stderr}\n${result.stdout}`;
      return {
        content: [{ type: "text" as const, text }],
        ...(result.exitCode !== 0 ? { isError: true } : {}),
      };
    }
  );
}

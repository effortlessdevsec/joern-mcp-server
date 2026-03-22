import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import path from "path";
import { runJoernExport } from "../joern/executor.js";
import { MCP_OUT } from "../config/paths.js";

const reprEnum = z.enum([
  "ast",
  "cfg",
  "ddg",
  "cdg",
  "pdg",
  "cpg14",
  "cpg",
  "all",
]);
const formatEnum = z.enum(["dot", "neo4jcsv", "graphml", "graphson"]);

/**
 * `joern-export` CLI — dump AST/CFG/DDG/… or whole CPG (Joern JoernExport).
 * Spawn only.
 */
export function registerExportCpgTool(server: McpServer): void {
  server.registerTool(
    "joern_export",
    {
      description:
        "Run joern-export: write graph representations (ast, cfg, ddg, cdg, pdg, cpg14, cpg, all) to dot/graphml/graphson/neo4jcsv under a fresh output directory. Same as Joern CLI joern-export.",
      inputSchema: {
        cpgPath: z
          .string()
          .describe("Path to cpg.bin or project directory Joern accepts"),
        repr: reprEnum
          .optional()
          .describe("Representation (default cpg14 in Joern; we default ast)"),
        format: formatEnum.optional().describe("Export format (default dot)"),
        outputDir: z
          .string()
          .optional()
          .describe("Output directory (-o); must not exist. Default: MCP_OUT/joern-export-<ts>"),
      },
    },
    async (args: {
      cpgPath: string;
      repr?:
        | "ast"
        | "cfg"
        | "ddg"
        | "cdg"
        | "pdg"
        | "cpg14"
        | "cpg"
        | "all";
      format?: "dot" | "neo4jcsv" | "graphml" | "graphson";
      outputDir?: string;
    }) => {
      const outDir =
        args.outputDir?.trim() || path.join(MCP_OUT, `joern-export-${Date.now()}`);
      const repr = args.repr ?? "ast";
      const format = args.format ?? "dot";
      const cliArgs = [
        args.cpgPath,
        "-o",
        outDir,
        "--repr",
        repr,
        "--format",
        format,
      ];
      const result = await runJoernExport(cliArgs);
      const text =
        result.exitCode === 0
          ? JSON.stringify(
              {
                outputDir: outDir,
                repr,
                format,
                stdout: result.stdout,
                stderr: result.stderr,
              },
              null,
              2
            )
          : `joern-export failed (exit ${result.exitCode}):\n${result.stderr}\n${result.stdout}`;
      return {
        content: [{ type: "text" as const, text }],
        ...(result.exitCode !== 0 ? { isError: true } : {}),
      };
    }
  );
}

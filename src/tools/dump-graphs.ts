import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { runJoernScriptFromSource } from "../joern/executor.js";
import { scriptDumpGraphs } from "../scripts.js";
import { MCP_OUT } from "../config/paths.js";

export function registerDumpGraphsTool(server: McpServer): void {
  server.registerTool(
    "joern_dump_graphs",
    {
      description:
        "Dump AST, CFG, and/or PDG as .dot for methods in source->sink flows. Works with any language CPG.",
      inputSchema: {
        cpgPath: z.string().describe("Path to cpg.bin or project directory"),
        sourceCallName: z.string().describe("Source call name, e.g. getIntent"),
        sinkCallNamePattern: z
          .string()
          .describe("Sink pattern, e.g. loadUrl|loadData|loadDataWithBaseURL"),
        outputDir: z.string().optional().describe("Output directory for .dot files (default: out-flows)"),
        graphTypes: z
          .array(z.enum(["ast", "cfg", "pdg"]))
          .optional()
          .describe("Which graphs to dump (default: all)"),
        sourceMatch: z
          .enum(["exact", "regex"])
          .optional()
          .describe("How to match sourceCallName (default: regex)"),
        sinkMatch: z
          .enum(["exact", "regex"])
          .optional()
          .describe("How to match sinkCallNamePattern (default: regex)"),
        sourceArgIndex: z
          .number()
          .int()
          .optional()
          .describe("If set, taint starts at this source call argument index (e.g. 1)"),
        sinkArgIndex: z
          .number()
          .int()
          .optional()
          .describe("If set, sink node is this sink call argument index (e.g. loadUrl arg 1)"),
        methodRegex: z
          .string()
          .optional()
          .describe("Optional filter: only keep flows touching methods whose fullName matches this regex"),
        fileRegex: z
          .string()
          .optional()
          .describe("Optional filter: only keep flows touching elements whose filename matches this regex"),
        dumpFlowDot: z
          .boolean()
          .optional()
          .describe("Also write one end-to-end DOT file per flow path (default: true)"),
        flowDotDir: z.string().optional().describe("Directory for flow DOT files (default: outputDir)"),
      },
    },
    async (args: {
      cpgPath: string;
      sourceCallName: string;
      sinkCallNamePattern: string;
      outputDir?: string;
      graphTypes?: ("ast" | "cfg" | "pdg")[];
      sourceMatch?: "exact" | "regex";
      sinkMatch?: "exact" | "regex";
      sourceArgIndex?: number;
      sinkArgIndex?: number;
      methodRegex?: string;
      fileRegex?: string;
      dumpFlowDot?: boolean;
      flowDotDir?: string;
    }) => {
      const {
        cpgPath,
        sourceCallName,
        sinkCallNamePattern,
        outputDir = path.join(process.cwd(), "out-flows"),
        graphTypes = ["ast", "cfg", "pdg"],
        sourceMatch,
        sinkMatch,
        sourceArgIndex,
        sinkArgIndex,
        methodRegex,
        fileRegex,
        dumpFlowDot,
        flowDotDir,
      } = args;
      const outputFile = path.join(MCP_OUT, `dump-manifest-${Date.now()}.json`);
      const script = scriptDumpGraphs(
        sourceCallName,
        sinkCallNamePattern,
        outputDir,
        outputFile,
        graphTypes,
        {
          sourceMatch,
          sinkMatch,
          sourceArgIndex,
          sinkArgIndex,
          methodRegex,
          fileRegex,
          dumpFlowDot,
          flowDotDir,
        }
      );
      const result = await runJoernScriptFromSource(script, {}, cpgPath);
      if (result.exitCode !== 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Joern dump failed:\n${result.stderr}\n${result.stdout}`,
            },
          ],
          isError: true,
        };
      }
      let json = "[]";
      if (existsSync(outputFile)) {
        json = readFileSync(outputFile, "utf8");
      }
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                outputDir,
                files: JSON.parse(json),
                hint: "Convert to SVG: dot -Tsvg file.dot -o file.svg",
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}

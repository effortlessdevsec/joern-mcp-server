import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync, existsSync, writeFileSync } from "fs";
import path from "path";
import { execSync } from "child_process";
import { runJoernScriptFromSource } from "../joern/executor.js";
import { scriptFlows } from "../scripts.js";
import { MCP_OUT } from "../config/paths.js";
import { buildMergedFlowDot, type FlowsPayload } from "../flow-graph/merge-dot.js";

export function registerFullFlowGraphTool(server: McpServer): void {
  server.registerTool(
    "joern_full_flow_graph",
    {
      description:
        "Create one merged flow graph (DOT + SVG) for all source->sink dataflows. No manual script: uses Joern to get flows, then builds a single full graph.",
      inputSchema: {
        cpgPath: z.string().describe("Path to cpg.bin or cpg.bin.zip"),
        sourceCallName: z.string().describe("Source call name, e.g. getIntent"),
        sinkCallNamePattern: z.string().describe("Sink pattern, e.g. loadUrl or loadUrl|loadData"),
        outputDir: z
          .string()
          .optional()
          .describe("Directory for output .dot and .svg (default: current dir or temp)"),
        emitSVG: z
          .boolean()
          .optional()
          .describe("Run dot -Tsvg to produce .svg (default: true; requires graphviz)"),
        sourceMatch: z.enum(["exact", "regex"]).optional().describe("Match mode for source (default: regex)"),
        sinkMatch: z.enum(["exact", "regex"]).optional().describe("Match mode for sink (default: regex)"),
        sourceArgIndex: z.number().int().optional(),
        sinkArgIndex: z.number().int().optional(),
        methodRegex: z.string().optional(),
        fileRegex: z.string().optional(),
      },
    },
    async (args: {
      cpgPath: string;
      sourceCallName: string;
      sinkCallNamePattern: string;
      outputDir?: string;
      emitSVG?: boolean;
      sourceMatch?: "exact" | "regex";
      sinkMatch?: "exact" | "regex";
      sourceArgIndex?: number;
      sinkArgIndex?: number;
      methodRegex?: string;
      fileRegex?: string;
    }) => {
      const {
        cpgPath,
        sourceCallName,
        sinkCallNamePattern,
        outputDir = process.cwd(),
        emitSVG = true,
        sourceMatch,
        sinkMatch,
        sourceArgIndex,
        sinkArgIndex,
        methodRegex,
        fileRegex,
      } = args;
      const flowJsonPath = path.join(MCP_OUT, `flows-fullgraph-${Date.now()}.json`);
      const script = scriptFlows(sourceCallName, sinkCallNamePattern, flowJsonPath, {
        sourceMatch,
        sinkMatch,
        sourceArgIndex,
        sinkArgIndex,
        methodRegex,
        fileRegex,
      });
      const result = await runJoernScriptFromSource(script, {}, cpgPath);
      if (result.exitCode !== 0) {
        return {
          content: [{ type: "text" as const, text: `Joern flows failed:\n${result.stderr}\n${result.stdout}` }],
          isError: true,
        };
      }
      let flowsPayload: FlowsPayload = { flows: [], flowCount: 0 };
      if (existsSync(flowJsonPath)) {
        try {
          flowsPayload = JSON.parse(readFileSync(flowJsonPath, "utf8")) as FlowsPayload;
        } catch (e) {
          return {
            content: [{ type: "text" as const, text: `Failed to parse flows JSON: ${String(e)}` }],
            isError: true,
          };
        }
      }
      const flows = flowsPayload.flows ?? [];
      const flowArrays = flows
        .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
        .map((f) => f.elements ?? []);
      if (flowArrays.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                message: "No flows found for the given source/sink.",
                flowCount: 0,
                dotPath: null,
                svgPath: null,
              }),
            },
          ],
        };
      }
      const dotContent = buildMergedFlowDot(flowArrays, sourceCallName, sinkCallNamePattern);
      const safeSource = sourceCallName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 20);
      const safeSink = sinkCallNamePattern.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 20);
      const baseName = `flow-${safeSource}-to-${safeSink}`;
      const dotPath = path.join(outputDir, `${baseName}.dot`);
      const svgPath = path.join(outputDir, `${baseName}.svg`);
      try {
        writeFileSync(dotPath, dotContent, "utf8");
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Failed to write DOT: ${String(e)}` }],
          isError: true,
        };
      }
      let svgWritten = false;
      if (emitSVG) {
        try {
          execSync(`dot -Tsvg "${dotPath}" -o "${svgPath}"`, {
            stdio: "pipe",
            maxBuffer: 10 * 1024 * 1024,
          });
          svgWritten = existsSync(svgPath);
        } catch {
          /* dot missing */
        }
      }
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                flowCount: flowArrays.length,
                dotPath,
                svgPath: svgWritten ? svgPath : null,
                hint:
                  !svgWritten && emitSVG
                    ? "Install graphviz (dot) and run: dot -Tsvg " + dotPath + " -o " + svgPath
                    : undefined,
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

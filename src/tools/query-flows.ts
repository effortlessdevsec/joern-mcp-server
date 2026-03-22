import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { runJoernScriptFromSource } from "../joern/executor.js";
import { scriptFlows } from "../scripts.js";
import { MCP_OUT } from "../config/paths.js";

export function registerQueryFlowsTool(server: McpServer): void {
  server.registerTool(
    "joern_query_flows",
    {
      description:
        "Find data flows from source to sink. Works with any cpg.bin (Java, C, Python, etc.). Use language-appropriate names: Java getIntent/loadUrl; C system/strcpy; Python eval/exec.",
      inputSchema: {
        cpgPath: z.string().describe("Path to cpg.bin (project directory or cpg.bin file)"),
        sourceCallName: z.string().describe("Source call name, e.g. getIntent"),
        sinkCallNamePattern: z
          .string()
          .describe("Sink call name or regex pattern, e.g. loadUrl|loadData|loadDataWithBaseURL"),
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
        sourceMethodFullNameRegex: z
          .string()
          .optional()
          .describe(
            "If set, source is cpg.call.methodFullName(this regex) instead of call name (e.g. .*getString.*)"
          ),
        sinkMethodFullNameRegex: z
          .string()
          .optional()
          .describe(
            "If set, sink is cpg.call.methodFullName(this regex) instead of call name (e.g. .*android\\.util\\.Log\\.(d|e|i|v|w).*)"
          ),
        methodRegex: z
          .string()
          .optional()
          .describe("Optional filter: only keep flows touching methods whose fullName matches this regex"),
        fileRegex: z
          .string()
          .optional()
          .describe("Optional filter: only keep flows touching elements whose filename matches this regex"),
      },
    },
    async (args: {
      cpgPath: string;
      sourceCallName: string;
      sinkCallNamePattern: string;
      sourceMatch?: "exact" | "regex";
      sinkMatch?: "exact" | "regex";
      sourceMethodFullNameRegex?: string;
      sinkMethodFullNameRegex?: string;
      sourceArgIndex?: number;
      sinkArgIndex?: number;
      methodRegex?: string;
      fileRegex?: string;
    }) => {
      const {
        cpgPath,
        sourceCallName,
        sinkCallNamePattern,
        sourceMatch,
        sinkMatch,
        sourceMethodFullNameRegex,
        sinkMethodFullNameRegex,
        sourceArgIndex,
        sinkArgIndex,
        methodRegex,
        fileRegex,
      } = args;
      const outputFile = path.join(MCP_OUT, `flows-${Date.now()}.json`);
      const script = scriptFlows(sourceCallName, sinkCallNamePattern, outputFile, {
        sourceMatch,
        sinkMatch,
        sourceMethodFullNameRegex,
        sinkMethodFullNameRegex,
        sourceArgIndex,
        sinkArgIndex,
        methodRegex,
        fileRegex,
      });
      const result = await runJoernScriptFromSource(script, {}, cpgPath);
      if (result.exitCode !== 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Joern flows failed:\n${result.stderr}\n${result.stdout}`,
            },
          ],
          isError: true,
        };
      }
      let json = "{}";
      if (existsSync(outputFile)) {
        json = readFileSync(outputFile, "utf8");
      }
      return { content: [{ type: "text" as const, text: json }] };
    }
  );
}

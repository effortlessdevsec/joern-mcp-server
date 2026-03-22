import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { runJoernScriptFromSource } from "../joern/executor.js";
import { scriptFindCalls } from "../scripts.js";
import { MCP_OUT } from "../config/paths.js";

export function registerFindCallsTool(server: McpServer): void {
  server.registerTool(
    "joern_find_calls",
    {
      description:
        "Find call nodes. Filter by methodFullName regex (e.g. .*Log\\.(d|e|i|v|w).*), call name regex, and/or argument index + argument code regex (e.g. where arg 1 matches .*pass.*). Returns JSON array of code, lineNumber, filename, methodFullName.",
      inputSchema: {
        cpgPath: z.string().describe("Path to cpg.bin or cpg.bin.zip"),
        methodFullNameRegex: z.string().optional().describe("Filter by callee method full name regex"),
        callNameRegex: z.string().optional().describe("Filter by call name regex"),
        whereArgumentIndex: z.number().int().optional().describe("Argument index (0-based) to filter by"),
        whereArgumentCodeRegex: z
          .string()
          .optional()
          .describe("Regex that argument code must match (use with whereArgumentIndex)"),
      },
    },
    async (args: {
      cpgPath: string;
      methodFullNameRegex?: string;
      callNameRegex?: string;
      whereArgumentIndex?: number;
      whereArgumentCodeRegex?: string;
    }) => {
      const { cpgPath, methodFullNameRegex, callNameRegex, whereArgumentIndex, whereArgumentCodeRegex } = args;
      const outputFile = path.join(MCP_OUT, `find-calls-${Date.now()}.json`);
      const script = scriptFindCalls(outputFile, {
        methodFullNameRegex,
        callNameRegex,
        whereArgumentIndex,
        whereArgumentCodeRegex,
      });
      const result = await runJoernScriptFromSource(script, {}, cpgPath);
      if (result.exitCode !== 0) {
        return {
          content: [{ type: "text" as const, text: `Find calls failed:\n${result.stderr}\n${result.stdout}` }],
          isError: true,
        };
      }
      const json = existsSync(outputFile) ? readFileSync(outputFile, "utf8") : "[]";
      return { content: [{ type: "text" as const, text: json }] };
    }
  );
}

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { runJoernScriptFromSource } from "../joern/executor.js";
import { scriptMethods } from "../scripts.js";
import { MCP_OUT } from "../config/paths.js";

export function registerMethodsTool(server: McpServer): void {
  server.registerTool(
    "joern_methods",
    {
      description: "List methods (name, fullName, filename). Optionally filter by name regex or fullName regex.",
      inputSchema: {
        cpgPath: z.string().describe("Path to cpg.bin or cpg.bin.zip"),
        nameRegex: z.string().optional().describe("Filter by method name regex"),
        fullNameRegex: z.string().optional().describe("Filter by method fullName regex"),
      },
    },
    async (args: { cpgPath: string; nameRegex?: string; fullNameRegex?: string }) => {
      const { cpgPath, nameRegex, fullNameRegex } = args;
      const outputFile = path.join(MCP_OUT, `methods-list-${Date.now()}.json`);
      const script = scriptMethods(outputFile, { nameRegex, fullNameRegex });
      const result = await runJoernScriptFromSource(script, {}, cpgPath);
      if (result.exitCode !== 0) {
        return {
          content: [{ type: "text" as const, text: `Methods failed:\n${result.stderr}\n${result.stdout}` }],
          isError: true,
        };
      }
      const json = existsSync(outputFile) ? readFileSync(outputFile, "utf8") : "[]";
      return { content: [{ type: "text" as const, text: json }] };
    }
  );
}

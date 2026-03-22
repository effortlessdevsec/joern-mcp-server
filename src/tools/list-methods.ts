import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { runJoernScriptFromSource } from "../joern/executor.js";
import { scriptListMethods } from "../scripts.js";
import { MCP_OUT } from "../config/paths.js";

export function registerListMethodsTool(server: McpServer): void {
  server.registerTool(
    "joern_list_methods",
    {
      description:
        "List all method names in the loaded CPG. Works with any language (Java, C, Python, etc.).",
      inputSchema: {
        cpgPath: z.string().describe("Path to cpg.bin or project directory containing cpg.bin"),
      },
    },
    async (args: { cpgPath: string }) => {
      const { cpgPath } = args;
      const outputFile = path.join(MCP_OUT, `method-names-${Date.now()}.json`);
      const script = scriptListMethods(outputFile);
      const result = await runJoernScriptFromSource(script, {}, cpgPath);
      if (result.exitCode !== 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Joern list methods failed:\n${result.stderr}\n${result.stdout}`,
            },
          ],
          isError: true,
        };
      }
      let json = "[]";
      if (existsSync(outputFile)) {
        json = readFileSync(outputFile, "utf8");
      }
      return { content: [{ type: "text" as const, text: json }] };
    }
  );
}

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { runJoernScriptFromSource } from "../joern/executor.js";
import { scriptListCallNames } from "../scripts.js";
import { MCP_OUT } from "../config/paths.js";

export function registerListCallNamesTool(server: McpServer): void {
  server.registerTool(
    "joern_list_call_names",
    {
      description:
        "List distinct call names in the CPG. Optionally filter by callee methodFullName regex (e.g. .*Log.*).",
      inputSchema: {
        cpgPath: z.string().describe("Path to cpg.bin or cpg.bin.zip"),
        methodFullNameRegex: z
          .string()
          .optional()
          .describe("Only calls whose callee full name matches this regex"),
      },
    },
    async (args: { cpgPath: string; methodFullNameRegex?: string }) => {
      const { cpgPath, methodFullNameRegex } = args;
      const outputFile = path.join(MCP_OUT, `call-names-${Date.now()}.json`);
      const script = scriptListCallNames(outputFile, methodFullNameRegex);
      const result = await runJoernScriptFromSource(script, {}, cpgPath);
      if (result.exitCode !== 0) {
        return {
          content: [
            { type: "text" as const, text: `List call names failed:\n${result.stderr}\n${result.stdout}` },
          ],
          isError: true,
        };
      }
      const json = existsSync(outputFile) ? readFileSync(outputFile, "utf8") : "[]";
      return { content: [{ type: "text" as const, text: json }] };
    }
  );
}

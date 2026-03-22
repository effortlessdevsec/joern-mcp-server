import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runJoernScriptFromSource } from "../joern/executor.js";

/** Arbitrary Scala `@main` script — uses spawn or HTTP backend (see executor). */
export function registerRunScriptTool(server: McpServer): void {
  server.registerTool(
    "joern_run_script",
    {
      description:
        "Run any Joern Scala script against a CPG. Full API: cpg.*, import io.joern.dataflowengineoss.language._, reachableByFlows, methodFullName, etc. Script must define @main def main() = { ... }. Use println or .p or .toJsonPretty for output (captured in stdout).",
      inputSchema: {
        script: z.string().describe("Full Scala script (must contain @main def main() = { ... })"),
        cpgPath: z.string().optional().describe("Path to cpg.bin or cpg.bin.zip (required for CPG queries)"),
        params: z
          .record(z.string())
          .optional()
          .describe("Optional --param key=value map (no spaces after =)"),
      },
    },
    async (args: { script: string; cpgPath?: string; params?: Record<string, string> }) => {
      const { script, cpgPath, params = {} } = args;
      const result = await runJoernScriptFromSource(script, params, cpgPath);
      const text =
        result.exitCode === 0
          ? result.stdout + (result.stderr ? "\n--- stderr ---\n" + result.stderr : "")
          : `Exit ${result.exitCode}\n--- stdout ---\n${result.stdout}\n--- stderr ---\n${result.stderr}`;
      return {
        content: [{ type: "text" as const, text }],
        ...(result.exitCode !== 0 ? { isError: true } : {}),
      };
    }
  );
}

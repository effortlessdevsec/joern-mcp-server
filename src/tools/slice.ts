import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import path from "path";
import { runJoernSlice } from "../joern/executor.js";
import { MCP_OUT } from "../config/paths.js";

/**
 * `joern-slice` CLI — data-flow or usages slices (JoernSlice).
 * Spawn only.
 */
export function registerSliceTool(server: McpServer): void {
  server.registerTool(
    "joern_slice",
    {
      description:
        "Run joern-slice: extract data-flow or usages slices from a CPG to JSON (Joern CLI). Example: mode=data-flow with sink-filter regex.",
      inputSchema: {
        cpgPath: z.string().describe("cpg.bin path or source dir (CLI will build temp CPG if needed)"),
        mode: z.enum(["data-flow", "usages"]).describe("Slice subcommand"),
        outputPath: z
          .string()
          .optional()
          .describe("Base output path (-o); .json suffix added by Joern. Default under MCP_OUT"),
        sinkFilter: z
          .string()
          .optional()
          .describe("data-flow: --sink-filter regex on sink code"),
        sliceDepth: z
          .number()
          .int()
          .optional()
          .describe("data-flow: --slice-depth (default 20 in Joern)"),
        endAtExternalMethod: z
          .boolean()
          .optional()
          .describe("data-flow: --end-at-external-method"),
        minNumCalls: z
          .number()
          .int()
          .optional()
          .describe("usages: --min-num-calls"),
        excludeOperatorCalls: z
          .boolean()
          .optional()
          .describe("usages: --exclude-operators"),
        excludeSource: z
          .boolean()
          .optional()
          .describe("usages: --exclude-source"),
        fileFilter: z.string().optional().describe("--file-filter regex"),
        methodNameFilter: z.string().optional().describe("--method-name-filter regex"),
        methodParameterFilter: z
          .string()
          .optional()
          .describe("--method-parameter-filter regex"),
        methodAnnotationFilter: z
          .string()
          .optional()
          .describe("--method-annotation-filter regex"),
        parallelism: z.number().int().positive().optional().describe("-p parallelism"),
      },
    },
    async (args: {
      cpgPath: string;
      mode: "data-flow" | "usages";
      outputPath?: string;
      sinkFilter?: string;
      sliceDepth?: number;
      endAtExternalMethod?: boolean;
      minNumCalls?: number;
      excludeOperatorCalls?: boolean;
      excludeSource?: boolean;
      fileFilter?: string;
      methodNameFilter?: string;
      methodParameterFilter?: string;
      methodAnnotationFilter?: string;
      parallelism?: number;
    }) => {
      const outBase =
        args.outputPath?.trim() || path.join(MCP_OUT, `slice-${Date.now()}`);
      const cliArgs: string[] = [args.cpgPath, "-o", outBase];
      if (args.parallelism !== undefined) {
        cliArgs.push("-p", String(args.parallelism));
      }
      if (args.fileFilter) cliArgs.push("--file-filter", args.fileFilter);
      if (args.methodNameFilter) {
        cliArgs.push("--method-name-filter", args.methodNameFilter);
      }
      if (args.methodParameterFilter) {
        cliArgs.push("--method-parameter-filter", args.methodParameterFilter);
      }
      if (args.methodAnnotationFilter) {
        cliArgs.push("--method-annotation-filter", args.methodAnnotationFilter);
      }

      if (args.mode === "data-flow") {
        cliArgs.push("data-flow");
        if (args.sliceDepth !== undefined) {
          cliArgs.push("--slice-depth", String(args.sliceDepth));
        }
        if (args.sinkFilter) cliArgs.push("--sink-filter", args.sinkFilter);
        if (args.endAtExternalMethod) cliArgs.push("--end-at-external-method");
      } else {
        cliArgs.push("usages");
        if (args.minNumCalls !== undefined) {
          cliArgs.push("--min-num-calls", String(args.minNumCalls));
        }
        if (args.excludeOperatorCalls) cliArgs.push("--exclude-operators");
        if (args.excludeSource) cliArgs.push("--exclude-source");
      }

      const result = await runJoernSlice(cliArgs);
      const text =
        result.exitCode === 0
          ? JSON.stringify(
              {
                outputBase: outBase,
                mode: args.mode,
                stdout: result.stdout,
                stderr: result.stderr,
              },
              null,
              2
            )
          : `joern-slice failed (exit ${result.exitCode}):\n${result.stderr}\n${result.stdout}`;
      return {
        content: [{ type: "text" as const, text }],
        ...(result.exitCode !== 0 ? { isError: true } : {}),
      };
    }
  );
}

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { runJoernScriptFromSource } from "../joern/executor.js";
import { scriptImportCode } from "../scripts.js";
import { MCP_OUT } from "../config/paths.js";

const importCodeInputSchema = {
  inputPath: z
    .string()
    .describe(
      "Absolute path to source directory or file (Joern importCode input; e.g. .apk for jvm)"
    ),
  language: z
    .string()
    .optional()
    .describe(
      "Frontend for importCode.<language>: java, kotlin, jvm, c, cpp, python, golang, jssrc, javascript, php, ruby, csharp, csharpsrc, swiftsrc, llvm, ghidra (default: java)"
    ),
  runOssDataflow: z
    .boolean()
    .optional()
    .describe(
      "If true (default), run run.ossdataflow after import so dataflow tools work. Set false for import-only."
    ),
};

type ImportCodeArgs = {
  inputPath: string;
  language?: string;
  runOssDataflow?: boolean;
};

async function handleImportCode(args: ImportCodeArgs) {
  const { inputPath, language = "java", runOssDataflow } = args;
  const outputFile = path.join(MCP_OUT, `import-${Date.now()}.txt`);
  const script = scriptImportCode(inputPath, language, outputFile, {
    runOssDataflow: runOssDataflow !== false,
  });
  const result = await runJoernScriptFromSource(script, {});
  if (result.exitCode !== 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Joern importCode failed:\n${result.stderr}\n${result.stdout}`,
        },
      ],
      isError: true,
    };
  }
  let projectPath = "";
  if (existsSync(outputFile)) {
    projectPath = readFileSync(outputFile, "utf8").trim();
  }
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          { projectPath, stdout: result.stdout, stderr: result.stderr },
          null,
          2
        ),
      },
    ],
  };
}

/** Registers joern_import_code and joern_importcode (same handler; Joern importCode API). */
export function registerImportCodeTools(server: McpServer): void {
  server.registerTool(
    "joern_import_code",
    {
      description:
        "Import sources/binary into Joern (importCode.<language>) and build a CPG. Runs run.ossdataflow by default. Returns projectPath for cpgPath in other tools. Same behavior as joern_importcode.",
      inputSchema: importCodeInputSchema,
    },
    handleImportCode
  );

  server.registerTool(
    "joern_importcode",
    {
      description:
        "Joern importCode API: importCode.<language>(inputPath) into workspace, optional run.ossdataflow. Use language=jssrc for JavaScript/Node. Returns projectPath. Identical to joern_import_code — exposed so clients searching for 'importCode' find it.",
      inputSchema: importCodeInputSchema,
    },
    handleImportCode
  );
}

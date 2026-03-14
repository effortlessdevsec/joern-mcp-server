#!/usr/bin/env node
/**
 * Joern Advanced MCP Server
 * Exposes Joern CPG, dataflow, and graph dump as MCP tools.
 * Requires: joern and (for flows/dump) a loaded CPG. Set JOERN_HOME if joern is not on PATH.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, existsSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { runJoernScript, runJoernScan } from "./joern.js";
import {
  scriptFlows,
  scriptListMethods,
  scriptDumpGraphs,
  scriptImportCode,
  scriptFindCalls,
  scriptListCallNames,
  scriptMethods,
} from "./scripts.js";
import { writeTempScript } from "./joern.js";
import path from "path";
import { mkdirSync } from "fs";

const TMP = process.env.TMP || process.env.TEMP || "/tmp";
const MCP_OUT = path.join(TMP, "joern-mcp");
try {
  mkdirSync(MCP_OUT, { recursive: true });
} catch {}

const mcpServer = new McpServer({
  name: "joern-mcp-server",
  version: "1.0.0",
});

// --- joern_run_script: run arbitrary Joern Scala script (full CPG API, dataflow, etc.) ---
mcpServer.registerTool(
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
    const scriptPath = writeTempScript(script);
    const result = await runJoernScript(scriptPath, params, cpgPath);
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

// --- joern_find_calls: find call nodes by methodFullName/callName/argument filter ---
mcpServer.registerTool(
  "joern_find_calls",
  {
    description:
      "Find call nodes. Filter by methodFullName regex (e.g. .*Log\\.(d|e|i|v|w).*), call name regex, and/or argument index + argument code regex (e.g. where arg 1 matches .*pass.*). Returns JSON array of code, lineNumber, filename, methodFullName.",
    inputSchema: {
      cpgPath: z.string().describe("Path to cpg.bin or cpg.bin.zip"),
      methodFullNameRegex: z.string().optional().describe("Filter by callee method full name regex"),
      callNameRegex: z.string().optional().describe("Filter by call name regex"),
      whereArgumentIndex: z.number().int().optional().describe("Argument index (0-based) to filter by"),
      whereArgumentCodeRegex: z.string().optional().describe("Regex that argument code must match (use with whereArgumentIndex)"),
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
    const scriptPath = writeTempScript(script);
    const result = await runJoernScript(scriptPath, {}, cpgPath);
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

// --- joern_list_call_names: list distinct call names, optional methodFullName filter ---
mcpServer.registerTool(
  "joern_list_call_names",
  {
    description: "List distinct call names in the CPG. Optionally filter by callee methodFullName regex (e.g. .*Log.*).",
    inputSchema: {
      cpgPath: z.string().describe("Path to cpg.bin or cpg.bin.zip"),
      methodFullNameRegex: z.string().optional().describe("Only calls whose callee full name matches this regex"),
    },
  },
  async (args: { cpgPath: string; methodFullNameRegex?: string }) => {
    const { cpgPath, methodFullNameRegex } = args;
    const outputFile = path.join(MCP_OUT, `call-names-${Date.now()}.json`);
    const script = scriptListCallNames(outputFile, methodFullNameRegex);
    const scriptPath = writeTempScript(script);
    const result = await runJoernScript(scriptPath, {}, cpgPath);
    if (result.exitCode !== 0) {
      return {
        content: [{ type: "text" as const, text: `List call names failed:\n${result.stderr}\n${result.stdout}` }],
        isError: true,
      };
    }
    const json = existsSync(outputFile) ? readFileSync(outputFile, "utf8") : "[]";
    return { content: [{ type: "text" as const, text: json }] };
  }
);

// --- joern_methods: list methods with name, fullName, filename; optional filters ---
mcpServer.registerTool(
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
    const outputFile = path.join(MCP_OUT, `methods-${Date.now()}.json`);
    const script = scriptMethods(outputFile, { nameRegex, fullNameRegex });
    const scriptPath = writeTempScript(script);
    const result = await runJoernScript(scriptPath, {}, cpgPath);
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

// --- joern_import_code: import source directory and run dataflow ---
mcpServer.registerTool(
  "joern_import_code",
  {
    description:
      "Import source code into Joern and build CPG. Supports: java, kotlin, jvm, c, cpp, python, golang, jssrc, php, ruby, csharp, csharpsrc, swiftsrc, llvm, ghidra. Returns project path for other tools.",
    inputSchema: {
      inputPath: z.string().describe("Absolute path to source directory or file (e.g. .apk for jvm)"),
      language: z
        .string()
        .optional()
        .describe("Language: java, kotlin, jvm, c, cpp, python, golang, jssrc, php, ruby, csharp, csharpsrc, swiftsrc, llvm, ghidra (default: java)"),
    },
  },
  async (args: { inputPath: string; language?: string }) => {
    const { inputPath, language = "java" } = args;
    const outputFile = path.join(MCP_OUT, `import-${Date.now()}.txt`);
    const script = scriptImportCode(inputPath, language, outputFile);
    const scriptPath = writeTempScript(script);
    const result = await runJoernScript(scriptPath, {});
    if (result.exitCode !== 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Joern import failed:\n${result.stderr}\n${result.stdout}`,
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
);

// --- joern_query_flows: get dataflows from source call to sink call (works with any language CPG) ---
mcpServer.registerTool(
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
      sourceMethodFullNameRegex: z.string().optional().describe("If set, source is cpg.call.methodFullName(this regex) instead of call name (e.g. .*getString.*)"),
      sinkMethodFullNameRegex: z.string().optional().describe("If set, sink is cpg.call.methodFullName(this regex) instead of call name (e.g. .*android\\.util\\.Log\\.(d|e|i|v|w).*)"),
      methodRegex: z.string().optional().describe("Optional filter: only keep flows touching methods whose fullName matches this regex"),
      fileRegex: z.string().optional().describe("Optional filter: only keep flows touching elements whose filename matches this regex"),
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
    const scriptPath = writeTempScript(script);
    const result = await runJoernScript(scriptPath, {}, cpgPath);
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
    return {
      content: [{ type: "text" as const, text: json }],
    };
  }
);

// --- joern_list_methods: list method names in CPG ---
mcpServer.registerTool(
  "joern_list_methods",
  {
    description: "List all method names in the loaded CPG. Works with any language (Java, C, Python, etc.).",
    inputSchema: {
      cpgPath: z.string().describe("Path to cpg.bin or project directory containing cpg.bin"),
    },
  },
  async (args: { cpgPath: string }) => {
    const { cpgPath } = args;
    const outputFile = path.join(MCP_OUT, `methods-${Date.now()}.json`);
    const script = scriptListMethods(outputFile);
    const scriptPath = writeTempScript(script);
    const result = await runJoernScript(scriptPath, {}, cpgPath);
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
    return {
      content: [{ type: "text" as const, text: json }],
    };
  }
);

// --- joern_dump_graphs: dump AST/CFG/PDG for methods in flows ---
mcpServer.registerTool(
  "joern_dump_graphs",
  {
    description:
      "Dump AST, CFG, and/or PDG as .dot for methods in source->sink flows. Works with any language CPG.",
    inputSchema: {
      cpgPath: z.string().describe("Path to cpg.bin or project directory"),
      sourceCallName: z.string().describe("Source call name, e.g. getIntent"),
      sinkCallNamePattern: z.string().describe("Sink pattern, e.g. loadUrl|loadData|loadDataWithBaseURL"),
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
      methodRegex: z.string().optional().describe("Optional filter: only keep flows touching methods whose fullName matches this regex"),
      fileRegex: z.string().optional().describe("Optional filter: only keep flows touching elements whose filename matches this regex"),
      dumpFlowDot: z.boolean().optional().describe("Also write one end-to-end DOT file per flow path (default: true)"),
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
    const scriptPath = writeTempScript(script);
    const result = await runJoernScript(scriptPath, {}, cpgPath);
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
            { outputDir, files: JSON.parse(json), hint: "Convert to SVG: dot -Tsvg file.dot -o file.svg" },
            null,
            2
          ),
        },
      ],
    };
  }
);

// --- joern_full_flow_graph: one merged DOT + SVG for all source->sink flows (no manual script) ---
type FlowElement = { type?: string; code?: string; lineNumber?: number; method?: string; filename?: string; methodFullName?: string };
type FlowsPayload = { flows?: { index?: number; elements?: FlowElement[] }[]; flowCount?: number };

function dotLabelEscape(s: string): string {
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "");
}

function buildMergedFlowDot(flows: FlowElement[][], sourceName: string, sinkName: string): string {
  const title = `${sourceName} -> ${sinkName} (all flows)`;
  const lines: string[] = [
    `digraph "${title}" {`,
    '  rankdir=LR;',
    '  node [shape=box, fontname="Helvetica", fontsize=10];',
    '  edge [fontsize=9];',
  ];
  flows.forEach((elements, flowIdx) => {
    const clusterId = `cluster_f${flowIdx}`;
    const shortLabel = elements.length <= 8 ? `Flow ${flowIdx}` : `Flow ${flowIdx} (${elements.length} steps)`;
    lines.push(`  subgraph ${clusterId} { label="${dotLabelEscape(shortLabel)}"; fontsize=11;`);
    elements.forEach((el, elIdx) => {
      const nodeId = `f${flowIdx}_n${elIdx}`;
      const code = el.code ?? el.type ?? "?";
      const loc = el.filename ? `${el.filename}:${el.lineNumber ?? "?"}` : (el.method ? `${el.method}:${el.lineNumber ?? "?"}` : String(el.lineNumber ?? ""));
      const label = loc ? `${dotLabelEscape(code)}\\n${dotLabelEscape(loc)}` : dotLabelEscape(code);
      lines.push(`    ${nodeId} [label="${label}"];`);
    });
    for (let i = 0; i < elements.length - 1; i++) {
      lines.push(`    f${flowIdx}_n${i} -> f${flowIdx}_n${i + 1};`);
    }
    lines.push("  }");
  });
  lines.push("}");
  return lines.join("\n");
}

mcpServer.registerTool(
  "joern_full_flow_graph",
  {
    description:
      "Create one merged flow graph (DOT + SVG) for all source->sink dataflows. No manual script: uses Joern to get flows, then builds a single full graph.",
    inputSchema: {
      cpgPath: z.string().describe("Path to cpg.bin or cpg.bin.zip"),
      sourceCallName: z.string().describe("Source call name, e.g. getIntent"),
      sinkCallNamePattern: z.string().describe("Sink pattern, e.g. loadUrl or loadUrl|loadData"),
      outputDir: z.string().optional().describe("Directory for output .dot and .svg (default: current dir or temp)"),
      emitSVG: z.boolean().optional().describe("Run dot -Tsvg to produce .svg (default: true; requires graphviz)"),
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
    const scriptPath = writeTempScript(script);
    const result = await runJoernScript(scriptPath, {}, cpgPath);
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
        execSync(`dot -Tsvg "${dotPath}" -o "${svgPath}"`, { stdio: "pipe", maxBuffer: 10 * 1024 * 1024 });
        svgWritten = existsSync(svgPath);
      } catch (e) {
        // dot not installed or failed; dotPath still valid
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
              hint: !svgWritten && emitSVG ? "Install graphviz (dot) and run: dot -Tsvg " + dotPath + " -o " + svgPath : undefined,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// --- joern_scan: run joern-scan on a path ---
mcpServer.registerTool(
  "joern_scan",
  {
    description:
      "Run joern-scan on a source directory. Auto-detects language (C, Java, Python, Go, JS, etc.) and runs built-in queries.",
    inputSchema: {
      inputPath: z.string().describe("Path to source code directory"),
      language: z.string().optional().describe("Force language: e.g. java, kotlin, jvm"),
      overwrite: z.boolean().optional().describe("Overwrite existing CPG"),
    },
  },
  async (args: { inputPath: string; language?: string; overwrite?: boolean }) => {
    const { inputPath, language, overwrite } = args;
    const result = await runJoernScan(inputPath, { language, overwrite });
    return {
      content: [
        {
          type: "text" as const,
          text: result.exitCode === 0 ? result.stdout : `Scan failed:\n${result.stderr}\n${result.stdout}`,
        },
      ],
      ...(result.exitCode !== 0 ? { isError: true } : {}),
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

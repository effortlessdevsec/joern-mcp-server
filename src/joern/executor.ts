/**
 * Script execution:
 * - **HTTP (`JOERN_SERVER_URL`):** `POST /query-sync` with unwrapped Scala — **no temp file**, no `joern --script`.
 * - **Spawn:** `joern [cpg] --script` via temp file (only when URL unset).
 * - **`JOERN_MCP_HTTP_ONLY=1`:** script tools **refuse spawn**; require URL (no `JOERN_MCP_FORCE_SPAWN`).
 * - **`JOERN_MCP_FORCE_SPAWN`:** force spawn even if URL set (for `--param`).
 *
 * CLIs (`joern-scan`, `joern-parse`, …) have **no** Joern `/query-sync` API — they always spawn unless `JOERN_MCP_HTTP_ONLY` blocks them.
 */
import { readFileSync } from "fs";
import type { JoernRunResult } from "./types.js";
import {
  runJoernScriptSpawn,
  runJoernScanSpawn,
  runJoernScanNoInput,
  runJoernCli,
  writeTempScript,
  type JoernScanCliOptions,
} from "./spawn.js";
import { runMainScalaViaHttp } from "./http.js";
import { isMcpDebug, mcpDebug } from "./debug.js";

export type { JoernRunResult } from "./types.js";
export { writeTempScript } from "./spawn.js";

const HTTP_ONLY_ERR =
  "JOERN_MCP_HTTP_ONLY=1 requires JOERN_SERVER_URL (and do not set JOERN_MCP_FORCE_SPAWN). Script tools use only POST /query-sync.";

const HTTP_ONLY_CLI_ERR =
  "JOERN_MCP_HTTP_ONLY=1: this tool runs joern-cli (joern-scan / joern-parse / joern-export / joern-slice), which has no HTTP API. Unset JOERN_MCP_HTTP_ONLY, or use joern_importcode / joern_http_query / other script tools against joern --server.";

function wantsForceSpawn(): boolean {
  const v = process.env.JOERN_MCP_FORCE_SPAWN?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function wantsHttpOnly(): boolean {
  const v = process.env.JOERN_MCP_HTTP_ONLY?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** True when script tools should use Joern HTTP (`/query-sync`), not spawn. */
export function isHttpBackend(): boolean {
  if (wantsForceSpawn()) return false;
  const u = process.env.JOERN_SERVER_URL?.trim();
  return Boolean(u && u.length > 0);
}

/** MCP tool return shape when `JOERN_MCP_HTTP_ONLY` blocks a CLI tool. */
export function httpOnlyBlocksCliTool():
  | { content: [{ type: "text"; text: string }]; isError: true }
  | undefined {
  if (!wantsHttpOnly()) return undefined;
  return {
    content: [{ type: "text" as const, text: HTTP_ONLY_CLI_ERR }],
    isError: true,
  };
}

/** Human-readable backend label for docs / debug logging */
export function getBackendLabel(): string {
  if (wantsForceSpawn()) {
    return "spawn (JOERN_MCP_FORCE_SPAWN; scripts ignore JOERN_SERVER_URL)";
  }
  if (isHttpBackend()) {
    return `http (${process.env.JOERN_SERVER_URL?.trim()})`;
  }
  if (wantsHttpOnly()) {
    return "blocked (JOERN_MCP_HTTP_ONLY without JOERN_SERVER_URL)";
  }
  return "spawn (joern --script; JOERN_SERVER_URL not set)";
}

/**
 * Run generated Scala (`@main def main() = { ... }`). HTTP: **in-memory** POST `/query-sync` (no disk). Spawn: temp `.sc` + `joern --script`.
 */
export async function runJoernScriptFromSource(
  scalaSource: string,
  params: Record<string, string> = {},
  cpgPath?: string
): Promise<JoernRunResult> {
  if (isMcpDebug()) {
    mcpDebug("executor", "runJoernScriptFromSource", {
      scalaChars: scalaSource.length,
      paramKeys: Object.keys(params),
      cpgPath: cpgPath?.trim() || "(none)",
      httpBackend: isHttpBackend(),
      httpOnly: wantsHttpOnly(),
      forceSpawn: wantsForceSpawn(),
    });
  }
  if (wantsHttpOnly() && !isHttpBackend()) {
    if (isMcpDebug()) mcpDebug("executor", "blocked: JOERN_MCP_HTTP_ONLY without HTTP backend");
    return { stdout: "", stderr: HTTP_ONLY_ERR, exitCode: -1 };
  }
  if (isHttpBackend()) {
    if (Object.keys(params).length > 0) {
      if (isMcpDebug()) mcpDebug("executor", "HTTP path with non-empty params (warning appended to stderr)");
      const warn =
        "[joern-mcp] JOERN_SERVER_URL active: --param values are NOT passed over HTTP; use spawn mode or embed constants in the script.\n";
      const r = await runMainScalaViaHttp(scalaSource, cpgPath);
      return { ...r, stderr: warn + r.stderr, exitCode: r.exitCode };
    }
    return runMainScalaViaHttp(scalaSource, cpgPath);
  }
  const scriptPath = writeTempScript(scalaSource);
  if (isMcpDebug()) {
    mcpDebug("executor", "spawn: temp script", { scriptPath });
  }
  return runJoernScriptSpawn(scriptPath, params, cpgPath);
}

/** Read `.sc` from disk, then same routing as `runJoernScriptFromSource` (spawn path writes a fresh temp file). */
export async function runJoernScript(
  scriptPath: string,
  params: Record<string, string>,
  cpgPath?: string
): Promise<JoernRunResult> {
  let raw: string;
  try {
    raw = readFileSync(scriptPath, "utf8");
  } catch (e) {
    return { stdout: "", stderr: `read script failed: ${String(e)}`, exitCode: -1 };
  }
  return runJoernScriptFromSource(raw, params, cpgPath);
}

export async function runJoernScan(
  inputPath: string,
  options: JoernScanCliOptions = {}
): Promise<JoernRunResult> {
  if (wantsHttpOnly()) {
    if (isMcpDebug()) mcpDebug("executor", "runJoernScan blocked by JOERN_MCP_HTTP_ONLY");
    return { stdout: "", stderr: HTTP_ONLY_CLI_ERR, exitCode: -1 };
  }
  if (isMcpDebug()) mcpDebug("executor", "runJoernScan spawn", { inputPath, options });
  return runJoernScanSpawn(inputPath, options);
}

export async function runJoernScanListQueryNames(): Promise<JoernRunResult> {
  if (wantsHttpOnly()) {
    return { stdout: "", stderr: HTTP_ONLY_CLI_ERR, exitCode: -1 };
  }
  return runJoernScanNoInput(["--list-query-names"]);
}

export async function runJoernScanListLanguages(): Promise<JoernRunResult> {
  if (wantsHttpOnly()) {
    return { stdout: "", stderr: HTTP_ONLY_CLI_ERR, exitCode: -1 };
  }
  return runJoernScanNoInput(["--list-languages"]);
}

export async function runJoernParse(args: string[]): Promise<JoernRunResult> {
  if (wantsHttpOnly()) {
    return { stdout: "", stderr: HTTP_ONLY_CLI_ERR, exitCode: -1 };
  }
  return runJoernCli("joern-parse", args);
}

export async function runJoernExport(args: string[]): Promise<JoernRunResult> {
  if (wantsHttpOnly()) {
    return { stdout: "", stderr: HTTP_ONLY_CLI_ERR, exitCode: -1 };
  }
  return runJoernCli("joern-export", args);
}

export async function runJoernSlice(args: string[]): Promise<JoernRunResult> {
  if (wantsHttpOnly()) {
    return { stdout: "", stderr: HTTP_ONLY_CLI_ERR, exitCode: -1 };
  }
  return runJoernCli("joern-slice", args);
}

export type { JoernScanCliOptions } from "./spawn.js";

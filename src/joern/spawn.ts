import { spawn } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { tmpdir } from "os";
import type { JoernRunResult } from "./types.js";
import { isMcpDebug, mcpDebug } from "./debug.js";

const JOERN_BIN = process.env.JOERN_HOME
  ? path.join(process.env.JOERN_HOME, "joern-cli", "joern")
  : "joern";

const JOERN_SCAN_BIN = process.env.JOERN_HOME
  ? path.join(process.env.JOERN_HOME, "joern-cli", "joern-scan")
  : "joern-scan";

/** Resolve `joern-cli/<name>` when JOERN_HOME is set, else assume `name` is on PATH. */
export function joernCliBin(name: string): string {
  return process.env.JOERN_HOME
    ? path.join(process.env.JOERN_HOME, "joern-cli", name)
    : name;
}

export async function runJoernCli(
  name: string,
  args: string[],
  cwd?: string
): Promise<JoernRunResult> {
  return runCommand(joernCliBin(name), args, cwd);
}

export async function runJoernScriptSpawn(
  scriptPath: string,
  params: Record<string, string>,
  cpgPath?: string
): Promise<JoernRunResult> {
  const args = ["--script", scriptPath];
  for (const [k, v] of Object.entries(params)) {
    args.push("--param", `${k}=${v}`);
  }
  if (cpgPath) {
    args.unshift(cpgPath);
  }
  return runCommand(JOERN_BIN, args);
}

export type JoernScanCliOptions = {
  language?: string;
  overwrite?: boolean;
  store?: boolean;
  names?: string;
  tags?: string;
  maxCallDepth?: number;
};

/** `joern-scan` — flags must precede the positional `src` path (scopt). */
export async function runJoernScanSpawn(
  inputPath: string,
  options: JoernScanCliOptions = {}
): Promise<JoernRunResult> {
  const args: string[] = [];
  if (options.names) args.push("--names", options.names);
  if (options.tags) args.push("--tags", options.tags);
  if (options.maxCallDepth !== undefined && options.maxCallDepth >= 0) {
    args.push("--depth", String(options.maxCallDepth));
  }
  if (options.store) args.push("--store");
  if (options.language) args.push("--language", options.language);
  if (options.overwrite) args.push("--overwrite");
  args.push(inputPath);
  return runCommand(JOERN_SCAN_BIN, args);
}

/** `joern-scan` modes that do not take a source directory. */
export async function runJoernScanNoInput(args: string[]): Promise<JoernRunResult> {
  return runCommand(JOERN_SCAN_BIN, args);
}

export function runCommand(
  command: string,
  args: string[],
  cwd?: string
): Promise<JoernRunResult> {
  return new Promise((resolve) => {
    if (isMcpDebug()) {
      mcpDebug("spawn", "runCommand", {
        command,
        args,
        cwd: cwd || process.cwd(),
        joernHome: process.env.JOERN_HOME || "(unset)",
      });
    }
    const proc = spawn(command, args, {
      cwd: cwd || process.cwd(),
      shell: process.platform === "win32",
      env: { ...process.env, JOERN_HOME: process.env.JOERN_HOME || "" },
    });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d) => (stdout += d.toString()));
    proc.stderr?.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => {
      if (isMcpDebug()) {
        mcpDebug("spawn", "runCommand exit", {
          command,
          exitCode: code ?? -1,
          stdoutChars: stdout.length,
          stderrChars: stderr.length,
        });
      }
      resolve({
        stdout,
        stderr,
        exitCode: code ?? -1,
      });
    });
    proc.on("error", (err) => {
      if (isMcpDebug()) {
        mcpDebug("spawn", "runCommand spawn error", {
          command,
          message: err?.message || String(err),
        });
      }
      resolve({
        stdout,
        stderr: stderr + (err?.message || String(err)),
        exitCode: -1,
      });
    });
  });
}

/** Write a temporary .sc script and return its path */
export function writeTempScript(content: string): string {
  const dir = path.join(tmpdir(), "joern-mcp");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `script-${Date.now()}.sc`);
  writeFileSync(file, content, "utf8");
  return file;
}

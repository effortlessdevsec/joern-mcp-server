import { spawn } from "child_process";
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { tmpdir } from "os";

const JOERN_BIN = process.env.JOERN_HOME
  ? path.join(process.env.JOERN_HOME, "joern-cli", "joern")
  : "joern";
const JOERN_SCAN_BIN = process.env.JOERN_HOME
  ? path.join(process.env.JOERN_HOME, "joern-cli", "joern-scan")
  : "joern-scan";

export interface JoernRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function runJoernScript(
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

export async function runJoernScan(
  inputPath: string,
  options: { language?: string; overwrite?: boolean } = {}
): Promise<JoernRunResult> {
  const args = [inputPath];
  if (options.language) args.push("--language", options.language);
  if (options.overwrite) args.push("--overwrite");
  return runCommand(JOERN_SCAN_BIN, args);
}

export function runCommand(
  command: string,
  args: string[],
  cwd?: string
): Promise<JoernRunResult> {
  return new Promise((resolve) => {
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
      resolve({
        stdout,
        stderr,
        exitCode: code ?? -1,
      });
    });
    proc.on("error", (err) => {
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

/** Read script from our bundled scripts dir or from absolute path */
export function resolveScript(name: string): string {
  const local = path.join(process.cwd(), "scripts", name);
  try {
    if (readFileSync(local, "utf8")) return local;
  } catch {
    // fallback to same dir as dist
  }
  const nextToDist = path.join(process.cwd(), "scripts", name);
  return nextToDist;
}

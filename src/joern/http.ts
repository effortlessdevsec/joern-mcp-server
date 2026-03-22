import { readFileSync } from "fs";
import type { JoernRunResult } from "./types.js";
import { mcpDebug, truncateForDebug, isMcpDebug } from "./debug.js";
import { unwrapAtMainScript } from "./unwrap-main.js";

function baseUrl(): string {
  const raw = process.env.JOERN_SERVER_URL?.trim() ?? "";
  return raw.replace(/\/+$/, "");
}

function timeoutMs(): number {
  const t = process.env.JOERN_SERVER_TIMEOUT_MS;
  if (!t) return 300_000;
  const n = parseInt(t, 10);
  return Number.isFinite(n) && n > 0 ? n : 300_000;
}

function authHeader(): Record<string, string> {
  const u = process.env.JOERN_SERVER_USER ?? process.env.JOERN_SERVER_BASIC_USER;
  const p = process.env.JOERN_SERVER_PASSWORD ?? process.env.JOERN_SERVER_BASIC_PASS;
  if (u && p !== undefined) {
    const token = Buffer.from(`${u}:${p}`, "utf8").toString("base64");
    return { Authorization: `Basic ${token}` };
  }
  return {};
}

type QuerySyncResponse = {
  success?: boolean;
  stdout?: string;
  uuid?: string;
  err?: string;
};

export type QuerySyncHttpOptions = {
  /** Appended after server stdout (e.g. cpgPath reminder for script tools). */
  stdoutTrailNotes?: string[];
  /** Append `[joern-mcp] query-sync uuid: …` on success. */
  appendSyncFooter?: boolean;
};

/**
 * POST raw `query` to `JOERN_SERVER_URL/query-sync` (same wire format as curl).
 * Does not unwrap `@main` — pass REPL-style snippets.
 */
export async function runQuerySyncHttp(
  query: string,
  options: QuerySyncHttpOptions = {}
): Promise<JoernRunResult> {
  const root = baseUrl();
  if (!root) {
    return {
      stdout: "",
      stderr: "[joern-mcp] JOERN_SERVER_URL is not set.",
      exitCode: -1,
    };
  }

  const url = `${root}/query-sync`;
  const { stdoutTrailNotes = [], appendSyncFooter = false } = options;

  const t0 = Date.now();
  if (isMcpDebug()) {
    mcpDebug("http", "POST /query-sync", {
      url,
      queryChars: query.length,
      queryPreview: truncateForDebug(query),
      timeoutMs: timeoutMs(),
      auth: authHeader().Authorization ? "Basic (set)" : "none",
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...authHeader(),
      },
      body: JSON.stringify({ query }),
      signal: controller.signal,
    });

    const text = await res.text();
    let body: QuerySyncResponse = {};
    try {
      body = JSON.parse(text) as QuerySyncResponse;
    } catch {
      body = { success: false, err: text.slice(0, 2000) };
    }

    let stdout = body.stdout ?? "";
    if (stdoutTrailNotes.length) {
      stdout += (stdout ? "\n" : "") + stdoutTrailNotes.join("\n") + "\n";
    }
    if (appendSyncFooter && body.uuid) {
      stdout += `[joern-mcp] query-sync uuid: ${body.uuid}\n`;
    }

    const stderr =
      !res.ok
        ? `HTTP ${res.status} ${res.statusText}\n${text.slice(0, 4000)}`
        : body.success === false
          ? (body.err ?? "query-sync reported failure")
          : "";

    const ok = res.ok && body.success !== false;
    const exitCode = ok ? 0 : res.ok ? 1 : Math.min(res.status, 255) || 1;

    if (isMcpDebug()) {
      mcpDebug("http", "query-sync response", {
        ms: Date.now() - t0,
        httpStatus: res.status,
        success: body.success,
        uuid: body.uuid,
        exitCode,
        stdoutChars: stdout.length,
        stdoutPreview: truncateForDebug(stdout.replace(/\u001b\[[0-9;]*m/g, "")),
        err: body.err ? truncateForDebug(String(body.err)) : undefined,
      });
    }

    return { stdout, stderr, exitCode };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isMcpDebug()) {
      mcpDebug("http", "query-sync fetch error", {
        ms: Date.now() - t0,
        url,
        message: msg,
      });
    }
    return {
      stdout: "",
      stderr: `fetch ${url} failed: ${msg}`,
      exitCode: -1,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POST `@main` Scala (or raw block after unwrap) to `/query-sync` — **no temp file**, no `joern` subprocess.
 */
export async function runMainScalaViaHttp(
  scalaSource: string,
  cpgPath?: string
): Promise<JoernRunResult> {
  const query = unwrapAtMainScript(scalaSource);
  if (isMcpDebug()) {
    mcpDebug("http", "runMainScalaViaHttp unwrap", {
      scalaChars: scalaSource.length,
      queryChars: query.length,
      cpgPath: cpgPath?.trim() || "(none)",
      queryPreview: truncateForDebug(query),
    });
  }
  const notes: string[] = [];
  if (cpgPath?.trim()) {
    notes.push(
      `[joern-mcp] HTTP: tool passed cpgPath="${cpgPath}" — server uses whatever CPG it loaded at startup; importCpg is not run per request.`
    );
  }
  return runQuerySyncHttp(query, {
    stdoutTrailNotes: notes,
    appendSyncFooter: false,
  });
}

/**
 * Read `.sc` from disk then same as `runMainScalaViaHttp` (for external file paths only).
 */
export async function runScriptViaHttp(
  scriptPath: string,
  cpgPath?: string
): Promise<JoernRunResult> {
  let raw: string;
  try {
    raw = readFileSync(scriptPath, "utf8");
  } catch (e) {
    return {
      stdout: "",
      stderr: `read script failed: ${String(e)}`,
      exitCode: -1,
    };
  }
  return runMainScalaViaHttp(raw, cpgPath);
}

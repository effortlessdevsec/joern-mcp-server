/**
 * Verbose diagnostics on **stderr** when `JOERN_MCP_DEBUG` is truthy.
 * Never use stdout — MCP owns it for JSON-RPC.
 */

function truthyEnv(v: string | undefined): boolean {
  if (!v) return false;
  const t = v.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes";
}

export function isMcpDebug(): boolean {
  return truthyEnv(process.env.JOERN_MCP_DEBUG);
}

/** Max characters of `query` / script logged per request (default 2000). */
export function debugQueryMaxChars(): number {
  const raw = process.env.JOERN_MCP_DEBUG_QUERY_MAX;
  if (!raw) return 2000;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 2000;
}

export function truncateForDebug(text: string): string {
  const max = debugQueryMaxChars();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n... [joern-mcp-debug: truncated ${text.length - max} chars; set JOERN_MCP_DEBUG_QUERY_MAX]`;
}

export function mcpDebug(section: string, message: string, data?: Record<string, unknown>): void {
  if (!isMcpDebug()) return;
  const extra = data !== undefined ? ` ${JSON.stringify(data)}` : "";
  console.error(`[joern-mcp-debug] [${section}] ${message}${extra}`);
}

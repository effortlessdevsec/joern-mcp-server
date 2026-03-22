import { mkdirSync } from "fs";
import path from "path";

const TMP = process.env.TMP || process.env.TEMP || "/tmp";

/** Scratch dir for Joern script output JSON (same host as MCP; HTTP Joern must write here too). */
export const MCP_OUT = path.join(TMP, "joern-mcp");

export function ensureMcpOutDir(): void {
  try {
    mkdirSync(MCP_OUT, { recursive: true });
  } catch {
    /* exists */
  }
}

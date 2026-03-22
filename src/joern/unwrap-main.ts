/**
 * Joern MCP scripts use `@main def main() = { ... }` for `joern --script`.
 * The HTTP CPGQL server executes repl snippets; unwrap the main body so the
 * block runs as a single query string (best-effort brace matching).
 */
export function unwrapAtMainScript(scala: string): string {
  const marker = "@main def main() = {";
  const idx = scala.indexOf(marker);
  if (idx < 0) return scala.trim();
  let pos = idx + marker.length;
  let depth = 1;
  while (pos < scala.length && depth > 0) {
    const c = scala[pos++];
    if (c === "{") depth++;
    else if (c === "}") depth--;
  }
  if (depth !== 0) return scala.trim();
  return scala.slice(idx + marker.length, pos - 1).trim();
}

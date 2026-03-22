/** Result of running Joern (spawn or HTTP), normalized for MCP tools. */
export interface JoernRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

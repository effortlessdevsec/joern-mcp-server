import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllJoernTools } from "./tools/index.js";

export const MCP_SERVER_NAME = "joern-mcp-server";
export const MCP_SERVER_VERSION = "1.2.1";

export function createJoernMcpServer(): McpServer {
  const server = new McpServer({
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
  });
  registerAllJoernTools(server);
  return server;
}

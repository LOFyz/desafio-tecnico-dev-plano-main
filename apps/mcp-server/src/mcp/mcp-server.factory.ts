import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPostTools } from './tools.js';

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'desafio-mcp',
    version: '0.0.1',
  });
  registerPostTools(server);
  return server;
}

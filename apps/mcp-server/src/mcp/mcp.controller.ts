import { All, Controller, Logger, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './mcp-server.factory.js';

@Controller('mcp')
export class McpController {
  private readonly logger = new Logger(McpController.name);

  @All()
  async handle(@Req() req: Request, @Res() res: Response): Promise<void> {
    // Stateless mode: a fresh server + transport per request. The MCP SDK
    // expects this for HTTP and it keeps per-call header passthrough trivial
    // (the underlying tool callbacks read req headers via RequestHandlerExtra).
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    const server = createMcpServer();

    res.on('close', () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      this.logger.error(`MCP request failed: ${(err as Error).message}`);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal MCP server error' },
          id: null,
        });
      }
    }
  }
}

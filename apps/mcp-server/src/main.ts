import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import express from 'express';
import { AppModule } from './app/app.module.js';
import { checkGatewayReachable } from './mcp/gateway-health.js';

async function bootstrap() {
  const log = new Logger('mcp-server');

  const health = await checkGatewayReachable();
  if (!health.ok) {
    log.error(`${health.message} (gateway URL: ${health.url}). Aborting.`);
    process.exit(1);
  }
  log.log(`${health.message} at ${health.url}`);

  const app = await NestFactory.create(AppModule, { bodyParser: false });
  // The MCP transport reads req.body itself, so we wire JSON parsing here
  // explicitly (NestJS's body-parser middleware would otherwise consume the
  // stream too early on the /mcp POST).
  app.use(express.json({ limit: '4mb' }));

  const port = Number(process.env['MCP_SERVER_PORT'] ?? process.env['PORT'] ?? 4000);
  await app.listen(port);
  log.log(`MCP server listening on http://localhost:${port}/mcp`);
}

void bootstrap();

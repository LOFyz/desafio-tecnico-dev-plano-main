import { Module } from '@nestjs/common';
import { McpController } from '../mcp/mcp.controller.js';

@Module({
  imports: [],
  controllers: [McpController],
  providers: [],
})
export class AppModule {}

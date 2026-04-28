#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { config } from './config.js';
import { buildCache } from './index-cache.js';
import { registerCodeTools } from './code/tools.js';
import { registerInsightTools } from './insights/tools.js';

async function main(): Promise<void> {
  const server = new McpServer({
    name: 'atlas-dashboard-mcp',
    version: '1.0.0',
  });

  const cache = buildCache(config);

  registerInsightTools(server, cache, config);
  registerCodeTools(server, config);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write('Atlas Dashboard MCP server running on stdio\n');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Fatal error: ${message}\n`);
  process.exit(1);
});

#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { config } from './config.js';
import { AtlasHttpClient } from './http-client.js';
import { registerUserTools } from './user/tools.js';
import { registerTenantTools } from './tenant/tools.js';
import { registerActivityLogTools } from './activity-log/tools.js';

async function main(): Promise<void> {
  const server = new McpServer({
    name: 'atlas-mcp',
    version: '1.0.0',
  });

  const client = new AtlasHttpClient(config);

  registerUserTools(server, client);
  registerTenantTools(server, client);
  registerActivityLogTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write('Atlas MCP server running on stdio\n');
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Fatal error: ${message}\n`);
  process.exit(1);
});

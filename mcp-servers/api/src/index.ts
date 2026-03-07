#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import pg from 'pg';
import { config } from './config.js';
import { buildCache } from './index-cache.js';
import { registerRouteTools } from './routes/tools.js';
import { registerArchitectureTools } from './architecture/tools.js';
import { registerCodeTools } from './code/tools.js';
import { registerSchemaTools } from './schema/tools.js';

async function main(): Promise<void> {
  const server = new McpServer({
    name: 'atlas-backend-mcp',
    version: '1.0.0',
  });

  const pool = new pg.Pool({
    host:                   config.postgres.host,
    port:                   config.postgres.port,
    database:               config.postgres.database,
    user:                   config.postgres.user,
    password:               config.postgres.password,
    ssl:                    false,
    max:                    3,
    idleTimeoutMillis:      30_000,
    connectionTimeoutMillis: 5_000,
  });

  // Build in-memory index (non-fatal — tools degrade gracefully if empty)
  const cache = buildCache(config);

  registerRouteTools(server, cache, config);
  registerArchitectureTools(server, cache, config);
  registerCodeTools(server, config);
  registerSchemaTools(server, pool);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write('Atlas Backend MCP server running on stdio\n');
}

main().catch((e: unknown) => {
  const message = e instanceof Error ? e.message : String(e);
  process.stderr.write(`Fatal error: ${message}\n`);
  process.exit(1);
});

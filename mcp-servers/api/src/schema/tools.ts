import { z } from 'zod';
import type { Pool } from 'pg';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });
const err  = (m: string) => ({ content: [{ type: 'text' as const, text: m }], isError: true as const });

function isReadOnlyQuery(sql: string): boolean {
  const normalized = sql.trim().replace(/\s+/g, ' ').toUpperCase();
  return (
    normalized.startsWith('SELECT') ||
    normalized.startsWith('EXPLAIN') ||
    normalized.startsWith('WITH')
  );
}

function formatRows(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '(0 rows)';
  const keys = Object.keys(rows[0]);
  const colWidths = keys.map((k) =>
    Math.max(k.length, ...rows.map((r) => String(r[k] ?? 'NULL').length))
  );
  const header  = keys.map((k, i) => k.padEnd(colWidths[i])).join(' | ');
  const divider = colWidths.map((w) => '-'.repeat(w)).join('-+-');
  const dataRows = rows.map((row) =>
    keys.map((k, i) => String(row[k] ?? 'NULL').padEnd(colWidths[i])).join(' | ')
  );
  return [header, divider, ...dataRows, `(${rows.length} row${rows.length === 1 ? '' : 's'})`].join('\n');
}

export function registerSchemaTools(server: McpServer, pool: Pool): void {
  server.registerTool('list_tables', {
    title: 'List Database Tables',
    description: 'List all user-created tables in the public schema with approximate row counts from pg_stat_user_tables.',
    inputSchema: {},
  }, async () => {
    try {
      const result = await pool.query<{ table_name: string }>(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);
      if (result.rows.length === 0) return text('No tables found in public schema.');

      const countResult = await pool.query<{ relname: string; n_live_tup: string }>(`
        SELECT relname, n_live_tup::text
        FROM pg_stat_user_tables
        WHERE schemaname = 'public'
        ORDER BY relname
      `);
      const countMap = new Map(countResult.rows.map((r) => [r.relname, r.n_live_tup]));

      const lines = result.rows.map(
        (r) => `  ${r.table_name.padEnd(45)} ~${countMap.get(r.table_name) ?? '?'} rows`
      );
      return text(`Tables in public schema (${result.rows.length}):\n${lines.join('\n')}`);
    } catch (e: unknown) {
      return err(`Database error: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  server.registerTool('describe_table', {
    title: 'Describe Table',
    description: 'Show columns, data types, nullable, and default values for a table.',
    inputSchema: {
      table: z.string().min(1).describe('Table name to describe (e.g. "users", "tenants")'),
    },
  }, async ({ table }) => {
    try {
      const result = await pool.query<{
        column_name: string;
        data_type: string;
        is_nullable: string;
        column_default: string | null;
      }>(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
        ORDER BY ordinal_position
      `, [table]);

      if (result.rows.length === 0) {
        return err(`Table "${table}" not found in public schema.`);
      }

      const lines = result.rows.map((col) => {
        const nullable = col.is_nullable === 'YES' ? 'NULL    ' : 'NOT NULL';
        const def = col.column_default ? ` DEFAULT ${col.column_default}` : '';
        return `  ${col.column_name.padEnd(35)} ${col.data_type.padEnd(25)} ${nullable}${def}`;
      });

      const header = `  ${'column'.padEnd(35)} ${'type'.padEnd(25)} nullable`;
      return text(`Table: ${table}\n${header}\n${'-'.repeat(80)}\n${lines.join('\n')}`);
    } catch (e: unknown) {
      return err(`Database error: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  server.registerTool('run_query', {
    title: 'Run SQL Query',
    description: 'Execute a read-only SQL query (SELECT, EXPLAIN, or WITH). DDL and DML are rejected.',
    inputSchema: {
      sql: z.string().min(1).describe('SQL query to execute. Must start with SELECT, EXPLAIN, or WITH.'),
    },
  }, async ({ sql }) => {
    if (!isReadOnlyQuery(sql)) {
      return err(
        'Only SELECT, EXPLAIN, and WITH queries are allowed. ' +
        'DDL (CREATE, DROP, ALTER) and DML (INSERT, UPDATE, DELETE) are rejected.'
      );
    }
    try {
      const result = await pool.query(sql);
      if (!result.rows || result.rows.length === 0) return text('Query returned 0 rows.');
      return text(formatRows(result.rows as Record<string, unknown>[]));
    } catch (e: unknown) {
      return err(`Query error: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
}

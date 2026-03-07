import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AtlasHttpClient } from '../http-client.js';
import type { ApiResponse, ActivityLog } from '../types.js';

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });
const err  = (m: string) => ({ content: [{ type: 'text' as const, text: m }], isError: true as const });

function formatLog(l: ActivityLog): string {
  const causer = l.causer_name ? `${l.causer_name} <${l.causer_email ?? ''}>` : 'system';
  return `[${l.id}] ${l.event} ${l.subject_type}#${l.subject_id} by ${causer} at ${l.created_at}`;
}

const eventEnum = z.enum(['created', 'updated', 'deleted', 'restored', 'force-deleted']).optional();

export function registerActivityLogTools(server: McpServer, client: AtlasHttpClient): void {
  server.registerTool('list_activity_logs', {
    description: 'List activity logs with optional filtering. Admin only. Requires ATLAS_TENANT_ID to be set.',
    inputSchema: {
      event:        eventEnum.describe('Filter by event type'),
      subject_type: z.string().optional().describe('Filter by subject model type (e.g. App\\\\Models\\\\User)'),
      subject_id:   z.number().int().min(1).optional().describe('Filter by subject ID'),
      causer_id:    z.number().int().min(1).optional().describe('Filter by causer user ID'),
      from_date:    z.string().optional().describe('Start date filter (YYYY-MM-DD)'),
      to_date:      z.string().optional().describe('End date filter (YYYY-MM-DD)'),
      sort:         z.string().optional().describe('Sort field; prefix with - for descending (default: -created_at)'),
      page:         z.number().int().min(1).optional().describe('Page number (default: 1)'),
      per_page:     z.number().int().min(1).max(100).optional().describe('Results per page, max 100 (default: 15)'),
    },
  }, async (args) => {
    const result = await client.get<ApiResponse<ActivityLog[]>>('/activity-logs', {
      event:        args.event,
      subject_type: args.subject_type,
      subject_id:   args.subject_id,
      causer_id:    args.causer_id,
      from_date:    args.from_date,
      to_date:      args.to_date,
      sort:         args.sort,
      page:         args.page ?? 1,
      per_page:     args.per_page ?? 15,
    });
    if (!result.ok) return err(`Error ${result.status}: ${result.message}`);
    const { data, meta } = result.data;
    const total = meta?.total ?? data.length;
    const perPage = meta?.per_page ?? (args.per_page ?? 15);
    const page = meta?.current_page ?? (args.page ?? 1);
    const totalPages = Math.ceil(total / perPage);
    const lines = data.map(formatLog);
    return text([
      `Activity logs (page ${page}/${totalPages}, total ${total}):`,
      ...lines,
    ].join('\n'));
  });

  server.registerTool('get_activity_log', {
    description: 'Get a single activity log entry by ID, including old and new values.',
    inputSchema: {
      id: z.number().int().min(1).describe('Activity log entry ID'),
    },
  }, async (args) => {
    const result = await client.get<ApiResponse<ActivityLog>>(`/activity-logs/${args.id}`);
    if (!result.ok) return err(`Error ${result.status}: ${result.message}`);
    const l = result.data.data;
    const oldVals = l.old_values ? JSON.stringify(l.old_values, null, 2) : 'none';
    const newVals = l.new_values ? JSON.stringify(l.new_values, null, 2) : 'none';
    return text([
      formatLog(l),
      `  old values: ${oldVals}`,
      `  new values: ${newVals}`,
    ].join('\n'));
  });

  server.registerTool('list_user_activity_logs', {
    description: "List activity logs where a specific user was the subject. Requires ATLAS_TENANT_ID to be set.",
    inputSchema: {
      user_id:  z.number().int().min(1).describe('The user ID whose activity logs to retrieve'),
      event:    eventEnum.describe('Filter by event type'),
      from_date: z.string().optional().describe('Start date filter (YYYY-MM-DD)'),
      to_date:   z.string().optional().describe('End date filter (YYYY-MM-DD)'),
      sort:      z.string().optional().describe('Sort field; prefix with - for descending (default: -created_at)'),
      page:      z.number().int().min(1).optional().describe('Page number (default: 1)'),
      per_page:  z.number().int().min(1).max(100).optional().describe('Results per page, max 100 (default: 15)'),
    },
  }, async (args) => {
    const result = await client.get<ApiResponse<ActivityLog[]>>(`/users/${args.user_id}/activity-logs`, {
      event:    args.event,
      from_date: args.from_date,
      to_date:   args.to_date,
      sort:      args.sort,
      page:      args.page ?? 1,
      per_page:  args.per_page ?? 15,
    });
    if (!result.ok) return err(`Error ${result.status}: ${result.message}`);
    const { data, meta } = result.data;
    const total = meta?.total ?? data.length;
    const perPage = meta?.per_page ?? (args.per_page ?? 15);
    const page = meta?.current_page ?? (args.page ?? 1);
    const totalPages = Math.ceil(total / perPage);
    const lines = data.map(formatLog);
    return text([
      `Activity logs for user ${args.user_id} (page ${page}/${totalPages}, total ${total}):`,
      ...lines,
    ].join('\n'));
  });
}

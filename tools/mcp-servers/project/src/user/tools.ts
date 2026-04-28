import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AtlasHttpClient } from '../http-client.js';
import type { ApiResponse, User, UserStats } from '../types.js';

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });
const err  = (m: string) => ({ content: [{ type: 'text' as const, text: m }], isError: true as const });

function formatValidationErrors(errors: Record<string, string[]>): string {
  return Object.entries(errors)
    .map(([field, messages]) => `  ${field}: ${messages.join(', ')}`)
    .join('\n');
}

function formatUser(u: User): string {
  const deleted = u.deleted_at ? ' [DELETED]' : '';
  return `[${u.id}] ${u.name} <${u.email}> roles=${u.roles.join(',') || 'none'} created=${u.created_at}${deleted}`;
}

export function registerUserTools(server: McpServer, client: AtlasHttpClient): void {
  server.registerTool('list_users', {
    description: 'List users with optional filtering, search, and pagination. Requires ATLAS_TENANT_ID to be set.',
    inputSchema: {
      search:   z.string().optional().describe('Search by name or email'),
      trashed:  z.enum(['with', 'only']).optional().describe('"with" includes soft-deleted users, "only" shows only soft-deleted users'),
      page:     z.number().int().min(1).optional().describe('Page number (default: 1)'),
      per_page: z.number().int().min(1).max(100).optional().describe('Results per page, max 100 (default: 15)'),
      sort:     z.string().optional().describe('Sort field; prefix with - for descending, e.g. -created_at'),
    },
  }, async (args) => {
    const result = await client.get<ApiResponse<User[]>>('/users', {
      search:   args.search,
      trashed:  args.trashed,
      page:     args.page ?? 1,
      per_page: args.per_page ?? 15,
      sort:     args.sort,
    });
    if (!result.ok) return err(`Error ${result.status}: ${result.message}`);
    const { data, meta } = result.data;
    const total = meta?.total ?? data.length;
    const perPage = meta?.per_page ?? (args.per_page ?? 15);
    const page = meta?.current_page ?? (args.page ?? 1);
    const totalPages = Math.ceil(total / perPage);
    const lines = data.map(formatUser);
    return text([
      `Users (page ${page}/${totalPages}, total ${total}):`,
      ...lines,
    ].join('\n'));
  });

  server.registerTool('get_user_stats', {
    description: 'Get user statistics: total active, total deleted, and created today. Requires ATLAS_TENANT_ID to be set.',
    inputSchema: {},
  }, async () => {
    const result = await client.get<ApiResponse<UserStats>>('/users/stats');
    if (!result.ok) return err(`Error ${result.status}: ${result.message}`);
    const s = result.data.data;
    return text(
      `User stats:\n  Active:        ${s.total_active}\n  Deleted:       ${s.total_deleted}\n  Created today: ${s.created_today}`
    );
  });

  server.registerTool('create_user', {
    description: 'Create a new user in the current tenant. Requires ATLAS_TENANT_ID to be set.',
    inputSchema: {
      name:     z.string().min(1).max(255).describe('Full name of the user'),
      email:    z.string().email().describe('Email address — must be unique'),
      password: z.string().min(8).describe('Password, minimum 8 characters'),
    },
  }, async (args) => {
    const result = await client.post<ApiResponse<User>>('/users', {
      name:     args.name,
      email:    args.email,
      password: args.password,
    });
    if (!result.ok) {
      if (result.status === 422 && result.errors) {
        return err(`Validation failed:\n${formatValidationErrors(result.errors)}`);
      }
      return err(`Error ${result.status}: ${result.message}`);
    }
    const u = result.data.data;
    return text(`User created:\n${formatUser(u)}`);
  });

  server.registerTool('delete_user', {
    description: 'Soft-delete a user by ID. The user can be restored later with restore_user. Requires ATLAS_TENANT_ID to be set.',
    inputSchema: {
      id: z.number().int().min(1).describe('User ID to soft-delete'),
    },
  }, async (args) => {
    const result = await client.delete<{ message: string }>(`/users/${args.id}`);
    if (!result.ok) return err(`Error ${result.status}: ${result.message}`);
    const msg = (result.data as { message?: string })?.message ?? 'User deleted successfully';
    return text(msg);
  });

  server.registerTool('restore_user', {
    description: 'Restore a previously soft-deleted user. Requires ATLAS_TENANT_ID to be set.',
    inputSchema: {
      id: z.number().int().min(1).describe('ID of the soft-deleted user to restore'),
    },
  }, async (args) => {
    const result = await client.post<ApiResponse<User>>(`/users/${args.id}/restore`);
    if (!result.ok) return err(`Error ${result.status}: ${result.message}`);
    const u = result.data.data;
    const msg = result.data.message ?? 'User restored successfully';
    return text(`${msg}\n${formatUser(u)}`);
  });

  server.registerTool('force_delete_user', {
    description: 'Permanently delete a user. This action cannot be undone. Requires ATLAS_TENANT_ID to be set.',
    inputSchema: {
      id: z.number().int().min(1).describe('User ID to permanently delete'),
    },
  }, async (args) => {
    const result = await client.delete<{ message: string }>(`/users/${args.id}/force`);
    if (!result.ok) return err(`Error ${result.status}: ${result.message}`);
    const msg = (result.data as { message?: string })?.message ?? 'User permanently deleted';
    return text(msg);
  });
}

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AtlasHttpClient } from '../http-client.js';
import type { ApiResponse, Tenant } from '../types.js';

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });
const err  = (m: string) => ({ content: [{ type: 'text' as const, text: m }], isError: true as const });

function formatValidationErrors(errors: Record<string, string[]>): string {
  return Object.entries(errors)
    .map(([field, messages]) => `  ${field}: ${messages.join(', ')}`)
    .join('\n');
}

function formatTenant(t: Tenant): string {
  const active = t.is_active ? 'active' : 'inactive';
  return `[${t.id}] ${t.name} (slug: ${t.slug}) [${active}] created=${t.created_at}`;
}

export function registerTenantTools(server: McpServer, client: AtlasHttpClient): void {
  server.registerTool('list_tenants', {
    description: 'List all tenants with pagination.',
    inputSchema: {
      page:     z.number().int().min(1).optional().describe('Page number (default: 1)'),
      per_page: z.number().int().min(1).max(100).optional().describe('Results per page, max 100 (default: 15)'),
    },
  }, async (args) => {
    const result = await client.get<ApiResponse<Tenant[]>>('/tenants', {
      page:     args.page ?? 1,
      per_page: args.per_page ?? 15,
    });
    if (!result.ok) return err(`Error ${result.status}: ${result.message}`);
    const { data, meta } = result.data;
    const total = meta?.total ?? data.length;
    const perPage = meta?.per_page ?? (args.per_page ?? 15);
    const page = meta?.current_page ?? (args.page ?? 1);
    const totalPages = Math.ceil(total / perPage);
    const lines = data.map(formatTenant);
    return text([
      `Tenants (page ${page}/${totalPages}, total ${total}):`,
      ...lines,
    ].join('\n'));
  });

  server.registerTool('get_tenant', {
    description: 'Get a single tenant by ID.',
    inputSchema: {
      id: z.number().int().min(1).describe('Tenant ID'),
    },
  }, async (args) => {
    const result = await client.get<ApiResponse<Tenant>>(`/tenants/${args.id}`);
    if (!result.ok) return err(`Error ${result.status}: ${result.message}`);
    const t = result.data.data;
    const settings = t.settings ? JSON.stringify(t.settings, null, 2) : 'none';
    return text(
      `${formatTenant(t)}\n  settings: ${settings}\n  updated: ${t.updated_at}`
    );
  });

  server.registerTool('create_tenant', {
    description: 'Create a new tenant. The slug must be unique and use only alphanumeric characters and dashes.',
    inputSchema: {
      name:      z.string().min(1).max(255).describe('Tenant display name'),
      slug:      z.string().min(1).max(100).describe('Unique slug (alphanumeric and dashes only)'),
      settings:  z.record(z.string(), z.unknown()).optional().describe('Optional JSON settings object'),
      is_active: z.boolean().optional().describe('Whether the tenant is active (default: true)'),
    },
  }, async (args) => {
    const result = await client.post<ApiResponse<Tenant>>('/tenants', {
      name:      args.name,
      slug:      args.slug,
      settings:  args.settings,
      is_active: args.is_active,
    });
    if (!result.ok) {
      if (result.status === 422 && result.errors) {
        return err(`Validation failed:\n${formatValidationErrors(result.errors)}`);
      }
      return err(`Error ${result.status}: ${result.message}`);
    }
    const t = result.data.data;
    return text(`Tenant created:\n${formatTenant(t)}`);
  });

  server.registerTool('update_tenant', {
    description: 'Update an existing tenant. All fields are optional.',
    inputSchema: {
      id:        z.number().int().min(1).describe('Tenant ID to update'),
      name:      z.string().min(1).max(255).optional().describe('New display name'),
      slug:      z.string().min(1).max(100).optional().describe('New unique slug'),
      settings:  z.record(z.string(), z.unknown()).optional().describe('Settings object (replaces existing)'),
      is_active: z.boolean().optional().describe('Active status'),
    },
  }, async (args) => {
    const { id, ...body } = args;
    const result = await client.put<ApiResponse<Tenant>>(`/tenants/${id}`, body);
    if (!result.ok) {
      if (result.status === 422 && result.errors) {
        return err(`Validation failed:\n${formatValidationErrors(result.errors)}`);
      }
      return err(`Error ${result.status}: ${result.message}`);
    }
    const t = result.data.data;
    return text(`Tenant updated:\n${formatTenant(t)}`);
  });

  server.registerTool('delete_tenant', {
    description: 'Delete a tenant by ID.',
    inputSchema: {
      id: z.number().int().min(1).describe('Tenant ID to delete'),
    },
  }, async (args) => {
    const result = await client.delete<{ message?: string }>(`/tenants/${args.id}`);
    if (!result.ok) return err(`Error ${result.status}: ${result.message}`);
    const msg = (result.data as { message?: string })?.message ?? `Tenant ${args.id} deleted successfully`;
    return text(msg);
  });
}
